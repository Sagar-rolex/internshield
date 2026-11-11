# Admin Analytics Report

`GET /api/analytics` now aggregates stored records and supports `period=all|today|7d|30d|90d|year|custom`; custom periods require `date_from=YYYY-MM-DD` and `date_to=YYYY-MM-DD`. Series use hour/day/week/month buckets according to the selected range and include user registrations, analyses, high/critical detections, and reports. Category counts come from triggered categories in analysis signal JSON. CSV export is available at `GET /api/admin/analytics.csv` with the same period/date parameters.

All counts reflect persisted application rows. The endpoint does not fabricate monthly history. Recent-list panels currently show the latest records overall, while KPI and chart aggregates respect the selected range. Company status distribution reflects current `Verified`/`Blacklisted` platform values; no company verification history or `Unverified` state exists in the current schema, so those historical trends are unavailable.
