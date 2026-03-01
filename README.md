# dyngeseth.no

Personal portfolio for Gustav Dyngeseth — React + TypeScript hosted on Azure Static Web Apps, with a live AI voice transcription feature powered by OpenAI Whisper.

## Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18 · TypeScript · CSS Modules · Vite |
| Cloud API | Azure Static Web Apps Managed Functions (Node 22) |
| Transcription | OpenAI Whisper (`api/src/lib/whisper.ts`) |
| Local bridge | Rust · Axum (`lytt-bridge/`) |
| Hosting & CI/CD | Azure Static Web Apps + GitHub Actions |
| Domain | domeneshop.no → CNAME → Azure |

---

## Lytt — Three-Tier Voice Transcription

The main feature ("Lytt", Norwegian for "Listen") records your voice and transcribes it using three engines in priority order:

```
Tier 1  http://localhost:3000   lytt-bridge  — Rust Axum server, developer machine only
Tier 2  /api/transcribe         Azure Function — OpenAI Whisper, available to all visitors
Tier 3  Browser Web Speech API  — no API key required, last resort
```

On page load the frontend runs health checks with short timeouts (1.5 s → 3 s → immediate) and picks the highest available tier. The engine badge in the UI shows which tier is active.

Recording uses **silence detection** via the Web Audio API: audio amplitude is sampled every 100 ms, and when the user pauses for 1.5 s the current chunk is sent to Whisper automatically. The microphone stays open and a new chunk begins immediately — no manual stop needed between utterances.

Transcripts are stored in `localStorage` and never leave the device beyond the transcription request itself.

### Why `https.request()` instead of the OpenAI SDK?

The OpenAI SDK uses `fetch` (Node.js undici) to send multipart audio. Inside Azure SWA managed function sandboxes, this fetch-based multipart serialisation hangs for ~30 s and then fails. Raw `https.request()` — confirmed at 437 ms to `api.openai.com` — works reliably, so `api/src/lib/whisper.ts` builds the multipart body by hand without the SDK dependency.

---

## Project Structure

```
/
├── src/                              # React frontend
│   ├── components/                   # Nav, Hero, Transcriber, Contact, Footer
│   │   └── *.module.css              # Per-component CSS Modules
│   ├── hooks/
│   │   └── useTranscriber.ts         # All transcription logic + engine detection
│   ├── App.tsx
│   └── main.tsx
│
├── api/                              # Azure Functions (TypeScript → esbuild → CJS)
│   ├── src/
│   │   ├── functions/
│   │   │   ├── health.ts             # GET /api/health — returns 503 if key missing
│   │   │   └── transcribe.ts         # POST /api/transcribe — multipart audio → text
│   │   └── lib/
│   │       ├── whisper.ts            # Direct HTTPS call to OpenAI Whisper
│   │       └── validate.ts           # File size guard (25 MB Whisper limit)
│   ├── build.mjs                     # esbuild script — bundles each function separately
│   ├── host.json                     # Azure Functions v2 runtime config
│   └── local.settings.json.example   # Template for local secrets (never committed)
│
├── lytt-bridge/                      # Optional local Rust bridge (developer-only)
│   └── src/
│       ├── main.rs                   # Axum setup, CORS, body limit, graceful shutdown
│       ├── app_state.rs              # Shared reqwest::Client + Config
│       ├── config.rs                 # CLI args (host, port, API key via clap)
│       ├── error.rs                  # Unified error type + IntoResponse
│       └── routes/
│           ├── health.rs             # GET /health
│           └── transcribe.rs         # POST /transcribe → OpenAI Whisper
│
├── public/
│   └── staticwebapp.config.json      # Azure SWA routing + security headers
│
└── .github/workflows/
    └── azure-static-web-apps-*.yml   # Auto-deploys on push to main
```

---

## Local Development

### Frontend only

```bash
npm install
npm run dev          # → http://localhost:5173
```

### Frontend + cloud API (full stack)

Requires [Azure Functions Core Tools](https://docs.microsoft.com/azure/azure-functions/functions-run-local) and [SWA CLI](https://azure.github.io/static-web-apps-cli/):

```bash
# Build the API bundle once (or run in watch mode)
cd api && npm install && npm run build && cd ..

# Start everything — SWA emulator routes /api/* to the Functions runtime
swa start http://localhost:5173 --api-location api --run "npm run dev"
# → http://localhost:4280
```

Copy the API secret template and fill in your key:

```bash
cp api/local.settings.json.example api/local.settings.json
# then edit: "OPENAI_API_KEY": "sk-..."
```

### Tier 1 — lytt-bridge (optional)

lytt-bridge is a small Rust HTTP server that proxies audio to OpenAI Whisper. When running locally it is auto-detected by the frontend and used instead of the cloud function, removing the round-trip latency to Azure.

```bash
cd lytt-bridge
cp .env.example .env        # add OPENAI_API_KEY=sk-...
cargo run --release          # → http://localhost:3000
```

---

## Deployment

Every push to `main` triggers the GitHub Actions workflow, which uses `Azure/static-web-apps-deploy@v1`. Oryx (Azure's build tool) runs inside the workflow container and:

1. Installs frontend dependencies and runs `vite build` → `dist/`
2. Installs API dev-dependencies, runs `node build.mjs` (esbuild), then strips dev-dependencies → `api/dist/`
3. Deploys both artefacts to Azure Static Web Apps

Azure SWA routes all `/api/*` requests to the managed Functions at the platform level, before the static routing config is evaluated.

### OpenAI API key — one-time setup

The key lives exclusively in Azure App Settings and is never in code, git, or GitHub Actions:

**Azure Portal → your Static Web App → Settings → Configuration → Application settings**

| Key | Value |
|-----|-------|
| `OPENAI_API_KEY` | `sk-...` |

The health endpoint returns `200 {"ok":true}` when the key is present and `503` when it is not, allowing the frontend to fall back gracefully to the browser Speech API.
