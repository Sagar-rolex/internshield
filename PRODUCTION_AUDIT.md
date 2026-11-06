# Production Readiness Audit — Initial Findings

**Audit date:** 2026-11-07  
**Repository branch:** `main`  
**Latest committed revision at audit start:** `ac364c7` (`Fix screenshot analysis and improve responsiveness`)  
**Audit state:** Initial source audit complete; implementation and verification are pending.

This report describes source that exists in the current checkout. It does not imply that the hosted Vercel, Render, or PostgreSQL services were inspected. No production credentials or `.env` contents were read. The working tree already contains substantial uncommitted changes from the preceding responsive UI/debugging requests; those changes are part of the reviewed checkout and must be preserved and reviewed before any commit.

## Repository and current architecture

- Frontend: React 19, TanStack Start/Router, TanStack Query provider, TypeScript, Tailwind CSS v4; Vite production build; Vercel is described in project documentation.
- Backend selected by `render.yaml`: FastAPI at `backend_fastapi.main:app`, packaged with Docker. `backend/server.js` is a separate legacy Node stub and is not the Render entry point.
- Data access: SQLAlchemy async, PostgreSQL with `asyncpg` when a Postgres URL is provided; SQLite is the backend default. Startup calls `Base.metadata.create_all()` and then seeds.
- Authentication: scrypt password hashes (with legacy SHA-256 upgrade), custom HMAC bearer tokens with a seven-day expiry, browser `localStorage` storage. Logout clears local storage; there is no server-side token revocation.
- OCR: Pillow, pytesseract, and Tesseract are installed by the backend Dockerfile. `OCR_BACKEND=auto` fails closed when Tesseract is unavailable; explicit `demo` mode returns sample text.
- AI: `services/gemini_service.py` imports the deprecated `google.generativeai` package. AI calls are synchronous inside async request handlers.
- Existing tests: FastAPI service tests in `backend_fastapi/tests/` and a root `test_ocr.py`; no frontend test script or frontend test suite is declared in `package.json`.
- Deployment files: `render.yaml`, `backend_fastapi/Dockerfile`, and `wrangler.jsonc`. No Vercel project configuration is tracked at the repository root. Render configuration expects deployment-time `DATABASE_URL`, `CORS_ORIGIN`, and admin values; the actual hosted settings cannot be confirmed from this checkout.

## Actual routes and feature status

### Frontend routes found

`/`, `/about`, `/contact`, `/company-verification`, `/detect`, `/dashboard`, `/history`, `/profile`, `/report`, `/login`, `/signup`, `/forgot-password`, `/admin-login`, `/admin/dashboard`, `/admin/users`, `/admin/reports`, `/admin/companies`, `/admin/analytics`, and `/unauthorized`.

### FastAPI endpoints found

| Method and path | Current behavior / access control |
| --- | --- |
| `GET /`, `GET /health` | Shallow process health; no database check. |
| `GET /api/health` | Database query health check. |
| `GET /uploads/{filename}` | Serves an uploaded image without authentication or owner check. |
| `POST /api/auth/register` | Creates a user, hashes password, issues bearer token. |
| `POST /api/auth/login` | Authenticates user, upgrades legacy SHA-256 hash, issues token. |
| `POST /api/auth/admin-login` | Same auth flow, requires admin role. |
| `GET /api/admin/users` | Admin-only user listing. |
| `PATCH /api/admin/users/{user_id}` | Admin-only user update. |
| `DELETE /api/admin/users/{user_id}` | Admin-only user deletion; excludes admin accounts. |
| `GET /api/reports` | Any authenticated user can read every report. |
| `POST /api/reports` | Any authenticated user can submit; accepts caller-supplied reporter identity; report has no user owner. |
| `PATCH /api/reports/{report_id}` | Any authenticated user can moderate any report. |
| `DELETE /api/reports/{report_id}` | Any authenticated user can delete any report. |
| `GET /api/companies` | Authenticated only, although company lookup is exposed in guest navigation. |
| `POST /api/companies` | Admin-only company creation. |
| `PATCH /api/companies/{company_id}` | Any authenticated user can alter company status/name/domain/report count. |
| `DELETE /api/companies/{company_id}` | Admin-only company deletion. |
| `POST /api/analyze` | Authenticated; analyzes and stores against authenticated user ID. |
| `POST /api/analyze-screenshot` | Authenticated; accepts multipart field `file`, OCRs and stores against authenticated user ID. |
| `GET /api/analyses` | Authenticated; filters history by authenticated user ID. |
| `GET /api/analytics` | Any authenticated user can retrieve global counts; some returned totals are constants. |

No backend logout, profile read/update, password-reset, company-verification-history, user-dashboard, or PDF endpoint exists. PDF export is a browser print view; it depends on popups and browser “Save as PDF”.

## Confirmed release blockers and risks

