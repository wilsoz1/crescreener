# CRE Screener — extraction API

Turns an offering memorandum into a typed deal sheet: **PDF → page images → Unlimited-OCR → Claude structured extraction**. The static site at crescreener.com calls this; the UI does the underwriting math itself.

## Run the OCR model (GPU box)

Unlimited-OCR needs an NVIDIA GPU. Easiest is the official vLLM image, which exposes an OpenAI-compatible endpoint:

```bash
docker run --gpus all -p 8000:8000 vllm/vllm-openai:unlimited-ocr \
  --model baidu/Unlimited-OCR --served-model-name Unlimited-OCR --max-model-len 32768
```

(SGLang works too — see the model README; point `OCR_BASE_URL` at whichever server you run.)

## Run this API

```bash
cd server
python3.10 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export OCR_BASE_URL=http://<gpu-box>:8000/v1
export ANTHROPIC_API_KEY=...           # or `ant auth login`
uvicorn main:app --host 0.0.0.0 --port 8787
```

No GPU yet? `MOCK_OCR=1 uvicorn main:app --port 8787` skips OCR and feeds `sample_om.md` to the extractor, so you can exercise the full API + UI path.

## Point the site at it

Open `https://crescreener.com/?api=https://<your-api-host>` once — the URL is remembered in the browser's localStorage. Without it the site runs in demo mode (bundled sample deal).

The API must be served over HTTPS for the HTTPS site to call it (put it behind Caddy / Cloudflare Tunnel / a cloud load balancer). CORS is open to crescreener.com and localhost dev by default (`ALLOWED_ORIGINS`).
