# API Deployment Configuration

## Render backend

- Keep `DATABASE_URL` pointed at the existing Render PostgreSQL database; do not reset it.
- Set `CORS_ORIGIN` to exact deployed frontend origin(s), comma-separated, e.g. `https://internshield-pmio.vercel.app` (no trailing slash, path, or wildcard).
- Preserve the existing `SESSION_SECRET`. Keep it exclusively on the backend.
- Configure `GEMINI_API_KEY` as a backend secret for AI validation; never put it in a Vercel `VITE_` variable.
- Keep `APP_ENV=production` and `SEED_DEMO_DATA=false`.

## Vercel frontend

- Set `VITE_API_URL` to the actual Render API base URL, including `/api`, e.g. `https://internshield-backend.onrender.com/api`.
- Redeploy Vercel after changing this build-time setting. Redeploy Render after backend code or environment changes.

## Local development

- Frontend API base: `http://127.0.0.1:4001/api`.
- Run `npm run backend` from the repository root.
- Development CORS explicitly includes localhost and loopback origins on ports 3000, 5173, and 8080.
