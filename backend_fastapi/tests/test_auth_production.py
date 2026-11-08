"""Local integration coverage for registration and authentication behavior."""
import asyncio
import os
import unittest
import uuid
from unittest.mock import patch

from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from starlette.requests import Request

from backend_fastapi import main, seed as seed_module
from backend_fastapi.auth import _get_current_user, hash_password, verify_token
from backend_fastapi.database import Base
from backend_fastapi.models import User
from backend_fastapi.schemas import LoginInput, RegisterInput


def make_request(path: str, headers: list[tuple[bytes, bytes]] | None = None) -> Request:
    async def receive():
        await asyncio.Future()

    return Request(
        {
            "type": "http",
            "http_version": "1.1",
            "method": "POST",
            "scheme": "http",
            "path": path,
            "raw_path": path.encode(),
            "query_string": b"",
            "headers": headers or [],
            "client": (f"auth-test-{uuid.uuid4()}", 12345),
            "server": ("127.0.0.1", 4001),
        },
        receive=receive,
    )


class AuthFlowTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        async with self.engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        self.factory = async_sessionmaker(self.engine, expire_on_commit=False)
        async with self.factory() as db:
            db.add_all(
                [
                    User(
                        id="production-admin",
                        name="Production Admin",
                        email="admin@example.com",
                        password_hash=hash_password("AdminPass123"),
                        role="admin",
                        status="Active",
                    ),
                    User(
                        id="ordinary-user",
                        name="Ordinary User",
                        email="user@example.com",
                        password_hash=hash_password("UserPass123"),
                        role="user",
                        status="Active",
                    ),
                ]
            )
            await db.commit()

    async def asyncTearDown(self):
        await self.engine.dispose()

    async def test_registration_persists_hashed_user_and_user_can_login(self):
        async with self.factory() as db:
            registered = await main.register(
                RegisterInput(name="New Student", email="New@Example.com", password="Student123"),
                make_request("/api/auth/register"),
                db,
            )
            stored = (
                await db.execute(select(User).where(User.email == "new@example.com"))
            ).scalar_one()
            self.assertEqual(registered["user"]["role"], "user")
            self.assertNotEqual(stored.password_hash, "Student123")
            self.assertTrue(stored.password_hash.startswith("scrypt:"))
            self.assertTrue(verify_token(registered["token"]))

            # Close the creating session and read through a fresh one to verify persistence.
        async with self.factory() as db:
            login = await main.login(
                LoginInput(email="new@example.com", password="Student123"),
                make_request("/api/auth/login"),
                db,
            )
            self.assertEqual(login["user"]["id"], registered["user"]["id"])

    async def test_duplicate_registration_returns_conflict_without_extra_user(self):
        async with self.factory() as db:
            with self.assertRaises(HTTPException) as caught:
                await main.register(
                    RegisterInput(name="Duplicate", email="USER@example.com", password="Student123"),
                    make_request("/api/auth/register"),
                    db,
                )
            self.assertEqual(caught.exception.status_code, 409)
            count = (await db.execute(select(func.count(User.id)))).scalar_one()
            self.assertEqual(count, 2)

    async def test_existing_admin_login_and_user_is_rejected_from_admin_login(self):
        async with self.factory() as db:
            result = await main.admin_login(
                LoginInput(email="ADMIN@example.com", password="AdminPass123"),
                make_request("/api/auth/admin-login"),
                db,
            )
            self.assertEqual(result["user"]["role"], "admin")
            with self.assertRaises(HTTPException) as caught:
                await main.admin_login(
                    LoginInput(email="user@example.com", password="UserPass123"),
                    make_request("/api/auth/admin-login"),
                    db,
                )
            self.assertEqual(caught.exception.status_code, 403)

    async def test_invalid_password_is_rejected(self):
        async with self.factory() as db:
            with self.assertRaises(HTTPException) as caught:
                await main.login(
                    LoginInput(email="user@example.com", password="WrongPass123"),
                    make_request("/api/auth/login"),
                    db,
                )
            self.assertEqual(caught.exception.status_code, 401)

    async def test_logout_revokes_token_and_survives_session_reload(self):
        async with self.factory() as db:
            login = await main.login(
                LoginInput(email="user@example.com", password="UserPass123"),
                make_request("/api/auth/login"),
                db,
            )
            token = login["token"]
            payload = verify_token(token)
            await main.logout(
                make_request(
                    "/api/auth/logout",
                    [(b"authorization", f"Bearer {token}".encode())],
                ),
                await db.get(User, "ordinary-user"),
                db,
            )

        async with self.factory() as db:
            credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
            with self.assertRaises(HTTPException) as caught:
                await _get_current_user(credentials, db)
            self.assertEqual(caught.exception.status_code, 401)
            self.assertIsNotNone(payload)

    async def test_admin_only_route_rejects_authenticated_user(self):
        async with self.factory() as db:
            with self.assertRaises(HTTPException) as caught:
                main.require_admin(await db.get(User, "ordinary-user"))
            self.assertEqual(caught.exception.status_code, 403)


class ProductionSeedTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        async with self.engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        self.factory = async_sessionmaker(self.engine, expire_on_commit=False)

    async def asyncTearDown(self):
        await self.engine.dispose()

    async def test_production_seed_adds_configured_admin_even_when_users_exist(self):
        async with self.factory() as db:
            db.add(
                User(
                    id="existing-user",
                    name="Existing",
                    email="existing@example.com",
                    password_hash=hash_password("Existing123"),
                    role="user",
                    status="Active",
                )
            )
            await db.commit()

        production_env = {
            "APP_ENV": "production",
            "ADMIN_EMAIL": "root@example.com",
            "ADMIN_PASSWORD": "RootPass123",
            "SEED_DEMO_DATA": "false",
        }
        with patch.dict(os.environ, production_env, clear=True):
            with patch.object(seed_module, "AsyncSessionLocal", self.factory):
                await seed_module.seed()

        async with self.factory() as db:
            admin = (await db.execute(select(User).where(User.email == "root@example.com"))).scalar_one()
            users = (await db.execute(select(User))).scalars().all()
            self.assertEqual(admin.role, "admin")
            self.assertTrue(admin.password_hash.startswith("scrypt:"))
            self.assertEqual(len(users), 2)

    async def test_production_seed_preserves_existing_admin_credentials(self):
        original_hash = hash_password("KeepThis123")
        async with self.factory() as db:
            db.add(
                User(
                    id="existing-admin",
                    name="Existing Admin",
                    email="root@example.com",
                    password_hash=original_hash,
                    role="admin",
                    status="Inactive",
                )
            )
            await db.commit()

        production_env = {
            "APP_ENV": "production",
            "ADMIN_EMAIL": "root@example.com",
            "ADMIN_PASSWORD": "NewPass456",
            "SEED_DEMO_DATA": "true",
        }
        with patch.dict(os.environ, production_env, clear=True):
            with patch.object(seed_module, "AsyncSessionLocal", self.factory):
                await seed_module.seed()

        async with self.factory() as db:
            admin = (await db.execute(select(User).where(User.email == "root@example.com"))).scalar_one()
            count = (await db.execute(select(func.count(User.id)))).scalar_one()
            self.assertEqual(admin.password_hash, original_hash)
            self.assertEqual(admin.status, "Inactive")
            self.assertEqual(count, 1)


if __name__ == "__main__":
    unittest.main()
