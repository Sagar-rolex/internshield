"""
FastAPI app — drop-in replacement for the Node.js backend.
Exact same API contract: same endpoints, same JSON shapes.
"""
import os
import asyncio
import logging
import time
import uuid
import json
import csv
import io
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, Depends, HTTPException, Request, Response, UploadFile, File, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import case, select, update, delete, func, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from .database import engine, get_db, Base
from .models import (
    AdminAuditLog,
    Analysis,
    AnalysisImage,
    Company,
    CompanyVerification,
    RevokedToken,
    ScamReport,
    ScamReportOwner,
    User,
)
from .schemas import (
    RegisterInput,
    LoginInput,
    UpdateUserInput,
    CreateReportInput,
    UpdateReportInput,
    CreateCompanyInput,
    CompanyVerificationInput,
    UpdateCompanyInput,
    AnalyzeManualInput,
    ChatInput,
)
from .services.evidence_engine import analyze_with_evidence
from .services.gemini_service import (
    validate_with_gemini,
    GeminiUnavailableError,
    GeminiAnalysisError,
    provider_configuration_status,
    _model_name,
)
from .services.risk_aggregator import aggregate_evidence_and_ai
from .services.chat_service import generate_chat_reply, wants_personal_analysis
from .services.ocr import (
    NoReadableTextError,
    OCRProcessingError,
    OCRUnavailableError,
    get_ocr_backend,
    require_readable_text,
)
from .services.image_processor import ALLOWED_FORMATS, MAX_IMAGE_BYTES
from .services.imagekit import (
    ImageKitConfigurationError,
    ImageKitServiceError,
    delete_screenshot,
    ensure_configured as ensure_imagekit_configured,
    get_signed_url as get_imagekit_signed_url,
    upload_screenshot,
)
from .auth import (
    hash_password,
    verify_password,
    is_legacy_sha256,
    legacy_sha256,
    public_user,
    auth_response,
    require_auth,
    require_admin,
    get_optional_user,
    verify_token,
)
from .seed import seed

# ── Validation constants (same as Node) ──────────────────────────────────────

VALID_USER_STATUS = {"Active", "Inactive", "Review"}
VALID_REPORT_STATUS = {"Pending", "Review", "Approved", "Rejected"}
VALID_REPORT_RISK = {"Low", "Medium", "High"}
VALID_COMPANY_STATUS = {"Verified", "Blacklisted"}
EMAIL_RE = __import__("re").compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


# ── Rate limiting (in-memory sliding window) ─────────────────────────────────

_rate_log: dict[str, list[float]] = {}
RATE_WINDOW = 60.0
RATE_MAX = 120
RATE_AUTH_MAX = 10
RATE_REGISTER_MAX = 5
RATE_CHAT_MAX = 20
_rate_calls = 0


def _check_rate(key: str, limit: int) -> bool:
    global _rate_calls
    now = time.time()
    entries = [t for t in _rate_log.get(key, []) if now - t < RATE_WINDOW]
    _rate_calls += 1
    if _rate_calls % 128 == 0:
        for old_key, old_entries in list(_rate_log.items()):
            if not old_entries or now - old_entries[-1] >= RATE_WINDOW:
                _rate_log.pop(old_key, None)
    if len(_rate_log) > 10_000:
        oldest_keys = sorted(
            _rate_log,
            key=lambda existing: _rate_log[existing][-1] if _rate_log[existing] else 0,
        )[:2_000]
        for old_key in oldest_keys:
            _rate_log.pop(old_key, None)
    if len(entries) >= limit:
        return False
    entries.append(now)
    _rate_log[key] = entries
    return True


def _rate_key(request: Request, path: str, is_auth: bool = False) -> str:
    ip = request.client.host if request.client else "unknown"
    return f"{ip}:{path}:{'auth' if is_auth else 'general'}"


# ── Lifespan: create tables + seed ──────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    provider_status = provider_configuration_status()
    if not provider_status["sdk_available"]:
        logging.getLogger("scamshield").error(
            "Chatbot unavailable: google-genai dependency is not installed."
        )
    elif not provider_status["api_key_configured"]:
        logging.getLogger("scamshield").error(
            "Chatbot unavailable: GEMINI_API_KEY is not configured in the backend environment."
        )
    else:
        logging.getLogger("scamshield").info(
            "Chatbot provider configured; model=%s", provider_status["model"]
        )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await seed()
    yield
    await engine.dispose()


app = FastAPI(title="ScamShield API", lifespan=lifespan)

APP_ENV = os.getenv("APP_ENV", "development").strip().lower()
cors_origin_str = os.getenv("CORS_ORIGIN", "").strip()
configured_cors_origins = [
    origin.strip().rstrip("/")
    for origin in cors_origin_str.split(",")
    if origin.strip()
]
cors_regex = os.getenv("CORS_ORIGIN_REGEX", "").strip() or None

if APP_ENV == "production":
    if not configured_cors_origins:
        raise RuntimeError("CORS_ORIGIN must list the exact HTTPS frontend origin(s) in production.")
    if cors_regex:
        raise RuntimeError("CORS_ORIGIN_REGEX is disabled in production; use exact origins.")
    from urllib.parse import urlsplit

    for origin in configured_cors_origins:
        parsed_origin = urlsplit(origin)
        if (
            parsed_origin.scheme != "https"
            or not parsed_origin.netloc
            or parsed_origin.path
            or parsed_origin.query
            or parsed_origin.fragment
            or "*" in origin
        ):
            raise RuntimeError(
                "Production CORS_ORIGIN values must be exact HTTPS origins without paths."
            )
    cors_origins = configured_cors_origins
else:
    # Local frontend origins must remain available in development even when a
    # developer's .env.local also contains a deployed frontend origin.
    development_origins = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]
    cors_origins = list(dict.fromkeys([*configured_cors_origins, *development_origins]))

if "*" in cors_origins:
    raise RuntimeError("CORS_ORIGIN must contain explicit frontend origins, not '*'.")

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_origin_regex=cors_regex,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _json(response: Response, status: int, body: dict) -> dict:
    response.status_code = status
    return body


# ── Health ───────────────────────────────────────────────────────────────────

@app.get("/")
@app.get("/health")
async def root_health():
    return {"status": "ok", "service": "ScamShield API", "version": "1.0.0"}

@app.get("/api/health")
async def health(db: AsyncSession = Depends(get_db)):
    try:
        await db.execute(select(func.count(User.id)))
    except Exception:
        raise HTTPException(503, "Database unavailable.")
    return {"ok": True, "database": "active"}


# ── Static file serving for uploaded screenshots ──────────────────────────────

from fastapi.responses import FileResponse

