# Admin API Documentation

All listed endpoints require a valid bearer token for an active admin unless noted. Responses use JSON except CSV export. Pagination uses `page` (1-based) and `page_size` (1–100) and returns `total`, `page`, `page_size`, and `total_pages`.

| Method and path | Query/body | Purpose |
|---|---|---|
| `GET /api/admin/users` | `q,status,role,date_from,date_to,sort_by,sort_order,page,page_size` | Filtered user list |
| `GET /api/admin/users/{user_id}` | — | Account summary and recent analyses |
| `PATCH /api/admin/users/{user_id}` | `name`, `status`, `role` (`user` or `admin`) | Update account/role; last active admin is protected |
| `DELETE /api/admin/users/{user_id}` | — | Delete a non-admin account and linked records |
| `GET /api/companies` | `q,status,page,page_size` | Filtered company list |
| `POST/PATCH/DELETE /api/companies[/{id}]` | Existing company schemas | Admin company management |
| `GET /api/reports` | `q,status,risk_level,page,page_size` | Admin all reports; user-owned reports for regular users |
| `PATCH/DELETE /api/reports/{id}` | Existing moderation fields | Admin moderation |
| `GET /api/analytics` | `period,date_from,date_to` | Database analytics (admin only) |
| `GET /api/admin/analytics.csv` | `period,date_from,date_to` | CSV export (admin only) |

Authentication and validation errors use HTTP status codes and safe messages from the existing API conventions. Do not put secrets in query strings or frontend code.

## Deployment steps

1. Review and commit the backend model/route changes and frontend admin pages to the repository branch used by Render and Vercel.
2. In Render, retain the existing `DATABASE_URL`, `CORS_ORIGIN`, `SESSION_SECRET`, and other backend settings. No new secret is required. The added audit table is additive and is created by the app's existing `Base.metadata.create_all` startup hook; do not reset or reseed the database.
3. Deploy the Render backend first. Confirm startup completes and inspect logs for schema/startup errors. Use a dedicated admin session to verify dashboard, user filters, company/report lists, CSV export, and an attempted regular-user denial.
4. In Vercel, retain/set the existing `VITE_API_URL` to the Render backend API base ending in `/api`. It must be a frontend-exposed URL only; do not set database credentials, Gemini credentials, or session secrets in Vercel.
5. Deploy the frontend and check the admin pages in the browser. Confirm the browser's API requests point to the Render service and that CSV downloads with the selected period.

This repository change has only been tested locally; production deployment and data were not accessed during this implementation.
