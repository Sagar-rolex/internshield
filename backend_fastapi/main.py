"""
FastAPI app — drop-in replacement for the Node.js backend.
Exact same API contract: same endpoints, same JSON shapes.
"""
import os
import time
import uuid
import json
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, Depends, HTTPException, Request, Response, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import select, update, delete, func
from sqlalchemy.ext.asyncio import AsyncSession

from .database import engine, get_db, Base
from .models import User, ScamReport, Company, Analysis
from .schemas import (
    RegisterInput,
    LoginInput,
    UpdateUserInput,
    CreateReportInput,
    UpdateReportInput,
    CreateCompanyInput,
    UpdateCompanyInput,
    AnalyzeManualInput,
)
from .services.evidence_engine import analyze_with_evidence
from .services.gemini_service import (
    validate_with_gemini,
    GeminiUnavailableError,
    GeminiAnalysisError,
)
from .services.risk_aggregator import aggregate_evidence_and_ai
from .services.ocr import get_ocr_backend
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


def _check_rate(key: str, limit: int) -> bool:
    now = time.time()
    entries = [t for t in _rate_log.get(key, []) if now - t < RATE_WINDOW]
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
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await seed()
    yield
    await engine.dispose()


app = FastAPI(title="ScamShield API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        o.strip()
        for o in os.getenv(
            "CORS_ORIGIN",
            "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8080,http://127.0.0.1:8080",
        ).split(",")
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _json(response: Response, status: int, body: dict) -> dict:
    response.status_code = status
    return body


# ── Health ───────────────────────────────────────────────────────────────────

@app.get("/api/health")
async def health(db: AsyncSession = Depends(get_db)):
    try:
        await db.execute(select(func.count(User.id)))
    except Exception:
        raise HTTPException(503, "Database unavailable.")
    return {"ok": True, "database": "postgresql"}


# ── Static file serving for uploaded screenshots ──────────────────────────────

from fastapi.responses import FileResponse

@app.get("/uploads/{filename}")
async def serve_upload(filename: str):
    """Serve uploaded screenshot images for analysis history."""
    file_path = UPLOAD_DIR / filename
    if not file_path.exists():
        raise HTTPException(404, "File not found.")
    return FileResponse(file_path)


# ── Auth ─────────────────────────────────────────────────────────────────────

@app.post("/api/auth/register")
async def register(body: RegisterInput, db: AsyncSession = Depends(get_db)):
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
    await db.commit()
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
    await db.delete(target)
    await db.commit()
    return {"ok": True}


# ── Reports ──────────────────────────────────────────────────────────────────

@app.get("/api/reports")
async def list_reports(
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(ScamReport).order_by(ScamReport.date.desc()))
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
        reporter=body.reporter[:100] or "Anonymous",
        risk_level=body.riskLevel,
        details=body.details[:2000],
        status="Pending",
    )
    db.add(report)
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
    user: User = Depends(require_auth),
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
    user: User = Depends(require_auth),
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
    user: User = Depends(require_auth),
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
    user: User = Depends(require_auth),
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
    recs = []

    if probability >= RISK_HIGH_THRESHOLD or "Suspicious Keywords" in triggered:
        recs.append("Do not pay any registration, training, or application fee.")
    if "Unrealistic Salary" in triggered:
        recs.append("Compare the offered salary with typical ranges for the role before responding.")
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


