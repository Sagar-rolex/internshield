# ScamShield Backend — FastAPI + PostgreSQL

## Setup

```bash
# 1. Create and activate a Python virtual environment
python -m venv venv
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# 2. Install dependencies
pip install -r backend_fastapi/requirements.txt

# 3. Make sure PostgreSQL is running and a 'scamshield' database exists
createdb scamshield

# 4. Set environment variables (optional — defaults shown)
export DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/scamshield
export SESSION_SECRET=dev-secret-change-me
export CORS_ORIGIN=http://localhost:5173

# 5. Start the server
uvicorn backend_fastapi.main:app --host 127.0.0.1 --port 4001 --reload
# or via npm script:
npm run backend
```

Tables are created automatically on first start. Seed data is inserted if the users table is empty.

## API Docs

Open http://127.0.0.1:4001/docs for the interactive Swagger UI.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://postgres:postgres@localhost:5432/scamshield` | PostgreSQL connection string |
| `SESSION_SECRET` | `dev-secret-change-me` | HMAC signing key — set a strong value in production |
| `CORS_ORIGIN` | `http://localhost:5173` | Comma-separated allowed origins |
| `GEMINI_API_KEY` | *required for AI/chat layer* | Google Gemini API key; set only on the backend |
| `GEMINI_MODEL` | `gemini-3.8-flash` | Optional Gemini model name override |
| `OCR_BACKEND` | `auto` | `auto` \| `tesseract` \| `demo` — OCR engine selection |

## Demo Accounts

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@internshield.com | admin123 |
| User | student@internshield.com | student123 |

## Running Tests

```bash
# Install test dependencies (if not already installed)
pip install pytest pytest-asyncio

# Run all tests
python -m pytest tests/ -v

# Run with coverage
python -m pytest tests/ --cov=services --cov-report=term-missing
```

## Hybrid Engine Architecture

The backend implements a **Hybrid Scam Detection Engine** with three services:

1. **`services/rule_engine.py`** — Wraps the existing deterministic 6-signal rule engine
2. **`services/gemini_service.py`** — Google Gemini AI contextual analysis (never exposed to frontend)
3. **`services/risk_aggregator.py`** — Combines rule + AI scores (70%/30% weight)

The `GEMINI_API_KEY` environment variable is **required for the chatbot and optional AI analysis layer**. If it is not configured, rule-based job analysis still works; chatbot requests return a clear unavailable response rather than a fabricated answer. The service uses Google's `google-genai` SDK and the `GEMINI_MODEL` setting.
