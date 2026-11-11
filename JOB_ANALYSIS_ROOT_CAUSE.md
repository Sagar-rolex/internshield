# Job Analysis Root Cause

The frontend reported “Could not reach the backend service” from the API client's `fetch()` rejection handler. The analysis URL/method were consistent (`POST /api/analyze`), but local browser CORS preflight from `http://localhost:3000` was rejected because development CORS used only the configured deployed origin whenever `CORS_ORIGIN` was set.

The fix merges explicit localhost origins in development and keeps exact HTTPS origins in production. A local authenticated analysis and history request passed against isolated SQLite. Production networking was not available for verification.
