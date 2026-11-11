# API Connection Audit

## Request path

- `src/routes/detect.tsx` submits manual analysis through `api.analyzeManual`.
- `src/lib/api.ts` builds the URL from `VITE_API_URL`, defaulting to `http://127.0.0.1:4001/api` in Vite development and `https://internshield-backend.onrender.com/api` in production.
- The request is an authenticated JSON `POST /analyze` with a bearer token.
- `backend_fastapi/main.py` exposes `POST /api/analyze`, validates the input, runs the evidence detector and optional Gemini validation, persists the result for the authenticated user, and returns `{ analysis: ... }`.
- `GET /api/analyses` reads the signed-in user's saved history.

## Root cause found

The browser message was emitted when `fetch()` failed before receiving an HTTP response. Local API URL and route matched. The local `.env.local` supplied only a deployed Vercel `CORS_ORIGIN` (with a trailing slash); the backend then omitted its localhost development origins because it used the development defaults only when the variable was empty. A browser request from `http://localhost:3000` therefore failed the CORS preflight and appeared as a generic backend connectivity error.

The current workspace cannot inspect live Vercel or Render settings. The production URL, service health, and production CORS configuration remain unverified.

## Fix

Development now combines configured origins with explicit localhost origins for ports 3000, 5173, and 8080. Trailing slashes are normalized. Production continues to require explicit HTTPS origins and now rejects paths, wildcards, query strings, and fragments.
