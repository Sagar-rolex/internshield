# Scam Report Management

Report listing now supports server-side search by company/reporter, status and risk filters, and pagination. Admins can continue to moderate status and delete reports using the existing protected endpoints; those changes are recorded in the admin audit table. Non-admin list requests remain scoped to reports owned by the authenticated user.

The current report schema stores company, reporter, date, status (`Pending`, `Review`, `Approved`, `Rejected`), risk level, and details. Its statuses do not match the requested `Confirmed Scam`/`Resolved` workflow labels, so the existing status contract is preserved. The schema does not store a report category, evidence uploads, or status-transition history; those are not represented as available in the upgraded panel.
