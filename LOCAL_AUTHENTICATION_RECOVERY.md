# Local Authentication Recovery

## Root cause

`src/lib/api.ts` points local development at `http://127.0.0.1:4001/api`. The backend launcher selects root `.venv` before `venv`; a recent ImageKit import was added to `backend_fastapi/main.py`, but the selected `.venv` lacked the already-declared `imagekitio` dependency. FastAPI exited during module import, so every login and registration request failed before authentication logic ran. The dependency is now installed into the selected `.venv`.

The old backend process on port 4001 also rejected the localhost CORS preflight because it had not loaded the updated CORS code. It was confirmed as this repository's Uvicorn process and restarted. The existing local SQLite database remains `scamshield.db`; startup used `SEED_DEMO_DATA=false` and did not reset or seed records.

`CHATBOT_SYSTEM_PROMPT.md`, which is read during backend import, was also absent from the working tree; it was restored from the current commit.

## Files and environment

- `backend_fastapi/main.py`: development CORS merges configured origins with explicit localhost origins; production remains restricted to exact HTTPS origins.
- `.env.example`: shows separate local CORS defaults and the exact production origin format.
- `CHATBOT_SYSTEM_PROMPT.md`: restored committed prompt used at startup.
- `.venv`: installed `backend_fastapi/requirements.txt`, including `imagekitio`.
- No authentication code, password hashes, roles, existing accounts, production database, or tracked dependency declarations were changed for this recovery.

## Regression results

| Test | Result |
|---|---:|
| Isolated user login / admin login | 200 / 200 |
| Invalid credentials | 401 |
| Registration and subsequent login | 200 / 200 |
| User dashboard | 200 |
| User access to admin endpoint | 403 |
| Admin access to admin endpoint | 200 |
| Logout, revoked token, login after logout | 200 / 401 / 200 |
| New user's dashboard starts at zero | Passed |
| Analysis/history isolation between two test users | Owner saw saved result; other user's history and dashboard both remained at zero |
| Existing local user login against `scamshield.db` | 200 |
| Existing local admin login against `scamshield.db` | 200 |
| Existing DB health and localhost CORS at port 4001 | 200 / 200 |
| Frontend `/login` at localhost:3000 | 200 |

The full flow tests used a disposable SQLite database that was removed after testing. Existing local user/admin rows were inspected read-only and retained; production PostgreSQL was not accessed. Production login is not tested.

## Current local state

The backend is running on port 4001 with the existing `scamshield.db` and the frontend `/login` route returns 200 on port 3000. If you need to restart the backend, press `Ctrl+C` in its terminal and run `npm run backend` from `E:\NF\alert-beacon-ai`. Do not start a second backend on the same port.
