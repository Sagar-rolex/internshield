"""
Pydantic schemas for request validation + response shapes.
Matches the exact JSON the frontend expects.
"""
from typing import Literal
from pydantic import BaseModel, ConfigDict, EmailStr, Field


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
    role: str | None = None


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


class CompanyVerificationInput(BaseModel):
    query: str = Field(..., min_length=1, max_length=200)


class UpdateCompanyInput(BaseModel):
    name: str | None = None
    domain: str | None = None
    status: str | None = None
    reports: int | None = None


# ── Analysis ─────────────────────────────────────────────────────────────────
class AnalyzeManualInput(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    company: str = Field(..., min_length=1, max_length=150)
    website: str = Field(default="", max_length=300)
    description: str = Field(default="", max_length=10000)
    email: str = Field(default="", max_length=254)
    salary: str = Field(default="", max_length=100)
    workType: str = Field(default="Remote", max_length=40)


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
    uncertainties: list[str] = Field(default_factory=list)
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


class ChatTurn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1, max_length=1600)


class ChatInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    message: str = Field(..., min_length=1, max_length=1500)
    history: list[ChatTurn] = Field(default_factory=list, max_length=8)


class CompanyOut(BaseModel):
    id: str
    name: str
    domain: str = ""
    status: str
    reports: int
    last_checked: str
