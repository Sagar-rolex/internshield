# Production API Test Report

Production Vercel, Render, and PostgreSQL settings were not accessible from this workspace, so production connectivity is unverified.

Local checks passed using a temporary SQLite database: health, localhost CORS preflight, auth enforcement, registration, authenticated job analysis, and saved history. These checks do not establish that the deployed Vercel URL, Render service, CORS setting, or Gemini provider are healthy.

After deployment, verify in DevTools that the frontend calls `POST https://<render-service>/api/analyze`, that preflight allows the exact Vercel origin, and that Render returns the expected response. Do not log tokens or credentials.
