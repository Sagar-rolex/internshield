# Chatbot Audit

## Existing workflow inspected

- UI: `src/components/Chatbot.tsx`.
- Frontend API client: `src/lib/api.ts`.
- Backend routes: `backend_fastapi/main.py`.
- Existing model adapter: `backend_fastapi/services/gemini_service.py`.
- Authentication/session: `backend_fastapi/auth.py` and bearer-token API client.
- Persistent chat storage: none.

## Findings before implementation

1. **No AI chatbot call exists.** `Chatbot.tsx` uses `generateReply()` to search a local array of nine canned intents. No message is sent to FastAPI or Gemini. The user text is technically received by this local matcher, but never reaches an AI model.
2. **Keyword ranking causes irrelevant answers.** Matching is substring based and adds points for every matching word, then returns the first highest-ranked canned response. Broad words (`how`, `work`, `help`, `company`) overlap several intents; negation, sentence meaning, multi-part questions, and scenario details are ignored.
3. **Conversation context is discarded.** The matcher receives only the latest string. Earlier turns are stored only in component state and are never used to form an answer. There is no conversation ID, history payload, summary, or reset control.
4. **No chatbot API or request schema exists.** `src/lib/api.ts` has no chat operation and `main.py` has no chat endpoint. The existing Gemini adapter is used only by job-analysis routes and has a job-advertisement validation prompt, so it is not suitable as a general-purpose student assistant prompt.
5. **The chat is transient and unbounded in the browser.** Messages live in React state (no database); closing the panel preserves them while mounted, but refresh/remount loses them. There is no max input/history size, loading guard, timeout, retry, or provider/network error state. The UI uses a single-line input, so it cannot support Shift+Enter.
6. **Response presentation is local and immediate.** There is no provider response parser or streaming UI. The panel labels the local canned replies “Quick answers,” which can imply more context or capability than exists.
7. **Privacy baseline is favorable but untested.** No chat DB means there are no cross-user chat rows to leak. The intended AI path must require authentication, use the authenticated user's analysis history only when specifically requested, avoid logging message contents, and treat pasted advertisements as untrusted input.
8. **Configuration/security.** The existing provider key is read by the backend from `GEMINI_API_KEY`; there is no frontend provider key. `render.yaml` marks the variable as backend-only and unsynchronized. The adapter currently imports deprecated `google.generativeai` and initializes `gemini-1.5-flash`; provider failures are converted to analysis fallbacks for the analysis route, but there is no chatbot-specific failure handling.

## Root cause

The current feature is a deterministic FAQ keyword switcher, not an AI assistant. Its limited intent vocabulary, overlapping generic keywords, latest-turn-only matching, and canned responses explain irrelevant, generic, and context-free answers. This implementation cannot explain a user's actual analysis because it has neither an analysis context API nor a model request path.

## Planned remediation

Add a rate-limited `/api/chat` endpoint using the existing Gemini provider credential, with a dedicated system prompt, bounded recent role-ordered history, strict input validation, safe provider errors, and no message-body logging. General chat is available to guests; optional authentication is used only to look up an authenticated user's latest analysis when explicitly requested, filtered by that user's ID. The frontend sends the current message and recent conversation, preserves context, supports reset/retry/loading states, and renders provider errors without fabricated answers.

## Implementation status

The local keyword matcher was replaced with the backend AI flow. Gemini calls now use Google's current `google-genai` SDK (async on active API paths); the old `google.generativeai` dependency was removed and the unused stale main helper was deleted. The API returns 503/502/504-safe responses on configuration/provider/timeout failures, validates message/history sizes, applies per-user or guest-IP limits, and does not store or log chat bodies. A signed-in user's recent analysis is retrieved only when the current message explicitly asks for it and is filtered by that user's ID. UI and test details are in `CHATBOT_TEST_REPORT.md`.
