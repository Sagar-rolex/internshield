"""Context-aware, evidence-based job and internship risk assessment."""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import NamedTuple, Optional


class Signal(NamedTuple):
    """A distinct signal and the evidence that supports it."""
    name: str
    weight: int
    triggered: bool
    evidence: str = ""
    id: str = ""
    category: str = ""
    severity: str = "low"
    confidence: float = 0.0
    contribution: int = 0


@dataclass(frozen=True)
class EvidenceBasedResult:
    probability: int
    risk: str
    safe: bool
    reasons: list[str]
    positives: list[str]
    signals: list[Signal]
    extracted_data: dict = field(default_factory=dict)
    confidence: float = 0.85
    uncertainties: list[str] = field(default_factory=list)


RISK_MEDIUM_THRESHOLD = 30
RISK_HIGH_THRESHOLD = 60
RISK_CRITICAL_THRESHOLD = 85
MAX_PROBABILITY = 100

FREE_EMAIL_DOMAINS = frozenset({
    "gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "rediffmail.com",
    "aol.com", "mail.com", "protonmail.com", "zoho.com",
})

# Match the action and context, rather than a bare mention of a fee.
PAYMENT_REQUEST = re.compile(
    r"\b(?:pay|send|transfer|deposit|remit|purchase|buy|submit)\b"
    r".{0,55}\b(?:registration|application|processing|onboarding|interview|exam|"
    r"training|course|verification|document|security|refundable|equipment|laptop|"
    r"kit|fee|fees|charge|deposit|cost|payment)\b"
    r"|\b(?:registration|application|processing|onboarding|interview|exam|training|"
    r"course|verification|document|security|refundable|equipment|laptop|kit)\s+"
    r"(?:fee|fees|charge|deposit|cost|payment)\b.{0,65}\b(?:required|must|payable|"
    r"pay|before|to apply|to join|to secure|to receive|offer letter|joining)\b"
    r"|\b(?:fee|deposit|charge|payment)\b.{0,45}\b(?:required|must be paid|"
    r"before (?:joining|interview|selection)|to (?:apply|join|secure|receive))\b"
    r"|\bpay\b.{0,30}\b(?:to receive|for)\b.{0,25}\b(?:offer(?:\s+letter)?|job|position|employment)\b",
    re.IGNORECASE | re.DOTALL,
)
SENSITIVE_REQUEST = re.compile(
    r"\b(?:share|send|provide|enter|tell|submit|verify with|give)\b.{0,35}\b"
    r"(?:your\s+)?(?:otp|one[- ]time\s+password|upi\s*pin|bank(?:ing)?\s+pin|"
    r"password|passcode|card\s+cvv|cvv|internet\s+banking\s+(?:login|credentials)|"
    r"bank\s+login\s+(?:details|credentials)|net\s*banking\s+credentials)\b"
    r"|\b(?:otp|upi\s*pin|bank(?:ing)?\s+pin|card\s+cvv|internet\s+banking\s+"
    r"(?:password|credentials))\b.{0,35}\b(?:required|send|share|provide|enter)\b",
    re.IGNORECASE | re.DOTALL,
)
SENSITIVE_ID_REQUEST = re.compile(
    r"\b(?:share|send|provide|upload|submit|enter)\b.{0,35}\b(?:your\s+)?"
    r"(?:aadhaar|aadhar|pan\s+(?:card|number)|passport\s+(?:number|copy)|"
    r"social\s+security\s+(?:number|ssn)|ssn|national\s+id(?:entity)?\s+(?:number|card)|"
    r"tax\s+identification\s+number)\b",
    re.IGNORECASE | re.DOTALL,
)
PAYMENT_CHANNEL = re.compile(
    r"\b(?:western\s+union|money\s*gram|bitcoin|cryptocurrency|crypto|usdt|"
    r"gift\s+cards?|apple\s+cards?|steam\s+cards?|wire\s+transfer|cashier['’]?s\s+check)\b",
    re.IGNORECASE,
)
JOB_CONTEXT = re.compile(
    r"\b(?:job|employment|intern(?:ship)?|position|offer|applicant|candidate|recruit(?:ment|er)?|"
    r"hiring|joining|onboarding|selection|apply|work)\b", re.IGNORECASE,
)
TASK_SCAM = re.compile(
    r"\b(?:like\s+(?:and|&)\s+subscribe|youtube\s+(?:video\s+)?(?:like|review)|"
    r"daily\s+task\s+earning|ad\s+clicking|copy[- ]paste\s+work|sms\s+sending\s+job|"
    r"part[- ]time\s+data\s+entry)\b.{0,100}\b(?:earn|earning|income|payout|salary|\$|₹|rs\.?)\b"
    r"|\b(?:earn|earning)\s+(?:₹|\$|rs\.?\s*)?[\d,.]+\s*(?:per day|daily)\b.{0,70}"
    r"\b(?:like|subscribe|click|copy paste|data entry|no experience)\b",
    re.IGNORECASE | re.DOTALL,
)
GUARANTEE = re.compile(
    r"\b(?:100\s*%\s*)?(?:guarantee(?:s|d)?\s+(?:job|placement|selection|offer|offer letter|"
    r"internship certificate|earnings|income)|(?:job|placement|selection|offer letter)\s+"
    r"guaranteed|direct\s+selection|no\s+interview\s+(?:needed|required)|"
    r"selected\s+without\s+(?:(?:an?\s+)?|any\s+)interviews?)\b", re.IGNORECASE,
)
URGENCY = re.compile(
    r"\b(?:limited\s+(?:seats|slots|vacancies)|only\s+(?:\d+|a few)\s+(?:positions|slots|seats|"
    r"vacancies)\s+(?:left|remaining)|hurry\s+up|apply\s+immediately|offer\s+expires?\s+"
    r"(?:in|within)\s+\d+\s+hours?|last\s+chance|pay\s+immediately|immediate\s+"
    r"payment|required\s+immediately)\b", re.IGNORECASE,
)
OFFICIAL_CHANNEL = re.compile(
    r"\b(?:whatsapp\s+only|telegram\s+only|contact\s+(?:me\s+)?only\s+(?:on|via)\s+"
    r"(?:whatsapp|telegram)|apply\s+only\s+(?:on|via)\s+(?:whatsapp|telegram)|"
    r"wa\.me/|t\.me/)\b", re.IGNORECASE,
)
UNREALISTIC_PAY = re.compile(
    r"(?:\b(?:earn|salary|income|pay)\s+(?:up\s+to\s+)?(?:₹|\$|rs\.?\s*|inr\s*)?"
    r"(?:[\d,]+\s*(?:k|\s*thousand)|[\d,]{5,})\s*(?:per\s+day|daily|/day)\b.{0,100}"
    r"\b(?:one\s+hour|\d+\s+hours?|part[- ]time|simple|typing|copy[- ]paste|no\s+experience)\b"
    r"|\b(?:one\s+hour|\d+\s+hours?)\b.{0,70}\b(?:earn|salary|income)\b.{0,35}"
    r"(?:₹|\$|rs\.?\s*)?[\d,]{5,}\s*(?:per\s+day|daily)\b)",
    re.IGNORECASE | re.DOTALL,
)

