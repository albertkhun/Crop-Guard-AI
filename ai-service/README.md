---
title: PaddyGuard AI Service
emoji: 🌾
colorFrom: green
colorTo: yellow
sdk: docker
app_port: 8000
pinned: false
---

# PaddyGuard AI service

FastAPI service that loads the paddy leaf CNN (`models/paddy_best.keras`) once at startup and serves
`POST /predict`, `GET /weather-risk`, `GET /classes` and `GET /health`. It is **private**: every route except
`/health` requires the shared secret in the `X-Internal-Key` header, and only the Express server calls it.

The YAML block above is only for Hugging Face Spaces (Docker SDK); GitHub ignores it.

## Run

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
pytest -q                                              # 67 tests
INTERNAL_KEY=dev-secret uvicorn app.main:app --port 8000
MOCK_AI=true INTERNAL_KEY=dev-secret uvicorn app.main:app --port 8000   # canned responses, no model needed
```

Mock mode accepts a `mock_scenario` form field on `/predict` (`ok`, `low_confidence`, `unclear_image`).

## Swap or retrain the model (file-only)

Replace `models/paddy_best.keras`, `models/class_names.json` (keys in training order) and bump `version` in
`models/model_meta.json`. Every class key needs an entry in `data/treatments.json`; startup fails fast otherwise.
Input/output contract: 224x224x3 float32 RGB in [0, 1] (the model rescales internally) and a softmax over the classes.

## Evaluate on your own test images

```bash
python scripts/evaluate.py --data-dir path/to/test               # test/<class_key>/*.jpg
python scripts/evaluate.py --data-dir path/to/test --resize tf   # A/B the resize backend
python scripts/evaluate.py --data-dir path/to/test --ood-dir path/to/non_paddy_photos
python scripts/list_todos.py -v                                  # every unverified (TODO_VERIFY) data item
```

## Deploy as a Hugging Face Space (Docker)

1. Create a Space: SDK **Docker**, hardware CPU basic. Keep it public: access is protected by `X-Internal-Key`.
2. In the Space **Settings → Secrets**, add `INTERNAL_KEY` (same value as the server's `AI_INTERNAL_KEY`).
   Optional Variables: `CONFIDENCE_THRESHOLD`, `RESIZE_BACKEND`, and so on.
3. Push this folder as the Space repo. The 30 MB model must go through Git LFS (`.gitattributes` is included):

```bash
git lfs install
cp -r ai-service /tmp/paddyguard-ai && cd /tmp/paddyguard-ai
git init -b main && git add . && git commit -m "PaddyGuard AI service"
git remote add space https://huggingface.co/spaces/<user>/<space-name>
git push space main
```

4. The service URL is `https://<user>-<space-name>.hf.space`. Use it as the server's `AI_SERVICE_URL`.

Free Spaces sleep when idle. The first request after a sleep takes about a minute (container start, TensorFlow import,
model load). The Express server retries once and the React client shows a "waking up" banner.
