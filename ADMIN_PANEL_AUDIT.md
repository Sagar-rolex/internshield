# Admin Panel Audit

## Findings

- The dashboard and analytics screens displayed hard-coded sample KPI values, charts, categories, users, and reports. Those numbers were not queried from PostgreSQL/SQLite.
- The existing analytics endpoint raised `NameError: datetime is not defined`; its request therefore returned HTTP 500.
- The admin user listing returned the whole user table without server-side pagination or filters. Company listing did not require an admin, while its mutations did.
- Several displayed concepts are not stored in the current schema. There is no report evidence/attachment or status history, nor company verification provenance. The UI must not imply that the platform's `Verified` record status is an independent guarantee.

## Changes

Dashboard and analytics now query `User`, `Analysis`, `ScamReport`, `Company`, and `CompanyVerification`. Admin user/company/report listings have paging and filters; admin user detail is scoped by ID after authorization. Sensitive admin mutations are recorded in the additive `admin_audit_logs` table. The last active admin cannot be deactivated and admins cannot be deleted via user management.

## Data safety

No database reset or production connection was made. The new audit table is created by the application's existing additive `Base.metadata.create_all` startup behavior. This report does not claim production deployment verification.
