# Admin Dashboard Implementation

`/admin/dashboard` now loads `/api/analytics?period=all` and renders database-derived users, analyses, high/critical detections, reports, company records/checks, risk/category distributions, activity series, recent reports/users/analyses/platform-verified companies, and recent admin actions. Loading, retry, API failure, and empty states are explicit.

Metric definitions follow available fields: active, inactive, and review user counts match their stored statuses; scam detections are analyses whose stored risk is `High` or `Critical`; company checks count `CompanyVerification`; platform-verified companies count `Company.status == "Verified"`. That status is a platform label, not proof of external verification. Categories come from stored analysis signals with `triggered=true`. Time series include registrations, analyses, high/critical detections, and reports. Missing/empty data displays zero/empty states instead of sample values.

Role changes are allowed only through the admin-protected endpoint; last active admin accounts cannot be demoted/deactivated. Existing schema gaps include last-login time, separate saved-result records, company verification history/evidence, and unverified company state.