NEGATED_PAYMENT = re.compile(
    r"\b(?:no|without|never|not|don't|do\s+not|doesn't|does\s+not|isn't|is\s+not|"
    r"aren't|are\s+not)\b.{0,45}\b(?:fee|fees|deposit|charge|payment|money|cost)\b"
    r"|\b(?:fee|fees|deposit|charge|payment)\b.{0,30}\b(?:not\s+required|is\s+not\s+required|"
    r"isn't\s+required|never\s+charged|not\s+charged)\b", re.IGNORECASE | re.DOTALL,
)
NEGATED_CREDENTIAL = re.compile(
    r"\b(?:never|don't|do\s+not|doesn't|does\s+not|never\s+share|never\s+send|"
    r"shouldn't|should\s+not)\b.{0,45}\b(?:share|send|provide|give|reveal|disclose)?\s*"
    r"(?:your\s+)?(?:otp|one[- ]time\s+password|upi\s*pin|bank(?:ing)?\s+pin|"
    r"password|passcode|cvv|banking credentials)\b", re.IGNORECASE | re.DOTALL,
)
NEGATED_IDENTITY = re.compile(
    r"\b(?:never|don't|do\s+not|shouldn't|should\s+not)\b.{0,45}\b"
    r"(?:share|send|provide|upload|submit|enter)\b.{0,35}\b(?:aadhaar|aadhar|pan|passport|"
    r"social\s+security|ssn|national\s+id|tax\s+identification)\b", re.IGNORECASE | re.DOTALL,
)

