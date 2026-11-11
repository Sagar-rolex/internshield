# Authentication flow audit

## Existing architecture

- `AuthProvider` reads the persisted user from `localStorage` once on startup.
- The bearer token is stored under `scamshield.auth.token`; the user record is stored separately under `scamshield.auth.user`.
- Login, registration, and admin login call the existing FastAPI endpoints and persist the returned user/token.
- `ProtectedRoute` enforces authentication and role requirements in the route component tree. Admin pages also use `AdminShell` protection.
- TanStack Query is created once per router. Its only authenticated query in this codebase is `user-dashboard`, keyed by user ID.
- FastAPI `POST /api/auth/logout` inserts the token ID into `revoked_tokens`; the authentication dependency rejects revoked tokens.

## Findings

- The frontend logout path previously omitted the backend revocation endpoint.
- Logout previously called `queryClient.clear()` and separately navigated to `/`, while a protected route redirected to `/login` after the same auth update.
- Authenticated fetches did not share a cancellation mechanism.
- History and admin list screens load through component effects rather than Query. Those effects guard state updates after unmount, while the HTTP layer now aborts their authenticated fetches at logout.
- Screenshot and manual-analysis progress intervals are cleared in `finally`; their authenticated requests are now aborted on logout.
- Object URL cleanup already existed for uploaded screenshots.
- Chatbot requests are authenticated and now stop on logout; the transcript is cleared on a session change to avoid exposing one account’s conversation to another.

## Route behavior

Protected routes redirect unauthenticated users through the existing `/login` route. Logout does not bypass authorization: backend requests remain protected by bearer-token validation and token revocation. Public routes remain available after sign-out.
