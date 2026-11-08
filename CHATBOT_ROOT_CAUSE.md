# Chatbot Root Cause

## Confirmed before remediation

The message is returned only when `GeminiUnavailableError` reaches `POST /api/chat`. Before this fix, that exception represented either a missing `google-genai` package or a missing `GEMINI_API_KEY`, but the route collapsed both into the same generic 503 message.

Two local configuration defects were confirmed without printing the credential:

- The project `.env.local` contains a non-empty `GEMINI_API_KEY`, but the backend did not load `.env.local` or `.env`. Vite loads its dotenv files for the frontend; Python does not do so automatically. Consequently, the key was absent from the backend process environment.
- `google-genai` is declared in `backend_fastapi/requirements.txt`, but it is not installed in any of the three local Python environments inspected. The adapter therefore reports the SDK unavailable before it can call Gemini.
- The backend launcher preferred `.venv` even when the documented `venv` was active in the terminal. This could make an install in one environment invisible to the running backend.

The current Render template declares `GEMINI_API_KEY` with `sync: false`. That correctly keeps the secret out of source control, but it means Render requires the value to be added manually to the backend service's Environment settings. This workspace cannot inspect the live Render service or its logs, so its current variable state cannot be asserted.

The frontend's API client sends `/chat` to `VITE_API_URL` and uses `https://internshield-backend.onrender.com/api` as its production fallback. The reported backend 503 indicates that the request reached a backend; a Vercel URL mismatch is therefore not the source of this specific message. Confirm the Vercel `VITE_API_URL` setting during deployment anyway.

`GEMINI_MODEL=gemini-3.8-flash` is present as the current default. Google's model catalog lists this ID as a stable Gemini API model, so this fix keeps it. The active chat and analysis requests no longer pass sampling temperature settings that Google's Gemini 3.8 migration guidance says to remove. Once request serialization was fixed, the live request returned `DEADLINE_EXCEEDED` at the backend's explicit 20-second client timeout, even for a minimal prompt. Google's API docs recommend increasing the deadline for this error. Chat now uses low reasoning plus a 60-second provider timeout, with 65/70-second API/browser budgets. A live minimal request at the new 60-second timeout also returned `DEADLINE_EXCEEDED`; this indicates the current Gemini API/model/account path is not completing simple requests within that budget. The model and provider remain unchanged.

## References

- Google Gemini API [model catalog](https://ai.google.dev/gemini-api/docs/models)
- Google Gemini API [API key configuration](https://ai.google.dev/gemini-api/docs/api-key)