@app.get("/uploads/{filename}")
async def serve_upload(
    filename: str,
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """Serve an image only to the authenticated owner of its analysis."""
    if Path(filename).name != filename or not __import__("re").fullmatch(
        r"[a-f0-9]{32}\.(?:jpg|png|webp)", filename
    ):
        raise HTTPException(404, "File not found.")
    file_path = UPLOAD_DIR / filename
    if not file_path.exists():
        raise HTTPException(404, "File not found.")
    owned_image = (
        await db.execute(
            select(Analysis.id).where(
                Analysis.user_id == user.id,
                Analysis.image_path == f"/uploads/{filename}",
            )
        )
    ).scalar_one_or_none()
    if not owned_image:
        raise HTTPException(404, "File not found.")
    return FileResponse(file_path)


async def _read_upload_limited(file: UploadFile, max_bytes: int) -> bytes:
    chunks: list[bytes] = []
    total = 0
    while total <= max_bytes:
        chunk = await file.read(min(64 * 1024, max_bytes + 1 - total))
        if not chunk:
            break
        chunks.append(chunk)
        total += len(chunk)
    if total > max_bytes:
        raise HTTPException(413, "File is too large. Maximum size is 5 MB.")
    return b"".join(chunks)


# ── Auth ─────────────────────────────────────────────────────────────────────

@app.post("/api/auth/register")
async def register(body: RegisterInput, request: Request, db: AsyncSession = Depends(get_db)):
    if not _check_rate(_rate_key(request, "register", True), RATE_REGISTER_MAX):
        raise HTTPException(429, "Too many registration attempts. Please try again shortly.")
    # Validate password rules
    if not body.password or len(body.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters.")
    if not any(c.isupper() for c in body.password):
        raise HTTPException(400, "Password must include an uppercase letter.")
    if not any(c.isdigit() for c in body.password):
        raise HTTPException(400, "Password must include a number.")

    email = body.email.lower().strip()
    existing = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if existing:
        raise HTTPException(409, "An account with that email already exists.")

    user = User(
        id=str(uuid.uuid4()),
        name=body.name.strip(),
        email=email,
        password_hash=hash_password(body.password),
        role="user",
        status="Active",
    )
    db.add(user)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        # A concurrent request may have registered the email after the
        # availability check. Convert the unique-index race into a safe 409.
        existing = (
            await db.execute(select(User.id).where(User.email == email))
        ).scalar_one_or_none()
        if existing:
            raise HTTPException(409, "An account with that email already exists.") from exc
        logging.getLogger("scamshield").error(
            "Registration transaction failed due to a database integrity error (type=%s).",
            type(exc).__name__,
        )
        raise HTTPException(503, "Registration could not be completed. Please try again later.") from exc
    except Exception as exc:
        await db.rollback()
        logging.getLogger("scamshield").error(
            "Registration database transaction failed (type=%s).", type(exc).__name__
        )
        raise HTTPException(503, "Registration could not be completed. Please try again later.") from exc
    await db.refresh(user)
    return auth_response(user)


@app.post("/api/auth/login")
async def login(body: LoginInput, request: Request, db: AsyncSession = Depends(get_db)):
    key = _rate_key(request, "auth", True)
    if not _check_rate(key, RATE_AUTH_MAX):
        raise HTTPException(429, "Too many requests. Please try again shortly.")

    email = body.email.lower().strip()
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(401, "Invalid credentials.")
    if user.status != "Active":
        raise HTTPException(403, "This account is not active. Contact support.")

    ok = verify_password(body.password, user.password_hash)

    # Legacy SHA-256 migration
    if not ok and is_legacy_sha256(user.password_hash):
        if legacy_sha256(body.password) == user.password_hash:
            user.password_hash = hash_password(body.password)
            await db.commit()
            return auth_response(user)

    if not ok:
        raise HTTPException(401, "Invalid credentials.")

    return auth_response(user)


@app.post("/api/auth/admin-login")
async def admin_login(body: LoginInput, request: Request, db: AsyncSession = Depends(get_db)):
    key = _rate_key(request, "auth", True)
    if not _check_rate(key, RATE_AUTH_MAX):
        raise HTTPException(429, "Too many requests. Please try again shortly.")

    email = body.email.lower().strip()
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(401, "Invalid credentials.")
    if user.status != "Active":
        raise HTTPException(403, "This account is not active. Contact support.")

    ok = verify_password(body.password, user.password_hash)

    if not ok and is_legacy_sha256(user.password_hash):
        if legacy_sha256(body.password) == user.password_hash:
            user.password_hash = hash_password(body.password)
            await db.commit()
            if user.role != "admin":
                raise HTTPException(403, "Admin access required.")
            return auth_response(user)

    if not ok:
        raise HTTPException(401, "Invalid credentials.")
    if user.role != "admin":
        raise HTTPException(403, "Admin access required.")

    return auth_response(user)


@app.post("/api/auth/logout")
async def logout(
    request: Request,
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """Revoke the current bearer token; clients should still clear it immediately."""
    authorization = request.headers.get("authorization", "")
    token = authorization.partition(" ")[2].strip()
    payload = verify_token(token)
    if payload and isinstance(payload.get("jti"), str):
        expires_at = int(payload.get("exp", 0))
        existing = await db.get(RevokedToken, payload["jti"])
        if existing is None:
            db.add(RevokedToken(token_id=payload["jti"], expires_at=expires_at))
            await db.commit()
    return {"ok": True}


# ── Admin: users ─────────────────────────────────────────────────────────────

def _admin_user_to_dict(account: User) -> dict:
    """Return account metadata to admins without ever including credentials."""
    public = public_user(account)
    public["created_at"] = account.created_at.isoformat() if account.created_at else ""
    return public


def _record_admin_action(
    db: AsyncSession,
    actor: User,
    action: str,
    entity_type: str,
    entity_id: str,
    summary: str,
) -> None:
    db.add(
        AdminAuditLog(
            id=str(uuid.uuid4()),
            actor_id=actor.id,
            actor_email=actor.email,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            summary=summary[:300],
        )
    )


def _admin_date_bound(value: date | None, *, end: bool = False) -> datetime | None:
    if value is None:
        return None
    boundary = value + timedelta(days=1) if end else value
    return datetime.combine(boundary, datetime.min.time())

@app.get("/api/admin/users")
async def list_users(
    q: str = Query(default="", max_length=150),
    status: str | None = Query(default=None),
    role: str | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    sort_by: str = Query(default="created_at"),
    sort_order: str = Query(default="desc"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    statement = select(User)
    count_statement = select(func.count(User.id))
    if q.strip():
        search = f"%{q.strip().lower()}%"
        condition = func.lower(User.name).like(search) | func.lower(User.email).like(search)
        statement = statement.where(condition)
        count_statement = count_statement.where(condition)
    if status:
        if status not in VALID_USER_STATUS:
            raise HTTPException(400, "Invalid account status filter.")
        statement = statement.where(User.status == status)
        count_statement = count_statement.where(User.status == status)
    if role:
        if role not in {"user", "admin"}:
            raise HTTPException(400, "Invalid role filter.")
        statement = statement.where(User.role == role)
        count_statement = count_statement.where(User.role == role)
    if date_from:
        bound = _admin_date_bound(date_from)
        statement = statement.where(User.created_at >= bound)
        count_statement = count_statement.where(User.created_at >= bound)
    if date_to:
        bound = _admin_date_bound(date_to, end=True)
        statement = statement.where(User.created_at < bound)
        count_statement = count_statement.where(User.created_at < bound)

    sort_column = {"created_at": User.created_at, "name": User.name, "email": User.email}.get(sort_by)
    if sort_column is None or sort_order not in {"asc", "desc"}:
        raise HTTPException(400, "Invalid user sort option.")
    order_column = sort_column.asc() if sort_order == "asc" else sort_column.desc()
    total = int((await db.execute(count_statement)).scalar() or 0)
    rows = (
        await db.execute(
            statement.order_by(order_column, User.id).offset((page - 1) * page_size).limit(page_size)
        )
    ).scalars().all()
    return {
        "users": [_admin_user_to_dict(account) for account in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size,
    }


@app.get("/api/admin/users/{user_id}")
async def get_admin_user(
    user_id: str,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    target = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not target:
        raise HTTPException(404, "User not found.")
    analyses_count = int((await db.execute(
        select(func.count(Analysis.id)).where(Analysis.user_id == target.id)
    )).scalar() or 0)
    reports_count = int((await db.execute(
        select(func.count(ScamReportOwner.report_id)).where(ScamReportOwner.user_id == target.id)
    )).scalar() or 0)
    checks_count = int((await db.execute(
        select(func.count(CompanyVerification.id)).where(CompanyVerification.user_id == target.id)
    )).scalar() or 0)
    recent_analyses = (
        await db.execute(
            select(Analysis).where(Analysis.user_id == target.id)
            .order_by(Analysis.created_at.desc()).limit(5)
        )
    ).scalars().all()
    return {
        "user": _admin_user_to_dict(target),
        "stats": {"analyses": analyses_count, "reports": reports_count, "companyChecks": checks_count},
        "recentAnalyses": [
            {"id": row.id, "job_title": row.job_title or "", "company": row.company or "",
             "risk": row.risk, "created_at": row.created_at.isoformat() if row.created_at else ""}
            for row in recent_analyses
        ],
    }


@app.patch("/api/admin/users/{user_id}")
async def update_user(
    user_id: str,
    body: UpdateUserInput,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    if body.status and body.status not in VALID_USER_STATUS:
        raise HTTPException(400, f"Invalid status. Must be one of: {', '.join(VALID_USER_STATUS)}")

    target = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not target:
        raise HTTPException(404, "User not found.")
    if body.status:
        if target.role == "admin" and target.status == "Active" and body.status != "Active":
            active_admins = int((await db.execute(
                select(func.count(User.id)).where(User.role == "admin", User.status == "Active")
            )).scalar() or 0)
            if active_admins <= 1:
                raise HTTPException(409, "The last active administrator cannot be deactivated.")
        target.status = body.status
    if body.role:
        if body.role not in {"user", "admin"}:
            raise HTTPException(400, "Role must be user or admin.")
        if target.role == "admin" and body.role == "user" and target.status == "Active":
            active_admins = int((await db.execute(
                select(func.count(User.id)).where(User.role == "admin", User.status == "Active")
            )).scalar() or 0)
            if active_admins <= 1:
                raise HTTPException(409, "The last active administrator cannot be demoted.")
        target.role = body.role
    if body.name:
        target.name = body.name[:100]
    action = "user.role_updated" if body.role else "user.updated"
    _record_admin_action(db, user, action, "user", target.id, f"Updated account {target.email}.")
    await db.commit()
    await db.refresh(target)
    return {"user": _admin_user_to_dict(target)}


@app.delete("/api/admin/users/{user_id}")
async def delete_user(
    user_id: str,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    target = (await db.execute(select(User).where(User.id == user_id, User.role != "admin"))).scalar_one_or_none()
    if not target:
        raise HTTPException(404, "User not found or is an admin.")
    analysis_ids = select(Analysis.id).where(Analysis.user_id == target.id)
    image_file_ids = list((await db.execute(
        select(AnalysisImage.file_id).where(AnalysisImage.analysis_id.in_(analysis_ids))
    )).scalars().all())
    _record_admin_action(db, user, "user.deleted", "user", target.id, f"Deleted account {target.email}.")
    await db.execute(delete(ScamReportOwner).where(ScamReportOwner.user_id == target.id))
    await db.execute(delete(CompanyVerification).where(CompanyVerification.user_id == target.id))
    await db.execute(delete(AnalysisImage).where(AnalysisImage.analysis_id.in_(analysis_ids)))
    await db.execute(delete(Analysis).where(Analysis.user_id == target.id))
    await db.delete(target)
    await db.commit()
    for file_id in image_file_ids:
        try:
            await delete_screenshot(file_id)
        except (ImageKitConfigurationError, ImageKitServiceError):
            logger.warning("Could not remove an image asset linked to a deleted user account.")
    return {"ok": True}


# ── Reports ──────────────────────────────────────────────────────────────────

@app.get("/api/reports")
async def list_reports(
    q: str = Query(default="", max_length=150),
    status: str | None = Query(default=None),
    risk_level: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    statement = select(ScamReport)
    count_statement = select(func.count(func.distinct(ScamReport.id)))
    if user.role != "admin":
        statement = statement.join(
            ScamReportOwner, ScamReportOwner.report_id == ScamReport.id
        ).where(ScamReportOwner.user_id == user.id)
        count_statement = count_statement.join(
            ScamReportOwner, ScamReportOwner.report_id == ScamReport.id
        ).where(ScamReportOwner.user_id == user.id)
    if q.strip():
        search = f"%{q.strip().lower()}%"
        condition = func.lower(ScamReport.company).like(search) | func.lower(ScamReport.reporter).like(search)
        statement = statement.where(condition)
        count_statement = count_statement.where(condition)
    if status:
        if status not in VALID_REPORT_STATUS:
            raise HTTPException(400, "Invalid report status filter.")
        statement = statement.where(ScamReport.status == status)
        count_statement = count_statement.where(ScamReport.status == status)
    if risk_level:
        if risk_level not in VALID_REPORT_RISK:
            raise HTTPException(400, "Invalid risk level filter.")
        statement = statement.where(ScamReport.risk_level == risk_level)
        count_statement = count_statement.where(ScamReport.risk_level == risk_level)
    total = int((await db.execute(count_statement)).scalar() or 0)
    result = await db.execute(statement.order_by(ScamReport.date.desc()).offset((page - 1) * page_size).limit(page_size))
    reports = [
        {
            "id": r.id,
            "company": r.company,
            "reporter": r.reporter,
            "date": str(r.date)[:10] if r.date else "",
            "status": r.status,
            "risk_level": r.risk_level,
            "details": r.details or "",
        }
        for r in result.scalars().all()
    ]
    return {"reports": reports, "total": total, "page": page, "page_size": page_size, "total_pages": (total + page_size - 1) // page_size}


@app.post("/api/reports")
async def create_report(
    body: CreateReportInput,
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    company = body.company.strip()[:150]
    if not company:
        raise HTTPException(400, "Company name is required.")
    if body.riskLevel not in VALID_REPORT_RISK:
        raise HTTPException(400, f"Invalid risk level. Must be one of: {', '.join(VALID_REPORT_RISK)}")

    report = ScamReport(
        id=str(uuid.uuid4()),
        company=company,
        reporter=user.name[:100],
        risk_level=body.riskLevel,
        details=body.details[:2000],
        status="Pending",
    )
    db.add(report)
    db.add(ScamReportOwner(report_id=report.id, user_id=user.id))
    await db.commit()
    await db.refresh(report)
    return {
        "report": {
            "id": report.id,
            "company": report.company,
            "reporter": report.reporter,
            "date": str(report.date)[:10] if report.date else "",
            "status": report.status,
            "risk_level": report.risk_level,
            "details": report.details or "",
        }
    }


@app.patch("/api/reports/{report_id}")
async def update_report(
    report_id: str,
    body: UpdateReportInput,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    if body.status and body.status not in VALID_REPORT_STATUS:
        raise HTTPException(400, f"Invalid status. Must be one of: {', '.join(VALID_REPORT_STATUS)}")
    if body.riskLevel and body.riskLevel not in VALID_REPORT_RISK:
        raise HTTPException(400, f"Invalid risk level. Must be one of: {', '.join(VALID_REPORT_RISK)}")

    target = (await db.execute(select(ScamReport).where(ScamReport.id == report_id))).scalar_one_or_none()
    if not target:
        raise HTTPException(404, "Report not found.")
    if body.status:
        target.status = body.status
    if body.riskLevel:
        target.risk_level = body.riskLevel
    _record_admin_action(
        db, user, "report.updated", "report", target.id,
        f"Updated report status/risk for {target.company}.",
    )
    await db.commit()
    await db.refresh(target)
    return {
        "report": {
            "id": target.id,
            "company": target.company,
            "reporter": target.reporter,
            "date": str(target.date)[:10] if target.date else "",
            "status": target.status,
            "risk_level": target.risk_level,
            "details": target.details or "",
        }
    }


@app.delete("/api/reports/{report_id}")
async def delete_report(
    report_id: str,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    target = (await db.execute(select(ScamReport).where(ScamReport.id == report_id))).scalar_one_or_none()
    if not target:
        raise HTTPException(404, "Report not found.")
    _record_admin_action(db, user, "report.deleted", "report", target.id, f"Deleted report for {target.company}.")
    await db.delete(target)
    await db.commit()
    return {"ok": True}


# ── Companies ────────────────────────────────────────────────────────────────

@app.get("/api/companies")
async def list_companies(
    q: str = Query(default="", max_length=150),
    status: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    statement = select(Company)
    count_statement = select(func.count(Company.id))
    if q.strip():
        search = f"%{q.strip().lower()}%"
        condition = func.lower(Company.name).like(search) | func.lower(Company.domain).like(search)
        statement = statement.where(condition)
        count_statement = count_statement.where(condition)
    if status:
        if status not in VALID_COMPANY_STATUS:
            raise HTTPException(400, "Invalid company status filter.")
        statement = statement.where(Company.status == status)
        count_statement = count_statement.where(Company.status == status)
    total = int((await db.execute(count_statement)).scalar() or 0)
    result = await db.execute(statement.order_by(Company.status, Company.name).offset((page - 1) * page_size).limit(page_size))
    companies = [
        {
            "id": c.id,
            "name": c.name,
            "domain": c.domain or "",
            "status": c.status,
            "reports": c.reports,
            "last_checked": str(c.last_checked)[:10] if c.last_checked else "",
        }
        for c in result.scalars().all()
    ]
    return {"companies": companies, "total": total, "page": page, "page_size": page_size, "total_pages": (total + page_size - 1) // page_size}


@app.post("/api/company-verifications")
async def verify_company_record(
    body: CompanyVerificationInput,
    user: User | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    """Compare a name against this platform's records; this is not external verification."""
    query = body.query.strip()[:200]
    if not query:
        raise HTTPException(400, "Company name is required.")
    company = (
        await db.execute(select(Company).where(func.lower(Company.name) == query.lower()))
    ).scalar_one_or_none()
    status = company.status if company else "Not found in records"
    company_name = company.name if company else query

    if user is not None:
        db.add(
            CompanyVerification(
                id=str(uuid.uuid4()),
                user_id=user.id,
                query=query,
                company_name=company_name,
                status=status,
            )
        )
        await db.commit()

    return {
        "match": (
            {
                "id": company.id,
                "name": company.name,
                "domain": company.domain or "",
                "status": company.status,
                "reports": company.reports,
                "last_checked": str(company.last_checked)[:10] if company.last_checked else "",
            }
            if company
            else None
        ),
        "message": "Matched against records stored on this platform; this is not independent company verification.",
    }


@app.post("/api/companies")
async def create_company(
    body: CreateCompanyInput,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    name = body.name.strip()[:150]
    if not name:
        raise HTTPException(400, "Company name is required.")
    if body.status not in VALID_COMPANY_STATUS:
        raise HTTPException(400, "Invalid status. Must be Verified or Blacklisted.")

    company = Company(
        id=str(uuid.uuid4()),
        name=name,
        domain=body.domain[:200] if body.domain else "",
        status=body.status,
        reports=0,
    )
    db.add(company)
    _record_admin_action(db, user, "company.created", "company", company.id, f"Added {company.name} to platform records.")
    await db.commit()
    await db.refresh(company)
    return {
        "company": {
            "id": company.id,
            "name": company.name,
            "domain": company.domain or "",
            "status": company.status,
            "reports": company.reports,
            "last_checked": str(company.last_checked)[:10] if company.last_checked else "",
        }
    }


@app.patch("/api/companies/{company_id}")
async def update_company(
    company_id: str,
    body: UpdateCompanyInput,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    if body.status and body.status not in VALID_COMPANY_STATUS:
        raise HTTPException(400, "Invalid status. Must be Verified or Blacklisted.")

    target = (await db.execute(select(Company).where(Company.id == company_id))).scalar_one_or_none()
    if not target:
        raise HTTPException(404, "Company not found.")
    if body.name is not None:
        target.name = body.name[:150]
    if body.domain is not None:
        target.domain = body.domain[:200]
    if body.status is not None:
        target.status = body.status
    if body.reports is not None:
        target.reports = max(0, int(body.reports))
    target.last_checked = func.now()
    _record_admin_action(
        db, user, "company.updated", "company", target.id,
        f"Updated {target.name}; platform status is {target.status}.",
    )
    await db.commit()
    await db.refresh(target)
    return {
        "company": {
            "id": target.id,
            "name": target.name,
            "domain": target.domain or "",
            "status": target.status,
            "reports": target.reports,
            "last_checked": str(target.last_checked)[:10] if target.last_checked else "",
        }
    }


@app.delete("/api/companies/{company_id}")
async def delete_company(
    company_id: str,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    target = (await db.execute(select(Company).where(Company.id == company_id))).scalar_one_or_none()
    if not target:
        raise HTTPException(404, "Company not found.")
    _record_admin_action(db, user, "company.deleted", "company", target.id, f"Removed {target.name} from platform records.")
    await db.delete(target)
    await db.commit()
    return {"ok": True}


# ── Analysis (fake job detector) ───────────────────────────────────────────

UPLOAD_DIR = Path(__file__).resolve().parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

# Risk thresholds for recommendations
RISK_HIGH_THRESHOLD = 60
RISK_MEDIUM_THRESHOLD = 30

# Configure logging
import logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)


def _parse_json_list(raw: str | None) -> list:
    if not raw:
        return []
    try:
        value = json.loads(raw)
        return value if isinstance(value, list) else []
    except Exception:
        return []


def _build_recommendations(signals: list, probability: int) -> list[str]:
    triggered = {s.name for s in signals if s.triggered}
    categories = {s.category for s in signals if s.triggered}
    recs = []

    if probability >= RISK_HIGH_THRESHOLD or "payment" in categories or "Suspicious Keywords" in triggered:
        recs.append("Do not pay any registration, training, or application fee.")
    if "pay" in categories or "task" in categories:
        recs.append("Compare the offered salary with typical ranges for the role before responding.")
    if "credential" in categories:
        recs.append("Never share OTPs, PINs, passwords, CVV, or banking credentials with a recruiter.")
    if "Missing/Insecure Website" in triggered:
        recs.append("Verify the company through its official website or trusted job boards.")
    if "Missing Company Info" in triggered:
        recs.append("Confirm the recruiter's identity through an official company email domain.")
    if "Vague Description" in triggered or probability >= RISK_MEDIUM_THRESHOLD:
        recs.append("Do not share OTP, PIN, UPI, or banking credentials with any recruiter.")

    # Always-apply safety basics
    recs.append("Contact the company using independently verified contact information.")

    # De-duplicate, cap at 6
    seen = set()
    unique: list[str] = []
    for r in recs:
        if r not in seen:
            seen.add(r)
            unique.append(r)
    return unique[:6]


def _analysis_to_dict(row: Analysis) -> dict:
    signals = _parse_json_list(row.signals)
    return {
        "id": row.id,
        "input_type": row.input_type,
        "job_title": row.job_title or "",
        "company": row.company or "",
        "website": row.website or "",
        "description": row.description or "",
        "image_path": row.image_path or "",
        "has_image": False,
        "extracted_text": row.extracted_text or "",
        "probability": row.probability,
        "risk": row.risk,
        "safe": row.safe,
        "trust_score": row.trust_score,
        "reasons": _parse_json_list(row.reasons),
        "positives": _parse_json_list(row.positives),
        "keywords": _parse_json_list(row.keywords),
        "signals": signals,
        "uncertainties": _uncertainties_from_signals(signals),
        "ai": {
            "available": row.ai_available,
            "explanation": row.ai_explanation or "",
        },
        "recommendations": _parse_json_list(row.recommendations),
        "ocr_mode": row.ocr_mode or "manual",
        "created_at": str(row.created_at)[:19] if row.created_at else "",
    }


def _uncertainties_from_signals(signals: list[dict]) -> list[str]:
    uncertainties = []
    for signal in signals:
        if signal.get("id") == "website_unverified":
            uncertainties.append("No official website was included, so employer identity could not be checked from this text.")
        elif signal.get("id") == "personal_email_domain":
            domain = str(signal.get("evidence", "")).split("@")[-1]
            uncertainties.append(f"Recruiter email uses a free email provider (@{domain}); verify the recruiter independently.")
    return uncertainties


@app.post("/api/analyze")
async def analyze_manual_endpoint(
    body: AnalyzeManualInput,
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """Manual text-based analysis — evidence-based scam detection."""
    if not body.title.strip():
        raise HTTPException(400, "Please enter a job title.")
    if not body.company.strip():
        raise HTTPException(400, "Please enter a company name.")

    # Combine all provided text for analysis
    combined_text = "\n".join(filter(None, [
        body.title.strip(),
        body.company.strip(),
        body.website.strip() if body.website else "",
        body.description.strip() if body.description else "",
        body.email.strip() if body.email else "",
        body.salary.strip() if body.salary else "",
    ]))

    # Step 1: Run evidence-based rule engine
    evidence_result = analyze_with_evidence(combined_text)

    # Step 2: Validate with AI (if available and enabled)
    ai_output = None
    ai_error = None

    # Check if AI validation should be skipped for faster analysis
    skip_ai = os.getenv("SKIP_AI_VALIDATION", "false").lower() == "true"

    if not skip_ai:
        try:
            ai_output = await validate_with_gemini(
                text=combined_text,
                rule_findings=evidence_result.reasons,
                extracted_data=evidence_result.extracted_data,
            )
        except GeminiUnavailableError as e:
            ai_error = str(e)
        except GeminiAnalysisError as e:
            ai_error = str(e)
            # Fallback result available if AI failed
            if e.fallback_result:
                ai_output = e.fallback_result
        except Exception as e:
            # Catch any other timeout or network errors
            ai_error = f"AI validation timed out: {str(e)}"
    else:
        ai_error = "AI validation skipped for faster analysis"

    # Step 3: Aggregate evidence + AI validation
    hybrid_result = aggregate_evidence_and_ai(
        evidence_result=evidence_result,
        ai_output=ai_output,
        ai_error=ai_error,
    )

    # Step 4: Build recommendations from signals
    recs = _build_recommendations(evidence_result.signals, evidence_result.probability)
    if ai_output and ai_output.recommendations:
        recs.extend(ai_output.recommendations)
    # Deduplicate and cap at 6
    recs = list(dict.fromkeys(recs))[:6]

    # Step 5: Persist analysis to database
    row = Analysis(
        id=str(uuid.uuid4()),
        user_id=user.id,
        input_type="manual",
        job_title=body.title.strip()[:200],
        company=body.company.strip()[:150],
        website=body.website[:200] if body.website else "",
        description=body.description[:5000] if body.description else "",
        extracted_text=combined_text[:10000],
        probability=hybrid_result.final_score,
        risk=hybrid_result.risk_level,
        safe=hybrid_result.safe,
        trust_score=100 - hybrid_result.final_score,
        reasons=json.dumps(hybrid_result.rule_findings),
        positives=json.dumps(hybrid_result.positives),
        keywords=json.dumps([s.name for s in evidence_result.signals if s.triggered]),
        signals=json.dumps([{
            "name": s.name,
            "weight": s.weight,
            "triggered": s.triggered,
            "evidence": s.evidence,
            "id": s.id,
            "category": s.category,
            "severity": s.severity,
            "confidence": s.confidence,
            "contribution": s.contribution,
        } for s in evidence_result.signals]),
        ai_explanation=hybrid_result.ai_validation.get("additional_context", ""),
        ai_available=hybrid_result.ai_available,
        recommendations=json.dumps(recs),
        ocr_mode="manual",
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)

    # Step 6: Format response
    response_data = _analysis_to_dict(row)
    response_data["rule_score"] = hybrid_result.rule_score
    response_data["ai_score"] = hybrid_result.ai_score
    response_data["final_score"] = hybrid_result.final_score
    response_data["ai_validation"] = hybrid_result.ai_validation
    response_data["confidence"] = hybrid_result.confidence
    response_data["uncertainties"] = evidence_result.uncertainties

    return {"analysis": response_data}


@app.post("/api/analyze-screenshot")
async def analyze_screenshot_endpoint(
    request: Request,
    file: UploadFile = File(...),
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """Screenshot analysis — upload image, OCR-extract text, run evidence-based detection."""
    import logging
    logger = logging.getLogger("scamshield")

    # Define allowed content types
    ALLOWED_CONTENT_TYPES = {
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/webp",
    }

    content_type = file.content_type or ""
    # Infer from extension if content_type missing
    if not content_type and file.filename:
        ext = file.filename.rsplit(".", 1)[-1].lower()
        if ext in ("jpg", "jpeg"):
            content_type = "image/jpeg"
        elif ext == "png":
            content_type = "image/png"
        elif ext == "webp":
            content_type = "image/webp"

    if content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            415,
            f"Unsupported file format: {content_type}. Please upload JPG, JPEG, PNG, or WEBP.",
        )

    image_bytes = await _read_upload_limited(file, MAX_IMAGE_BYTES)
    if not image_bytes:
        raise HTTPException(400, "Please upload a screenshot.")

    try:
        ensure_imagekit_configured()
    except ImageKitConfigurationError as exc:
        raise HTTPException(503, str(exc)) from exc

    ext_map = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "image/jpg": ".jpg",
    }
    ext = ext_map.get(content_type, ".jpg")
    image_name = f"{uuid.uuid4().hex}{ext}"

    logger.info("Screenshot received: size=%s bytes", len(image_bytes))

    # Step 1: OCR with quality validation
    logger.info(f"Getting OCR backend (OCR_BACKEND={os.getenv('OCR_BACKEND', 'auto')})")
    try:
        ocr_backend = get_ocr_backend()
    except OCRUnavailableError as e:
        logger.error("OCR backend unavailable: %s", e)
        raise HTTPException(
            503,
            "Screenshot analysis is temporarily unavailable because OCR is not installed.",
        ) from e
    ocr_mode = ocr_backend.name
    logger.info(f"Using OCR backend: {ocr_mode}")

    try:
        logger.info("Starting screenshot OCR")
        ocr_result = ocr_backend.extract_text(image_bytes, file.filename or "")
        logger.info("Screenshot OCR completed")
    except Exception as e:
        logger.exception("Screenshot OCR raised an unexpected error")
        raise HTTPException(500, "OCR could not process this image. Please try another screenshot.") from e

    logger.info(
        f"OCR result: backend={ocr_mode}, success={ocr_result.success}, "
        f"chars={ocr_result.characters_extracted}, confidence={ocr_result.confidence:.1f}%, "
        f"quality_score={ocr_result.quality_score:.1f}"
    )

    try:
        extracted_text = require_readable_text(ocr_result)
    except NoReadableTextError as e:
        logger.warning("Screenshot OCR found no usable text: %s", ocr_result.error or "empty result")
        raise HTTPException(422, str(e)) from e
    except OCRProcessingError as e:
        logger.error("Screenshot OCR processing failed: %s", e)
        raise HTTPException(500, "OCR could not process this image. Please try another screenshot.") from e

    # Step 4: Run evidence-based analysis
    evidence_result = analyze_with_evidence(extracted_text)

    # Step 5: Validate with AI (if available and enabled)
    ai_output = None
    ai_error = None

    # Check if AI validation should be skipped for faster analysis
    skip_ai = os.getenv("SKIP_AI_VALIDATION", "false").lower() == "true"

    if not skip_ai:
        try:
            ai_output = await validate_with_gemini(
                text=extracted_text,
                rule_findings=evidence_result.reasons,
                extracted_data=evidence_result.extracted_data,
            )
        except GeminiUnavailableError as e:
            ai_error = str(e)
        except GeminiAnalysisError as e:
            ai_error = str(e)
            if e.fallback_result:
                ai_output = e.fallback_result
        except Exception as e:
            # Catch any other timeout or network errors
            ai_error = f"AI validation timed out: {str(e)}"
            logger.warning(f"AI validation failed: {e}")
    else:
        ai_error = "AI validation skipped for faster analysis"

    # Step 6: Aggregate evidence + AI
    hybrid_result = aggregate_evidence_and_ai(
        evidence_result=evidence_result,
        ai_output=ai_output,
        ai_error=ai_error,
    )

    logger.info(
        f"Analysis result: rule_score={hybrid_result.rule_score}, "
        f"ai_score={hybrid_result.ai_score}, final_score={hybrid_result.final_score}, "
        f"risk={hybrid_result.risk_level}, ai_available={hybrid_result.ai_available}"
    )

    # Step 7: Build recommendations
    recs = _build_recommendations(evidence_result.signals, evidence_result.probability)
    if ai_output and ai_output.recommendations:
        recs.extend(ai_output.recommendations)
    recs = list(dict.fromkeys(recs))[:6]

    # Step 8: Persist to database
    row = Analysis(
        id=str(uuid.uuid4()),
        user_id=user.id,
        input_type="screenshot",
        extracted_text=extracted_text[:10000],
        image_path="",
        probability=hybrid_result.final_score,
        risk=hybrid_result.risk_level,
        safe=hybrid_result.safe,
        trust_score=100 - hybrid_result.final_score,
        reasons=json.dumps(hybrid_result.rule_findings),
        positives=json.dumps(hybrid_result.positives),
        keywords=json.dumps([s.name for s in evidence_result.signals if s.triggered]),
        signals=json.dumps([{
            "name": s.name,
            "weight": s.weight,
            "triggered": s.triggered,
            "evidence": s.evidence,
            "id": s.id,
            "category": s.category,
            "severity": s.severity,
            "confidence": s.confidence,
            "contribution": s.contribution,
        } for s in evidence_result.signals]),
        ai_explanation=hybrid_result.ai_validation.get("additional_context", ""),
        ai_available=hybrid_result.ai_available,
        recommendations=json.dumps(recs),
        ocr_mode=ocr_mode,
    )
    try:
        stored_image = await upload_screenshot(image_bytes, image_name, user.id)
    except ImageKitConfigurationError as exc:
        raise HTTPException(503, str(exc)) from exc
    except ImageKitServiceError as exc:
        logger.exception("ImageKit screenshot upload failed")
        raise HTTPException(
            503, "Screenshot storage is temporarily unavailable. Please try again."
        ) from exc

    image_asset = AnalysisImage(
        analysis_id=row.id,
        file_id=stored_image.file_id,
        file_path=stored_image.file_path,
    )
    try:
        db.add(row)
        db.add(image_asset)
        await db.commit()
        await db.refresh(row)
    except Exception as e:
        await db.rollback()
        logger.exception("Could not save screenshot analysis to history")
        try:
            await delete_screenshot(stored_image.file_id)
        except (ImageKitConfigurationError, ImageKitServiceError):
            logger.exception("Could not clean up an unlinked ImageKit screenshot")
        raise HTTPException(
            503,
            "Analysis could not be saved to your history right now. Please try again.",
        ) from e

    # Step 9: Format response
    response_data = _analysis_to_dict(row)
    response_data["has_image"] = True
    response_data["rule_score"] = hybrid_result.rule_score
    response_data["ai_score"] = hybrid_result.ai_score
    response_data["final_score"] = hybrid_result.final_score
    response_data["ai_validation"] = hybrid_result.ai_validation
    response_data["confidence"] = round(hybrid_result.confidence * max(0.0, min(1.0, ocr_result.confidence / 100.0)), 3)
    response_data["uncertainties"] = evidence_result.uncertainties
    response_data["ocr_quality"] = ocr_result.quality_score
    response_data["ocr_confidence"] = ocr_result.confidence

    if ocr_mode == "demo":
        response_data["ocr_warning"] = (
            "Demo OCR engine used (Tesseract not installed). Install Tesseract + pytesseract for real OCR."
        )

    return {"analysis": response_data}


@app.get("/api/analyses")
async def list_analyses(
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    rows = (
        await db.execute(
            select(Analysis).where(Analysis.user_id == user.id).order_by(Analysis.created_at.desc())
        )
    ).scalars().all()
    image_ids = set()
    if rows:
        image_ids = set(
            (
                await db.execute(
                    select(AnalysisImage.analysis_id).where(
                        AnalysisImage.analysis_id.in_([row.id for row in rows])
                    )
                )
            ).scalars().all()
        )
    analyses = []
    for row in rows:
        item = _analysis_to_dict(row)
        item["has_image"] = row.id in image_ids
        analyses.append(item)
    return {"analyses": analyses}


@app.get("/api/analyses/{analysis_id}/image")
async def get_analysis_image(
    analysis_id: str,
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    asset = (
        await db.execute(
            select(AnalysisImage)
            .join(Analysis, Analysis.id == AnalysisImage.analysis_id)
            .where(Analysis.id == analysis_id, Analysis.user_id == user.id)
        )
    ).scalar_one_or_none()
    if not asset:
        raise HTTPException(404, "Screenshot not found.")

    try:
        return {"url": get_imagekit_signed_url(asset.file_path)}
    except ImageKitConfigurationError as exc:
        raise HTTPException(503, str(exc)) from exc
    except ImageKitServiceError as exc:
        raise HTTPException(503, "Could not create a secure screenshot link.") from exc


@app.delete("/api/analyses/{analysis_id}/image")
async def delete_analysis_image(
    analysis_id: str,
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    asset = (
        await db.execute(
            select(AnalysisImage)
            .join(Analysis, Analysis.id == AnalysisImage.analysis_id)
            .where(Analysis.id == analysis_id, Analysis.user_id == user.id)
        )
    ).scalar_one_or_none()
    if not asset:
        raise HTTPException(404, "Screenshot not found.")

    try:
        await delete_screenshot(asset.file_id)
    except ImageKitConfigurationError as exc:
        raise HTTPException(503, str(exc)) from exc
    except ImageKitServiceError as exc:
        raise HTTPException(503, "Could not delete the stored screenshot. Please retry.") from exc

    try:
        await db.delete(asset)
        await db.commit()
    except Exception as exc:
        await db.rollback()
        logging.getLogger("scamshield").exception(
            "ImageKit screenshot was deleted but its history link could not be removed"
        )
        raise HTTPException(
            503, "Screenshot was deleted, but history could not be updated. Please retry."
        ) from exc
    return {"ok": True}


class ChatClientDisconnected(Exception):
    """The browser disconnected while a Gemini request was still running."""


async def _chat_reply_or_disconnect(
    request: Request,
    message: str,
    history: list[dict],
    analysis_context: dict | None,
) -> str:
    """Cancel provider work when the client leaves instead of wasting retries."""
    provider_task = asyncio.create_task(
        generate_chat_reply(message, history, analysis_context)
    )
    try:
        while not provider_task.done():
            if await request.is_disconnected():
                provider_task.cancel()
                try:
                    await provider_task
                except asyncio.CancelledError:
                    pass
                raise ChatClientDisconnected()
            await asyncio.wait({provider_task}, timeout=0.25)
        return provider_task.result()
    finally:
        if not provider_task.done():
            provider_task.cancel()
            try:
                await provider_task
            except asyncio.CancelledError:
                pass


@app.post("/api/chat")
async def chat(
    body: ChatInput,
    request: Request,
    user: User | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    """Answer a safety question with bounded recent context; no chat text is persisted."""
    rate_key = f"user:{user.id}:chat" if user else _rate_key(request, "chat", True)
    if not _check_rate(rate_key, RATE_CHAT_MAX):
        raise HTTPException(429, "Chat limit reached. Wait a minute and try again.")

    history = [turn.model_dump() for turn in body.history[-8:]]
    analysis_context = None
    if user and wants_personal_analysis(body.message):
        latest = (
            await db.execute(
                select(Analysis)
                .where(Analysis.user_id == user.id)
                .order_by(Analysis.created_at.desc())
                .limit(1)
            )
        ).scalars().first()
        if latest:
            analysis_context = {
                "job_title": latest.job_title or "",
                "company": latest.company or "",
                "score": latest.probability,
                "risk": latest.risk,
                "reasons": _parse_json_list(latest.reasons)[:10],
                "signals": [
                    {"name": signal.get("name"), "evidence": signal.get("evidence", "")}
                    for signal in _parse_json_list(latest.signals)
                    if signal.get("triggered")
                ][:10],
                "recommendations": _parse_json_list(latest.recommendations)[:8],
            }

    try:
        reply = await asyncio.wait_for(
            _chat_reply_or_disconnect(request, body.message, history, analysis_context),
            timeout=65.0,
        )
    except ChatClientDisconnected:
        logging.getLogger("scamshield").info("Chat request cancelled after client disconnect.")
        raise HTTPException(499, "Client disconnected.")
    except GeminiUnavailableError:
        config_status = provider_configuration_status()
        if not config_status["sdk_available"]:
            logging.getLogger("scamshield").error(
                "Chatbot request unavailable: SDK dependency missing (google-genai)."
            )
            raise HTTPException(
                503,
                "The AI assistant dependency is missing on the backend. Redeploy the backend dependencies.",
            )
        logging.getLogger("scamshield").error(
            "Chatbot request unavailable: GEMINI_API_KEY is missing."
        )
        raise HTTPException(
            503,
            "The AI assistant is not configured on the backend. Set GEMINI_API_KEY in the backend environment.",
        )
    except asyncio.TimeoutError:
        raise HTTPException(504, "The assistant took too long to respond. Please retry.")
    except GeminiAnalysisError as exc:
        logger = logging.getLogger("scamshield")
        logger.warning("Chat provider failure category=%s", exc.code)
        if exc.code == "invalid_api_key":
            raise HTTPException(
                503,
                "Gemini rejected the backend API key. Verify GEMINI_API_KEY in the backend environment.",
            )
        if exc.code == "provider_quota_exceeded":
            raise HTTPException(
                429,
                "The Gemini project quota or spending limit appears exhausted. Check Google AI Studio Usage and Rate Limits; changing the API key will not reset project limits.",
            )
        if exc.code == "provider_rate_limited":
            retry_after = exc.retry_after_seconds or 30
            raise HTTPException(
                429,
                "Gemini's short-term request limit was reached. Wait, then retry. If it continues, check the project's AI Studio Rate Limits and Usage.",
                headers={"Retry-After": str(retry_after)},
            )
        if exc.code == "provider_unavailable":
            raise HTTPException(
                503,
                "Gemini is temporarily overloaded or unavailable. Please wait a few seconds and retry.",
                headers={"Retry-After": "5"},
            )
        if exc.code == "network_error":
            raise HTTPException(
                503,
                "The backend could not reach Gemini after several attempts. Check the backend network and retry.",
                headers={"Retry-After": "5"},
            )
        if exc.code == "model_unavailable":
            raise HTTPException(
                503,
                "The configured Gemini model is unavailable. Verify GEMINI_MODEL on the backend.",
            )
        if exc.code == "provider_timeout":
            raise HTTPException(504, "Gemini took too long to respond. Please retry.")
        raise HTTPException(502, "The assistant could not create a reliable response. Please retry.")
    except Exception as exc:
        logging.getLogger("scamshield").error("Chat request failed (%s)", type(exc).__name__)
        raise HTTPException(502, "The assistant is temporarily unavailable. Please retry.")

    return {
        "reply": reply,
        "model": _model_name(),
        "analysis_context_used": analysis_context is not None,
    }


# ── User and administrator analytics ────────────────────────────────────────

@app.get("/api/dashboard")
async def user_dashboard(
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """Return dashboard counts and recent analyses for the authenticated user only."""
    analyses_count = (
        await db.execute(select(func.count(Analysis.id)).where(Analysis.user_id == user.id))
    ).scalar() or 0
    reports_count = (
        await db.execute(
            select(func.count(ScamReportOwner.report_id)).where(ScamReportOwner.user_id == user.id)
        )
    ).scalar() or 0
    verifications_count = (
        await db.execute(
            select(func.count(CompanyVerification.id)).where(CompanyVerification.user_id == user.id)
        )
    ).scalar() or 0
    # Analyses are automatically persisted to the user's History; the current
    # schema has no separate saved/unsaved state, so these are the saved results.
    saved_results_count = analyses_count
    recent_rows = (
        await db.execute(
            select(Analysis)
            .where(Analysis.user_id == user.id)
            .order_by(Analysis.created_at.desc())
            .limit(10)
        )
    ).scalars().all()
    return {
        "stats": {
            "jobsAnalyzed": analyses_count,
            "reportsSubmitted": reports_count,
            "savedResults": saved_results_count,
            "companyChecks": verifications_count,
        },
        "recentAnalyses": [_analysis_to_dict(row) for row in recent_rows],
    }


def _analytics_bounds(period: str, date_from: date | None, date_to: date | None) -> tuple[datetime | None, datetime | None]:
    today = datetime.now(timezone.utc).date()
    if period == "all":
        return None, None
    if period == "custom":
        if date_from is None or date_to is None:
            raise HTTPException(400, "Custom analytics require date_from and date_to.")
        if date_from > date_to:
            raise HTTPException(400, "date_from must not be after date_to.")
        return _admin_date_bound(date_from), _admin_date_bound(date_to, end=True)
    if period not in {"today", "7d", "30d", "90d", "year"}:
        raise HTTPException(400, "Unsupported analytics period.")
    if period == "today":
        first_day = today
    elif period == "7d":
        first_day = today - timedelta(days=6)
    elif period == "30d":
        first_day = today - timedelta(days=29)
    elif period == "90d":
        first_day = today - timedelta(days=89)
    else:
        first_day = today.replace(month=1, day=1)
    return _admin_date_bound(first_day), _admin_date_bound(today, end=True)


def _analytics_granularity(period: str, start: datetime | None, end: datetime | None) -> str:
    if period == "today":
        return "hour"
    if period in {"7d", "30d"}:
        return "day"
    if period == "90d":
        return "week"
    if period == "custom" and start and end:
        span = (end - start).days
        return "day" if span <= 31 else "week" if span <= 120 else "month"
    return "month"


def _bucket_expression(column, dialect: str, granularity: str):
    if dialect == "postgresql":
        return func.date_trunc(granularity, column)
    formats = {"hour": "%Y-%m-%d %H:00", "day": "%Y-%m-%d", "week": "%Y-%W", "month": "%Y-%m"}
    return func.strftime(formats[granularity], column)


def _bucket_key(value, granularity: str) -> str:
    if isinstance(value, datetime):
        if granularity == "hour":
            return value.strftime("%Y-%m-%d %H:00")
        if granularity == "day":
            return value.strftime("%Y-%m-%d")
        if granularity == "week":
            return value.strftime("%Y-%W")
        return value.strftime("%Y-%m")
    return str(value or "")


def _bucket_label(key: str, granularity: str) -> str:
    try:
        if granularity == "hour":
            return datetime.strptime(key, "%Y-%m-%d %H:%M").strftime("%b %d %H:%M")
        if granularity == "day":
            return datetime.strptime(key, "%Y-%m-%d").strftime("%b %d")
        if granularity == "week":
            year, week = key.split("-", 1)
            return f"{year} W{int(week) + 1}"
        return datetime.strptime(key, "%Y-%m").strftime("%b %Y")
    except (TypeError, ValueError):
        return key


async def _grouped_count(
    db: AsyncSession, model, column, start, end, granularity: str, *conditions
) -> dict[str, int]:
    bucket = _bucket_expression(column, db.get_bind().dialect.name, granularity)
    statement = select(bucket.label("bucket"), func.count()).select_from(model).where(*conditions)
    if start:
        statement = statement.where(column >= start)
    if end:
        statement = statement.where(column < end)
    rows = (await db.execute(statement.group_by(bucket).order_by(bucket))).all()
    return {_bucket_key(row.bucket, granularity): int(row[1] or 0) for row in rows if row.bucket}


async def _risk_category_counts(db: AsyncSession, start, end) -> list[dict]:
    dialect = db.get_bind().dialect.name
    conditions = []
    params: dict[str, object] = {}
    if start:
        conditions.append("a.created_at >= :start")
        params["start"] = start
    if end:
        conditions.append("a.created_at < :end")
        params["end"] = end
    if dialect == "postgresql":
        sql = (
            "SELECT COALESCE(NULLIF(signal.value->>'category', ''), 'Uncategorized') AS category, COUNT(*) AS total "
            "FROM analyses AS a CROSS JOIN LATERAL jsonb_array_elements(COALESCE(NULLIF(a.signals, '')::jsonb, '[]'::jsonb)) AS signal(value) "
            "WHERE signal.value->>'triggered' = 'true'"
        )
    elif dialect == "sqlite":
        sql = (
            "SELECT COALESCE(NULLIF(json_extract(signal.value, '$.category'), ''), 'Uncategorized') AS category, COUNT(*) AS total "
            "FROM analyses AS a CROSS JOIN json_each(CASE WHEN json_valid(a.signals) THEN a.signals ELSE '[]' END) AS signal "
            "WHERE json_extract(signal.value, '$.triggered') IN (1, 'true')"
        )
    else:
        return []
    if conditions:
        sql += " AND " + " AND ".join(conditions)
    sql += " GROUP BY category ORDER BY total DESC, category LIMIT 8"
    rows = (await db.execute(text(sql), params)).all()
    return [{"category": row.category, "count": int(row.total or 0)} for row in rows]


async def _admin_analytics_data(db: AsyncSession, period: str, date_from: date | None, date_to: date | None) -> dict:
    start, end = _analytics_bounds(period, date_from, date_to)
    date_filter = lambda column: ([column >= start] if start else []) + ([column < end] if end else [])

    async def count(statement) -> int:
        return int((await db.execute(statement)).scalar() or 0)

    total_users = await count(select(func.count(User.id)).where(User.role == "user"))
    active_users = await count(select(func.count(User.id)).where(User.role == "user", User.status == "Active"))
    inactive_users = await count(select(func.count(User.id)).where(User.role == "user", User.status == "Inactive"))
    review_users = await count(select(func.count(User.id)).where(User.role == "user", User.status == "Review"))
    analysis_conditions = date_filter(Analysis.created_at)
    report_conditions = date_filter(ScamReport.date)
    verification_conditions = date_filter(CompanyVerification.created_at)
    jobs = await count(select(func.count(Analysis.id)).where(*analysis_conditions))
    risk_counts = {}
    for risk in ("Critical", "High", "Medium", "Low"):
        risk_counts[risk] = await count(
            select(func.count(Analysis.id)).where(Analysis.risk == risk, *analysis_conditions)
        )
    total_reports = await count(select(func.count(ScamReport.id)).where(*report_conditions))
    pending_reports = await count(select(func.count(ScamReport.id)).where(ScamReport.status == "Pending", *report_conditions))
    total_companies = await count(select(func.count(Company.id)))
    verified_companies = await count(select(func.count(Company.id)).where(Company.status == "Verified"))
    company_checks = await count(select(func.count(CompanyVerification.id)).where(*verification_conditions))
    scams_detected = risk_counts["Critical"] + risk_counts["High"]

    period_users = await count(select(func.count(User.id)).where(User.role == "user", *date_filter(User.created_at)))
    status_rows = (await db.execute(
        select(ScamReport.status, func.count(ScamReport.id)).where(*report_conditions).group_by(ScamReport.status)
    )).all()
    report_statuses = {str(status): int(total or 0) for status, total in status_rows}
    for status_name in ("Pending", "Review", "Approved", "Rejected"):
        report_statuses.setdefault(status_name, 0)

    company_status_rows = (await db.execute(
        select(Company.status, func.count(Company.id)).group_by(Company.status)
    )).all()
    company_statuses = {str(status): int(total or 0) for status, total in company_status_rows}
    for status_name in ("Verified", "Blacklisted"):
        company_statuses.setdefault(status_name, 0)

    granularity = _analytics_granularity(period, start, end)
    analysis_series = await _grouped_count(db, Analysis, Analysis.created_at, start, end, granularity)
    user_series = await _grouped_count(
        db, User, User.created_at, start, end, granularity, User.role == "user"
    )
    report_series = await _grouped_count(db, ScamReport, ScamReport.date, start, end, granularity)
    scam_series = await _grouped_count(
        db, Analysis, Analysis.created_at, start, end, granularity,
        Analysis.risk.in_(("High", "Critical")),
    )
    keys = sorted(set(analysis_series) | set(user_series) | set(report_series) | set(scam_series))
    monthly = [
        {"bucket": key, "label": _bucket_label(key, granularity), "jobs": analysis_series.get(key, 0),
         "registrations": user_series.get(key, 0), "reports": report_series.get(key, 0),
         "scams": scam_series.get(key, 0)}
        for key in keys
    ]

    risk_rows = (await db.execute(
        select(Analysis.risk, func.count(Analysis.id)).where(*analysis_conditions).group_by(Analysis.risk)
    )).all()
    actual_risk = {str(risk): int(total or 0) for risk, total in risk_rows}
    risk_distribution = [{"risk": risk, "count": actual_risk.get(risk, 0)} for risk in ("Low", "Medium", "High", "Critical")]
    categories = await _risk_category_counts(db, start, end)
    top_companies = (await db.execute(
        select(ScamReport.company, func.count(ScamReport.id).label("reports"))
        .where(*report_conditions).group_by(ScamReport.company)
        .order_by(func.count(ScamReport.id).desc(), ScamReport.company).limit(5)
    )).all()

    recent_users = (await db.execute(
        select(User).where(User.role == "user").order_by(User.created_at.desc()).limit(5)
    )).scalars().all()
    recent_reports = (await db.execute(
        select(ScamReport).order_by(ScamReport.date.desc()).limit(5)
    )).scalars().all()
    recent_companies = (await db.execute(
        select(Company).where(Company.status == "Verified").order_by(Company.last_checked.desc()).limit(5)
    )).scalars().all()
    recent_analyses = (await db.execute(
        select(Analysis).order_by(Analysis.created_at.desc()).limit(5)
    )).scalars().all()
    recent_actions = (await db.execute(
        select(AdminAuditLog).order_by(AdminAuditLog.created_at.desc()).limit(10)
    )).scalars().all()

    return {
        "period": period,
        "dateRange": {"from": start.isoformat() if start else None, "to": (end - timedelta(microseconds=1)).isoformat() if end else None},
        "granularity": granularity,
        "cards": {
            "totalUsers": total_users, "activeUsers": active_users, "inactiveUsers": inactive_users,
            "reviewUsers": review_users,
            "newUsers": period_users, "jobsAnalyzed": jobs, "scamsDetected": scams_detected,
            "highRiskDetections": risk_counts["Critical"] + risk_counts["High"],
            "mediumRiskDetections": risk_counts["Medium"], "lowRiskDetections": risk_counts["Low"],
            "totalReports": total_reports, "reportsPending": pending_reports,
            "verifiedCompanies": verified_companies, "totalCompanies": total_companies,
            "companyChecks": company_checks,
            "detectionRate": round((scams_detected / jobs) * 100, 1) if jobs else 0,
        },
        "monthly": monthly,
        "riskDistribution": risk_distribution,
        "scamCategories": categories,
        "reportStatusDistribution": [{"status": key, "count": report_statuses[key]} for key in sorted(report_statuses)],
        "companyStatusDistribution": [{"status": key, "count": company_statuses[key]} for key in sorted(company_statuses)],
        "topCompanies": [{"company": name, "reports": int(total or 0)} for name, total in top_companies],
        "recentUsers": [_admin_user_to_dict(account) for account in recent_users],
        "recentReports": [
            {"id": row.id, "company": row.company, "reporter": row.reporter,
             "date": row.date.isoformat() if row.date else "", "status": row.status,
             "risk_level": row.risk_level, "details": row.details or ""}
            for row in recent_reports
        ],
        "recentCompanies": [
            {"id": row.id, "name": row.name, "domain": row.domain or "", "status": row.status,
             "last_checked": row.last_checked.isoformat() if row.last_checked else ""}
            for row in recent_companies
        ],
        "recentAnalyses": [
            {"id": row.id, "job_title": row.job_title or "", "company": row.company or "",
             "risk": row.risk, "probability": row.probability,
             "created_at": row.created_at.isoformat() if row.created_at else ""}
            for row in recent_analyses
        ],
        "recentAdminActions": [
            {"id": row.id, "actor": row.actor_email, "action": row.action,
             "entity_type": row.entity_type, "entity_id": row.entity_id,
             "summary": row.summary, "created_at": row.created_at.isoformat() if row.created_at else ""}
            for row in recent_actions
        ],
    }


@app.get("/api/analytics")
async def analytics(
    period: str = Query(default="all"),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    return await _admin_analytics_data(db, period, date_from, date_to)


@app.get("/api/admin/analytics.csv")
async def export_admin_analytics(
    period: str = Query(default="all"),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    data = await _admin_analytics_data(db, period, date_from, date_to)
    output = io.StringIO(newline="")
    writer = csv.writer(output)
    writer.writerow(["metric", "value"])
    writer.writerow(["period", data["period"]])
    writer.writerow(["date_from", data["dateRange"]["from"] or "all time"])
    writer.writerow(["date_to", data["dateRange"]["to"] or "all time"])
    writer.writerow([])
    for key, value in data["cards"].items():
        writer.writerow([key, value])
    writer.writerow([])
    writer.writerow(["time_bucket", "jobs", "scams_detected_high_or_critical", "registrations", "reports"])
    for row in data["monthly"]:
        writer.writerow([row["label"], row["jobs"], row["scams"], row["registrations"], row["reports"]])
    writer.writerow([])
    writer.writerow(["risk", "count"])
    for row in data["riskDistribution"]:
        writer.writerow([row["risk"], row["count"]])
    writer.writerow([])
    writer.writerow(["scam_signal_category", "trigger_count"])
    for row in data["scamCategories"]:
        writer.writerow([row["category"], row["count"]])
    return Response(
        content=output.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="internshield-analytics-{period}.csv"'},
    )
