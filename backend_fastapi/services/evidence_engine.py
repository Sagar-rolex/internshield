"""
Evidence-Based Scam Detection Engine.

Extracts structured job data from text, identifies evidence-based scam signals,
and calculates a transparent risk score with explainable reasoning.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import NamedTuple, Optional


class Signal(NamedTuple):
    """A scam risk signal with weight, trigger status, and matched evidence."""
    name: str
    weight: int
    triggered: bool
    evidence: str = ""


@dataclass(frozen=True)
class EvidenceBasedResult:
    """Result from evidence-based scam detection."""
    probability: int  # 0-100
    risk: str  # "Low" | "Medium" | "High"
    safe: bool
    reasons: list[str]  # Red flags with evidence
    positives: list[str]  # Legitimate signals
    signals: list[Signal]  # Detailed signal breakdown
    extracted_data: dict = field(default_factory=dict)  # Structured job data
    confidence: float = 0.85


# ── Constants ────────────────────────────────────────────────────────────────

RISK_HIGH_THRESHOLD = 60
RISK_MEDIUM_THRESHOLD = 30
MAX_PROBABILITY = 100

FREE_EMAIL_DOMAINS = frozenset({
    "gmail.com", "yahoo.com", "outlook.com", "hotmail.com",
    "rediffmail.com", "aol.com", "mail.com", "protonmail.com", "zoho.com"
})

# Strong red flags (regex patterns detecting fraudulent indicators)
RED_FLAG_PATTERNS = {
    "registration_fee": re.compile(
        r"(?:registration|processing|application|onboarding|interview|exam|badge|kit|material|verification|security)\s+(?:fee|charge|deposit|amount|cost|payment)|"
        r"(?:pay|deposit|transfer|send)\s+(?:₹|\$|rs\.?|inr|usd)?\s*\d+\s*(?:to apply|for training|refundable|before interview|as security)|"
        r"pay\s+to\s+apply|investment\s+required",
        re.IGNORECASE
    ),
    "training_fee": re.compile(
        r"(?:training|course|learning|certification)\s+(?:fee|charge|cost|amount)|pay\s+for\s+training",
        re.IGNORECASE
    ),
    "security_deposit": re.compile(
        r"(?:security|refundable|laptop|equipment)\s+(?:deposit|amount|caution\s+money)|deposit\s+required",
        re.IGNORECASE
    ),
    "payment_method": re.compile(
        r"(?:western\s+union|money\s*gram|bitcoin|cryptocurrency|crypto|usdt|gift\s+card|apple\s+card|steam\s+card|wire\s+transfer|cashier(?:'s)?\s+check|check\s+deposit)",
        re.IGNORECASE
    ),
    "otp_request": re.compile(
        r"(?:share|send|enter|provide)\s+(?:your\s+)?(?:otp|upi\s*pin|password|bank\s+account\s+details|debit\s+card|credit\s+card|net\s*banking)|bank\s+login\s+details",
        re.IGNORECASE
    ),
    "task_scam": re.compile(
        r"(?:like\s+(?:and|&)\s+subscribe|youtube\s+video\s+(?:like|review)|daily\s+task\s+earning|ad\s+clicking|copy\s+paste\s+work|sms\s+sending\s+job|earn\s+(?:daily|per\s+day)\s*(?:₹|\$|rs\.?|inr)?\s*\d+|daily\s+payouts?|part[\s-]time\s+data\s+entry\s+earn\s+money)",
        re.IGNORECASE
    ),
    "unrealistic_guarantee": re.compile(
        r"(?:100%\s+guaranteed\s+(?:job|placement|selection)|guaranteed\s+job|guaranteed\s+offer|direct\s+selection|no\s+interview\s+(?:needed|required))",
        re.IGNORECASE
    ),
    "urgency_pressure": re.compile(
        r"(?:limited\s+seats|only\s+\d+\s+(?:positions|slots|seats)|hurry\s+up|immediate\s+(?:joining|start|action)|urgent\s+hiring\s+apply\s+immediately)",
        re.IGNORECASE
    ),
    "unofficial_messaging": re.compile(
        r"((?:contact|apply|dm|reach\s+out|message|chat)\s+(?:via|on|at|through)?\s*(?:whatsapp|telegram|signal|google\s+chat|viber)|whatsapp\s+only|telegram\s+only|wa\.me\/|t\.me\/)",
        re.IGNORECASE
    ),
}


# ── Structured Data Extraction ────────────────────────────────────────────

@dataclass
class JobPostingData:
    """Structured extraction from a job posting."""
    company_name: Optional[str] = None
    job_title: Optional[str] = None
    salary: Optional[str] = None
    location: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    application_method: Optional[str] = None
    fee_detected: Optional[str] = None
    otp_requested: bool = False
    task_scam_detected: bool = False


def _extract_job_data(text: str) -> JobPostingData:
    """Extract structured job data from posting text."""
    data = JobPostingData()

    # Extract email
    email_match = re.search(r"([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})", text)
    if email_match:
        data.email = email_match.group(1).lower()

    # Extract website
    website_match = re.search(r"(https?://[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}[^\s]*)", text)
    if website_match:
        data.website = website_match.group(1)

    # Extract salary
    salary_match = re.search(
        r"((?:₹|\$|Rs\.?|INR|USD)\s*[\d,]+(?:\.\d+)?\s*(?:LPA|lakh|crore|k|/month|per month|monthly|pm|/day|per day|daily)?)",
        text,
        re.IGNORECASE,
    )
    if salary_match:
        data.salary = salary_match.group(1).strip()

    # Detect fees
    for fee_key in ["registration_fee", "training_fee", "security_deposit"]:
        m = RED_FLAG_PATTERNS[fee_key].search(text)
        if m:
            data.fee_detected = m.group(0)
            break

    # Detect credential theft
    if RED_FLAG_PATTERNS["otp_request"].search(text):
        data.otp_requested = True

    # Detect task scams
    if RED_FLAG_PATTERNS["task_scam"].search(text):
        data.task_scam_detected = True

    # Application method
    if "whatsapp" in text.lower():
        data.application_method = "WhatsApp"
    elif "telegram" in text.lower():
        data.application_method = "Telegram"
    elif data.email:
        data.application_method = "Email"

    return data


# ── Evidence-Based Rule Engine ────────────────────────────────────────────

def analyze_with_evidence(text: str) -> EvidenceBasedResult:
    """
    Analyze job posting using evidence-based detection.
    Identifies high-risk indicators, structured signals, and positive markers.
    """
    if not text or not text.strip():
        return EvidenceBasedResult(
            probability=0,
            risk="Low",
            safe=True,
            reasons=[],
            positives=["Insufficient text to analyze"],
            signals=[],
            extracted_data={},
            confidence=0.0,
        )

    reasons: list[str] = []
    positives: list[str] = []
    signals: list[Signal] = []
    score = 0
    has_critical_red_flag = False

    # Extract structured data
    job_data = _extract_job_data(text)
    extracted_dict = {
        "email": job_data.email,
        "website": job_data.website,
        "salary": job_data.salary,
        "application_method": job_data.application_method,
    }

    # 1. Registration / Upfront Fees
    match_reg = RED_FLAG_PATTERNS["registration_fee"].search(text)
    if match_reg:
        evidence = match_reg.group(0)
        reasons.append(f"Demands upfront payment or fee: \"{evidence}\"")
        signals.append(Signal("Registration Fee", 35, True, evidence))
        score += 35
        has_critical_red_flag = True
    else:
        signals.append(Signal("Registration Fee", 35, False))

    # 2. Training / Security Deposit Fees
    match_train = RED_FLAG_PATTERNS["training_fee"].search(text)
    match_sec = RED_FLAG_PATTERNS["security_deposit"].search(text)
    if match_train:
        evidence = match_train.group(0)
        reasons.append(f"Training/course fee required: \"{evidence}\"")
        signals.append(Signal("Training Fee", 25, True, evidence))
        score += 25
        has_critical_red_flag = True
    elif match_sec:
        evidence = match_sec.group(0)
        reasons.append(f"Security deposit requested: \"{evidence}\"")
        signals.append(Signal("Security Deposit", 25, True, evidence))
        score += 25
        has_critical_red_flag = True
    else:
        signals.append(Signal("Training/Security Deposit", 25, False))

    # 3. OTP or Sensitive Credential Theft
    if job_data.otp_requested:
        match = RED_FLAG_PATTERNS["otp_request"].search(text)
        evidence = match.group(0) if match else "Banking details or OTP requested"
        reasons.append(f"Requests sensitive banking credentials or OTP: \"{evidence}\"")
        signals.append(Signal("Credential Request", 35, True, evidence))
        score += 35
        has_critical_red_flag = True
    else:
        signals.append(Signal("Credential Request", 35, False))

    # 4. Untraceable Payment Methods / Check Scams
    match_pay = RED_FLAG_PATTERNS["payment_method"].search(text)
    if match_pay:
        evidence = match_pay.group(0)
        reasons.append(f"Requires untraceable or suspicious payment methods: \"{evidence}\"")
        signals.append(Signal("Suspicious Payment Method", 25, True, evidence))
        score += 25
        has_critical_red_flag = True
    else:
        signals.append(Signal("Suspicious Payment Method", 25, False))

    # 5. Task Scams / Fake Daily Payouts
    if job_data.task_scam_detected:
        match = RED_FLAG_PATTERNS["task_scam"].search(text)
        evidence = match.group(0) if match else "Task-based / daily payout scheme"
        reasons.append(f"Indicates a task or daily payout scheme: \"{evidence}\"")
        signals.append(Signal("Task / Ponzi Scheme", 25, True, evidence))
        score += 25
        has_critical_red_flag = True
    else:
        signals.append(Signal("Task / Ponzi Scheme", 25, False))

    # 6. Unofficial Messaging Apps Only
    match_msg = RED_FLAG_PATTERNS["unofficial_messaging"].search(text)
    if match_msg:
        evidence = match_msg.group(0)
        reasons.append(f"Directs applicants solely to off-platform messaging apps: \"{evidence}\"")
        signals.append(Signal("Unofficial Messaging Channels", 20, True, evidence))
        score += 20
    else:
        signals.append(Signal("Unofficial Messaging Channels", 20, False))

    # 7. Unrealistic Guarantees & Pressure Tactics
    match_guar = RED_FLAG_PATTERNS["unrealistic_guarantee"].search(text)
    match_urg = RED_FLAG_PATTERNS["urgency_pressure"].search(text)
    if match_guar:
        evidence = match_guar.group(0)
        reasons.append(f"Unrealistic job guarantee: \"{evidence}\"")
        signals.append(Signal("Unrealistic Guarantee", 15, True, evidence))
        score += 15
    elif match_urg:
        evidence = match_urg.group(0)
        reasons.append(f"High-pressure urgency tactics: \"{evidence}\"")
        signals.append(Signal("High Pressure Urgency", 12, True, evidence))
        score += 12
    else:
        signals.append(Signal("Unrealistic Guarantee / Urgency", 15, False))

    # 8. Free Email Recruiter
    if job_data.email:
        email_domain = job_data.email.split("@")[1].lower() if "@" in job_data.email else ""
        if email_domain in FREE_EMAIL_DOMAINS:
            reasons.append(f"Uses free personal email domain (@{email_domain}) for official correspondence")
            signals.append(Signal("Free Email Domain", 15, True, job_data.email))
            score += 15
        else:
            positives.append(f"Professional corporate email domain (@{email_domain})")
            signals.append(Signal("Free Email Domain", 15, False))
    else:
        signals.append(Signal("Free Email Domain", 15, False))

    # 9. Website Verification
    if not job_data.website:
        reasons.append("No official corporate website or domain provided")
        signals.append(Signal("Missing Website", 10, True))
        score += 10
    else:
        if job_data.website.startswith("https://"):
            positives.append("Verifiable company website provided over HTTPS")
        signals.append(Signal("Missing Website", 10, False))

    # 10. Positive Signals & Safe Checks
    has_substantive_skills = bool(re.search(r"(?:requirements|responsibilities|qualifications|skills|eligibility|experience)", text, re.I))
    if has_substantive_skills and not has_critical_red_flag and score < 25:
        positives.append("Detailed job requirements and professional responsibilities outlined")

    if job_data.salary and not has_critical_red_flag:
        positives.append(f"Compensation explicitly stated: {job_data.salary}")

    # Elevate critical red flags to High risk threshold
    if has_critical_red_flag and score < RISK_HIGH_THRESHOLD:
        score = max(score, 65)

    probability = min(MAX_PROBABILITY, score)
    risk = (
        "High" if probability >= RISK_HIGH_THRESHOLD
        else "Medium" if probability >= RISK_MEDIUM_THRESHOLD
        else "Low"
    )
    safe = probability < RISK_MEDIUM_THRESHOLD

    return EvidenceBasedResult(
        probability=probability,
        risk=risk,
        safe=safe,
        reasons=reasons,
        positives=positives,
        signals=signals,
        extracted_data=extracted_dict,
        confidence=0.90 if has_critical_red_flag else 0.85,
    )
