"""
Password hashing (scrypt) + HMAC-signed bearer tokens.
Keeps the exact same wire format as the Node backend so existing DB rows
and frontend token handling keep working.
"""
import hashlib
import hmac
import os
import re
import time
import secrets
from datetime import datetime, timezone
from typing import Any

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .database import get_db
from .models import User

SCHEME = "scrypt"
SCRYPT_KEYLEN = 64
SCRYPT_N = 16384
SCRYPT_R = 8
SCRYPT_P = 1
SESSION_SECRET = os.getenv("SESSION_SECRET", "dev-secret-change-me")
TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60  # 7 days

_bearer = HTTPBearer(auto_error=False)

# ── Password helpers ──────────────────────────────────────────────────────────


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    dk = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt.encode("utf-8"),
        n=SCRYPT_N,
        r=SCRYPT_R,
        p=SCRYPT_P,
        dklen=SCRYPT_KEYLEN,
    )
    return f"scrypt:{salt}:{dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    if not stored:
        return False
    parts = stored.split(":")
    if len(parts) != 3 or parts[0] != SCHEME:
        return False
    _, salt, expected_hex = parts
    candidate = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt.encode("utf-8"),
        n=SCRYPT_N,
        r=SCRYPT_R,
        p=SCRYPT_P,
        dklen=SCRYPT_KEYLEN,
    )
    return hmac.compare_digest(candidate.hex(), expected_hex)


_LEGACY_RE = re.compile(r"^[0-9a-f]{64}$")


def is_legacy_sha256(stored: str) -> bool:
    return bool(_LEGACY_RE.match(stored))


def legacy_sha256(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


# ── Token helpers (HMAC-signed — same wire format as Node) ────────────────────


def _b64url_encode(data: bytes) -> str:
    import base64

    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _b64url_decode(s: str) -> bytes:
    import base64

    pad = 4 - len(s) % 4
    s += "=" * pad
    return base64.urlsafe_b64decode(s)


def sign_token(payload: dict[str, Any]) -> str:
    import json

    body = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode())
    sig = _b64url_encode(
        hmac.new(SESSION_SECRET.encode(), body.encode(), "sha256").digest()
    )
    return f"{body}.{sig}"


def verify_token(token: str) -> dict[str, Any] | None:
    import json

    parts = token.split(".")
    if len(parts) != 2:
        return None
    body, sig = parts
    expected = _b64url_encode(
        hmac.new(SESSION_SECRET.encode(), body.encode(), "sha256").digest()
    )
    if not hmac.compare_digest(sig, expected):
        return None
    try:
        payload = json.loads(_b64url_decode(body))
        if payload.get("exp", 0) < time.time() * 1000:
            return None
        return payload
    except Exception:
        return None


def issue_token(user: User) -> str:
    return sign_token(
        {"sub": user.id, "role": user.role, "exp": time.time() * 1000 + TOKEN_TTL_SECONDS * 1000}
    )


# ── Public user dict ──────────────────────────────────────────────────────────


def public_user(user: User) -> dict:
    initials = "".join(w[0] for w in user.name.split() if w)[:2].upper()
    return {
        "id": user.id,
        "role": user.role,
        "name": user.name,
        "email": user.email,
        "phone": user.phone or "",
        "college": user.college or "",
        "course": user.course or "",
        "status": user.status,
        "photo": initials,
    }


def auth_response(user: User) -> dict:
    return {"user": public_user(user), "token": issue_token(user)}


# ── FastAPI dependencies ──────────────────────────────────────────────────────


async def _get_current_user(
    cred: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    if cred is None:
        raise HTTPException(401, "Authentication required.")
    payload = verify_token(cred.credentials)
    if not payload:
        raise HTTPException(401, "Invalid or expired token.")
    result = await db.execute(select(User).where(User.id == payload["sub"]))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(401, "User not found.")
    return user


def require_auth(user: User = Depends(_get_current_user)) -> User:
    return user


def require_admin(user: User = Depends(_get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(403, "Admin access required.")
    return user
