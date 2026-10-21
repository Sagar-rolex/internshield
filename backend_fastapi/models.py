"""
SQLAlchemy ORM models for the database.
"""
from datetime import datetime
from sqlalchemy import String, Text, CheckConstraint, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[str] = mapped_column(String, nullable=False, default="user")
    phone: Mapped[str | None] = mapped_column(String, default="")
    college: Mapped[str | None] = mapped_column(String, default="")
    course: Mapped[str | None] = mapped_column(String, default="")
    status: Mapped[str] = mapped_column(String, nullable=False, default="Active")
    created_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), nullable=False
    )

    __table_args__ = (
        CheckConstraint("role IN ('user', 'admin')", name="ck_user_role"),
    )


class ScamReport(Base):
    __tablename__ = "scam_reports"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    company: Mapped[str] = mapped_column(String, nullable=False)
    reporter: Mapped[str] = mapped_column(String, nullable=False)
    date: Mapped[datetime] = mapped_column(
        server_default=func.now(), nullable=False
    )
    status: Mapped[str] = mapped_column(String, nullable=False, default="Pending")
    risk_level: Mapped[str] = mapped_column(String, nullable=False, default="Medium")
    details: Mapped[str | None] = mapped_column(Text, default="")


class Company(Base):
    __tablename__ = "companies"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    domain: Mapped[str | None] = mapped_column(String, default="")
    status: Mapped[str] = mapped_column(String, nullable=False, default="Verified")
    reports: Mapped[int] = mapped_column(default=0, nullable=False)
    last_checked: Mapped[datetime] = mapped_column(
        server_default=func.now(), nullable=False
    )

    __table_args__ = (
        CheckConstraint(
            "status IN ('Verified', 'Blacklisted')", name="ck_company_status"
        ),
    )


class Analysis(Base):
    __tablename__ = "analyses"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(String, nullable=False)
    input_type: Mapped[str] = mapped_column(String, nullable=False, default="manual")
    job_title: Mapped[str | None] = mapped_column(String, default="")
    company: Mapped[str | None] = mapped_column(String, default="")
    website: Mapped[str | None] = mapped_column(String, default="")
    description: Mapped[str | None] = mapped_column(Text, default="")
    image_path: Mapped[str | None] = mapped_column(String, default="")
    extracted_text: Mapped[str | None] = mapped_column(Text, default="")
    probability: Mapped[int] = mapped_column(default=0, nullable=False)
    risk: Mapped[str] = mapped_column(String, nullable=False, default="Low")
    safe: Mapped[bool] = mapped_column(default=True, nullable=False)
    trust_score: Mapped[int] = mapped_column(default=100, nullable=False)
    reasons: Mapped[str | None] = mapped_column(Text, default="[]")
    positives: Mapped[str | None] = mapped_column(Text, default="[]")
    keywords: Mapped[str | None] = mapped_column(Text, default="[]")
    signals: Mapped[str | None] = mapped_column(Text, default="[]")
    ai_explanation: Mapped[str | None] = mapped_column(Text, default="")
    ai_available: Mapped[bool] = mapped_column(default=False, nullable=False)
    recommendations: Mapped[str | None] = mapped_column(Text, default="[]")
    ocr_mode: Mapped[str | None] = mapped_column(String, default="manual")
    created_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), nullable=False
    )
