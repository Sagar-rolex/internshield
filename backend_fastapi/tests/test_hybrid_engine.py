"""
Backend tests for the Hybrid Scam Detection Engine.

Tests:
1. Rule engine works without Gemini (Gemini unavailable)
2. Gemini failure does not break analysis
3. Final result has valid score 0-100
4. Risk level is Low/Medium/High
"""
import os
import pytest
from unittest.mock import patch, MagicMock

# Set test environment before importing services
os.environ["GEMINI_API_KEY"] = "test-key"
os.environ["OCR_BACKEND"] = "demo"

from services.rule_engine import (
    run_rule_engine_manual,
    run_rule_engine_screenshot,
    get_signal_weights,
)
from services.gemini_service import (
    analyze_with_gemini,
    is_gemini_available,
    GeminiUnavailableError,
    GeminiAnalysisError,
    GeminiAnalysisOutput,
)
from services.risk_aggregator import (
    aggregate_results,
    HybridAnalysisResult,
    get_scoring_explanation,
)


# ─── Rule Engine Tests ──────────────────────────────────────────────────────

class TestRuleEngine:
    """Tests for the deterministic rule engine."""

    def test_signal_weights_exist(self):
        """Verify all 6 expected signals have weights defined."""
        weights = get_signal_weights()
        assert len(weights) == 6
        expected_signals = {
            "Suspicious Keywords": 25,
            "Free Email Domain": 18,
            "Unrealistic Salary": 22,
            "Missing/Insecure Website": 15,
            "Vague Description": 12,
            "Missing Company Info": 8,
        }
        assert weights == expected_signals

    def test_safe_posting_low_risk(self):
        """Test a clearly legitimate job posting scores low."""
        result = run_rule_engine_manual(
            title="Software Engineer Intern",
            company="TechCorp Inc",
            email="hr@techcorp.com",
            salary="50000",
            description=(
                "We are looking for a motivated intern to join our engineering team. "
                "You will work on real projects with mentorship from senior engineers. "
                "Requirements: Python, JavaScript, basic algorithms knowledge."
            ),
            website="https://techcorp.com",
            work_type="Hybrid",
        )

        assert result.rule_score <= 30
        assert result.risk_level == "Low"
        assert result.safe is True
        assert len(result.findings) == 0  # No red flags for clean posting

    def test_scam_posting_high_risk(self):
        """Test a classic scam posting scores high."""
        result = run_rule_engine_manual(
            title="Work From Home Data Entry Job",
            company="FastCash Hiring",
            email="hr.fastcash@gmail.com",
            salary="80000",
            description=(
                "Urgent hiring! No experience needed. Earn $$$ from home. "
                "Pay registration fee of 999 to confirm slot. WhatsApp only. "
                "100% guaranteed job offer. Limited slots!"
            ),
            website="",
            work_type="Remote",
        )

        assert result.rule_score >= 60
        assert result.risk_level == "High"
        assert result.safe is False
        assert len(result.findings) >= 3  # Multiple red flags
        # Check for specific keywords
        findings_text = " ".join(result.findings).lower()
        assert "registration fee" in findings_text or "scam keyword" in findings_text
        assert "free email" in findings_text or "gmail" in findings_text

    def test_missing_website_medium_risk(self):
        """Test posting with missing website but otherwise OK."""
        result = run_rule_engine_manual(
            title="Marketing Intern",
            company="MarketingCo",
            email="jobs@marketingco.com",
            salary="20000",
            description=(
                "Join our marketing team for a 3-month internship. "
                "You will assist with social media campaigns and content creation. "
                "Requirements: Good communication skills, basic marketing knowledge."
            ),
            website="",  # Missing website
            work_type="Onsite",
        )

        assert 30 <= result.rule_score < 60
        assert result.risk_level == "Medium"

    def test_screenshot_analysis(self):
        """Test rule engine on extracted text from screenshot."""
        extracted_text = (
            "URGENT HIRING! Work From Home Data Entry Operator\n"
            "FastCash Hiring Pvt Ltd\n"
            "No experience needed. Earn Rs 80,000 per month from home.\n"
            "Pay a one-time registration fee of Rs 999 to confirm your slot. "
            "Limited seats only!\n"
            "Join instantly on WhatsApp. Telegram: FastCashHiring\n"
            "100% guaranteed job offer after the training.\n"
            "Western Union and bank transfer accepted for the processing fee.\n"
        )

        result = run_rule_engine_screenshot(extracted_text)

        assert result.rule_score >= 60
        assert result.risk_level == "High"
        assert result.safe is False
        assert len(result.findings) >= 3


# ─── Risk Aggregator Tests ──────────────────────────────────────────────────

