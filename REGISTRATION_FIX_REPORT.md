# Registration Fix Report

## Changes

- Kept the existing React signup payload (`name`, `email`, `password`) and FastAPI contract.
- Preserved server-side EmailStr validation, password policy, scrypt hashing, user role assignment (`user`), and commit-before-success behavior.
- Added rollback around database commit errors. A concurrent duplicate email now returns HTTP 409; other persistence failures return a safe HTTP 503 and log only the exception type.
- Added in-memory SQLite tests proving a registered user persists across sessions, the stored password is hashed, the new user can log in, and duplicate registration does not create a second row.

## Result

Local tests passed. This does not constitute a production registration test because the deployed Render response/logs and production database are not accessible from this workspace.

## If registration still fails after deploy

In Render service logs, inspect the corresponding `POST /api/auth/register` status. `409` means the email is already present; `422` means request validation failed; `429` means the per-IP registration limit was reached; `503` means the backend could not commit successfully. Do not share passwords, tokens, or database URLs when sharing logs.
