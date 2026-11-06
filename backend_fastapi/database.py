"""
Database configuration — SQLAlchemy async engine + SQLite (default) or PostgreSQL.
"""
import os
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase

APP_ENV = os.getenv("APP_ENV", "development").strip().lower()
configured_database_url = os.getenv("DATABASE_URL", "").strip()

if APP_ENV == "production" and not configured_database_url:
    raise RuntimeError("DATABASE_URL must point to the production PostgreSQL database.")

DATABASE_URL = configured_database_url or "sqlite+aiosqlite:///./scamshield.db"

if APP_ENV == "production" and not configured_database_url.startswith(
    ("postgres://", "postgresql://", "postgresql+asyncpg://")
):
    raise RuntimeError("Production DATABASE_URL must use PostgreSQL with the asyncpg driver.")

# Render (and several other managed PostgreSQL providers) supply a
# postgresql:// URL. SQLAlchemy's async engine needs the asyncpg dialect.
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+asyncpg://", 1)
elif DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_async_engine(DATABASE_URL, echo=False, future=True, connect_args=connect_args)

AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