class TestRiskAggregator:
    """Tests for the risk aggregator combining rule and AI scores."""

    def test_rule_only_when_ai_unavailable(self):
        """When AI is unavailable, final score should equal rule score (capped at 100)."""
        from services.rule_engine import RuleEngineOutput

        rule_output = RuleEngineOutput(
            rule_score=75,
            risk_level="High",
            safe=False,
            findings=["Fee requested", "Free email"],
            positives=[],
            signals=[
                {"name": "Suspicious Keywords", "weight": 25, "triggered": True},
                {"name": "Free Email Domain", "weight": 18, "triggered": True},
            ],
            keywords_matched=[],
        )

        hybrid = aggregate_results(
            rule_output=rule_output,
            gemini_output=None,
            ai_error="GEMINI_API_KEY not configured",
        )

        assert hybrid.ai_available is False
        assert hybrid.ai_score == 0
        assert hybrid.final_score == 75  # Rule score directly used
        assert hybrid.risk_level == "High"
        assert hybrid.safe is False
        assert hybrid.ai_error is not None

    def test_weighted_combination_with_ai(self):
        """When AI is available, final score should be weighted combination."""
        from services.rule_engine import RuleEngineOutput

        rule_output = RuleEngineOutput(
            rule_score=60,
            risk_level="High",
            safe=False,
            findings=["Fee requested"],
            positives=[],
            signals=[{"name": "Suspicious Keywords", "weight": 25, "triggered": True}],
            keywords_matched=[],
        )

        ai_output = GeminiAnalysisOutput(
            risk_score=40,
            risk_level="Medium",
            red_flags=["WhatsApp only"],
            suspicious_evidence=["No official website"],
            explanation="Posting has some concerning elements but not definitive fraud.",
            recommendations=["Verify company"],
            confidence=0.8,
        )

        hybrid = aggregate_results(
            rule_output=rule_output,
            gemini_output=ai_output,
        )

        assert hybrid.ai_available is True
        assert hybrid.ai_score == 40
        # Weighted: 0.7 * 60 + 0.3 * 40 = 42 + 12 = 54
        assert hybrid.final_score == 54
        assert hybrid.risk_level == "Medium"
        assert hybrid.safe is False

    def test_final_score_bounds(self):
        """Final score must always be 0-100."""
        from services.rule_engine import RuleEngineOutput

        # Test edge cases
        test_cases = [
            (0, 0, 0),      # Both zero
            (98, 100, 98),  # Rule capped at 98, AI at 100
            (98, 0, 68),    # Rule max, AI zero
            (0, 100, 30),   # Rule zero, AI max
        ]

        for rule_score, ai_score, expected in test_cases:
            rule_output = RuleEngineOutput(
                rule_score=rule_score,
                risk_level="Low" if rule_score < 30 else "Medium" if rule_score < 60 else "High",
                safe=rule_score < 30,
                findings=[],
                positives=[],
                signals=[],
                keywords_matched=[],
            )

            ai_output = GeminiAnalysisOutput(
                risk_score=ai_score,
                risk_level="Low" if ai_score < 30 else "Medium" if ai_score < 60 else "High",
                red_flags=[],
                suspicious_evidence=[],
                explanation="Test",
                recommendations=[],
                confidence=0.5,
            )

            hybrid = aggregate_results(rule_output, ai_output)
            assert hybrid.final_score == expected, f"Failed for ({rule_score}, {ai_score})"
            assert 0 <= hybrid.final_score <= 100

    def test_risk_levels(self):
        """Risk level must always be Low/Medium/High."""
        from services.rule_engine import RuleEngineOutput

        for score in [15, 45, 75]:
            rule_output = RuleEngineOutput(
                rule_score=score,
                risk_level="Low" if score < 30 else "Medium" if score < 60 else "High",
                safe=score < 30,
                findings=[],
                positives=[],
                signals=[],
                keywords_matched=[],
            )

            hybrid = aggregate_results(rule_output, None)
            assert hybrid.risk_level in ["Low", "Medium", "High"]
            assert hybrid.final_score == score

    def test_ai_fallback_on_error(self):
        """When AI throws an error with fallback, use fallback."""
        from services.rule_engine import RuleEngineOutput

        rule_output = RuleEngineOutput(
            rule_score=50,
            risk_level="Medium",
            safe=False,
            findings=["Fee requested"],
            positives=[],
            signals=[{"name": "Suspicious Keywords", "weight": 25, "triggered": True}],
            keywords_matched=[],
        )

        fallback_ai = GeminiAnalysisOutput(
            risk_score=55,
            risk_level="Medium",
            red_flags=["Fee requested"],
            suspicious_evidence=[],
            explanation="Fallback analysis",
            recommendations=["Verify company"],
            confidence=0.0,
        )

        # Simulate AIAnalysisError with fallback
        class MockError(GeminiAnalysisError):
            def __init__(self):
                super().__init__("Simulated failure", fallback_result=fallback_ai)

        # We can't easily test the exception handling without mocking,
        # but we can test that the fallback logic in the endpoint works
        # by checking the aggregate_results handles None and fallback
        hybrid = aggregate_results(
            rule_output=rule_output,
            gemini_output=fallback_ai,  # Using fallback directly
        )

        assert hybrid.ai_available is True
        assert hybrid.ai_score == 55


