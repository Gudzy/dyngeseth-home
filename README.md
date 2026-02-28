# dyngeseth.no

Personal website — React + TypeScript + Vite, hosted on Azure Static Web Apps.

## Local Development

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Project Structure

```
src/
  components/     # UI components (Nav, Hero, Transcriber, Contact, Footer)
  hooks/          # Custom React hooks (useTranscriber)
  pages/          # Future page-level components
  assets/         # Static assets
.github/
  workflows/
    deploy.yml    # CI/CD — auto-deploys to Azure on push to main
public/
  staticwebapp.config.json  # Azure routing rules
```

## Deploying to Azure Static Web Apps

### 1. Create Azure Resource

1. Go to [portal.azure.com](https://portal.azure.com)
2. Search for **Static Web Apps** → Create
3. Choose:
   - Subscription: your subscription
   - Resource group: create new `dyngeseth-rg`
   - Name: `dyngeseth`
   - Region: `West Europe` (closest to Norway)
   - Plan type: **Free**
   - Deployment source: **GitHub**
4. Authorize GitHub and select your repo + `main` branch
5. Build details:
   - App location: `/`
   - Output location: `dist`
6. Click **Review + Create**

Azure will auto-generate and commit the GitHub Actions workflow, but you already have it in `.github/workflows/deploy.yml`.

### 2. Get your API token

After creation, go to your Static Web App → **Manage deployment token** → copy the token.

In your GitHub repo: **Settings → Secrets → Actions → New secret**
- Name: `AZURE_STATIC_WEB_APPS_API_TOKEN`
- Value: paste the token

### 3. Connect Custom Domain (dyngeseth.no)

**In Azure Portal → your Static Web App → Custom domains:**
1. Click **+ Add**
2. Enter `dyngeseth.no`
3. Azure will give you a **CNAME value** (e.g. `proud-field-abc123.azurestaticapps.net`)

**In Domeneshop (domeneshop.no):**
1. Log in → DNS for `dyngeseth.no`
2. Add record:
   - Type: `CNAME`
   - Name: `@` (or `www`)
   - Value: the Azure URL above
   - TTL: 3600
3. For the apex domain (`@`), Domeneshop may require an `ALIAS` or `ANAME` record instead of CNAME — use that if CNAME doesn't work on `@`.

HTTPS is automatic via Let's Encrypt — no action needed.

### 4. Push & deploy

```bash
git add .
git commit -m "initial commit"
git push origin main
```

Watch the Actions tab in GitHub — your site will be live at dyngeseth.no within ~2 minutes.

## Voice Transcriber

Uses the browser's built-in Web Speech API. Works in Chrome and Edge.
Transcripts are stored in `localStorage` — private to the user's browser.

### Future: Rust / Azure Functions backend

When you're ready to add server-side transcription (e.g. OpenAI Whisper or Azure AI Speech):
1. Create an Azure Functions app (Rust via `cargo-azure-functions` or WASM)
2. Add an API folder: `api/` in the project root
3. Azure Static Web Apps automatically routes `/api/*` to your Functions
4. Swap `localStorage` for Azure Cosmos DB for signed-in users

## Environment Variables

Create `.env.local` for local secrets (never commit this):

```
VITE_API_URL=https://...
```

Access in code: `import.meta.env.VITE_API_URL`

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React 18, TypeScript, Vite |
| Styling | CSS Modules |
| Hosting | Azure Static Web Apps (free tier) |
| CI/CD | GitHub Actions |
| Domain | Domeneshop → CNAME → Azure |
| Auth (future) | Azure AD B2C |
| Database (future) | Azure Cosmos DB |
| Backend (future) | Azure Functions (Rust/WASM) |
