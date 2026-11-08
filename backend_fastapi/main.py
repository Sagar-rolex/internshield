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
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, Depends, HTTPException, Request, Response, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import case, select, update, delete, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from .database import engine, get_db, Base
from .models import (
    Analysis,
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

cors_origin_str = os.getenv("CORS_ORIGIN", "").strip()
cors_origins = [o.strip() for o in cors_origin_str.split(",") if o.strip()]
APP_ENV = os.getenv("APP_ENV", "development").strip().lower()
cors_regex = os.getenv("CORS_ORIGIN_REGEX", "").strip() or None

if APP_ENV == "production":
    if not cors_origins:
        raise RuntimeError("CORS_ORIGIN must list the exact HTTPS frontend origin(s) in production.")
    if cors_regex:
        raise RuntimeError("CORS_ORIGIN_REGEX is disabled in production; use exact origins.")
    if any(not origin.startswith("https://") or "*" in origin for origin in cors_origins):
        raise RuntimeError("Production CORS_ORIGIN values must be explicit HTTPS origins.")
elif not cors_origins:
    cors_origins = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

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

@app.get("/api/admin/users")
async def list_users(
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    users = [public_user(u) for u in result.scalars().all()]
    return {"users": users}


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
        target.status = body.status
    if body.name:
        target.name = body.name[:100]
    await db.commit()
    await db.refresh(target)
    return {"user": public_user(target)}


@app.delete("/api/admin/users/{user_id}")
async def delete_user(
    user_id: str,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    target = (await db.execute(select(User).where(User.id == user_id, User.role != "admin"))).scalar_one_or_none()
    if not target:
        raise HTTPException(404, "User not found or is an admin.")
    await db.execute(delete(ScamReportOwner).where(ScamReportOwner.user_id == target.id))
    await db.execute(delete(CompanyVerification).where(CompanyVerification.user_id == target.id))
    await db.delete(target)
    await db.commit()
    return {"ok": True}


# ── Reports ──────────────────────────────────────────────────────────────────

@app.get("/api/reports")
async def list_reports(
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    statement = select(ScamReport)
    if user.role != "admin":
        statement = statement.join(
            ScamReportOwner, ScamReportOwner.report_id == ScamReport.id
        ).where(ScamReportOwner.user_id == user.id)
    result = await db.execute(statement.order_by(ScamReport.date.desc()))
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
    return {"reports": reports}


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
    await db.delete(target)
    await db.commit()
    return {"ok": True}


# ── Companies ────────────────────────────────────────────────────────────────

@app.get("/api/companies")
async def list_companies(
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Company).order_by(Company.status, Company.name))
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
    return {"companies": companies}


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

    # Prepare a stable image reference; persist only after OCR succeeds.
    ext_map = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "image/jpg": ".jpg",
    }
    ext = ext_map.get(content_type, ".jpg")
    image_name = f"{uuid.uuid4().hex}{ext}"
    image_ref = f"/uploads/{image_name}"

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

    image_path = UPLOAD_DIR / image_name
    try:
        image_path.write_bytes(image_bytes)
    except OSError as e:
        logger.exception("Could not store the analyzed screenshot")
        raise HTTPException(500, "Analysis completed, but the screenshot could not be saved.") from e

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
        image_path=image_ref,
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
        db.add(row)
        await db.commit()
        await db.refresh(row)
    except Exception as e:
        await db.rollback()
        logger.exception("Could not save screenshot analysis to history")
        raise HTTPException(
            503,
            "Analysis could not be saved to your history right now. Please try again.",
        ) from e

    # Step 9: Format response
    response_data = _analysis_to_dict(row)
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
    return {"analyses": [_analysis_to_dict(r) for r in rows]}


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


# ── Analytics ────────────────────────────────────────────────────────────────

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


@app.get("/api/analytics")
async def analytics(
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    total_users = (await db.execute(
        select(func.count(User.id)).where(User.role == "user")
    )).scalar() or 0
    jobs_analyzed = (await db.execute(select(func.count(Analysis.id)))).scalar() or 0
    scams_detected = (
        await db.execute(select(func.count(Analysis.id)).where(Analysis.risk == "High"))
    ).scalar() or 0
    pending_reports = (
        await db.execute(select(func.count(ScamReport.id)).where(ScamReport.status == "Pending"))
    ).scalar() or 0
    verified_companies = (await db.execute(
        select(func.count(Company.id)).where(Company.status == "Verified")
    )).scalar() or 0

    dialect = db.get_bind().dialect.name
    if dialect == "postgresql":
        analysis_month = func.to_char(func.date_trunc("month", Analysis.created_at), "YYYY-MM")
        report_month = func.to_char(func.date_trunc("month", ScamReport.date), "YYYY-MM")
    else:
        analysis_month = func.strftime("%Y-%m", Analysis.created_at)
        report_month = func.strftime("%Y-%m", ScamReport.date)

    analysis_month_rows = (
        await db.execute(
            select(
                analysis_month.label("month"),
                func.count(Analysis.id).label("jobs"),
                func.sum(case((Analysis.risk == "High", 1), else_=0)).label("detected"),
            )
            .group_by(analysis_month)
            .order_by(analysis_month.desc())
            .limit(6)
        )
    ).all()
    report_month_rows = (
        await db.execute(
            select(report_month.label("month"), func.count(ScamReport.id).label("reports"))
            .group_by(report_month)
            .order_by(report_month.desc())
            .limit(6)
        )
    ).all()
    monthly_values: dict[str, dict[str, int]] = {}
    for row in analysis_month_rows:
        if row.month:
            monthly_values[row.month] = {"jobs": int(row.jobs or 0), "detected": int(row.detected or 0), "reports": 0}
    for row in report_month_rows:
        if row.month:
            monthly_values.setdefault(row.month, {"jobs": 0, "detected": 0, "reports": 0})["reports"] = int(row.reports or 0)
    monthly = [
        {
            "month": datetime.strptime(month, "%Y-%m").strftime("%b %Y"),
            **monthly_values[month],
        }
        for month in sorted(monthly_values)[-6:]
    ]

    risk_rows = (
        await db.execute(
            select(Analysis.risk, func.count(Analysis.id))
            .group_by(Analysis.risk)
            .order_by(Analysis.risk)
        )
    ).all()
    top_companies = (
        await db.execute(
            select(ScamReport.company, func.count(ScamReport.id).label("reports"))
            .group_by(ScamReport.company)
            .order_by(func.count(ScamReport.id).desc(), ScamReport.company)
            .limit(5)
        )
    ).all()
    recent_reports = (
        await db.execute(select(ScamReport).order_by(ScamReport.date.desc()).limit(5))
    ).scalars().all()

    return {
        "cards": {
            "totalUsers": total_users,
            "jobsAnalyzed": jobs_analyzed,
            "scamsDetected": scams_detected,
            "reportsPending": pending_reports,
            "verifiedCompanies": verified_companies,
            "detectionRate": round((scams_detected / jobs_analyzed) * 100, 1) if jobs_analyzed else 0,
            "monthlyReports": sum(int(value["reports"]) for value in monthly_values.values()),
        },
        "monthly": monthly,
        "riskDistribution": [{"risk": risk, "count": count} for risk, count in risk_rows],
        "topCompanies": [{"company": name, "reports": count} for name, count in top_companies],
        "recentReports": [
            {
                "id": report.id,
                "company": report.company,
                "reporter": report.reporter,
                "date": str(report.date)[:10] if report.date else "",
                "status": report.status,
                "risk_level": report.risk_level,
                "details": report.details or "",
            }
            for report in recent_reports
        ],
    }
