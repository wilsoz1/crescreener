"""CRE Screener model gateway — open-source models only.

One FastAPI service in front of two vLLM servers:
  OCR_BASE_URL  -> Unlimited-OCR   (documents -> markdown)
  LLM_BASE_URL  -> Qwen3-32B-AWQ   (markdown -> structured JSON via guided decoding, drafting, Q&A)

Endpoints (all JSON unless noted):
  GET  /api/health                          liveness + which models are reachable
  POST /api/extract      multipart file     offering memo -> deal sheet (Screener; legacy path kept)
  POST /api/spread       {document_id}      tax return / financials -> populated spread draft
  POST /api/classify     {document_id}      content-based doc type + borrower routing
  POST /api/obligations  {document_id}      loan agreement -> ticklers + covenants (with citations)
  POST /api/draft        {kind, loan_id}    annual_review | brief -> markdown
  POST /api/ask          {question}         NL question -> whitelisted query plan -> answer

Auth: caller passes their Supabase JWT (Authorization: Bearer). The gateway verifies org
membership and only touches that org's rows, then writes results with the service role.

Env: OCR_BASE_URL, LLM_BASE_URL, LLM_MODEL (default Qwen), SUPABASE_URL,
SUPABASE_SERVICE_ROLE_KEY, ALLOWED_ORIGINS, MOCK=1 (no GPUs needed; canned model output).
"""
from __future__ import annotations

import base64
import io
import json
import os
import re
from typing import Any, Dict, List, Optional

import httpx
from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

OCR_BASE_URL = os.environ.get("OCR_BASE_URL", "http://127.0.0.1:8001/v1").rstrip("/")
LLM_BASE_URL = os.environ.get("LLM_BASE_URL", "http://127.0.0.1:8002/v1").rstrip("/")
LLM_MODEL = os.environ.get("LLM_MODEL", "Qwen/Qwen3-32B-AWQ")
OCR_MODEL = os.environ.get("OCR_MODEL", "Unlimited-OCR")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://ngmpmyuwacwbwtqtinos.supabase.co").rstrip("/")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
MOCK = os.environ.get("MOCK") == "1"
ORIGINS = os.environ.get(
    "ALLOWED_ORIGINS", "https://crescreener.com,https://www.crescreener.com,http://localhost:5199"
).split(",")

app = FastAPI(title="CRE Screener model gateway")
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_methods=["*"], allow_headers=["*"])

SPREAD_LINES = ["revenue", "cogs", "opex", "ebitda", "depreciation", "interest_expense",
                "net_income", "distributions", "total_debt", "tangible_net_worth"]
DOC_TYPES = ["Rent Roll", "Tax Return", "Personal Financial Statement", "Insurance Certificate",
             "Appraisal", "Borrowing Base Certificate", "Offering Memorandum", "Lease",
             "Organizational Documents", "Financial Statement", "Loan Agreement", "Unclassified"]


# ——— Supabase helpers (service role for data, user JWT for authorization) ———

def sb(path: str, method: str = "GET", body: Any = None, params: Optional[Dict[str, str]] = None) -> Any:
    r = httpx.request(
        method, f"{SUPABASE_URL}/rest/v1/{path}", params=params, json=body,
        headers={"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}",
                 "Content-Type": "application/json", "Prefer": "return=representation"},
        timeout=30,
    )
    if r.status_code >= 300:
        raise HTTPException(502, f"supabase: {r.text[:200]}")
    return r.json() if r.text else None


def caller_orgs(authorization: Optional[str] = Header(None)) -> List[str]:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "sign in required")
    r = httpx.get(f"{SUPABASE_URL}/auth/v1/user",
                  headers={"apikey": SERVICE_KEY, "Authorization": authorization}, timeout=15)
    if r.status_code != 200:
        raise HTTPException(401, "invalid session")
    uid = r.json()["id"]
    rows = sb("org_members", params={"user_id": f"eq.{uid}", "select": "org_id"})
    if not rows:
        raise HTTPException(403, "no workspace")
    return [row["org_id"] for row in rows]


