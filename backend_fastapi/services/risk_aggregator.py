"""
Risk Aggregator Service — Combines Evidence-Based Rules with AI Analysis.

Integrates evidence findings and AI contextual intelligence into an accurate,
balanced risk score with clear explainability.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Optional

from .evidence_engine import EvidenceBasedResult
from .gemini_service import AIValidationOutput


# ─── Configuration ──────────────────────────────────────────────────────────

RISK_HIGH_THRESHOLD = 60
RISK_MEDIUM_THRESHOLD = 30
MAX_SCORE = 100


# ─── Output Schema ──────────────────────────────────────────────────────────

@dataclass(frozen=True)
class HybridAnalysisResult:
    """Final unified result from evidence-based + AI validation."""
    rule_score: int  # 0-100 from evidence engine
    ai_score: int  # 0-100 from AI contextual assessment
    final_score: int  # 0-100 combined score
    risk_level: Literal["Low", "Medium", "High"]
    safe: bool
    rule_findings: list[str]  # Evidence-based findings
    positives: list[str]  # Positive signals
    ai_validation: dict  # AI validation details
    ai_available: bool
    ai_error: Optional[str] = None
    extracted_data: dict = None  # Structured job data
    confidence: float = 0.85


def _determine_risk_level(score: int) -> Literal["Low", "Medium", "High"]:
    """Determine risk level from final score."""
    if score >= RISK_HIGH_THRESHOLD:
        return "High"
    if score >= RISK_MEDIUM_THRESHOLD:
        return "Medium"
    return "Low"


def _calculate_final_score(
    rule_score: int,
    ai_score: int,
    ai_available: bool,
    validation_score: float = 1.0,
) -> int:
    """
    Calculate final score combining rule findings and AI contextual score.

    If AI unavailable, uses rule_score.
    If AI available:
      - Takes into account both concrete rule evidence and AI contextual insights.
      - If either strongly detects fraud, the overall score reflects the elevated risk.
    """
    if not ai_available:
        return min(rule_score, MAX_SCORE)

    # Validated rule score adjusted by validation score
    validated_rule_score = int(rule_score * max(0.5, validation_score))

    # If AI detects strong contextual scam signals that rules missed
    if ai_score >= 65 and rule_score < 40:
        final = int(0.35 * validated_rule_score + 0.65 * ai_score)
    # If rules found concrete hard red flags
    elif rule_score >= 60:
        final = max(rule_score, int(0.65 * validated_rule_score + 0.35 * ai_score))
    else:
        final = int(0.6 * validated_rule_score + 0.4 * ai_score)

    return min(MAX_SCORE, max(0, final))


def _extract_ai_validation_dict(ai_output: Optional[AIValidationOutput]) -> dict:
    """Extract AI validation details for storage."""
    if not ai_output:
        return {
            "validation_score": 0.0,
            "supported_findings": [],
            "unsupported_findings": [],
            "additional_context": "",
            "missing_information": [],
            "recommendations": [],
            "confidence": 0.0,
        }

    return {
        "validation_score": ai_output.validation_score,
        "supported_findings": ai_output.supported_findings,
        "unsupported_findings": ai_output.unsupported_findings,
        "additional_context": ai_output.additional_context,
        "missing_information": ai_output.missing_information,
        "recommendations": ai_output.recommendations,
        "confidence": ai_output.confidence,
    }


def aggregate_evidence_and_ai(
    evidence_result: EvidenceBasedResult,
    ai_output: Optional[AIValidationOutput] = None,
    ai_error: Optional[str] = None,
) -> HybridAnalysisResult:
    """
    Combine evidence-based rule engine with AI analysis.
    """
    ai_available = ai_output is not None

    # Extract AI contextual risk and validation score
    ai_score = ai_output.contextual_risk if ai_available else 0
    validation_score = ai_output.validation_score if ai_available else 1.0

    # Calculate final score with validation adjustment
    final_score = _calculate_final_score(
        evidence_result.probability,
        ai_score,
        ai_available,
        validation_score,
    )

    # Determine final risk level
    risk_level = _determine_risk_level(final_score)
    safe = final_score < RISK_MEDIUM_THRESHOLD

    # Combine confidence scores
    confidence = evidence_result.confidence
    if ai_available:
        confidence = 0.5 * evidence_result.confidence + 0.5 * ai_output.confidence

    # Combine findings and positive notes
    all_findings = list(evidence_result.reasons)
    if ai_output and ai_output.supported_findings:
        for f in ai_output.supported_findings:
            if f and f not in all_findings:
                all_findings.append(f)

    return HybridAnalysisResult(
        rule_score=evidence_result.probability,
        ai_score=ai_score,
        final_score=final_score,
        risk_level=risk_level,
        safe=safe,
        rule_findings=all_findings,
        positives=evidence_result.positives,
        ai_validation=_extract_ai_validation_dict(ai_output),
        ai_available=ai_available,
        ai_error=ai_error,
        extracted_data=evidence_result.extracted_data,
        confidence=confidence,
    )


def get_scoring_explanation() -> dict:
    """Return scoring methodology for API documentation."""
    return {
        "approach": "Evidence-based rule engine combined with Gemini AI contextual analysis",
        "rule_engine": "Detects concrete red flags with actual evidence quotes and regex patterns",
        "ai_role": "Performs full contextual fraud analysis and validates findings",
        "risk_thresholds": {
            "Low": f"0-{RISK_MEDIUM_THRESHOLD - 1}",
            "Medium": f"{RISK_MEDIUM_THRESHOLD}-{RISK_HIGH_THRESHOLD - 1}",
            "High": f"{RISK_HIGH_THRESHOLD}-100",
        },
        "fallback": "If AI unavailable, evidence-based rule engine is used directly",
    }
