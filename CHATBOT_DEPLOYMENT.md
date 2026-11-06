# Chatbot Deployment Notes

## Runtime flow

- Frontend: `POST {VITE_API_URL}/chat` through `src/lib/api.ts`.
- Backend: `POST /api/chat` in FastAPI. Guest questions are allowed; authenticated users get per-account rate limiting and, only when explicitly referring to their previous/latest analysis, a lookup scoped to their own `user_id`.
- Provider: Google Gemini API through the current `google-genai` Python SDK.
- Default model: `gemini-3.8-flash`; override on the backend with `GEMINI_MODEL`.
- Credential: `GEMINI_API_KEY` is read only by the backend. Do not create a `VITE_GEMINI_API_KEY` or expose the value to frontend builds.
- Request fields: `{ "message": string, "history": [{ "role": "user" | "assistant", "content": string }] }`; current message is separate from up to 8 prior messages. Each history message is capped at 1,600 characters and the current question at 1,500.
- Response: `{ "reply": string, "model": string, "analysis_context_used": boolean }`.

## Environment setup

1. Configure `GEMINI_API_KEY` as a secret environment variable on the backend service (Render dashboard); it is marked `sync: false` in `render.yaml`.
2. Set `GEMINI_MODEL` only on the backend if changing the default. The model name should be one listed as stable in Google's [Gemini API model catalog](https://ai.google.dev/gemini-api/docs/models).
3. Set `VITE_API_URL` to the backend's `/api` base URL in the frontend host. Do not add provider credentials to Vercel/Vite variables.
4. Redeploy backend and frontend, then check `GET /api/health`, open the chatbot, ask a general question, ask a follow-up, and test provider-unavailable behavior without exposing an API key.

## Limits and operational notes

- Provider call timeout is 20 seconds; the endpoint has a 26-second guard and the browser request times out at 30 seconds.
- Chat requests are limited to 20 per minute per authenticated user or guest IP. The current limiter is in-memory per process; multiple replicas need a shared store before scaling out.
- Conversations are not written to a database. The browser sends only the latest 8 prior user/assistant messages with each request; Reset starts a fresh conversation. Refreshing the page clears chat history.
- An authenticated user asking about their latest/previous analysis gets the most recent record owned by their account. Chat never selects another user's record. Unauthenticated users should paste/share the result or sign in.
- The app does not browse the web or verify a company's identity. The assistant cannot guarantee a job is legitimate.
- Provider errors are returned as safe generic messages; no canned answer is substituted. Backend logs record error types without message contents.
- The local environment does not currently have `google-genai` installed. The dependency is declared for Docker/Render deployment; provider calls are mocked in automated tests and live Gemini credentials were not tested.

## Current setup migration

The backend requirements now install `google-genai` rather than the ended `google-generativeai` SDK. Existing deployments must rebuild/redeploy the Docker service for this dependency update. The new SDK's asynchronous request pattern and `HttpOptions` timeout are documented in the [official SDK README](https://github.com/googleapis/python-genai) and [SDK reference](https://googleapis.github.io/python-genai/).
