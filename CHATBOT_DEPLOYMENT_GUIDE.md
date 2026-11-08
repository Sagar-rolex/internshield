# Chatbot Deployment Guide

## Render backend

In the `internshield-backend` Render service, open **Environment** and add:

| Name | Value | Required |
| --- | --- | --- |
| `GEMINI_API_KEY` | A valid Google Gemini API key stored as a secret | Yes, for AI chat |
| `GEMINI_MODEL` | `gemini-3.8-flash` | Optional; this is the code/template default |

Do not put the key in a Vercel variable, a `VITE_` variable, source code, or logs. `render.yaml` intentionally marks `GEMINI_API_KEY` as `sync: false`; add its value in the Render dashboard. The Docker build installs `google-genai` from `backend_fastapi/requirements.txt`, so redeploy/rebuild the backend after dependency changes.

The service also needs its existing application settings: `DATABASE_URL` (PostgreSQL), `SESSION_SECRET`, and `CORS_ORIGIN` containing the exact deployed Vercel origin. Keep `SEED_DEMO_DATA=false` in production. `ADMIN_EMAIL` and `ADMIN_PASSWORD` are only needed when provisioning the initial administrator in an empty database.

## Vercel frontend

Set `VITE_API_URL` to the Render API base URL, including `/api`, for example:

```text
https://internshield-backend.onrender.com/api
```

This is only the backend URL; never include a Gemini credential. Redeploy Vercel after changing it. If unset, the client uses the same production backend fallback.

## Local development

The Python backend reads `.env.local` and then `.env`; operating-system environment variables take precedence. Put `GEMINI_API_KEY` and optionally `GEMINI_MODEL=gemini-3.8-flash` in a gitignored local env file. `npm run backend` prefers the active virtualenv and prints the interpreter path it selected. Activate the virtualenv first, then install dependencies with:

```powershell
python -m pip install -r backend_fastapi\requirements.txt
```

Restart the backend after changing environment variables.

## Safe deployment check

1. Confirm Render's backend logs say the provider is configured and show the model ID only. Logs must not include the key.
2. Check `GET /api/health` and the Render service health page.
3. Send a greeting, a scam-identification question, a follow-up, and an authenticated own-analysis question.
4. In a non-production service, test missing/invalid keys and restore the valid secret afterward.
5. Check Render logs for safe categories: missing SDK/key, invalid API key, provider rate limit, model unavailable, or provider timeout.
