# Company Management Report

Company listing now requires an authenticated administrator and supports name/domain search, status filtering, and pagination. Existing create/update/delete operations remain admin-only and now append audit events. The page supports retry, paging, and a notice clarifying that `Verified` describes a stored platform status; the application schema has no external verification evidence or provenance.

The schema only stores name, domain, `Verified`/`Blacklisted` status, report count, and last-checked timestamp. Industry, location, contact details, registration/submission date, evidence, and verification history cannot be truthfully shown without a separately designed schema change. No schema migration was made to invent those fields.