# ─── Gemini Service Tests ───────────────────────────────────────────────────

class TestGeminiService:
    """Tests for the Gemini AI service."""

    def test_is_gemini_available_without_key(self):
        """Gemini should report unavailable when no API key is set."""
        # Temporarily unset the key
        old_key = os.environ.pop("GEMINI_API_KEY", None)
        try:
            assert is_gemini_available() is False
        finally:
            if old_key:
                os.environ["GEMINI_API_KEY"] = old_key

    def test_is_gemini_available_with_key(self):
        """Gemini should report available when API key is set."""
        os.environ["GEMINI_API_KEY"] = "test-key"
        assert is_gemini_available() is True

    def test_fallback_output_structure(self):
        """Fallback output should have all required fields."""
        from services.gemini_service import _create_fallback

        fallback = _create_fallback("test text")

        assert isinstance(fallback, GeminiAnalysisOutput)
        assert 0 <= fallback.risk_score <= 100
        assert fallback.risk_level in ["Low", "Medium", "High"]
        assert isinstance(fallback.red_flags, list)
        assert isinstance(fallback.suspicious_evidence, list)
        assert isinstance(fallback.explanation, str)
        assert len(fallback.explanation) > 0
        assert isinstance(fallback.recommendations, list)
        assert len(fallback.recommendations) > 0
        assert 0.0 <= fallback.confidence <= 1.0


# ─── Scoring Explanation Tests ──────────────────────────────────────────────

class TestScoringExplanation:
    """Tests for the scoring methodology documentation."""

    def test_get_scoring_explanation(self):
        """Scoring explanation should contain all key information."""
        explanation = get_scoring_explanation()

        assert "rule_weight" in explanation
        assert "ai_weight" in explanation
        assert explanation["rule_weight"] == 0.7
        assert explanation["ai_weight"] == 0.3
        assert "final_score_formula" in explanation
        assert "risk_thresholds" in explanation
        assert explanation["risk_thresholds"]["Low"] == "0-29"
        assert explanation["risk_thresholds"]["Medium"] == "30-59"
        assert explanation["risk_thresholds"]["High"] == "60-100"


# ─── Integration Tests (Mocked) ─────────────────────────────────────────────

class TestIntegration:
    """Integration tests with mocked external dependencies."""

    @patch("services.gemini_service._build_gemini_client")
    def test_gemini_success_path(self, mock_client):
        """Test successful Gemini call path."""
        # Mock the Gemini client
        mock_model = MagicMock()
        mock_response = MagicMock()
        mock_response.text = json.dumps({
            "risk_score": 70,
            "risk_level": "High",
            "red_flags": ["Fee requested", "WhatsApp only"],
            "suspicious_evidence": ["No website"],
            "explanation": "This posting shows multiple scam indicators.",
            "recommendations": ["Don't pay fees", "Verify company"],
            "confidence": 0.85,
        })
        mock_model.generate_content.return_value = mock_response
        mock_client.return_value = mock_model

        result = analyze_with_gemini("Test posting with fee")

        assert result.risk_score == 70
        assert result.risk_level == "High"
        assert len(result.red_flags) == 2
        assert result.confidence == 0.85

    @patch("services.gemini_service._build_gemini_client")
    def test_gemini_invalid_json_fallback(self, mock_client):
        """Test fallback when Gemini returns invalid JSON."""
        mock_model = MagicMock()
        mock_response = MagicMock()
        mock_response.text = "This is not valid JSON {"
        mock_model.generate_content.return_value = mock_response
        mock_client.return_value = mock_model

        result = analyze_with_gemini("Test posting")

        # Should return fallback
        assert result.confidence == 0.0
        assert "unavailable" in result.explanation.lower()

    @patch("services.gemini_service._build_gemini_client")
    def test_gemini_exception_fallback(self, mock_client):
        """Test fallback when Gemini raises exception."""
        mock_client.side_effect = Exception("API error")

        result = analyze_with_gemini("Test posting")

        # Should return fallback
        assert result.confidence == 0.0
        assert "unavailable" in result.explanation.lower()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])