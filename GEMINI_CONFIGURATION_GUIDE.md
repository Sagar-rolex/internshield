# Gemini Configuration Guide

## Local backend

1. Activate the project virtual environment in PowerShell:

   ```powershell
   .\.venv\Scripts\Activate.ps1
   ```

2. Install the backend dependencies after pulling the changes:

   ```powershell
   python -m pip install -r backend_fastapi\requirements.txt
   ```

3. Add these values to the root `.env.local` or `.env` file (both are ignored by Git). Keep the actual key private:

   ```dotenv
   GEMINI_API_KEY=your_actual_key
   GEMINI_MODEL=gemini-3.8-flash
   ```

   `GEMINI_MODEL` is optional; the default is `gemini-3.8-flash`. Do not set `VITE_GEMINI_API_KEY`.

4. Restart the backend:

   ```powershell
   npm run backend
   ```

The backend startup log prints only whether configuration exists and the selected model ID. It never prints the API key.

## Render backend

In Render Dashboard → `internshield-backend` → **Environment**, configure:

- `GEMINI_API_KEY`: the current valid Google AI Studio API key (secret value).
- `GEMINI_MODEL`: `gemini-3.8-flash` (optional; leave unset to use the default).

Also retain the service's existing `DATABASE_URL`, `SESSION_SECRET`, `CORS_ORIGIN`, and production settings. Rebuild/redeploy the backend after changing dependencies. Do not copy the Gemini key to Vercel, a `VITE_` variable, or source control.

## Frontend deployment

Set Vercel `VITE_API_URL` to the Render API base, for example:

```text
https://internshield-backend.onrender.com/api
```

This is a backend URL only. Redeploy Vercel if it changes. The production frontend fallback already points at the Render API.

## Model and SDK notes

The project venv reports `google-genai` 3.0.0. The backend requirement is constrained to `>=3.0.0,<4.0.0` for the retry options API this fix uses. Google's official model page lists `gemini-3.8-flash` as stable and demonstrates `models.generate_content` with that ID. Keep the model configurable through the backend-only `GEMINI_MODEL` environment variable.

## Interpreting errors

- 503: Gemini service is temporarily overloaded or unavailable; retry after the short delay.
- 504: Gemini did not finish before the request deadline; the backend retries up to the configured maximum.
- 429 short-term rate limit: backend makes up to two bounded retries, honoring a short `Retry-After` hint.
- 429 daily quota/spending limit: backend does not retry; check the selected project's AI Studio Usage, Rate Limits, and billing state. API-key rotation in the same project does not reset its limits.
- 401/403 or invalid key: verify the backend secret. Do not rotate it unless it is proven invalid or revoked.
- 404/model unavailable: verify model access and `GEMINI_MODEL`.

A configured key only proves the backend has a non-empty value. It does not prove that Gemini's service, account quota, or project access is currently healthy.
