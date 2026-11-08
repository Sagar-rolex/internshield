# Production Authentication Audit

## Scope and access limits

Reviewed the signup and login forms, API client, FastAPI auth routes, auth dependencies, password/token implementation, startup seeding, database configuration, CORS policy, Render Blueprint, and schema creation behavior. This workspace has no authenticated access to the live Render PostgreSQL instance, Render environment panel/logs, or Vercel deployment settings. No production credentials were requested, read, or logged; no production database connection or account changes were attempted.

## Findings

- The frontend sends registration/login JSON to `VITE_API_URL` and stores an API bearer token in local storage. It does not use cross-site cookies (`credentials: omit`).
- The production fallback URL in `src/lib/api.ts` matches the Render service name in `render.yaml`: `https://internshield-backend.onrender.com/api`. A Vercel `VITE_API_URL` override must match the actual Render service URL and include `/api`.
- Render's Blueprint declares `DATABASE_URL`, `CORS_ORIGIN`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` as deployment-supplied values, and generates `SESSION_SECRET`. It previously omitted `APP_ENV=production`, leaving production-only checks disabled unless manually set.
- Startup `seed()` previously returned immediately if any user already existed. Consequently, on an initialized database, configured `ADMIN_EMAIL` and `ADMIN_PASSWORD` never provisioned an administrator. If the database was empty, demo data defaulted on and could insert the documented demo admin credentials into production.
- Existing admin passwords are not checked against `ADMIN_PASSWORD`, and startup must not overwrite them. An existing account with the configured email is preserved; if it is a non-admin account, startup logs a safe error and does not elevate it.
- Registration validates with Pydantic `EmailStr`, enforces password length/uppercase/digit, hashes passwords with scrypt, and commits the row before returning a token. The email unique constraint protects concurrent registration. Previously an insert race/database integrity exception could return 500; it now rolls back and returns 409 for a duplicate or a safe 503 for another transaction failure.
- Login normalizes email, verifies scrypt (and upgrades legacy SHA-256 hashes on successful login), rejects inactive accounts, signs HMAC bearer tokens, and checks role in `require_admin`. Admin endpoints use that dependency.
- CORS in production requires explicit HTTPS origins and disallows wildcard origins/regex. Since auth uses bearer headers and not cookies, `allow_credentials` is false by design.
- No Alembic migration framework is present. Startup's SQLAlchemy `create_all` creates missing tables but does not add or alter columns on existing tables. A live schema comparison cannot be made without read-only production DB access/logs.

## Root cause confidence

The admin initialization bug above is confirmed directly from code. The precise reason user registration is failing on the live deployment is not confirmable without a production response/log entry and deployment configuration. The local flow and new isolated database tests pass. If deployed registration still fails after this patch, check Render logs for the registration failure type (the application will not log request passwords or database URLs) and confirm Render is using the intended PostgreSQL database and current schema.

## Deployment steps

1. Push the updated revision and deploy the `internshield-backend` Render service using `render.yaml`. In **Render → service → Environment**, confirm `APP_ENV=production`, `DATABASE_URL` is the intended Render PostgreSQL connection string, `SEED_DEMO_DATA=false`, `CORS_ORIGIN` is the exact deployed Vercel HTTPS origin, and both `ADMIN_EMAIL` and `ADMIN_PASSWORD` are set. Keep the generated `SESSION_SECRET` stable across normal deploys; rotating it invalidates existing bearer tokens. Do not put any backend secret in Vercel.
2. After deploy, inspect Render logs for startup configuration errors or the safe message that the configured admin already exists. The backend adds an admin only when the configured email does not exist; it does not reset an existing account.
3. In **Vercel → project → Settings → Environment Variables**, set `VITE_API_URL=https://internshield-backend.onrender.com/api` for Production (or the actual Render URL if the service hostname differs). This value is compiled into the frontend, so redeploy Vercel after changing it.
4. Set `CORS_ORIGIN` to the exact production website origin, such as `https://<your-project>.vercel.app`, with no path or trailing slash. Add a custom production domain as another comma-separated exact origin. Preview deployments require their origin to be explicitly allowed; do not use `*`.
5. Smoke-test with a dedicated new user email and the intended admin account. Verify registration, login, duplicate email, logout, dashboard, and an admin-only request. Check the user appears in the intended Render PostgreSQL database using a safe database console query. Do not delete test or existing accounts as cleanup; mark the test account inactive if needed.

No live environment values were inspected by this audit. Confirm each value in the hosting dashboards without copying its secret value into chat or logs.
