# Chatbot Test Report

## Automated checks

- Chatbot unit suite: 7 passed. Covers history ordering/bounds, prompt-injection boundary, explicit personal-analysis intent, missing provider configuration, input validation, rate limiting, and FastAPI route registration.
- Existing detector regression tests: 8 passed; screenshot OCR tests: 8 passed.
- Python compile check: passed.
- FastAPI app import and `/api/chat` registration: passed.
- TypeScript check (`npx tsc --noEmit`): passed.
- Production client/server build (`npm run build`): passed.

## Coverage limits

- No live Gemini call was made. The local virtual environment does not have `google-genai` installed, and no production API key was available. Docker deployment installs the updated requirement.
- A transport-level `TestClient` request was not run because this environment's Starlette TestClient requires the missing `httpx2` package. Route registration, request validation, rate limit behavior, and missing-key handling in the provider adapter were checked directly; HTTP 502/503/504 mappings were not exercised end to end.
- The chatbot's history is intentionally not persisted. Refresh clears it; each request includes only the most recent eight prior messages.
- The in-memory rate limiter is process-local. Deployments with multiple replicas need a shared rate-limit store.

## Required manual smoke test after deployment

1. Ask “How can I identify a fake internship?” and follow up “What if they promise a refund?”; confirm the follow-up uses conversation context.
2. Ask a new question with Reset; confirm the old conversation is not sent.
3. Ask a general InternShield feature question and a question about the signed-in user's latest analysis.
4. Temporarily unset/invalid-test the backend provider key in a non-production environment; confirm a clear retryable error appears and no canned answer is shown.
5. Test mobile width, Enter-to-send, Shift+Enter, loading state, duplicate-send prevention, and retry.
