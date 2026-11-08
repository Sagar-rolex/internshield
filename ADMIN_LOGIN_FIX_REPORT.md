# Admin Login Fix Report

## Root cause

The startup seed routine stopped as soon as it found any user row. That caused it to skip provisioning the `ADMIN_EMAIL` / `ADMIN_PASSWORD` administrator on an existing database. Separately, the Render Blueprint did not set `APP_ENV=production`, so production-only database, session-secret, and CORS checks could be bypassed.

## Changes

- Added `APP_ENV=production` to `render.yaml`.
- Production startup now provisions the configured admin only when its email does not already exist, regardless of other users in the database.
- Startup never changes an existing admin password/status/role and never upgrades an existing non-admin account. It emits a safe error if `ADMIN_EMAIL` matches a non-admin record.
- Production never inserts demo accounts, even if `SEED_DEMO_DATA=true` is accidentally set. In non-production, existing demo behavior remains controlled by that variable.

## Existing administrator caveat

Setting `ADMIN_PASSWORD` does not reset an existing admin's password. This is intentional to protect existing accounts. If the configured admin already exists and the current password is unknown, use a separately reviewed, explicit password-reset procedure for that exact admin account; do not delete or recreate the account. If the configured email already belongs to a normal user, choose a new unused admin email or handle that account through a controlled admin-role procedure.

## Verification limit

An existing local test admin passed the admin login and authorization tests. Production credentials were not available, so production admin login is not claimed as verified.
