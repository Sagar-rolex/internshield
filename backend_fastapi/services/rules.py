"""
Rule-based scam detection engine (server-side port of the TypeScript engine).

This is the authoritative implementation — the frontend also uses a TypeScript
port for instant client-side feedback, but the backend is the source of truth.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import NamedTuple


class Signal(NamedTuple):
    name: str
    weight: int
    triggered: bool


@dataclass(frozen=True)
class RuleResult:
    probability: int           # 0–98
    risk: str                  # "Low" | "Medium" | "High"
    safe: bool
    reasons: list[str]
    positives: list[str]
    signals: list[Signal]


# ── Constants ────────────────────────────────────────────────────────────────

RISK_HIGH_THRESHOLD = 60
RISK_MEDIUM_THRESHOLD = 30
MAX_PROBABILITY = 98
VAGUE_DESCRIPTION_CUTOFF = 80
MIN_COMPANY_NAME_LENGTH = 2
MIN_WEBSITE_LENGTH = 5

FREE_EMAIL_DOMAINS = frozenset({
    "gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "rediffmail.com"
})

SUSPICIOUS_KEYWORDS = frozenset({
    "registration fee",
    "pay to apply",
    "training fee",
    "security deposit",
    "earn $",
    "work from home easy",
    "no experience needed",
    "urgent hiring",
    "western union",
    "telegram",
    "whatsapp only",
    "100% guaranteed",
    "limited slots",
    "make money fast",
    "investment required",
    "processing fee",
})


# ── Helpers ──────────────────────────────────────────────────────────────────

def _email_matches_company(email_domain: str, company: str) -> bool:
    if not email_domain or not company:
        return False
    domain_root = re.sub(r"\.[^.]+$", "", email_domain)
    company_prefix = company.lower().replace(" ", "").replace("\t", "")[:8]
    if len(company_prefix) < 4:
        return False
    return domain_root in company_prefix or company_prefix in domain_root


def _is_unrealistic_salary(raw: str) -> bool:
    """Currency-aware check matching the frontend logic."""
    salary_num = 0.0
    try:
        salary_num = float(re.sub(r"[^0-9.]", "", raw))
    except ValueError:
        return False
    if salary_num <= 0:
        return False

    has_lakh_or_lpa = re.search(r"lakh|lpa", raw, re.I) is not None
    has_rupee = "₹" in raw
    has_month = re.search(r"month", raw, re.I) is not None

    if has_lakh_or_lpa:
        return salary_num > 50
    if has_rupee and has_month:
        return salary_num > 200000
    if has_month:
        return salary_num > 20000
    return salary_num > 500000


def _clean_text(s: str) -> str:
    return (s or "").strip().lower()


# ── Public API ───────────────────────────────────────────────────────────────

def analyze_manual(
    title: str,
    company: str,
    email: str = "",
    salary: str = "",
    description: str = "",
    website: str = "",
    work_type: str = "Remote",
) -> RuleResult:
    """Score a manually-entered job posting."""
    title = _clean_text(title)
    company = _clean_text(company)
    email = _clean_text(email)
    salary = _clean_text(salary)
    description = _clean_text(description)
    website = _clean_text(website)

    text = f"{title} {description}"
    reasons: list[str] = []
    positives: list[str] = []

    # 1 — Suspicious keywords
    matched_keywords = [k for k in SUSPICIOUS_KEYWORDS if k in text]
    if matched_keywords:
        preview = ", ".join(matched_keywords[:3])
        suffix = f" and {len(matched_keywords) - 3} more" if len(matched_keywords) > 3 else ""
        reasons.append(f"Contains {len(matched_keywords)} scam keyword(s): \"{preview}{suffix}\"")

    # 2 — Free email domain
    email_domain = email.split("@")[1] if "@" in email else ""
    free_email = email_domain in FREE_EMAIL_DOMAINS
    email_matches = _email_matches_company(email_domain, company)
    if free_email:
        reasons.append(f"Recruiter uses free email ({email_domain}) instead of a company domain")
    elif email_matches:
        positives.append("Email domain matches company name")

    # 3 — Unrealistic salary
    if _is_unrealistic_salary(salary):
        reasons.append(f"Salary \"{salary}\" appears unrealistically high for the role")

    # 4 — Website
    no_website = not website or len(website) < MIN_WEBSITE_LENGTH
    http_only = bool(website) and website.startswith("http://")
    if no_website:
        reasons.append("No company website provided")
    elif http_only:
        reasons.append("Website uses insecure HTTP instead of HTTPS")
    else:
        positives.append("Company website provided with HTTPS")

    # 5 — Vague description
    vague_desc = len(description) < VAGUE_DESCRIPTION_CUTOFF
    if vague_desc:
        reasons.append("Job description is too short or vague")
    else:
        positives.append("Detailed job description provided")

    # 6 — Missing company info
    no_company = len(company) < MIN_COMPANY_NAME_LENGTH
    if no_company:
        reasons.append("Missing or incomplete company name")

    signals = [
        Signal("Suspicious Keywords", 25, bool(matched_keywords)),
        Signal("Free Email Domain", 18, free_email),
        Signal("Unrealistic Salary", 22, _is_unrealistic_salary(salary)),
        Signal("Missing/Insecure Website", 15, no_website or http_only),
        Signal("Vague Description", 12, vague_desc),
        Signal("Missing Company Info", 8, no_company),
    ]

    probability = min(
        MAX_PROBABILITY,
        sum(s.weight for s in signals if s.triggered),
    )

    risk = (
        "High" if probability >= RISK_HIGH_THRESHOLD
        else "Medium" if probability >= RISK_MEDIUM_THRESHOLD
        else "Low"
    )

    safe = probability < RISK_MEDIUM_THRESHOLD

    return RuleResult(
        probability=probability,
        risk=risk,
        safe=safe,
        reasons=reasons,
        positives=positives,
        signals=signals,
    )


def analyze_from_text(extracted_text: str, source: str = "screenshot") -> RuleResult:
    """
    Run the same rule engine on OCR-extracted text.

    Since OCR text may not cleanly map to fields, we run keyword/email/salary
    extraction on the full text blob.
    """
    text = _clean_text(extracted_text)
    reasons: list[str] = []
    positives: list[str] = []

    # 1 — Suspicious keywords in the full text
    matched_keywords = [k for k in SUSPICIOUS_KEYWORDS if k in text]
    if matched_keywords:
        preview = ", ".join(matched_keywords[:3])
        suffix = f" and {len(matched_keywords) - 3} more" if len(matched_keywords) > 3 else ""
        reasons.append(f"Contains {len(matched_keywords)} scam keyword(s): \"{preview}{suffix}\"")

    # 2 — Free email domain found anywhere in text
    email_re = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")
    emails_found = email_re.findall(text)
    free_email = False
    email_matches = False
    for em in emails_found:
        dom = em.split("@")[1].lower()
        if dom in FREE_EMAIL_DOMAINS:
            free_email = True
            reasons.append(f"Recruiter uses free email ({dom}) instead of a company domain")
            break
        # Could match against a company name extracted from text, but we don't
        # reliably have one here.
    if not free_email and emails_found:
        # We can't match without a company, skip
        pass

    # 3 — Unrealistic salary mentions in text
    # Search for ₹ X LPA or ₹ X /month patterns
    salary_re = re.compile(r"₹?\s*([0-9,]+\.?[0-9]*)\s*(?:LPA|lakh|/month|per month|monthly)", re.I)
    salary_matches = salary_re.findall(text)
    unrealistic_salary = False
    for sm in salary_matches:
        try:
            val = float(sm.replace(",", ""))
            # If we see a large monthly figure or LPA > 50, flag it
            if "lakh" in text.lower() or "lpa" in text.lower():
                if val > 50:
                    unrealistic_salary = True
                    break
            elif "month" in text.lower():
                if val > 200000:
                    unrealistic_salary = True
                    break
        except ValueError:
            continue
    if unrealistic_salary:
        reasons.append("Salary mentioned in posting appears unrealistically high")

    # 4 — Website
    website_re = re.compile(r"https?://[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")
    urls = website_re.findall(text)
    has_https = any(u.startswith("https://") for u in urls)
    has_http = any(u.startswith("http://") for u in urls)
    if not urls:
        reasons.append("No company website mentioned in posting")
    elif has_http and not has_https:
        reasons.append("Website uses insecure HTTP instead of HTTPS")
    elif has_https:
        positives.append("Company website mentioned with HTTPS")

    # 5 — Vague description (whole text length)
    vague_desc = len(text) < VAGUE_DESCRIPTION_CUTOFF
    if vague_desc:
        reasons.append("Extracted text is too short or vague")
    else:
        positives.append("Sufficient text extracted from screenshot")

    # 6 — Missing company info
    # Hard to determine from raw text; skip this signal for screenshots

    signals = [
        Signal("Suspicious Keywords", 25, bool(matched_keywords)),
        Signal("Free Email Domain", 18, free_email),
        Signal("Unrealistic Salary", 22, unrealistic_salary),
        Signal("Missing/Insecure Website", 15, not urls or (has_http and not has_https)),
        Signal("Vague Description", 12, vague_desc),
        # Company info signal omitted for screenshot flow
    ]

    probability = min(
        MAX_PROBABILITY,
        sum(s.weight for s in signals if s.triggered),
    )

    risk = (
        "High" if probability >= RISK_HIGH_THRESHOLD
        else "Medium" if probability >= RISK_MEDIUM_THRESHOLD
        else "Low"
    )

    safe = probability < RISK_MEDIUM_THRESHOLD

    return RuleResult(
        probability=probability,
        risk=risk,
        safe=safe,
        reasons=reasons,
        positives=positives,
        signals=signals,
    )