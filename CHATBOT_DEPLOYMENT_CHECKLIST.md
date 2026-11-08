# Chatbot Deployment Checklist

## Before deploying

- [ ] Review `GEMINI_ROOT_CAUSE.md` and `CHATBOT_FIX_REPORT.md`.
- [ ] Run the mocked backend suite with the command in `CHATBOT_TEST_REPORT.md`.
- [ ] Build/lint the frontend (`npm run build`, `npm run lint`).
- [ ] Confirm root `.env.local` is not tracked and no Gemini key is in frontend source or Vercel variables.
- [ ] Keep `GEMINI_MODEL=gemini-3.8-flash` unless Google reports it unavailable for the account.

## Render backend

- [ ] Set `GEMINI_API_KEY` as a secret under Render → backend service → Environment.
- [ ] Optionally set `GEMINI_MODEL=gemini-3.8-flash`; unset uses the same default.
- [ ] Preserve `DATABASE_URL`, `SESSION_SECRET`, exact production `CORS_ORIGIN`, and other service settings.
- [ ] Deploy/rebuild the Render service so `google-genai>=3.0.0,<4.0.0` is installed.
- [ ] Check startup logs show only provider configured state and model ID (no credentials).
- [ ] Test `/api/health`, a greeting, a follow-up, and an authenticated request about the user's own analysis.
- [ ] For testing outages, use mocks or a non-production environment; do not alter/delete the production database.

## Vercel frontend

- [ ] Set `VITE_API_URL=https://<your-render-service>.onrender.com/api`.
- [ ] Confirm the Render service's `CORS_ORIGIN` includes the exact deployed Vercel HTTPS origin.
- [ ] Redeploy Vercel after environment changes.
- [ ] Verify a provider outage shows a safe message, leaves the failed user message available, and the Retry button sends one bounded retry sequence.

## After deployment

- [ ] Inspect Render logs for model, attempt, duration, HTTP status, error category, and succeeded/failed result.
- [ ] Confirm no chat message text, token, password, or API key is logged.
- [ ] If Gemini continues returning 503/504 after the bounded attempts, check Google's service status, AI Studio project/account and usage limits, and reproduce using the same key/model from the backend environment. Do not assume a new key will fix provider-side availability.
- [ ] Record whether a real answer was received. Passing mocked tests alone does not establish live provider health.
