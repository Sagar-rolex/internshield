"""Synthetic regression checks for the shared manual/OCR detection engine."""
import json
from pathlib import Path
import unittest

from services.evidence_engine import analyze_with_evidence
from services.risk_aggregator import aggregate_evidence_and_ai
from services.gemini_service import AIValidationOutput


DATASET = Path(__file__).resolve().parents[2] / "detection_test_cases.json"


class TestDetectionEngine(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cases = json.loads(DATASET.read_text(encoding="utf-8"))["cases"]

    def test_synthetic_validation_confusion_matrix(self):
        tp = tn = fp = fn = 0
        for case in self.cases:
            result = analyze_with_evidence(case["text"])
            self.assertGreaterEqual(result.probability, 0, case["id"])
            self.assertLessEqual(result.probability, 100, case["id"])
            self.assertEqual(result.risk, _risk_for(result.probability), case["id"])
            predicted = result.risk in {"High", "Critical"}
            suspicious = case["label"] == "suspicious"
            tp += int(predicted and suspicious)
            tn += int(not predicted and not suspicious)
            fp += int(predicted and not suspicious)
            fn += int(not predicted and suspicious)
        # Synthetic regression acceptance: catch all explicit high-severity scams
        # while retaining conservative classifications for the legitimate set.
        self.assertGreaterEqual(tp, 13)
        self.assertEqual(fn, 0)
        self.assertEqual(fp, 0)
        self.assertEqual(tn, 14)

    def test_payment_and_credentials_are_grounded_and_severe(self):
        payment = analyze_with_evidence("Pay ₹500 to receive your offer letter and secure employment.")
        credentials = analyze_with_evidence("Send your OTP and UPI PIN to the hiring manager.")
        self.assertEqual(payment.risk, "High")
        self.assertTrue(any(s.id == "upfront_payment" and s.evidence for s in payment.signals))
        self.assertEqual(credentials.risk, "Critical")
        self.assertTrue(any(s.id == "sensitive_credentials" for s in credentials.signals))

    def test_negated_and_awareness_context_is_not_flagged(self):
        for text in (
            "No registration fee required. No deposit is charged.",
            "Never share your OTP with recruiters.",
            "Do not upload your Aadhaar number to a recruiter.",
            "Safety notice: never pay a registration fee to get a job.",
        ):
            result = analyze_with_evidence(text)
            self.assertFalse(any(s.triggered for s in result.signals if s.id in {"upfront_payment", "sensitive_credentials", "sensitive_identity_request"}), text)

    def test_identity_document_request_is_explained_without_hard_fraud_label(self):
        result = analyze_with_evidence("A recruiter asks applicants to upload their Aadhaar number before applying.")
        self.assertTrue(any(s.id == "sensitive_identity_request" and s.triggered for s in result.signals))
        self.assertNotIn(result.risk, {"High", "Critical"})

    def test_repeating_same_phrase_does_not_stack_score(self):
        single = analyze_with_evidence("Pay a registration fee to apply.")
        repeated = analyze_with_evidence("Pay a registration fee to apply. Pay a registration fee to apply.")
        self.assertEqual(single.probability, repeated.probability)
        self.assertEqual(sum(s.id == "upfront_payment" and s.triggered for s in repeated.signals), 1)

    def test_missing_company_details_are_uncertainty_not_risk_points(self):
        sparse = analyze_with_evidence("Customer support assistant wanted. Duties include answering questions.")
        self.assertEqual(sparse.probability, 0)
        self.assertEqual(sparse.risk, "Low")
        self.assertTrue(sparse.uncertainties)

    def test_ocr_spacing_and_manual_text_share_the_same_rule(self):
        manual = "Pay Rs. 5000 refundable security deposit before interview to confirm your position."
        ocr = "P a y R s . 5 0 0 0 refundable security deposit before interview to confirm your position."
        # API manual and screenshot routes call this same function after OCR text extraction.
        self.assertEqual(analyze_with_evidence(manual).risk, "High")
        self.assertEqual(analyze_with_evidence(ocr).risk, "High")

    def test_ai_validation_cannot_reduce_hard_rule_evidence(self):
        evidence = analyze_with_evidence("Pay an application fee to receive your job offer letter.")
        ai = AIValidationOutput(
            validation_score=0.5, contextual_risk=0, supported_findings=[],
            unsupported_findings=[], additional_context="", missing_information=[],
            recommendations=[], confidence=0.3,
        )
        combined = aggregate_evidence_and_ai(evidence, ai)
        self.assertGreaterEqual(combined.final_score, evidence.probability)
        self.assertEqual(combined.risk_level, evidence.risk)


def _risk_for(score):
    if score >= 85:
        return "Critical"
    if score >= 60:
        return "High"
    if score >= 30:
        return "Medium"
    return "Low"


if __name__ == "__main__":
    unittest.main()
