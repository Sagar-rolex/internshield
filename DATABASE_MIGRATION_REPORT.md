# Database and Migration Report

## Database configuration

`backend_fastapi/database.py` reads `DATABASE_URL` from the backend process. In production, `APP_ENV=production` now requires a PostgreSQL URL; Render's `postgres://` / `postgresql://` forms are normalized to SQLAlchemy's asyncpg driver. The connection string remains server-side.

## Schema behavior

The service calls `Base.metadata.create_all()` during startup. This creates absent tables and leaves existing tables alone; it is not a migration system and cannot safely add or change columns. This repository has no Alembic migration history. No schema change was needed for the auth fix, no migration was applied, and no production data was modified.

## Production comparison

A local-to-production schema comparison was not possible because the production database is not connected from this workspace. Do not provide a database URL or password in chat. For a later schema audit, use a read-only connection or Render's schema tooling, compare PostgreSQL table/column/index/constraint metadata, then prepare a reviewed forward-only migration if a mismatch is found. Never reset, drop, truncate, or rebuild the production database.

## Deployment check

Verify the Render `DATABASE_URL` points to the intended Render PostgreSQL instance (prefer its internal URL when the service and database share a region) and that the database remains the same across deployments. The auth code change requires no table alteration.