1. **Authorization gap (critical):** report status/delete operations and company updates use `require_auth` instead of `require_admin`. Any signed-in user can change global moderation/company data. `/api/analytics` exposes platform-wide counts to normal users.
2. **User data isolation incomplete (critical):** `Analysis.user_id` is a plain string without a foreign key. `ScamReport` has no `user_id`; the report API lists every report to all authenticated users and trusts the client-provided reporter name. There is no company-verification history or per-user dashboard endpoint.
3. **Private file exposure (high):** uploaded job screenshots are saved under `backend_fastapi/uploads` and returned by a public `/uploads/{filename}` route. Images and extracted text may contain personal data. Upload bytes are read fully before applying the 5 MB limit.
4. **Production authentication configuration (critical):** `SESSION_SECRET` falls back to the known literal `dev-secret-change-me`; startup does not reject it in production. Tokens remain valid until expiry after logout or account deactivation. Active/inactive user status is not checked by the token dependency.
5. **Production database configuration (critical):** absent `DATABASE_URL` silently selects local SQLite. Render marks the value as a manually supplied variable, so actual production Postgres connectivity and persistence are unverified. Schema creation uses `create_all`; there is no migration system.
6. **Fake or incomplete user-facing behavior (high):** the user dashboard and both admin overview/analytics pages display hard-coded figures and activity; the report form displays success without calling the backend; profile edits and password reset are UI-only; company verification searches a previously loaded company list and announces “complete” even though it does not perform independent verification. These must be made honest and connected only where backend support exists.
7. **Backend event-loop blocking (high):** synchronous Gemini generation and OCR/image processing run inside async FastAPI handlers, which can block the server event loop during slow external or CPU work.
8. **Abuse controls incomplete (high):** the in-memory rate limiter is applied only to login endpoints, is not shared across workers/restarts, and does not bound stored client keys. Registration, analysis, and upload have no endpoint-level limits.
9. **Dependency/runtime risk (medium-high):** the installed requirements name the discontinued `google-generativeai` client and use unpinned ranges. Hosted AI configuration and the installed SDK version are not verified.
10. **Deployment status unknown:** no read-only access to Vercel, Render, or production PostgreSQL configuration/health is available here. `CORS_ORIGIN`, database URL validity, secret quality, deployed commit, and real production smoke tests therefore remain unverified. `wrangler.jsonc` also appears to be an unused Cloudflare configuration alongside the documented Vercel deployment.
11. **Test coverage gap:** current backend tests cover detection/aggregation and OCR helper behavior, not FastAPI authentication, authorization, database ownership/isolation, API contracts, or integration with a test database. No frontend tests are configured.
12. **Legacy server risk:** `backend/server.js` exposes permissive `Access-Control-Allow-Origin: *` and returns demo analysis responses without auth. It is not selected by `render.yaml`, but must be documented as non-production and prevented from being mistaken for the deployed backend.

## Initial implementation and verification plan

1. Run the existing frontend and backend checks against a disposable/local test configuration; record baseline outcomes without accessing production data.
2. Add focused backend endpoint tests with an isolated test database for auth, admin-only mutations, authenticated ownership, reports, company listing, analytics authorization, and upload limits.
3. Close authorization gaps; make reports owner-aware and restrict global moderation to admins; make company verification reads public while keeping every write admin-only; restrict global analytics to admins.
4. Add a user dashboard response based on the authenticated user’s own analyses and reports. Add verification history only with an explicit ownership-aware schema/migration. Do not attach existing historical records to guessed users.
5. Protect screenshot retrieval by authentication and ownership, and enforce upload size while streaming/reading rather than only after a complete unbounded read. Ensure upload errors never become a successful safe result.
6. Fail startup for insecure/missing production settings, particularly session secret and database configuration; validate CORS configuration; make demo seeding explicitly opt-in in production. Preserve local development setup through explicit local values.
7. Move blocking OCR/AI work off the async event loop, set bounded request timeouts, and bound/clean rate-limit storage. Migrate the Gemini client only after validating the supported official SDK usage and dependency/runtime availability.
8. Remove fake-success UI and replace it with real API-backed behavior or explicit unavailable states. Preserve actual analysis scoring and avoid claiming verification certainty.
9. Add safe migration scripts for required schema changes (or document manual migration steps); never run DDL or destructive operations against production from this environment.
10. Run typecheck, lint, build, backend tests, endpoint tests on a throwaway DB, and responsive browser checks if tools permit. Produce the requested API, security, test, checklist, deployment, memory, and task documents with verified facts only.
11. Review the complete working tree for scope and secrets. Deployment/push will only be attempted if local checks pass and repository/service access is available; verify remote health before claiming release success.

## Verification status at audit start

- Source and route inventory: inspected.
- Production service/account configuration: not accessible from repository source; unverified.
- TypeScript, lint, production build, backend tests: pending this audit task.
- Browser viewport and end-to-end testing: pending; do not infer from CSS or a successful build.
- Production database read/write: not accessed.
- Production deployment: not performed.