def fetch_document(document_id: str, orgs: List[str]) -> Dict[str, Any]:
    rows = sb("documents", params={"id": f"eq.{document_id}",
                                   "select": "*, loans(id, loan_number, next_payment_amount), customers(id, name, company)"})
    if not rows or rows[0]["org_id"] not in orgs:
        raise HTTPException(404, "document not found")
    return rows[0]


def download_storage(path: str) -> bytes:
    r = httpx.get(f"{SUPABASE_URL}/storage/v1/object/documents/{path}",
                  headers={"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"}, timeout=120)
    if r.status_code != 200:
        raise HTTPException(502, "storage download failed")
    return r.content


# ——— Model calls (both OpenAI-compatible vLLM servers) ———

def pdf_to_pngs(data: bytes, dpi: int = 200, max_pages: int = 60) -> List[bytes]:
    import fitz  # PyMuPDF
    doc = fitz.open(stream=data, filetype="pdf")
    mat = fitz.Matrix(dpi / 72, dpi / 72)
    pages = [page.get_pixmap(matrix=mat).tobytes("png") for page in list(doc)[:max_pages]]
    doc.close()
    return pages


def ocr(data: bytes, filename: str, first_page_only: bool = False) -> str:
    """Any file -> markdown text with === PAGE n === markers."""
    if MOCK:
        return _mock_ocr(filename)
    if filename.lower().endswith(".pdf"):
        pages = pdf_to_pngs(data)
    else:
        pages = [data]
    if first_page_only:
        pages = pages[:1]
    chunks = []
    for i in range(0, len(pages), 8):
        content = [{"type": "text", "text": "Multi page parsing."}] + [
            {"type": "image_url", "image_url": {"url": "data:image/png;base64," + base64.b64encode(p).decode()}}
            for p in pages[i:i + 8]
        ]
        r = httpx.post(f"{OCR_BASE_URL}/chat/completions", timeout=1200, json={
            "model": OCR_MODEL, "temperature": 0, "max_tokens": 32768,
            "messages": [{"role": "user", "content": content}],
        })
        r.raise_for_status()
        chunks.append(f"=== PAGE {i + 1}–{min(i + 8, len(pages))} ===\n" + r.json()["choices"][0]["message"]["content"])
    return "\n".join(chunks)


def llm_json(system: str, user: str, schema: Dict[str, Any], mock: Any = None) -> Any:
    """Structured extraction with vLLM guided decoding — output is schema-valid by construction."""
    if MOCK:
        return mock
    r = httpx.post(f"{LLM_BASE_URL}/chat/completions", timeout=600, json={
        "model": LLM_MODEL, "temperature": 0, "max_tokens": 8192,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "response_format": {"type": "json_schema", "json_schema": {"name": "out", "schema": schema}},
    })
    r.raise_for_status()
    return json.loads(r.json()["choices"][0]["message"]["content"])


def llm_text(system: str, user: str, mock: str = "") -> str:
    if MOCK:
        return mock
    r = httpx.post(f"{LLM_BASE_URL}/chat/completions", timeout=600, json={
        "model": LLM_MODEL, "temperature": 0.3, "max_tokens": 4096,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
    })
    r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"]


def _mock_ocr(filename: str) -> str:
    if re.search(r"om|offering|memorandum", filename, re.I):
        from pathlib import Path
        return (Path(__file__).parent / "sample_om.md").read_text()
    return """=== PAGE 1 ===
FORM 1120-S — U.S. Income Tax Return for an S Corporation — Tax year 2026
Cascade Fabrication Inc — EIN 91-2044818
Gross receipts: $6,050,000   Cost of goods sold: $3,960,000
Total deductions incl. officers comp & rents: $1,310,000
Depreciation: $238,000   Interest expense: $131,000
Ordinary business income: $411,000   Distributions: $170,000
=== PAGE 2 ===
Schedule L — Balance Sheet: Total liabilities (loans + payables): $2,240,000
Total shareholder equity (tangible): $1,410,000
"""


# ——— Schemas ———