def _normalize(text: str) -> str:
    """Normalize Unicode and OCR spacing without discarding money/punctuation cues."""
    value = text.replace("\u00a0", " ").replace("\u2019", "'").replace("\u2013", "-")
    value = re.sub(r"\b(?:[A-Z]\s+){1,}[A-Z]\b", lambda m: re.sub(r"\s+", "", m.group()), value)
    value = re.sub(r"[ \t\r\f\v]+", " ", value)
    return value.strip()


def _contextual_match(pattern: re.Pattern, text: str, kind: str):
    """Return first supported span, ignoring explicit applicant-protection negations."""
    for match in pattern.finditer(text):
        clause_start = max(text.rfind(mark, 0, match.start()) for mark in (".", "!", "?", "\n", ";")) + 1
        clause_ends = [text.find(mark, match.end()) for mark in (".", "!", "?", "\n", ";")]
        clause_ends = [end for end in clause_ends if end >= 0]
        clause_end = min(clause_ends) if clause_ends else len(text)
        before = text[max(clause_start, match.start() - 90):match.start()]
        after = text[match.end():min(clause_end, match.end() + 55)]
        context = before + match.group(0) + after
        if kind == "payment" and NEGATED_PAYMENT.search(context):
            continue
        if kind == "payment" and re.search(r"training|course|learning|certification", match.group(0), re.I) and not JOB_CONTEXT.search(text):
            continue
        if kind == "credential" and NEGATED_CREDENTIAL.search(context):
            continue
        if kind == "identity" and NEGATED_IDENTITY.search(context):
            continue
        return match
    return None


@dataclass
class JobPostingData:
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
    data = JobPostingData()
    email = re.search(r"([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})", text)
    website = re.search(r"(?<![@\w.-])((?:https?://)?(?:www\.)?[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:/[^\s]*)?)", text)
    salary = re.search(
        r"((?:₹|\$|Rs\.?|INR|USD)?\s*[\d,]+(?:\.\d+)?\s*(?:k|LPA|lakhs?|crore|/month|per month|monthly|pm|/day|per day|daily))",
        text, re.IGNORECASE,
    )
    data.email = email.group(1).lower() if email else None
    data.website = website.group(1) if website else None
    data.salary = salary.group(1).strip() if salary else None
    data.application_method = "WhatsApp" if re.search(r"whatsapp|wa\.me", text, re.I) else (
        "Telegram" if re.search(r"telegram|t\.me", text, re.I) else "Email" if email else None
    )
    payment = _contextual_match(PAYMENT_REQUEST, text, "payment")
    data.fee_detected = payment.group(0).strip() if payment else None
    data.otp_requested = bool(_contextual_match(SENSITIVE_REQUEST, text, "credential"))
    data.task_scam_detected = bool(TASK_SCAM.search(text))
    return data


