"""CRE Screener extraction API.

POST /api/extract  (multipart: file=<pdf|png|jpg>)
  1. Render PDF pages to PNG (PyMuPDF, 300 dpi).
  2. OCR every page in one shot with Baidu Unlimited-OCR via its OpenAI-compatible server
     (vLLM `vllm/vllm-openai:unlimited-ocr` or SGLang) — prompt "Multi page parsing.", image_mode=base.
  3. Turn the OCR markdown into a typed deal sheet with Claude structured outputs.
  Returns {source: {...}, fields: {key: {text, number, confidence, page}}} — the UI does the underwriting.

Env:
  OCR_BASE_URL   OpenAI-compatible base URL of the Unlimited-OCR server (e.g. http://gpu-box:8000/v1)
  OCR_MODEL      served model name (default "Unlimited-OCR")
  MOCK_OCR=1     skip OCR and use sample_om.md (lets you run the API without a GPU)
  ANTHROPIC_API_KEY  (or an `ant auth login` profile) for the extraction step
  ALLOWED_ORIGINS comma-separated CORS origins (default: crescreener.com + localhost dev)
"""
from __future__ import annotations

import base64
import io
import os
import re
import time
from pathlib import Path
from typing import Optional

import anthropic
import fitz  # PyMuPDF
import httpx
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

OCR_BASE_URL = os.environ.get("OCR_BASE_URL", "http://127.0.0.1:8000/v1").rstrip("/")
OCR_MODEL = os.environ.get("OCR_MODEL", "Unlimited-OCR")
MOCK_OCR = os.environ.get("MOCK_OCR") == "1"
ORIGINS = os.environ.get(
    "ALLOWED_ORIGINS", "https://crescreener.com,https://www.crescreener.com,http://crescreener.com,http://localhost:5199"
).split(",")

app = FastAPI(title="CRE Screener API")
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_methods=["*"], allow_headers=["*"])
claude = anthropic.Anthropic()


# ——— Deal sheet schema (keys must match FIELD_DEFS in the UI) ———

class F(BaseModel):
    """One extracted value. `number` is the normalized numeric value (dollars as plain numbers,
    percentages as fractions, SF/units/years as plain numbers); null when not numeric or not found."""
    text: Optional[str] = Field(None, description="Value as written in the memo, lightly normalized; null if not found")
    number: Optional[float] = Field(None, description="Normalized numeric value; null if not numeric or not found")
    confidence: float = Field(..., ge=0, le=1, description="0–1 confidence that text/number are correct")
    page: Optional[int] = Field(None, description="1-based page number in the memo where the value appears")


class DealFields(BaseModel):
    property_name: F; address: F; property_type: F; year_built: F; building_sf: F; land_acres: F; units: F; parking: F
    occupancy: F; tenant_count: F; anchor_tenants: F; walt_years: F; avg_rent_psf: F
    gross_potential_rent: F; vacancy_loss: F; other_income: F; effective_gross_income: F
    operating_expenses: F; real_estate_taxes: F; insurance: F; noi_in_place: F; noi_pro_forma: F
    purchase_price: F; price_psf: F; cap_rate: F; closing_date: F; broker: F
    loan_amount: F; loan_ltv: F; loan_term: F; rate_request: F; equity: F; use_of_proceeds: F
    sponsor: F; sponsor_experience: F; guarantor: F; sponsor_net_worth: F; sponsor_liquidity: F


EXTRACT_SYSTEM = """You are a commercial real estate credit analyst. You are given the OCR text of an offering
memorandum / opportunity memo, with pages delimited by lines like `=== PAGE n ===`.
Fill every field of the deal sheet. Rules:
- Quote values as written (lightly normalized) in `text`; set `number` to the normalized numeric value:
  dollars as plain numbers (14200000), percentages as fractions (0.0741), SF/units/years as plain numbers.
- Prefer in-place / trailing-12 figures for `noi_in_place`; underwritten / year-1 for `noi_pro_forma`.
- `page` is the page where the value appears. If a value is truly absent, return text=null, number=null,
  confidence=0, page=null. Never invent numbers. Lower confidence when figures conflict between pages."""


