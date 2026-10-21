"""
Seed the database with demo users, reports, and companies.
Run once: python -m backend_fastapi.seed
"""
import asyncio
import uuid
from datetime import datetime
from sqlalchemy import select, func
from .database import AsyncSessionLocal
from .models import User, ScamReport, Company
from .auth import hash_password


def _dt(s: str) -> datetime:
    return datetime.strptime(s, "%Y-%m-%d")


def _uuid() -> str:
    return str(uuid.uuid4())


USERS = [
    {"id": "admin-1", "name": "InternShield Admin", "email": "admin@internshield.com", "pw": "admin123", "role": "admin"},
    {"id": "user-1", "name": "Aarav Sharma", "email": "student@internshield.com", "pw": "student123", "role": "user"},
    {"id": "user-2", "name": "Priya Iyer", "email": "priya@college.edu", "pw": "student123", "role": "user"},
    {"id": "user-3", "name": "Rahul Verma", "email": "rahul@college.edu", "pw": "student123", "role": "user"},
]

REPORTS = [
    {"id": "report-1", "company": "FastCash Hiring", "reporter": "Nisha Rao", "date": _dt("2026-07-12"), "status": "Pending", "risk_level": "High", "details": "Asked for registration fee."},
    {"id": "report-2", "company": "BrightCareer Hub", "reporter": "Rahul Mehta", "date": _dt("2026-07-11"), "status": "Review", "risk_level": "Medium", "details": "No official website."},
    {"id": "report-3", "company": "WorkFromHome India Ltd", "reporter": "Sara Khan", "date": _dt("2026-07-10"), "status": "Approved", "risk_level": "High", "details": "WhatsApp-only hiring."},
]

COMPANIES = [
    {"id": "company-1", "name": "TechNova Labs", "domain": "technova.example", "status": "Verified", "reports": 0},
    {"id": "company-2", "name": "CampusEdge AI", "domain": "campusedge.example", "status": "Verified", "reports": 1},
    {"id": "company-3", "name": "FastCash Hiring", "domain": "gmail recruiter", "status": "Blacklisted", "reports": 142},
    {"id": "company-4", "name": "WorkFromHome India Ltd", "domain": "unknown", "status": "Blacklisted", "reports": 88},
]


async def seed():
    async with AsyncSessionLocal() as db:
        count = (await db.execute(select(func.count(User.id)))).scalar()
        if count and count > 0:
            print("Database already seeded — skipping.")
            return

        for u in USERS:
            db.add(
                User(
                    id=u["id"],
                    name=u["name"],
                    email=u["email"],
                    password_hash=hash_password(u["pw"]),
                    role=u["role"],
                    status="Active",
                )
            )
        for r in REPORTS:
            db.add(ScamReport(**r))
        for c in COMPANIES:
            db.add(Company(**c))

        await db.commit()
        print(f"Seeded {len(USERS)} users, {len(REPORTS)} reports, {len(COMPANIES)} companies.")


if __name__ == "__main__":
    asyncio.run(seed())