def analyze_with_evidence(text: str) -> EvidenceBasedResult:
    """Return one evidence-grounded score for manual text and OCR-extracted text."""
    if not text or not text.strip():
        return EvidenceBasedResult(0, "Low", True, [], ["Insufficient text to analyze"], [], confidence=0.0,
                                   uncertainties=["No readable job advertisement text was provided."])

    text = _normalize(text)
    job = _extract_job_data(text)
    reasons: list[str] = []
    positives: list[str] = []
    uncertainties: list[str] = []
    signals: list[Signal] = []
    score = 0
    critical_floor = 0

    rules = [
        ("upfront_payment", "Upfront payment request", "payment", PAYMENT_REQUEST, 55, "critical", 0.96, 80),
        ("sensitive_credentials", "Sensitive credential request", "credential", SENSITIVE_REQUEST, 65, "critical", 0.99, 90),
        ("sensitive_identity_request", "Sensitive identity data requested", "identity", SENSITIVE_ID_REQUEST, 18, "low", 0.75, 0),
        ("suspicious_payment_channel", "Suspicious payment channel", "payment_channel", PAYMENT_CHANNEL, 30, "high", 0.88, 0),
        ("task_scheme", "Suspicious task-based earnings", "task", TASK_SCAM, 35, "high", 0.84, 0),
        ("unrealistic_compensation", "Unrealistic pay for simple work", "pay", UNREALISTIC_PAY, 35, "high", 0.87, 0),
        ("guaranteed_selection", "Guaranteed selection or offer", "guarantee", GUARANTEE, 40, "high", 0.91, 60),
        ("pressure_tactics", "Application pressure tactic", "urgency", URGENCY, 15, "medium", 0.82, 0),
        ("unofficial_only_channel", "Recruitment restricted to unofficial channel", "channel", OFFICIAL_CHANNEL, 16, "medium", 0.82, 0),
    ]
    for signal_id, name, category, pattern, weight, severity, confidence, floor in rules:
        match = _contextual_match(pattern, text, category) if category in ("payment", "credential", "identity") else pattern.search(text)
        if match:
            evidence = re.sub(r"\s+", " ", match.group(0)).strip()[:240]
            contribution = round(weight * confidence)
            score += contribution
            critical_floor = max(critical_floor, floor)
            reasons.append(f'{name}: "{evidence}"')
            signals.append(Signal(name, weight, True, evidence, signal_id, category, severity, confidence, contribution))
        else:
            signals.append(Signal(name, weight, False, "", signal_id, category, severity, 0.0, 0))

    email_domain = job.email.split("@", 1)[1] if job.email else ""
    if email_domain and email_domain in FREE_EMAIL_DOMAINS:
        uncertainties.append(f"Recruiter email uses a free email provider (@{email_domain}); verify the recruiter independently.")
        signals.append(Signal("Free email provider", 8, True, job.email, "personal_email_domain", "verification", "low", 0.55, 0))
    else:
        signals.append(Signal("Free email provider", 8, False, "", "personal_email_domain", "verification", "low", 0.0, 0))

    if not job.website:
        uncertainties.append("No official website was included, so employer identity could not be checked from this text.")
        signals.append(Signal("Website not provided", 0, False, "", "website_unverified", "verification", "information", 0.0, 0))
    else:
        positives.append("A website or domain was included; this text alone does not verify its ownership or authenticity.")
        signals.append(Signal("Website included", 0, False, "", "website_present", "verification", "information", 0.0, 0))

    skills = re.search(r"\b(?:requirements|responsibilities|qualifications|skills|eligibility|experience)\b", text, re.I)
    if skills:
        positives.append("The advertisement includes job requirements or responsibilities.")
    if job.salary:
        positives.append(f"Compensation is stated as {job.salary}.")

    probability = min(MAX_PROBABILITY, max(critical_floor, score))
    risk = ("Critical" if probability >= RISK_CRITICAL_THRESHOLD else
            "High" if probability >= RISK_HIGH_THRESHOLD else
            "Medium" if probability >= RISK_MEDIUM_THRESHOLD else "Low")
    # Independent behavior categories reinforce one another, without counting duplicate phrases.
    triggered_categories = {s.category for s in signals if s.triggered and s.severity in {"medium", "high", "critical"}}
    if len(triggered_categories) >= 2 and probability < 100:
        reinforcement = 5 + min(7, (len(triggered_categories) - 2) * 4)
        probability = min(100, probability + reinforcement)
        risk = ("Critical" if probability >= RISK_CRITICAL_THRESHOLD else
                "High" if probability >= RISK_HIGH_THRESHOLD else
                "Medium" if probability >= RISK_MEDIUM_THRESHOLD else "Low")
    confidence = 0.96 if critical_floor else (0.88 if triggered_categories else 0.65)
    return EvidenceBasedResult(
        probability=probability, risk=risk, safe=probability < RISK_MEDIUM_THRESHOLD,
        reasons=reasons, positives=positives, signals=signals,
        extracted_data={"email": job.email, "website": job.website, "salary": job.salary,
                        "application_method": job.application_method},
        confidence=confidence, uncertainties=uncertainties,
    )
