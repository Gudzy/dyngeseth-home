# CLAUDE.md — dyngeseth.no

Personal portfolio site for Gustav Dyngeseth. React 18 + TypeScript + Vite, hosted on Azure Static Web Apps at [dyngeseth.no](https://dyngeseth.no).

## Quick Commands

```bash
npm install        # install dependencies
npm run dev        # start dev server at http://localhost:5173
npm run build      # tsc + vite build → dist/
npm run preview    # preview the production build locally
npm run lint       # ESLint (zero warnings policy, --max-warnings 0)
```

**Before committing:** run `npm run lint` and `npm run build` — CI runs both and will fail the deploy if either errors.

## Repository Layout

```
src/
  App.tsx                        # root component, composes all sections
  main.tsx                       # React DOM entry point
  index.css                      # global reset / base styles
  speech.d.ts                    # ambient types for Web Speech API
  declarations.d.ts              # other ambient declarations
  components/
    Nav.tsx / Nav.module.css     # sticky top nav (anchor links)
    Hero.tsx / Hero.module.css   # intro / above-the-fold section
    Transcriber.tsx / Transcriber.module.css  # voice-to-text feature ("Lytt")
    Contact.tsx / Contact.module.css          # contact info + social links
    Footer.tsx / Footer.module.css            # site footer
  hooks/
    useTranscriber.ts            # all recording/transcription logic
public/
  favicon.svg
  staticwebapp.config.json       # Azure routing rules + security headers
.github/
  workflows/
    azure-static-web-apps-yellow-beach-0d4a4e903.yml  # CI/CD pipeline
```

## Architecture

Single-page app with **anchor-based navigation** — no client-side router. Sections have `id` attributes (`#top`, `#transcribe`, `#contact`) and the nav links to them directly.

Page composition in `App.tsx`:
```
<Nav /> → <Hero /> → <Transcriber /> → <Contact /> → <Footer />
```

## Styling Conventions

- **CSS Modules only** — every component has a paired `ComponentName.module.css`.
- No CSS-in-JS, no Tailwind, no global utility classes.
- Global base styles only in `src/index.css`.
- Class names follow camelCase in CSS Modules (e.g. `styles.topLine`, `styles.micBtn`).

## TypeScript Conventions

- Strict mode enabled (`strict: true`, `noUnusedLocals`, `noUnusedParameters`).
- Target `ES2020`, module resolution `bundler`.
- All component files use `.tsx`; hooks and utilities use `.ts`.
- Interfaces and types are exported from the file where they are defined (e.g. `Transcript`, `Language` from `useTranscriber.ts`).

## The Lytt / Transcriber Feature

The `Transcriber` component and `useTranscriber` hook implement voice-to-text with two engines:

| Engine | When used | How |
|---|---|---|
| **lytt** (primary) | `lytt serve` running locally at port 3000 | MediaRecorder → audio/webm blob → POST `/transcribe` |
| **Browser Speech API** (fallback) | Chrome/Edge + no lytt server | `window.SpeechRecognition` / `webkitSpeechRecognition` |

**Key constants in `useTranscriber.ts`:**
- `LYTT_API = 'http://localhost:3000'` — local lytt server endpoint
- `STORAGE_KEY = 'dyngeseth:transcripts'` — localStorage key

**Availability check:** on mount, the hook pings `GET /health` with a 1.5 s timeout. `lyttAvailable` is `null` while checking, `true`/`false` after.

**Languages supported:** `'auto'` | `'en'` | `'no'` (Norwegian). Language maps to `en-US` / `nb-NO` for the browser API, and `english` / `norwegian` for the lytt API.

**Transcript data shape:**
```ts
interface Transcript {
  id: string        // crypto.randomUUID()
  text: string
  language: string
  createdAt: string // ISO 8601
  source: 'lytt' | 'browser'
}
```

Transcripts are stored in `localStorage` and persist across page reloads. They are never sent to any remote server.

## CI/CD and Deployment

**Trigger:** Push to `main` → automatic deploy to Azure Static Web Apps.

**Pipeline steps (`.github/workflows/`):**
1. Checkout
2. Setup Node 20 (with npm cache)
3. `npm ci`
4. `npm run build`
5. Deploy `dist/` via `Azure/static-web-apps-deploy@v1`

**Required GitHub secret:** `AZURE_STATIC_WEB_APPS_API_TOKEN_YELLOW_BEACH_0D4A4E903`

**PR previews:** Azure automatically creates a preview environment for each PR and tears it down when the PR is closed (handled by `close_pull_request_job`).

**Azure routing** (`public/staticwebapp.config.json`): all routes rewrite to `/index.html` (SPA fallback). Security headers applied globally: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`.

## Environment Variables

Create `.env.local` for local-only secrets (never commit):
```
VITE_API_URL=https://...
```
Access in code via `import.meta.env.VITE_API_URL`. All Vite env vars must be prefixed `VITE_`.

## Key Development Notes

- **No test suite currently exists.** Validate changes by running `npm run build` and `npm run lint`.
- **No path aliases** configured in `vite.config.ts` — use relative imports.
- The `lytt` server is a local-only tool ([github.com/Smebbs/lytt](https://github.com/Smebbs/lytt)); it is never deployed and not required for the site to function.
- The site is purely static — no server-side rendering, no API routes in this repo.
- **Future planned additions** (from README): Azure Functions backend in `api/` (Rust/WASM), Azure AD B2C auth, Azure Cosmos DB for transcript persistence.

## What to Avoid

- Do not add a client-side router unless explicitly requested — navigation is intentionally anchor-based.
- Do not add global CSS classes or utility frameworks; keep CSS Modules per-component.
- Do not commit `.env.local` or any secrets.
- Do not push directly to `main` — use a branch and PR so CI/CD preview environments work correctly.
- Do not bypass TypeScript strict mode or suppress ESLint rules without a documented reason.
