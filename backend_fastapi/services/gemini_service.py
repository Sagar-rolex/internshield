"""
Gemini AI Service — Comprehensive Scam Detection and Validation Layer.

Performs robust contextual analysis on job postings, evaluating fraud indicators, scam mechanics, and missing details.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Optional

try:
    import google.generativeai as genai
    GENAI_AVAILABLE = True
except ImportError:
    GENAI_AVAILABLE = False


@dataclass(frozen=True)
class AIValidationOutput:
    """AI validation and contextual analysis output."""
    validation_score: float  # 0-1: how well findings are supported
    contextual_risk: int  # 0-100: AI's contextual risk assessment
    supported_findings: list[str]  # Confirmed red flags
    unsupported_findings: list[str]  # Questionable or dismissed flags
    additional_context: str  # Contextual insights
    missing_information: list[str]  # What's missing from posting
    recommendations: list[str]  # Actionable advice
    confidence: float = 0.85  # 0-1


class GeminiUnavailableError(RuntimeError):
    """Raised when Gemini client cannot be initialized."""
    pass


class GeminiAnalysisError(RuntimeError):
    """Raised when Gemini call fails."""
    def __init__(self, message: str, fallback_result: Optional[AIValidationOutput] = None):
        super().__init__(message)
        self.fallback_result = fallback_result


# ─── System Prompt ────────────────────────────────##########################

ANALYSIS_PROMPT = """
You are an expert cybersecurity and fraud detection analyst specializing in identifying fraudulent job postings, fake internships, advance-fee scams, and task-based scams targeting students and job seekers.

Your task is to analyze the provided job posting text and evaluate its legitimacy.

CRITICAL INSTRUCTIONS:
1. Examine the job posting for red flags:
   - Upfront fees (registration, training, security deposit, onboarding kit, exam fee)
   - Credential theft (OTP, UPI PIN, bank account numbers)
   - Unofficial communication (WhatsApp only, Telegram group links, Gmail/Yahoo for formal corporate roles)
   - Micro-task scams (YouTube likes, ad clicking, daily payouts, copy-paste work)
   - Unrealistic promises (100% job guarantee, ₹10,000/day for 1 hour of typing work)
   - Lack of verifiable company details or official domain

2. Balance your assessment:
   - Legitimate jobs have professional domains, clear interview processes, verifiable company registration, and never charge money.
   - Scams rely on urgency, payment demands, and secrecy.

3. OUTPUT FORMAT — Return ONLY valid JSON:
{
  "validation_score": 0.0-1.0,  // Confidence in rule findings alignment
  "contextual_risk": 0-100,      // Independent 0-100 scam risk score
  "supported_findings": ["finding 1", "finding 2"],  // Confirmed red flags or observations
  "unsupported_findings": [],  // Any questionable findings
  "additional_context": "2-3 sentence expert explanation of why this posting is risky or legitimate.",
  "missing_information": ["missing item 1", "missing item 2"],  // Key missing details
  "recommendations": ["action 1", "action 2", "action 3"],  // Practical advice
  "confidence": 0.0-1.0  // Confidence score
}
"""


def _build_client() -> any:
    """Initialize Gemini client."""
    if not GENAI_AVAILABLE:
        raise GeminiUnavailableError("google-generativeai not installed.")

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise GeminiUnavailableError("GEMINI_API_KEY not set.")

    genai.configure(api_key=api_key)
    return genai.GenerativeModel("gemini-1.5-flash")


def validate_with_gemini(
    text: str,
    rule_findings: list[str],
    extracted_data: dict,
) -> AIValidationOutput:
    """
    Use Gemini to analyze job posting and validate findings.
    """
    if not text or not text.strip():
        raise GeminiAnalysisError("Empty text provided for AI analysis.")

    try:
        model = _build_client()
    except Exception as e:
        raise GeminiUnavailableError(f"Could not initialize Gemini: {e}")

    context_msg = f"""
Job Posting Text:
{text[:10000]}

Rule Engine Findings:
{chr(10).join(f"- {finding}" for finding in rule_findings) if rule_findings else "No red flags detected"}

Extracted Data:
{json.dumps(extracted_data, indent=2)}

Perform a thorough scam risk assessment.
"""

    prompt = f"{ANALYSIS_PROMPT}\n\n{context_msg}"

    try:
        response = model.generate_content(
            prompt,
            generation_config={
                "response_mime_type": "application/json",
                "temperature": 0.2,
                "max_output_tokens": 1000,
            },
            request_options={
                "timeout": 15.0,
            },
        )
        raw = response.text.strip()
        data = json.loads(raw)

        return AIValidationOutput(
            validation_score=float(max(0.0, min(1.0, data.get("validation_score", 0.8)))),
            contextual_risk=int(max(0, min(100, data.get("contextual_risk", 50)))),
            supported_findings=[str(x).strip() for x in data.get("supported_findings", [])],
            unsupported_findings=[str(x).strip() for x in data.get("unsupported_findings", [])],
            additional_context=str(data.get("additional_context", "")).strip(),
            missing_information=[str(x).strip() for x in data.get("missing_information", [])],
            recommendations=[str(x).strip() for x in data.get("recommendations", [])],
            confidence=float(max(0.0, min(1.0, data.get("confidence", 0.85)))),
        )

    except json.JSONDecodeError as e:
        fallback = _create_fallback()
        raise GeminiAnalysisError(f"Gemini returned invalid JSON: {e}", fallback)
    except Exception as e:
        fallback = _create_fallback()
        raise GeminiAnalysisError(f"Gemini call failed: {e}", fallback)


def _create_fallback() -> AIValidationOutput:
    """Create safe fallback when Gemini fails."""
    return AIValidationOutput(
        validation_score=0.5,
        contextual_risk=50,
        supported_findings=[],
        unsupported_findings=[],
        additional_context="AI analysis unavailable. Rule-based analysis completed successfully.",
        missing_information=[],
        recommendations=[
            "Verify the company through its official website",
            "Do not pay any registration or application fee",
            "Do not share OTP, PIN, or banking credentials",
        ],
        confidence=0.0,
    )


def is_gemini_available() -> bool:
    """Check if Gemini is configured."""
    if not GENAI_AVAILABLE:
        return False
    if not os.getenv("GEMINI_API_KEY"):
        return False
    return True
