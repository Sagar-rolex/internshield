"""
Gemini AI analysis service with graceful fallback.

This module never exposes the API key to the frontend. The flow is:

  1. Frontend sends extracted text (or manual input) to the backend.
  2. Backend calls `analyze_with_gemini(text)` here.
  3. If Gemini fails / unavailable, we return a structured error that the
     route handler turns into a fallback response:
     "AI analysis unavailable — showing rule-based results."

Gemini response is expected to be structured JSON matching `AIAnalysisOutput`.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any

try:
    import google.generativeai as genai
    GENAI_AVAILABLE = True
except ImportError:  # pragma: no cover
    GENAI_AVAILABLE = False


@dataclass
class AIAnalysisOutput:
    """Structured result from the AI model."""

    explanation: str
    red_flags: list[str]
    risk_factors: list[str]
    safety_recommendations: list[str]
    confidence: float  # 0–1


class GeminiUnavailableError(RuntimeError):
    """Raised when the Gemini client cannot be initialised."""


class AIAnalysisError(RuntimeError):
    """Raised when the model call fails but we want to handle it gracefully."""

    def __init__(self, message: str, fallback_result: AIAnalysisOutput | None = None):
        super().__init__(message)
        self.fallback_result = fallback_result


_SYSTEM_PROMPT = """
You are an expert scam analyst for job and internship postings targeting students in India.
Analyze the provided text and return ONLY valid JSON with exactly these fields:

{
  "explanation": "A concise 2-3 sentence summary of why this posting is suspicious or safe.",
  "red_flags": ["flag1", "flag2", ...],
  "risk_factors": ["factor1", "factor2", ...],
  "safety_recommendations": ["rec1", "rec2", ...],
  "confidence": 0.85
}

Guidelines:
- Red flags: specific scam indicators (fees, WhatsApp-only, unrealistic salary, etc.)
- Risk factors: broader concerns (missing company info, vague description, etc.)
- Safety recommendations: actionable advice for the student
- Confidence: 0.0 to 1.0
- If the text is clearly legitimate, red_flags can be empty
- Keep explanations objective and student-friendly
""".strip()


def _build_gemini_client() -> Any:
    """Create and configure the GenerativeModel. Raises if not possible."""
    if not GENAI_AVAILABLE:
        raise GeminiUnavailableError("google-generativeai not installed.")

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise GeminiUnavailableError("GEMINI_API_KEY not set in environment.")

    genai.configure(api_key=api_key)
    return genai.GenerativeModel("gemini-1.5-flash")


def analyze_with_gemini(text: str) -> AIAnalysisOutput:
    """
    Send extracted text to Gemini and return structured analysis.

    Raises:
        GeminiUnavailableError — if client cannot be initialised
        AIAnalysisError — if the model call fails (includes fallback)
    """
    if not text or not text.strip():
        raise AIAnalysisError("Empty text provided for AI analysis.")

    try:
        model = _build_gemini_client()
    except Exception as e:
        raise GeminiUnavailableError(f"Could not initialise Gemini: {e}")

    prompt = f"{_SYSTEM_PROMPT}\n\nJob posting text:\n{text[:12000]}"

    try:
        response = model.generate_content(
            prompt,
            generation_config={"response_mime_type": "application/json"},
        )
        raw = response.text.strip()
        data = json.loads(raw)

        # Validate / coerce
        return AIAnalysisOutput(
            explanation=str(data.get("explanation", "")).strip(),
            red_flags=[str(x).strip() for x in data.get("red_flags", []) if str(x).strip()],
            risk_factors=[str(x).strip() for x in data.get("risk_factors", []) if str(x).strip()],
            safety_recommendations=[
                str(x).strip() for x in data.get("safety_recommendations", []) if str(x).strip()
            ],
            confidence=float(data.get("confidence", 0.5)),
        )
    except Exception as e:
        # Graceful fallback — minimal structure so UI can still render something
        fallback = AIAnalysisOutput(
            explanation="AI analysis could not be completed. Showing rule-based results.",
            red_flags=[],
            risk_factors=["AI service unavailable"],
            safety_recommendations=[
                "Rule-based analysis completed. Review the flags below.",
                "Do not pay any registration or application fee.",
                "Verify the company through its official website.",
                "Do not share OTP, PIN, or banking credentials with recruiters.",
            ],
            confidence=0.0,
        )
        raise AIAnalysisError(f"Gemini call failed: {e}", fallback_result=fallback)