def num_or_null() -> Dict[str, Any]:
    return {"type": ["number", "null"]}

SPREAD_SCHEMA = {
    "type": "object", "additionalProperties": False,
    "properties": {**{k: num_or_null() for k in SPREAD_LINES},
                   "period": {"type": "string"},
                   "confidence": {"type": "number"}},
    "required": SPREAD_LINES + ["period", "confidence"],
}

CLASSIFY_SCHEMA = {
    "type": "object", "additionalProperties": False,
    "properties": {
        "doc_type": {"type": "string", "enum": DOC_TYPES},
        "entity_names": {"type": "array", "items": {"type": "string"}},
        "period_or_date": {"type": ["string", "null"]},
        "confidence": {"type": "number"},
    },
    "required": ["doc_type", "entity_names", "period_or_date", "confidence"],
}

OBLIGATION_SCHEMA = {
    "type": "object", "additionalProperties": False,
    "properties": {
        "ticklers": {"type": "array", "items": {"type": "object", "additionalProperties": False, "properties": {
            "requirement": {"type": "string"}, "responsible": {"type": "string"},
            "frequency": {"type": ["string", "null"]}, "first_due_date": {"type": "string"},
            "source": {"type": "string"}}, "required": ["requirement", "responsible", "frequency", "first_due_date", "source"]}},
        "covenants": {"type": "array", "items": {"type": "object", "additionalProperties": False, "properties": {
            "name": {"type": "string"}, "requirement": {"type": "string"},
            "frequency": {"type": ["string", "null"]}, "source": {"type": "string"}},
            "required": ["name", "requirement", "frequency", "source"]}},
    },
    "required": ["ticklers", "covenants"],
}

ASK_PLAN_SCHEMA = {
    "type": "object", "additionalProperties": False,
    "properties": {
        "table": {"type": "string", "enum": ["loans", "deposits", "credit_lines", "ticklers", "covenants"]},
        "filters": {"type": "array", "items": {"type": "object", "additionalProperties": False, "properties": {
            "field": {"type": "string"}, "op": {"type": "string", "enum": ["eq", "neq", "gt", "gte", "lt", "lte", "ilike"]},
            "value": {"type": ["string", "number"]}}, "required": ["field", "op", "value"]}},
        "order_by": {"type": ["string", "null"]},
        "limit": {"type": "integer"},
    },
    "required": ["table", "filters", "order_by", "limit"],
}
ASK_FIELDS = {
    "loans": ["loan_number", "type", "stage", "amount", "rate", "ltv", "dscr", "maturity", "payment_type", "draw_period_end", "io_end_date", "current_balance", "rm"],
    "deposits": ["account_name", "type", "balance", "opened"],
    "credit_lines": ["name", "commitment", "outstanding", "rate", "maturity"],
    "ticklers": ["requirement", "responsible", "due_date", "status"],
    "covenants": ["name", "requirement", "actual", "status", "next_test"],
}


# ——— Endpoints ———

@app.get("/api/health")
def health():
    models = {}
    for name, url in (("ocr", OCR_BASE_URL), ("llm", LLM_BASE_URL)):
        if MOCK:
            models[name] = "mock"
            continue
        try:
            models[name] = "up" if httpx.get(f"{url}/models", timeout=4).status_code == 200 else "down"
        except Exception:
            models[name] = "down"
    return {"ok": True, "mock": MOCK, "models": models}


class DocReq(BaseModel):
    document_id: str