def _ai_payload_for_text(text: str) -> dict:
    """Run Gemini with graceful fallback — never fail the whole request."""
    try:
        result = analyze_with_gemini(text)
        return {
            "available": True,
            "explanation": result.explanation,
            "red_flags": result.red_flags,
            "risk_factors": result.risk_factors,
            "confidence": result.confidence,
        }
    except GeminiUnavailableError as e:
        return {
            "available": False,
            "reason": "GEMINI_API_KEY not configured or SDK missing. Rule-based results shown.",
            "detail": str(e),
        }
    except AIAnalysisError as e:
        if e.fallback_result:
            return {
                "available": True,
                "explanation": e.fallback_result.explanation,
                "red_flags": e.fallback_result.red_flags,
                "risk_factors": e.fallback_result.risk_factors,
                "confidence": 0.0,
                "partial": True,
            }
        return {"available": False, "reason": str(e)}


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
        "ai": {
            "available": row.ai_available,
            "explanation": row.ai_explanation or "",
        },
        "recommendations": _parse_json_list(row.recommendations),
        "ocr_mode": row.ocr_mode or "manual",
        "created_at": str(row.created_at)[:19] if row.created_at else "",
    }


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
            ai_output = validate_with_gemini(
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

    image_bytes = await file.read()
    if len(image_bytes) > MAX_IMAGE_BYTES:
        raise HTTPException(413, "File is too large. Maximum size is 5 MB.")
    if not image_bytes:
        raise HTTPException(400, "Please upload a screenshot.")

    # Persist the image so we can reference it later
    ext_map = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "image/jpg": ".jpg",
    }
    ext = ext_map.get(content_type, ".jpg")
    image_name = f"{uuid.uuid4().hex}{ext}"
    image_path = UPLOAD_DIR / image_name
    image_path.write_bytes(image_bytes)
    image_ref = f"/uploads/{image_name}"

    logger.info(f"Screenshot uploaded: {image_name}, size={len(image_bytes)} bytes, user={user.id}")

    # Step 1: OCR with quality validation
    logger.info(f"Getting OCR backend (OCR_BACKEND={os.getenv('OCR_BACKEND', 'auto')})")
    ocr_backend = get_ocr_backend()
    ocr_mode = ocr_backend.name
    logger.info(f"Using OCR backend: {ocr_mode}")

    try:
        logger.info(f"Starting OCR extraction for {image_name}")
        ocr_result = ocr_backend.extract_text(image_bytes, file.filename or "")
        logger.info(f"OCR extraction completed for {image_name}")
    except Exception as e:
        logger.error(f"OCR extraction failed with exception: {e}", exc_info=True)
        # Return error response
        return {
            "analysis": {
                "id": str(uuid.uuid4()),
                "input_type": "screenshot",
                "image_path": image_ref,
                "extracted_text": "",
                "probability": 0,
                "risk": "Low",
                "safe": True,
                "trust_score": 100,
                "reasons": [],
                "positives": ["OCR processing failed. Please try again."],
                "keywords": [],
                "signals": [],
                "ai": {
                    "available": False,
                    "explanation": "",
                },
                "recommendations": [
                    "Try uploading the screenshot again",
                    "Ensure the image is a valid JPG, PNG, or WEBP file",
                    "Check that the image is not corrupted",
                ],
                "status": "error",
                "error": f"OCR failed: {str(e)}",
                "ocr_mode": ocr_mode,
                "created_at": "",
            }
        }

    logger.info(
        f"OCR result: backend={ocr_mode}, success={ocr_result.success}, "
        f"chars={ocr_result.characters_extracted}, confidence={ocr_result.confidence:.1f}%, "
        f"quality_score={ocr_result.quality_score:.1f}"
    )

    if ocr_result.error:
        logger.warning(f"OCR error detail: {ocr_result.error}")

    # Step 2: Handle OCR failure with insufficient_text status
    if not ocr_result.success:
        ai_error = ocr_result.error or "OCR could not extract text from the image."

        # Check if it's specifically an insufficient text error
        is_insufficient = "Could not extract enough text" in ai_error or "quality too low" in ai_error

        if is_insufficient:
            # Return structured insufficient_text response
            response = {
                "analysis": {
                    "id": str(uuid.uuid4()),
                    "input_type": "screenshot",
                    "image_path": image_ref,
                    "extracted_text": ocr_result.text or "",
                    "probability": 0,
                    "risk": "Low",
                    "safe": True,
                    "trust_score": 100,
                    "reasons": [],
                    "positives": ["Please upload a clearer screenshot."],
                    "keywords": [],
                    "signals": [],
                    "ai": {
                        "available": False,
                        "explanation": "",
                    },
                    "recommendations": [
                        "Upload a clearer, higher-resolution screenshot",
                        "Ensure text is legible and well-lit",
                        "Try again with better image quality",
                    ],
                    "status": "insufficient_text",
                    "ocr_mode": ocr_mode,
                    "ocr_quality": ocr_result.quality_score,
                    "ocr_confidence": ocr_result.confidence,
                    "created_at": "",
                }
            }
            logger.warning(f"OCR insufficient text: {ai_error}")
            return response

    # Step 3: OCR succeeded with sufficient text
    extracted_text = ocr_result.text.strip()

    # Step 4: Run evidence-based analysis
    evidence_result = analyze_with_evidence(extracted_text)

    # Step 5: Validate with AI (if available and enabled)
    ai_output = None
    ai_error = None

    # Check if AI validation should be skipped for faster analysis
    skip_ai = os.getenv("SKIP_AI_VALIDATION", "false").lower() == "true"

    if not skip_ai:
        try:
            ai_output = validate_with_gemini(
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
        } for s in evidence_result.signals]),
        ai_explanation=hybrid_result.ai_validation.get("additional_context", ""),
        ai_available=hybrid_result.ai_available,
        recommendations=json.dumps(recs),
        ocr_mode=ocr_mode,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)

    # Step 9: Format response
    response_data = _analysis_to_dict(row)
    response_data["rule_score"] = hybrid_result.rule_score
    response_data["ai_score"] = hybrid_result.ai_score
    response_data["final_score"] = hybrid_result.final_score
    response_data["ai_validation"] = hybrid_result.ai_validation
    response_data["confidence"] = hybrid_result.confidence
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


# ── Analytics ────────────────────────────────────────────────────────────────

@app.get("/api/analytics")
async def analytics(
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    total_users = (await db.execute(
        select(func.count(User.id)).where(User.role == "user")
    )).scalar() or 0

    pending_reports = (await db.execute(
        select(func.count(ScamReport.id)).where(ScamReport.status == "Pending")
    )).scalar() or 0

    verified_companies = (await db.execute(
        select(func.count(Company.id)).where(Company.status == "Verified")
    )).scalar() or 0

    return {
        "cards": {
            "totalUsers": total_users,
            "jobsAnalyzed": 42318,
            "scamsDetected": 12847,
            "reportsPending": pending_reports,
            "verifiedCompanies": verified_companies,
        }
    }
