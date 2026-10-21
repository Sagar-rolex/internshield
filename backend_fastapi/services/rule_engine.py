"""
Rule Engine Service — Wrapper around the existing deterministic rule engine.

This module provides a clean interface for the rule-based scam detection engine,
preserving the existing 6-signal logic while making it easily composable
with the AI analysis layer.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal
from .rules import analyze_manual, analyze_from_text, Signal, RuleResult


@dataclass(frozen=True)
class RuleEngineOutput:
    """Structured output from the rule engine."""
    rule_score: int                    # 0–98 (capped at MAX_PROBABILITY)
    risk_level: Literal["Low", "Medium", "High"]
    safe: bool
    findings: list[str]                # Human-readable reasons (red flags)
    positives: list[str]               # Human-readable positive signals
    signals: list[dict]                # Detailed signal breakdown
    keywords_matched: list[str]        # Suspicious keywords found


def _convert_signals(signals: list[Signal]) -> list[dict]:
    """Convert Signal NamedTuple to dict for JSON serialization."""
    return [{"name": s.name, "weight": s.weight, "triggered": s.triggered} for s in signals]


def run_rule_engine_manual(
    title: str,
    company: str,
    email: str = "",
    salary: str = "",
    description: str = "",
    website: str = "",
    work_type: str = "Remote",
) -> RuleEngineOutput:
    """
    Run the rule engine on manually-entered job details.

    Returns a structured RuleEngineOutput with all findings.
    """
    result: RuleResult = analyze_manual(
        title=title,
        company=company,
        email=email,
        salary=salary,
        description=description,
        website=website,
        work_type=work_type,
    )

    return RuleEngineOutput(
        rule_score=result.probability,
        risk_level=result.risk,
        safe=result.safe,
        findings=result.reasons,
        positives=result.positives,
        signals=_convert_signals(result.signals),
        keywords_matched=[],  # Extracted from reasons if needed
    )


def run_rule_engine_screenshot(extracted_text: str) -> RuleEngineOutput:
    """
    Run the rule engine on OCR-extracted text from a screenshot.

    Returns a structured RuleEngineOutput with all findings.
    """
    result: RuleResult = analyze_from_text(extracted_text)

    return RuleEngineOutput(
        rule_score=result.probability,
        risk_level=result.risk,
        safe=result.safe,
        findings=result.reasons,
        positives=result.positives,
        signals=_convert_signals(result.signals),
        keywords_matched=[],  # Could be extracted from text
    )


def get_signal_weights() -> dict[str, int]:
    """Return the current signal weights for reference/debugging."""
    return {
        "Suspicious Keywords": 25,
        "Free Email Domain": 18,
        "Unrealistic Salary": 22,
        "Missing/Insecure Website": 15,
        "Vague Description": 12,
        "Missing Company Info": 8,
    }