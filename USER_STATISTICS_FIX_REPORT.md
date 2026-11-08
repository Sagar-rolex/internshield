# User Statistics Fix Report

## Changes

- Replaced hardcoded dashboard statistics and demo activity rows with data from the authenticated `GET /api/dashboard` endpoint.
- Added the typed frontend API response and request helper.
- Added loading, error, and true empty-state UI. Errors do not masquerade as zero counts.
- The backend now returns `savedResults`, defined as the user's persisted analyses because the current schema has no separate saved/unsaved state.
- Isolated dashboard cache entries by user ID, clear the query cache when authentication changes, and create a fresh QueryClient for each router instance.
- Left global admin analytics unchanged.

## Verification

- Backend regression suite: `python -m unittest backend_fastapi.tests.test_chatbot` — 28 tests passed, including a two-user dashboard data-isolation test.
- Frontend lint: 0 errors and 11 existing warnings.
- Production frontend build: `npm run build` — passed (client and SSR bundles generated). Existing dependency directive warnings were emitted by the bundler.

## Deployment

Deploy the backend and frontend code from the same updated revision. No Render environment-variable changes or PostgreSQL migration are required for this dashboard fix. The frontend calls the existing authenticated API, so ensure the frontend's configured API base URL points to the intended backend.
