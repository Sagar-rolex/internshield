# Dashboard Data Isolation Audit

## Scope

Reviewed the user dashboard, `GET /api/dashboard`, authentication dependency, and the ownership filters used for analyses, scam reports, and company verifications. Also reviewed the separate administrator analytics endpoint and frontend query-cache lifecycle.

## Findings

- The dashboard previously displayed fixed sample values (34 jobs, 8 reports, 12 saved results, and 19 company checks) and sample recent-analysis rows. Those values were not derived from the signed-in account.
- `GET /api/dashboard` already requires `require_auth`; it does not accept a client-supplied user ID.
- Dashboard aggregates and recent analyses are scoped using the authenticated `user.id`: `Analysis.user_id`, `ScamReportOwner.user_id`, and `CompanyVerification.user_id`.
- A new account with no owned records therefore has zero counts and an empty recent-activity list.
- There is no independent saved-results model or saved flag. Analyses are persisted into a user's history, so the dashboard's Saved Results count now represents that user's persisted analyses.
- The administrator's `/api/analytics` endpoint remains separate and uses global aggregates behind `require_admin`.
- The user dashboard query key includes the authenticated user ID, and auth changes clear the React Query cache. The QueryClient is created per router instance to avoid reusing SSR cache state across requests.

## Data and migration safety

No database schema changes or migration are needed. No database rows were modified or deleted.
