# Chatbot Fix Report

## Implementation

- Added bounded application retries for Gemini 503/504 and network failures: 3 total attempts, 20 seconds per attempt, capped exponential backoff with jitter.
- Added provider 429 distinction: short-term rate limits receive a bounded retry and honor `Retry-After`; recognizable daily/spend quota exhaustion is returned immediately with project-level AI Studio guidance.
- Disabled hidden SDK-level retries for chatbot calls so provider attempts and worst-case latency are predictable. Non-chat Gemini analysis behavior is unchanged.
- Classified Gemini 503 as temporary provider unavailability and return a safe 503 response with `Retry-After: 5`. Timeouts return 504; invalid keys, rate limits, and unsupported models are not retried and retain actionable safe messages.
- Added per-attempt structured logs for model, attempt count, duration, HTTP status, error category, success/failure, and cancellation. Chat content and credentials are not logged. Client disconnect cancels the active provider task so it does not continue through retries unnecessarily.
- Kept `gemini-3.8-flash`; Google lists it as stable and the Gen AI SDK supports it with `generate_content`.
- Kept typed chatbot input through the request. It clears after success, remains available on failure, prior turns remain visible, and the Retry button reuses the failed message/context.
- Kept the existing eight-message and per-turn history limits and authenticated per-user analysis lookup.
- Pinned backend SDK dependency to `google-genai>=3.0.0,<4.0.0`, matching the locally inspected SDK 3.0.0 and the explicit `HttpRetryOptions` API used here.

## Files changed

- `backend_fastapi/services/chat_service.py` — timeout, bounded retries, jitter, privacy-safe request logging, cancellation propagation.
- `backend_fastapi/services/gemini_service.py` — SDK retry configuration and transient/network error classification.
- `backend_fastapi/main.py` — clear transient-outage responses and retry header.
- `backend_fastapi/requirements.txt` — compatible SDK range.
- `backend_fastapi/tests/test_chatbot.py` — mocked retry, timeout, key, history, and classification coverage.
- `src/components/Chatbot.tsx` — retain user message on error and clear only on success.

## Security and persistence

Chat messages are not saved to PostgreSQL. Retry attempts make no database writes, and each request's private analysis lookup remains constrained to the authenticated user's ID. Gemini credentials remain backend-only under `GEMINI_API_KEY`.

## Verification limits

Mocked backend tests pass. One real request was attempted with the configured key and model; all three requests received upstream HTTP 503, so there is no successful live answer to claim. Vercel and Render deployment settings are not accessible from this workspace.
