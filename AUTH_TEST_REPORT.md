# Authentication Test Report

## Automated local tests

Added `backend_fastapi/tests/test_auth_production.py`, which uses isolated in-memory SQLite databases and test-only accounts. It covers:

- Existing admin login and admin role response.
- New user registration, persisted row in a fresh session, scrypt password hash, and subsequent login.
- Duplicate email returns 409 without adding a row.
- Invalid password returns 401.
- Logout revokes the bearer token, including after opening a new database session.
- An authenticated ordinary user is rejected by the admin dependency.
- Production seed creates the configured admin even when other users exist.
- Production seed preserves an existing administrator's credentials/status and suppresses demo account seeding.

The dashboard's user isolation has its own existing two-user test. These tests do not call Vercel, Render, or the production PostgreSQL database.

## Run and result

Command: `python -m unittest backend_fastapi.tests.test_auth_production`

Result: 8 auth/seed tests passed. The combined targeted command `python -m unittest backend_fastapi.tests.test_auth_production backend_fastapi.tests.test_chatbot` passed all 36 tests.

An attempted broad `unittest discover -s backend_fastapi/tests` found 3 unrelated legacy collection errors: two older tests import `services` as a top-level package, and one test requires `pytest`, which is not installed in this virtual environment. The targeted auth and API suites themselves passed.

Production admin login, registration, and deployed session behavior remain unverified until tested against the actual deployment with dedicated test accounts.

## Manual production smoke test after deployment

Use a dedicated new email address and a dedicated admin account only. Confirm signup creates a row in the intended Render PostgreSQL database, login works, duplicate signup returns 409, logout invalidates the token, the new user's dashboard is isolated, and an ordinary user receives 403 from an admin-only API. Do not delete existing users or share credentials/tokens.