# ——— Pipeline steps ———

def pdf_to_pngs(data: bytes, dpi: int = 300) -> list[bytes]:
    doc = fitz.open(stream=data, filetype="pdf")
    mat = fitz.Matrix(dpi / 72, dpi / 72)
    pages = [page.get_pixmap(matrix=mat).tobytes("png") for page in doc]
    doc.close()
    return pages


def ocr_pages(pages: list[bytes]) -> str:
    """One-shot multi-page parse via Unlimited-OCR's OpenAI-compatible chat endpoint."""
    content = [{"type": "text", "text": "Multi page parsing."}] + [
        {"type": "image_url", "image_url": {"url": "data:image/png;base64," + base64.b64encode(p).decode()}} for p in pages
    ]
    payload = {
        "model": OCR_MODEL,
        "messages": [{"role": "user", "content": content}],
        "temperature": 0,
        "max_tokens": 32768,
        "skip_special_tokens": False,
        "images_config": {"image_mode": "base"},
    }
    r = httpx.post(f"{OCR_BASE_URL}/chat/completions", json=payload, timeout=1200)
    r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"]


DET_RE = re.compile(r"<\|det\|>([^<\s]+)(?:\s*\[[^\]]*\])?\s*<\|/det\|>(.*)", re.DOTALL)


def clean_ocr(raw: str) -> str:
    """Strip Unlimited-OCR <|det|> layout markers (from the model's README post-processing), keep page markers."""
    out, cur = [], None
    for line in raw.splitlines():
        line = line.rstrip()
        if not line:
            continue
        if line.startswith("=== PAGE"):
            if cur is not None:
                out.append(cur)
            cur = [line]
            continue
        m = DET_RE.match(line)
        if m:
            cat, body = m.group(1).strip(), m.group(2).strip()
            if cat == "image":
                continue
            if cur is not None:
                out.append(cur)
            cur = [body] if body else []
            continue
        cur = cur or []
        cur.append(line)
    if cur is not None:
        out.append(cur)
    return "\n\n".join("\n".join(b) for b in out).strip()


def extract_fields(ocr_text: str) -> DealFields:
    resp = claude.messages.parse(
        model="claude-opus-5",
        max_tokens=16000,
        system=EXTRACT_SYSTEM,
        messages=[{"role": "user", "content": f"<memo>\n{ocr_text}\n</memo>\n\nProduce the deal sheet."}],
        output_format=DealFields,
    )
    if resp.stop_reason == "refusal":
        raise HTTPException(502, "Extraction model declined the request")
    return resp.parsed_output


# ——— API ———

@app.get("/api/health")
def health():
    return {"ok": True, "mock_ocr": MOCK_OCR, "ocr": OCR_BASE_URL, "model": OCR_MODEL}


@app.post("/api/extract")
async def extract(file: UploadFile = File(...)):
    data = await file.read()
    t0 = time.time()
    if MOCK_OCR:
        raw = (Path(__file__).parent / "sample_om.md").read_text()
        n_pages = raw.count("=== PAGE")
    else:
        if file.content_type == "application/pdf" or (file.filename or "").lower().endswith(".pdf"):
            pages = pdf_to_pngs(data)
        else:
            pages = [data]
        n_pages = len(pages)
        if n_pages > 600:
            raise HTTPException(413, "Memo exceeds 600 pages")
        # Tag pages so the extractor can cite them; Unlimited-OCR returns one stream for the whole batch,
        # so we OCR in page chunks and stamp markers ourselves.
        chunks = []
        for i in range(0, n_pages, 8):
            text = ocr_pages(pages[i:i + 8])
            chunks.append(f"=== PAGE {i + 1}–{min(i + 8, n_pages)} ===\n{text}")
        raw = "\n".join(chunks)
    ocr_text = clean_ocr(raw)
    ocr_secs = time.time() - t0
    fields = extract_fields(ocr_text)
    return {
        "source": {
            "filename": file.filename,
            "pages": n_pages,
            "ocr": f"{'mock' if MOCK_OCR else OCR_MODEL} · {n_pages} pages · {ocr_secs:.1f}s",
        },
        "fields": fields.model_dump(),
    }
