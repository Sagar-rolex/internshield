"""
Pydantic schemas for request validation + response shapes.
Matches the exact JSON the frontend expects.
"""
from pydantic import BaseModel, EmailStr, Field


# ── Auth ──────────────────────────────────────────────────────────────────────
class RegisterInput(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=8)


class LoginInput(BaseModel):
    email: EmailStr
    password: str


class PublicUser(BaseModel):
    id: str
    role: str
    name: str
    email: str
    phone: str = ""
    college: str = ""
    course: str = ""
    status: str = "Active"
    photo: str = ""


class AuthResponse(BaseModel):
    user: PublicUser
    token: str


# ── Users (admin) ─────────────────────────────────────────────────────────────
class UpdateUserInput(BaseModel):
    name: str | None = None
    status: str | None = None


# ── Reports ───────────────────────────────────────────────────────────────────
class CreateReportInput(BaseModel):
    company: str
    reporter: str = "Anonymous"
    riskLevel: str = "Medium"
    details: str = ""


class UpdateReportInput(BaseModel):
    status: str | None = None
    riskLevel: str | None = None


class ReportOut(BaseModel):
    id: str
    company: str
    reporter: str
    date: str
    status: str
    risk_level: str
    details: str = ""


# ── Companies ─────────────────────────────────────────────────────────────────
class CreateCompanyInput(BaseModel):
    name: str
    domain: str = ""
    status: str = "Verified"


class UpdateCompanyInput(BaseModel):
    name: str | None = None
    domain: str | None = None
    status: str | None = None
    reports: int | None = None


# ── Analysis ─────────────────────────────────────────────────────────────────
class AnalyzeManualInput(BaseModel):
    title: str
    company: str
    website: str = ""
    description: str = ""
    email: str = ""
    salary: str = ""
    workType: str = "Remote"


class AnalysisOut(BaseModel):
    id: str
    input_type: str
    job_title: str
    company: str
    website: str
    description: str
    image_path: str
    extracted_text: str
    probability: int
    risk: str
    safe: bool
    trust_score: int
    reasons: list[str]
    positives: list[str]
    keywords: list[str]
    signals: list[dict]
    ai: dict
    recommendations: list[str]
    ocr_mode: str
    created_at: str
    # New hybrid engine fields
    rule_score: int | None = None
    ai_score: int | None = None
    final_score: int | None = None
    ai_findings: dict | None = None
    ai_error: str | None = None


class CompanyOut(BaseModel):
    id: str
    name: str
    domain: str = ""
    status: str
    reports: int
    last_checked: str
