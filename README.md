# ScamShield.AI — Fake Internship & Job Scam Detector

An AI-powered web app that helps students detect fake internships and job scams. Enter a job posting and get a deterministic risk score with explainable reasoning. Built as a college mini-project.

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19, TanStack Start (SSR) + Router + Query, Tailwind CSS v4, shadcn/ui |
| **Backend** | Python FastAPI + SQLAlchemy + PostgreSQL (asyncpg), scrypt password hashing, HMAC bearer tokens |
| **Detection** | **Hybrid Engine**: 6-signal deterministic rule engine + Google Gemini AI contextual analysis |
| **Deploy** | Cloudflare Workers (via `wrangler.jsonc` + `@cloudflare/vite-plugin`) |
| **Tooling** | Vite 7, TypeScript 5.8 (strict), ESLint 9, Prettier, pytest |

## Prerequisites

- Node.js **20+**, npm or bun
- Python **3.10+**
- PostgreSQL running locally

## Getting Started

```bash
npm install          # or bun install
```

**Backend setup (Python + FastAPI + PostgreSQL):**

```bash
# 1. Create and activate a virtual environment
python -m venv venv
venv\Scripts\activate        # Windows
source venv/bin/activate     # macOS/Linux

# 2. Install Python dependencies
pip install -r backend_fastapi/requirements.txt

# 3. Create the database (once)
createdb scamshield

# 4. Start the API server (Terminal 1)
npm run backend

# 5. Start the frontend (Terminal 2)
npm run dev
```

Open **http://localhost:5173**.

Interactive API docs: http://127.0.0.1:4000/docs

## Demo Accounts

Seeded automatically on the first backend start.

| Role | Email | Password |
|---|---|---|
| Admin | `admin@internshield.com` | `admin123` |
| User | `student@internshield.com` | `student123` |

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start Vite dev server (frontend) |
| `npm run backend` | Start Python FastAPI server (port 4000) |
| `npm run build` | Production build for Cloudflare Workers |
| `npm run preview` | Preview production build |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |

## Environment Variables (optional)

| Variable | Where | Default |
|---|---|---|
| `VITE_API_URL` | frontend build environment | Local: `http://127.0.0.1:4000/api`; production fallback: `https://internshield-backend.onrender.com/api` |
| `DATABASE_URL` | backend | `postgresql+asyncpg://postgres:postgres@localhost:5432/scamshield` |
| `SESSION_SECRET` | backend | `dev-secret-change-me` (**set a strong value in prod**) |
| `CORS_ORIGIN` | backend | Local Vite origins; production must list the exact frontend origin(s), comma-separated |
| `GEMINI_API_KEY` | backend | *required for AI layer* |
| `OCR_BACKEND` | backend | `auto` (auto \| tesseract \| demo) |

`auto` uses Tesseract when available and returns a clear service error if it is missing. It never substitutes sample OCR text. `demo` is an explicit development/test setting only.

## Deploying the API to Render

The Render Blueprint builds the FastAPI service from `backend_fastapi/Dockerfile`, which installs Tesseract and its English language data alongside the Python requirements. Set these values in the Render service environment:

- `CORS_ORIGIN`: the exact Vercel production origin (for example, `https://your-project.vercel.app`). Add any approved preview/custom domains as comma-separated origins.
- `DATABASE_URL`, `SESSION_SECRET`, and `GEMINI_API_KEY` as required by the backend. Keep secret values in Render's environment settings.

Set the Vercel build environment variable `VITE_API_URL` to `https://internshield-backend.onrender.com/api`, or to the actual custom Render service URL if it differs. The API uses bearer tokens and does not require cross-origin cookies.

## API Endpoints

```
POST /api/auth/register        Register a user account
POST /api/auth/login           Login (user)
POST /api/auth/admin-login     Login (admin)
GET  /api/admin/users          [admin] List users
PATCH/DELETE /api/admin/users/:id   [admin] Update / delete user
GET  /api/reports              List scam reports (auth)
POST /api/reports              Submit a scam report (auth)
PATCH/DELETE /api/reports/:id  Update / delete report (auth)
GET  /api/companies            List companies (auth)
POST /api/companies            [admin] Add company
PATCH/DELETE /api/companies/:id  Update / delete company
GET  /api/analytics            Analytics counts (auth)
GET  /api/health               Health check
```

Authenticated routes expect `Authorization: Bearer <token>` (token is returned by login/register).

## Deploying to Cloudflare Workers

```bash
# 1. Install the Wrangler CLI
npm i -g wrangler

# 2. Log in
wrangler login

# 3. Build
npm run build

# 4. Deploy
wrangler deploy
```

**Important for production:**

- Set `SESSION_SECRET` to a strong random value (Cloudflare Workers secret):
  ```
  wrangler secret put SESSION_SECRET
  ```
- Set `CORS_ORIGIN` to your site's domain (e.g. `https://scamshield.example.com`).
- In a production Workers-only deployment, migrate the API routes into the Worker or host the API separately and point `VITE_API_URL` at it (note: the app also works fully client-side since the scam detector itself runs in the browser).

## Project Structure

```
backend_fastapi/
  database.py              SQLAlchemy async engine + PostgreSQL session
  models.py                User, ScamReport, Company, Analysis ORM models
  schemas.py               Pydantic request/response validation
  auth.py                  Password hashing + token helpers
  main.py                  FastAPI app (all routes)
  seed.py                  Demo data seeder
  requirements.txt         Python dependencies
  services/                Hybrid Scam Detection Engine services
    rule_engine.py         Deterministic 6-signal rule-based detection
    gemini_service.py      Google Gemini AI contextual analysis
    risk_aggregator.py     Combines rule + AI scores into final assessment
  tests/                   Backend test suite
    test_hybrid_engine.py  Rule engine, AI integration, aggregator tests
src/
  components/              App components (Header, Chatbot, AuthProvider, AdminShell, …)
  components/ui/           45+ shadcn/ui primitives
  lib/
    scam-detector.ts       Client-side rule-based scam score engine (fallback)
    api.ts                 Typed HTTP client (env-based URL, Auth header)
  routes/                  TanStack Router file-based routes
  router.tsx               Router factory
  server.ts                Cloudflare Workers entry
wrangler.jsonc             Cloudflare deployment config
```

## Notes

- The scam detection uses a **Hybrid Engine** combining:
  1. **Rule Engine** — Deterministic 6-signal heuristic (suspicious keywords, free email, unrealistic salary, missing/insecure website, vague description, missing company info). Runs client-side and server-side.
  2. **Gemini AI** — Contextual analysis that understands nuance, not just keywords. Never exposed to frontend; API key stays in backend environment.
  3. **Risk Aggregator** — Weighted combination: 70% rule engine + 30% AI. If AI unavailable, rule-only result is used.
- Data files, `.env*`, and build output are git-ignored.
- Auth tokens are currently stored in `localStorage`. For production, prefer `httpOnly` cookies or short-lived tokens with revocation.

### Hybrid Engine Scoring

| Component | Weight | Range | Notes |
|---|---|---|---|
| Rule Engine | 70% | 0–98 | Deterministic, authoritative for patterns |
| Gemini AI | 30% | 0–100 | Contextual, supplements rules |
| **Final Score** | — | 0–100 | `round(0.7 × rule + 0.3 × ai)` |

**Risk Levels:**
- **Low** (0–29): Generally legitimate
- **Medium** (30–59): Notable concerns, proceed with caution
- **High** (60–100): Strong scam indicators

### Running Tests

```bash
# Backend tests
cd backend_fastapi
python -m pytest tests/ -v
```
