# Chatbot Test Report

## Automated backend tests

Command:

```powershell
.\.venv\Scripts\python.exe -m unittest backend_fastapi.tests.test_chatbot -v
```

Result: **27 tests passed** (mocked Gemini provider; no API credentials printed).

Coverage includes greeting and safety question request construction, follow-up history, eight-turn history bounds and role mapping, authorized own-analysis data isolation, invalid/missing API key handling, unsupported model handling, local and provider rate limits, distinguishing project daily quota from short-term 429 rate limits, bounded 429/503 retries, provider 504 retry cap, network error classification, no retry for invalid credentials or exhausted project quota, task cancellation and client-disconnect cancellation, SDK hidden retries disabled, safe backend error messages, and environment loading.

These mocked tests validate application behavior but do not assert the truth or quality of a live Gemini answer.

## Live integration check

A minimal greeting was sent to the configured model with the local backend key present. The key was not displayed or logged. `gemini-3.8-flash` returned HTTP 503 on all three bounded attempts; durations were 8.5 s, 4.8 s, and 9.2 s, with 26.4 s total. The live request therefore **failed** because Gemini was temporarily unavailable/overloaded. No successful live answer is claimed.

The model name is listed as stable by Google's current model page, and the official SDK documents `models.generate_content` using `gemini-3.8-flash`. This verifies model support, not account-specific quota/access or moment-to-moment provider availability.

## Frontend verification

- `npm run build`: passed (client and SSR production bundles built).
- `npm run lint`: passed with 0 errors and 11 existing warnings. `src/components/Chatbot.tsx` passes targeted ESLint. Warnings are in unrelated existing components/utilities.
- `src/routes/detect.tsx` and `src/routes/history.tsx` received formatting-only changes to resolve three project-wide Prettier lint errors.
- Python `py_compile` passed for the changed backend service, route, and test modules.
- No browser automation test was run for Retry-button interaction; the component behavior was reviewed and the production build passed.

## Not verified

- Production Render environment variables, live Render logs, and production database access are not available from this workspace.
- No successful live answer was returned. The Gemini request and account's current access/availability remain unverified beyond the observed 503s.
- No API key was rotated. The provider's 503 response does not establish that a new key is needed.

## References

- [Gemini API error codes](https://ai.google.dev/gemini-api/docs/api-errors)
- [Gemini 3.8 Flash model page](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash)