@app.post("/api/spread")
def make_spread(req: DocReq, orgs: List[str] = Depends(caller_orgs)):
    doc = fetch_document(req.document_id, orgs)
    if not doc.get("customer_id"):
        raise HTTPException(400, "document is not attached to a borrower")
    text = ocr(download_storage(doc["storage_path"]), doc["filename"])
    out = llm_json(
        "You are a bank credit analyst spreading a borrower financial statement or tax return. "
        "Extract annual figures in dollars (plain numbers). ebitda = operating income + depreciation "
        "if not stated. Use null for anything not present. period like 'FY 2026' or 'T-12 Jun 2026'. "
        "confidence 0-1 for the overall extraction.",
        f"<document>\n{text}\n</document>",
        SPREAD_SCHEMA,
        mock={"revenue": 6050000, "cogs": 3960000, "opex": 1310000, "ebitda": 780000, "depreciation": 238000,
              "interest_expense": 131000, "net_income": 411000, "distributions": 170000,
              "total_debt": 2240000, "tangible_net_worth": 1410000, "period": "FY 2026", "confidence": 0.92},
    )
    # Deterministic cross-checks beat model self-confidence: penalize when arithmetic doesn't tie.
    conf = float(out.get("confidence") or 0.5)
    r, c, o, e = out.get("revenue"), out.get("cogs"), out.get("opex"), out.get("ebitda")
    if None not in (r, c, o, e) and abs((r - c - o) - e) > 0.1 * max(abs(e), 1):
        conf = min(conf, 0.6)
    data = {k: out.get(k) for k in SPREAD_LINES}

    existing = sb("financial_spreads", params={"source_document_id": f"eq.{doc['id']}", "select": "id"})
    if existing:
        sb(f"financial_spreads?id=eq.{existing[0]['id']}", "PATCH", {"data": data, "period": out["period"]})
        spread_id = existing[0]["id"]
    else:
        row = sb("financial_spreads", "POST", {
            "org_id": doc["org_id"], "customer_id": doc["customer_id"], "source_document_id": doc["id"],
            "period": out["period"], "statement_type": doc["doc_type"], "status": "draft", "data": data})
        spread_id = row[0]["id"]
    return {"spread_id": spread_id, "period": out["period"], "data": data, "confidence": conf}


@app.post("/api/classify")
def classify(req: DocReq, orgs: List[str] = Depends(caller_orgs)):
    doc = fetch_document(req.document_id, orgs)
    text = ocr(download_storage(doc["storage_path"]), doc["filename"], first_page_only=True)
    out = llm_json(
        "Classify this banking document and list every business/person entity name that appears.",
        f"<first_page>\n{text[:6000]}\n</first_page>",
        CLASSIFY_SCHEMA,
        mock={"doc_type": "Tax Return", "entity_names": ["Cascade Fabrication Inc"], "period_or_date": "2026", "confidence": 0.95},
    )
    # Borrower matching is string matching, not AI: compare entities to this org's customers.
    customers = sb("customers", params={"org_id": f"eq.{doc['org_id']}", "select": "id, company, name"})
    match = None
    for cust in customers:
        hay = f"{cust.get('company') or ''} {cust.get('name') or ''}".lower()
        for ent in out["entity_names"]:
            token = ent.lower().strip()
            if token and (token in hay or hay.split()[0] in token.split()):
                match = cust
                break
        if match:
            break
    patch: Dict[str, Any] = {"doc_type": out["doc_type"], "confidence": out["confidence"]}
    if match:
        loans = sb("loans", params={"customer_id": f"eq.{match['id']}", "select": "id", "order": "created_at.desc", "limit": "1"})
        patch.update({"customer_id": match["id"], "loan_id": loans[0]["id"] if loans else None,
                      "status": "routed" if loans and out["doc_type"] != "Unclassified" else "needs_review"})
    sb(f"documents?id=eq.{doc['id']}", "PATCH", patch)
    return {"doc_type": out["doc_type"], "matched": match["company"] if match else None, "confidence": out["confidence"]}


