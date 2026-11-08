# Gemini Chatbot Root Cause

## Finding

The recurring chatbot failure is upstream of the application. The local backend has `GEMINI_API_KEY` configured, uses `google-genai` 3.0.0 in the active `.venv`, and sends a request to the Gemini Developer API. A live request on 2026-11-08 returned HTTP 503 on all three controlled attempts (8.5 s, 4.8 s, and 9.2 s; 26.4 s total). Earlier requests returned HTTP 504 after roughly a minute. This confirms that the key is being loaded and the model endpoint is reached, but Gemini did not serve the requests at that time.

Google defines 503 as temporarily overloaded or unavailable and 504 as a deadline exceeded. Google's current catalog lists `gemini-3.8-flash` as a stable model, and the Google Gen AI SDK's `models.generate_content` supports that model. There is no evidence that an unsupported model or a missing API key caused these errors. The live test did not receive an answer, so it cannot prove that model access is currently healthy for every request.

## Application factors that amplified the issue

- Chat provider timeout was 60 seconds, while FastAPI allowed 65 seconds and the frontend allowed 70 seconds. A transient upstream failure could therefore leave users waiting for about a minute.
- The SDK request retry policy was not set explicitly. The installed SDK's `HttpRetryOptions` defaults to multiple attempts, which could compound latency invisibly.
- The backend classified 503 responses inconsistently; some surfaced as a generic 502.
- The frontend cleared the input as soon as a request started, even when generation failed.

## New 429 behavior

The frontend's “Gemini is rate-limited” message confirms a Gemini HTTP 429; it is distinct from InternShield's own local per-IP chat limit, which uses different response text. The user-visible message does not include Gemini's quota reason, so it cannot establish whether the project hit a short-term RPM/TPM limit, a requests-per-day quota, or a spend limit. Google's limits are project-scoped, so replacing a key in the same project would not reset them. The current backend now distinguishes recognizable daily/spend quota details from short-term limits and otherwise gives guidance to inspect AI Studio's project Usage and Rate Limits page.

## Changes made

- Chat uses a 20-second per-attempt deadline and at most three total attempts.
- SDK automatic retries are set to one attempt for chat, leaving all retry decisions to the bounded app policy.
- Only transient provider timeouts, 503/other transient 5xx responses, and network connection errors are retried, using exponential full jitter. Invalid keys, invalid requests, rate limits, and unavailable models are not retried.
- Request cancellation is allowed to propagate and is logged without retrying.
- The backend logs model, attempt, duration, numeric HTTP status when available, result, and safe error category. User messages and credentials are not logged.
- The frontend retains the submitted text on failure and preserves previous messages. Its existing Retry button resends the original request and duplicate sends remain guarded.

## Limits

Retries improve tolerance to brief outages; they cannot make a Gemini outage go away. The live integration check still ended in provider 503 after retries. No API key was changed, no model was switched, and no production Render environment was inspected from this workspace.

## References

- [Gemini API error codes](https://ai.google.dev/gemini-api/docs/api-errors)
- [Gemini 3.8 Flash model page](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash)
- [Google Gen AI Python SDK](https://github.com/googleapis/python-genai)
