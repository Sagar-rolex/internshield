# Admin Security Audit

- Dashboard analytics, CSV export, user list/detail/mutations, and company management are protected by the FastAPI `require_admin` dependency.
- Report reads retain their existing authenticated behavior: administrator-wide, regular-user ownership-scoped. Report moderation remains admin-only.
- User list/detail responses serialize safe profile fields and do not include password hashes or tokens. Role changes require the admin-protected endpoint; only `user` and `admin` roles are accepted.
- Admin deletions/status changes, company mutations, and report moderation append an actor/action/entity audit record. Audit records contain email and action summaries, not credentials.
- Demoting or deactivating the final active admin is blocked. Admin account deletion is blocked.
- A new audit table is additive. Existing user/report/company data is preserved; no production database was accessed.

Operational follow-up: configure and retain backups/migrations for production as part of normal deployment. This code-level audit is not a penetration test.