@app.post("/api/obligations")
def obligations(req: DocReq, orgs: List[str] = Depends(caller_orgs)):
    doc = fetch_document(req.document_id, orgs)
    if not doc.get("loan_id"):
        raise HTTPException(400, "attach the document to a loan first")
    text = ocr(download_storage(doc["storage_path"]), doc["filename"])
    out = llm_json(
        "You read executed commercial loan documents. Extract every ongoing reporting requirement "
        "(tickler: who must deliver what, how often, first due date as YYYY-MM-DD) and every financial "
        "covenant (name, requirement with threshold, testing frequency). Every item must cite its "
        "source section and page, e.g. 'LA §6.01(a), p. 37'. Do not invent items.",
        f"<loan_document>\n{text}\n</loan_document>",
        OBLIGATION_SCHEMA,
        mock={"ticklers": [
            {"requirement": "Annual CPA-reviewed financial statements", "responsible": "Borrower",
             "frequency": "Annual · 120 days after FYE", "first_due_date": "2027-04-30", "source": "LA §6.01(a), p. 37"},
            {"requirement": "Quarterly borrowing-base certificate", "responsible": "Borrower",
             "frequency": "Quarterly · 20 days after quarter-end", "first_due_date": "2026-10-20", "source": "LA §6.02, p. 39"}],
            "covenants": [
                {"name": "Minimum fixed-charge coverage", "requirement": "≥ 1.20x tested quarterly",
                 "frequency": "Quarterly", "source": "LA §6.12(b), p. 41"}]},
    )
    for t in out["ticklers"]:
        sb("ticklers", "POST", {"org_id": doc["org_id"], "loan_id": doc["loan_id"], "requirement": t["requirement"],
                                "responsible": t["responsible"], "frequency": t["frequency"],
                                "due_date": t["first_due_date"], "status": "open", "source": t["source"] + " (AI)"})
    for cv in out["covenants"]:
        sb("covenants", "POST", {"org_id": doc["org_id"], "loan_id": doc["loan_id"], "name": cv["name"],
                                 "requirement": cv["requirement"], "frequency": cv["frequency"],
                                 "source": cv["source"] + " (AI)"})
    return {"ticklers_created": len(out["ticklers"]), "covenants_created": len(out["covenants"])}


class DraftReq(BaseModel):
    kind: str  # 'annual_review' | 'brief'
    loan_id: Optional[str] = None


@app.post("/api/draft")
def draft(req: DraftReq, orgs: List[str] = Depends(caller_orgs)):
    org = orgs[0]
    if req.kind == "annual_review" and req.loan_id:
        loan = sb("loans", params={"id": f"eq.{req.loan_id}", "select": "*, customers(name, company)"})[0]
        if loan["org_id"] not in orgs:
            raise HTTPException(404, "loan not found")
        ctx = {
            "loan": loan,
            "payments": sb("loan_payments", params={"loan_id": f"eq.{req.loan_id}", "select": "due_date, amount, status, paid_date"}),
            "covenants": sb("covenants", params={"loan_id": f"eq.{req.loan_id}", "select": "name, requirement, actual, status"}),
            "spreads": sb("financial_spreads", params={"customer_id": f"eq.{loan['customer_id']}", "select": "period, data, status"}) if loan.get("customer_id") else [],
        }
        prompt_kind = "an annual credit review memo (sections: Relationship summary, Financial performance, Covenant compliance, Payment performance, Risks, Recommendation)"
    else:
        ctx = {
            "loans": sb("loans", params={"org_id": f"eq.{org}", "select": "loan_number, amount, stage, maturity, customers(company)"}),
            "past_due": sb("loan_payments", params={"org_id": f"eq.{org}", "status": "neq.paid", "select": "due_date, amount, loans(loan_number)"}),
            "covenants": sb("covenants", params={"org_id": f"eq.{org}", "status": "neq.Pass", "select": "name, status, actual, loans(loan_number)"}),
        }
        prompt_kind = "a Monday-morning portfolio brief for the chief credit officer: 5-8 bullet points, most urgent first, plain language"
    text = llm_text(
        f"You are a commercial bank portfolio analyst. Write {prompt_kind}. Use only the data provided; never invent figures.",
        json.dumps(ctx, default=str)[:24000],
        mock="## Portfolio brief\n- Cascade Fabrication: Aug 28 payment now 13 days past due ($17,850); final-notice SMS sent under the 13-day rule.\n- Bluestem Ag: minimum working capital covenant still failing ($355K vs $400K); waiver decision needed before Dec test.\n- Harbor Point: FCC 1.18x vs 1.20x — near violation; Q3 interims due Nov 14 will decide.\n- One document awaiting routing review; two spread drafts awaiting analyst approval.",
    )
    return {"markdown": text}


