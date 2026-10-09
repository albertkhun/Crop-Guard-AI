# 🌾 PaddyGuard

Paddy (rice) leaf disease detection from a phone photo. A farmer photographs a leaf, picks a district (or uses GPS),
and gets a diagnosis with confidence, practical guidance, and rule-based weather context.

**Status: hackathon prototype.** It runs end to end and is tested, but its agronomy content is placeholder text
until you verify it (see [Known limitations](#known-limitations)).

> ### How the AI and the weather fit together (read this first)
> - **The diagnosis comes only from an image CNN** (MobileNetV2). It has no weather input.
> - **Weather is a separate, transparent, rule-based layer** that (a) annotates the result as supporting, partly
>   matching, or not matching, and (b) gives a standalone 7-day risk alert.
> - It is **not** a trained fusion model, and the UI says so. Label used everywhere:
>   *"Rule-based environmental context; trainable fusion is future work."*
> - Weather can mildly reorder close calls (multipliers 0.8 to 1.25) **only when the CNN is below the confidence
>   gate**. It never overrides a confident prediction and never influences the gate.

## Architecture

```mermaid
flowchart LR
  B[React client<br/>Vercel / Netlify] -->|HTTPS + X-Device-Id| E[Express API<br/>Render]
  E --> M[(MongoDB Atlas)]
  E --> C[(Cloudinary<br/>images)]
  E -->|X-Internal-Key| F[FastAPI + Keras model<br/>Hugging Face Space]
  F --> O[Open-Meteo<br/>weather]
```

The browser only ever talks to Express. FastAPI is private: every route except `/health` requires the shared
secret in `X-Internal-Key`.

```
paddy-guard/
├── client/        React + Vite (upload, result, history, feedback)
├── server/        Express + Mongoose (the only public API) + feedback export script
├── ai-service/    FastAPI + TensorFlow/Keras, data/*.json, evaluate.py, tests
├── scripts/smoke.mjs     end-to-end check for any running stack
├── docker-compose.yml    local stack: mongo + ai-service + server + client
└── .env.example
```

## Quick start

### Option A: demo in one command, no model and no accounts (mock mode)

```bash
cp .env.example .env              # then set INTERNAL_KEY=<any long random string>
MOCK_AI=true STORAGE_DRIVER=local docker compose up --build
# open http://localhost:5173
```

`MOCK_AI=true` makes the AI service return canned model outputs (the real gate, advice and weather-rule code still
run on top), so the front end can be built and demoed without TensorFlow or the model file. The upload form is
unchanged; to force a state, call the API with a `mock_scenario` field:

```bash
for s in ok low_confidence unclear_image; do
  curl -s -F image=@server/test/fixtures/leaf.jpg -F mock_scenario=$s -H "X-Device-Id: $(uuidgen)" \
    http://localhost:4000/api/scans | python3 -c "import sys,json; print(json.load(sys.stdin)['aiResponse']['status'])"
done
```

(`mock_scenario` is only forwarded while `NODE_ENV` is not `production`.)

### Option B: the real model with Cloudinary

1. Put `paddy_best.keras` in `ai-service/models/`.
2. In `.env` set `INTERNAL_KEY` and your Cloudinary credentials (`CLOUDINARY_URL`, or the three `CLOUDINARY_*` values).
3. `docker compose up --build`, then open <http://localhost:5173>. The AI service needs about a minute to load
   TensorFlow and the model; the app shows a "waking up" banner meanwhile.

### Option C: run the services by hand (development)

```bash
# 1. AI service                     (Python 3.12)
cd ai-service && python -m venv .venv && . .venv/bin/activate && pip install -r requirements-dev.txt
INTERNAL_KEY=dev-secret uvicorn app.main:app --port 8000        # add MOCK_AI=true to skip the model

# 2. Express API                    (Node >= 20.6, a MongoDB on :27017)
cd server && npm install && cp ../.env.example .env             # fill AI_INTERNAL_KEY=dev-secret + Cloudinary
npm start

# 3. React client
cd client && npm install && npm run dev                         # http://localhost:5173
```

### Verify any running stack

```bash
node scripts/smoke.mjs http://localhost:4000 --origin http://localhost:5173
```

It uploads one real scan and checks: health, AI wake-up, class list, the scan contract, **that the stored image is
actually viewable** (this is the Cloudinary check), weather, read-back, history, per-device privacy, feedback,
bad-upload rejection and CORS. It exits non-zero on any failure and prints what to fix.

## Configuration

Everything is environment-driven; see [`.env.example`](.env.example) for the full annotated list.

| Variable | Service | Purpose |
|---|---|---|
| `INTERNAL_KEY` / `AI_INTERNAL_KEY` | ai / server | Shared secret (same value). Compose maps one `INTERNAL_KEY` to both. |
| `CLOUDINARY_URL` *or* `CLOUDINARY_CLOUD_NAME` + `_API_KEY` + `_API_SECRET` | server | Image storage. The server refuses to start if `STORAGE_DRIVER=cloudinary` and these are missing. |
| `MONGODB_URI` | server | Local Mongo or Atlas `mongodb+srv://...` |
| `CLIENT_ORIGIN` | server | Allowed browser origin(s), comma-separated, no trailing slash. Required in production. |
| `AI_SERVICE_URL`, `AI_TIMEOUT_MS` | server | Where the AI service lives; per-attempt timeout (one retry on top). |
| `TRUST_PROXY` | server | `true` behind a proxy such as Render so rate limiting sees real client IPs. |
| `CONFIDENCE_THRESHOLD` | ai | The 0.85 gate on the raw CNN output. |
| `UNCLEAR_MIN_MAX_PROB`, `UNCLEAR_MAX_NORM_ENTROPY` | ai | "Not a clear rice leaf" checks (unverified defaults). |
| `RESIZE_BACKEND` | ai | `pil` or `tf`; should match how the model was trained. |
| `MOCK_AI` | ai | Canned responses, no model needed. |
| `VITE_API_BASE_URL` | client | Express URL, baked in at build time. |

## API (Express)

All `/api/scans*` routes require a header `X-Device-Id: <uuid>`. The React client generates one per browser and each
device only ever sees its own scans. Errors are always `{ "error": { "code", "message" } }`.

| Route | Description |
|---|---|
| `POST /api/scans` | multipart: `image` (JPEG/PNG, under 10 MB), optional `lat`+`lon`, `district`, `crop_age_days` (0 to 400). Returns **201** with the stored scan. |
| `GET /api/scans?limit=&before=` | Your history, newest first, cursor-paginated (`nextBefore`). |
| `GET /api/scans/:id` | One scan. |
| `POST /api/scans/:id/feedback` | `{ "correct": bool, "true_class"?: "<class_key>" }`; `true_class` is validated against the model's own class list. |
| `GET /api/classes` | `[{class_key, display_name}]` straight from the AI service. |
| `GET /api/health`, `GET /api/health/ai` | Liveness; the second also wakes a sleeping AI service. |

Notable statuses: `400` bad input, `413` too large, `415` not a JPEG/PNG, `429` rate limited,
`503 ai_service_unavailable` (AI asleep after one automatic retry; carries `Retry-After`).

### Prediction contract (`aiResponse`, stored verbatim)

```jsonc
{
  "status": "ok" | "low_confidence" | "unclear_image",
  "prediction": { "class_key": "blast", "display_name": "Rice Blast", "confidence": 0.93 } | null,   // RAW CNN probability
  "top3": [{ "class_key", "display_name", "raw_prob", "adjusted_prob" }],  // adjusted_prob == raw_prob unless low_confidence + weather
  "retake_hint": "..." | null,
  "advice": { "severity_guide", "immediate_actions", "organic_options", "preventive",
              "recovery_timeline", "consult_expert_if", "safety_note" } | null,   // only when status == "ok"
  "weather": { "features": { "past_7d": {...}, "next_7d": {...} }, "context_note", "risk_alert", "source": "open-meteo" } | null,
  "model_version": "paddy-mnv2-v1"
}
```

- `low_confidence` (raw top-1 below the threshold): no prediction, no advice, a retake hint built from the top-2 classes.
- `unclear_image` (very low max probability or high entropy): no prediction, no candidates.
- If Open-Meteo fails, `weather` is `null` and everything else still works.

## Content you must verify before real use

Everything agronomic and every threshold lives in editable JSON, never in code, and every unverified item is marked
`TODO_VERIFY`:

| File | What | Status |
|---|---|---|
| `ai-service/data/treatments.json` | Per-class advice (no doses, no named active ingredients) | Cautious draft; specifics are `[TODO_VERIFY: ...]` slots to fill from ICAR / the IRRI Rice Knowledge Bank |
| `ai-service/data/weather_rules.json` | Weather conditions and multipliers per disease | **Placeholder numbers**, flagged `placeholder: true`. Not agronomic guidance. Set `_meta.verified` to `true` only after you replace them. |
| `ai-service/data/retake_hints.json` | Photo-taking hints | Draft |
| `client/src/data/districts.json` | Manipur districts + approximate coordinates (Imphal West is the default) | **Approximate, typed from memory.** Used only to fetch regional weather. |

```bash
cd ai-service && python scripts/list_todos.py -v            # lists every remaining marker
python scripts/list_todos.py --strict                        # exits 1 while any remain (use as a pre-release check)
```

## Evaluate the model on your own data

```bash
cd ai-service
python scripts/evaluate.py --data-dir /path/to/test                          # test/<class_key>/*.jpg
python scripts/evaluate.py --data-dir /path/to/test --resize tf              # A/B the resize backend, keep the better one
python scripts/evaluate.py --data-dir /path/to/test --ood-dir /path/to/non_paddy_photos
```

Reports per-class accuracy/precision/F1, the confusion matrix (also written to CSV), the top confusions, and what the
gate would do (share answered, accuracy on answered images). With `--ood-dir` it reports how many non-paddy
photos wrongly pass as a confident diagnosis. Use it to tune `CONFIDENCE_THRESHOLD` and `UNCLEAR_*`.

**Swapping or retraining the model is file-only:** replace `models/paddy_best.keras`, `models/class_names.json`
(training order) and bump `models/model_meta.json`. Startup checks that the model's output size matches the class
list and that every class has a `treatments.json` entry.

## Feedback to retraining data

Users can mark a result correct/incorrect and optionally say what it really was. Export it:

```bash
cd server && node scripts/export-feedback.js --out feedback.jsonl [--labeled-only]
```

One JSON line per scan with `label` and `label_kind` (`confirmed`, `corrected`, or `rejected` = known wrong, true
label unknown). The export omits device ids and GPS coordinates (district is kept). Treat user labels as noisy:
review them before training.

## Tests

| Suite | Command | Tests |
|---|---|---|
| ai-service | `cd ai-service && pytest -q` | 67 (gate, preprocessing, weather features and rules, API, real model) |
| server | `cd server && TEST_MONGODB_URI=mongodb://localhost:27017 npm test` | 64 (needs a MongoDB; skipped without `TEST_MONGODB_URI`) |
| server ↔ real AI | `RUN_INTEGRATION=1 AI_SERVICE_URL=... AI_INTERNAL_KEY=... TEST_MONGODB_URI=... npm run test:integration` | 4 |
| client | `cd client && npm test` | 59 (rendered from real captured API responses) |

## Deploy

Deploy in this order. Each step produces a value the next one needs.

**1. MongoDB Atlas.** Create a free cluster and a database user. Under *Network Access* allow `0.0.0.0/0`
(Render's free tier has no fixed IPs; use a strong password, connections are TLS). Copy the connection string and add
the database name: `mongodb+srv://USER:PASS@cluster.mongodb.net/paddyguard`.

**2. Cloudinary.** From the dashboard copy the *API Environment variable*: `cloudinary://<key>:<secret>@<cloud>`.

**3. AI service on a Hugging Face Space (Docker).** Follow [`ai-service/README.md`](ai-service/README.md): create a
Docker Space, add the secret `INTERNAL_KEY`, push the folder (the model goes through Git LFS). Your AI URL is
`https://<user>-<space>.hf.space`.

**4. Express on Render.** New *Web Service* from your repo:

| Setting | Value |
|---|---|
| Root directory | `server` |
| Build / start command | `npm ci` / `npm start` |
| Health check path | `/api/health` |
| Environment | `NODE_VERSION=20`, `NODE_ENV=production`, `TRUST_PROXY=true`, `MONGODB_URI`, `AI_SERVICE_URL`, `AI_INTERNAL_KEY` (same value as the Space's `INTERNAL_KEY`), `CLOUDINARY_URL`, `CLIENT_ORIGIN` (placeholder for now) |

**5. React on Vercel.** Import the repo, set *Root Directory* `client` (framework: Vite), and add
`VITE_API_BASE_URL=https://<your-service>.onrender.com`. `vercel.json` already rewrites all routes to the SPA.
Netlify also works: base directory `client`, build `npm run build`, publish `client/dist` (`_redirects` is included).

**6. Close the loop.** Set `CLIENT_ORIGIN` on Render to your exact Vercel URL (no trailing slash; add
comma-separated extras for preview URLs) and redeploy.

**7. Verify.**

```bash
node scripts/smoke.mjs https://<service>.onrender.com --origin https://<project>.vercel.app
```

On free tiers both Render and the Space sleep when idle. A first request after a long idle can wait for both to
start, which may take a couple of minutes. The server retries the AI service once, and the client shows a visible
"waking up" message; the smoke script waits through it.

## Security and privacy notes

- FastAPI never faces the browser; the shared secret is compared in constant time, and API docs are off by default.
- Uploads are checked by magic bytes (not file name or declared type) before anything is stored or sent on, then
  validated again by the AI service. Images are downscaled in the browser and again on Cloudinary.
- CORS allows only `CLIENT_ORIGIN`. Scan uploads are rate limited per IP.
- **Per-device isolation, not accounts.** Each browser gets a random UUID and only sees its own scans. Anyone who has
  that UUID could read those scans, and clearing browser storage means losing history. Real accounts are a future step;
  the code is structured so JWT only changes `server/src/middleware/auth.js`.
- Photos are stored on Cloudinary under random names. Delivery URLs are unguessable, not access controlled.
  Whether Cloudinary strips EXIF/GPS metadata from the stored original is **unverified**; check an asset before
  relying on it.
- The upload page tells users what is stored. Add your own privacy policy and consent wording before a public launch.

## Known limitations

Be upfront about these in any demo.

1. **Model accuracy: about 80% validation accuracy (author-reported, before retraining).** One in five unseen
   photos may be wrong, and some disease pairs will be confused. The 0.85 gate is a safety net, not a guarantee.
2. **Not a rice-leaf detector.** Softmax models are overconfident on out-of-distribution input. In a sandbox test,
   **46% of random-noise images** passed the 0.85 gate as a confident diagnosis. Real photos of other plants or
   objects may do the same. The proper fix is an "other / not paddy" class at the next retrain. Measure your own
   false-accept rate with `evaluate.py --ood-dir`.
3. **Weather is rule-based, not learned.** It is a transparent layer on top of the CNN, not a trained fusion model.
4. **No field-validated thresholds.** Every weather threshold and multiplier is a placeholder (`TODO_VERIFY`), and
   the unclear-image thresholds (0.40 / 0.80) and the 0.85 gate are untuned defaults.
5. **Advice is placeholder guidance.** No doses, no named pesticides, with specifics left as `TODO_VERIFY` slots.
   Do not present it as expert advice until verified against ICAR / IRRI.
6. **Approximate district coordinates.** Weather for a district is for one approximate point.
7. **Anonymous, not authenticated** history (see above). No accounts, no user-facing deletion.
8. **English only.** No offline mode.
9. **Not tested in a real browser or on real infrastructure.** Development ran in a sandbox without a browser, Docker,
   Cloudinary, Atlas or Open-Meteo access. Component tests use real captured API responses and the server was tested against a
   MongoDB-compatible server, not Atlas itself. Run `scripts/smoke.mjs` on your deployment and try it on a phone.
10. **Free-tier cold starts** (Render, Hugging Face) add up to a couple of minutes to the first request.
11. **Preprocessing parity is unconfirmed.** Make sure `RESIZE_BACKEND` matches how the model's training images were
    resized.

## Roadmap

Train an "other / not paddy" class; retrain on exported feedback; replace placeholder weather rules with
field-validated ones, and later a trainable fusion model; real accounts (JWT); regional-language UI;
thumbnails and image deletion; Open-Meteo and model monitoring.

## Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| Banner says "Waking up the AI service" for minutes | Sleeping Space/instance, or wrong `AI_SERVICE_URL`. Open `<ai-url>/health`; check Space logs. |
| `ai_auth_failed` (HTTP 500) | `INTERNAL_KEY` (Space) and `AI_INTERNAL_KEY` (Render) differ. |
| Browser: "blocked by CORS" | `CLIENT_ORIGIN` must exactly equal the client URL, no trailing slash. `smoke.mjs --origin` tells you. |
| `device_id_required` | The client didn't send `X-Device-Id` (an old cached build, or another client calling the API). |
| Server won't start: "Cloudinary storage selected but missing..." | Set `CLOUDINARY_URL` or all three `CLOUDINARY_*` values (or `STORAGE_DRIVER=local` for dev). |
| Scan works but result says photo "couldn't be saved" | Cloudinary upload failed (`image_not_saved` warning). Check credentials and the server log. |
| `weather: null` | Open-Meteo unreachable or slow. Scans still work without it. |
| Every result is `low_confidence` | Photos too far away or blurry, or `RESIZE_BACKEND` doesn't match training. Run `evaluate.py` on your test set. |
| AI service exits at startup | `models/paddy_best.keras` missing, class count mismatch, or a class missing from `treatments.json`. The error says which. |