class AskReq(BaseModel):
    question: str


@app.post("/api/ask")
def ask(req: AskReq, orgs: List[str] = Depends(caller_orgs)):
    plan = llm_json(
        "Translate the banker's question into a query plan. Allowed tables and fields: "
        + json.dumps(ASK_FIELDS) + ". Dates are YYYY-MM-DD; ltv/dscr are numeric.",
        req.question,
        ASK_PLAN_SCHEMA,
        mock={"table": "loans", "filters": [{"field": "payment_type", "op": "eq", "value": "I/O"}], "order_by": "maturity", "limit": 20},
    )
    table = plan["table"]
    allowed = set(ASK_FIELDS[table])
    params: Dict[str, str] = {"select": ",".join(ASK_FIELDS[table]), "org_id": f"eq.{orgs[0]}",
                              "limit": str(min(int(plan.get("limit") or 20), 50))}
    for f in plan["filters"]:
        if f["field"] not in allowed:
            continue  # whitelist: silently drop anything outside the schema
        op = f["op"] if f["op"] != "neq" else "neq"
        params[f["field"]] = f"{op}.{f['value']}"
    if plan.get("order_by") in allowed:
        params["order"] = f"{plan['order_by']}.asc"
    rows = sb(table, params=params)
    answer = llm_text(
        "Answer the banker's question in 2-4 sentences using ONLY these rows. Include figures.",
        json.dumps({"question": req.question, "rows": rows}, default=str)[:20000],
        mock=f"{len(rows)} loans are interest-only. The nearest maturity is {rows[0]['maturity'] if rows else 'n/a'}.",
    )
    return {"answer": answer, "rows": rows, "plan": plan}


# ——— Legacy screener endpoint (multipart) — same contract the frontend already uses ———

FIELD_KEYS = ["property_name", "address", "property_type", "year_built", "building_sf", "land_acres", "units", "parking",
              "occupancy", "tenant_count", "anchor_tenants", "walt_years", "avg_rent_psf",
              "gross_potential_rent", "vacancy_loss", "other_income", "effective_gross_income",
              "operating_expenses", "real_estate_taxes", "insurance", "noi_in_place", "noi_pro_forma",
              "purchase_price", "price_psf", "cap_rate", "closing_date", "broker",
              "loan_amount", "loan_ltv", "loan_term", "rate_request", "equity", "use_of_proceeds",
              "sponsor", "sponsor_experience", "guarantor", "sponsor_net_worth", "sponsor_liquidity"]
FIELD_SCHEMA = {"type": "object", "additionalProperties": False, "required": FIELD_KEYS, "properties": {
    k: {"type": "object", "additionalProperties": False,
        "properties": {"text": {"type": ["string", "null"]}, "number": {"type": ["number", "null"]},
                       "confidence": {"type": "number"}, "page": {"type": ["integer", "null"]}},
        "required": ["text", "number", "confidence", "page"]} for k in FIELD_KEYS}}


@app.post("/api/extract")
async def extract_om(file: UploadFile = File(...)):
    data = await file.read()
    text = ocr(data, file.filename or "memo.pdf")
    n_pages = max(text.count("=== PAGE"), 1)
    fields = llm_json(
        "You are a CRE credit analyst reading an offering memorandum (pages marked '=== PAGE n ==='). "
        "Fill every field: text as written; number normalized (dollars plain, percents as fractions); "
        "page where found; confidence 0-1. Missing -> nulls with confidence 0. Never invent numbers.",
        f"<memo>\n{text[:120000]}\n</memo>",
        FIELD_SCHEMA,
        mock={k: {"text": None, "number": None, "confidence": 0.0, "page": None} for k in FIELD_KEYS},
    )
    return {"source": {"filename": file.filename, "pages": n_pages,
                       "ocr": f"{'mock' if MOCK else OCR_MODEL} + {LLM_MODEL.split('/')[-1]} · {n_pages} pages"},
            "fields": fields}
