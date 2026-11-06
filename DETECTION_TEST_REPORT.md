# Detection Test Report

## Dataset and method

Ran `detection_test_cases.json`: 27 synthetic, hand-authored examples (13 suspicious, 14 legitimate). The dataset is a separate regression/validation set used to check expected behaviors, not a source of real-world performance claims. Positive prediction for the confusion matrix means High or Critical; Medium is treated as not confirmed suspicious.

## Before and after

| Version | TP | TN | FP | FN | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|---:|
| Previous rules | 9 | 10 | 4 | 4 | 0.692 | 0.692 | 0.692 |
| Updated rules | 13 | 14 | 0 | 0 | 1.000 | 1.000 | 1.000 |

The previous score was measured before modifying the rule engine using the same fixed examples. The updated score is likewise a synthetic regression result and should not be interpreted as expected field precision/recall. The set is small and authored to cover known failure modes.

## Per-case result

Run `python -m unittest discover -s tests -p 'test_detection_engine.py' -v` from `backend_fastapi` to reproduce. The test checks every case's score, score/class consistency and binary expected outcome. It also checks contextual negation, repeated phrase de-duplication, missing information, OCR spacing normalization, and protection against AI dilution of hard evidence.

| Case | Expected | Actual score / class | Triggered signal IDs | Outcome |
|---|---|---:|---|---|
| upfront_registration_fee | Suspicious | 80 High | upfront_payment | TP |
| refundable_security_deposit | Suspicious | 80 High | upfront_payment | TP |
| offer_letter_payment | Suspicious | 80 High | upfront_payment | TP |
| training_fee | Suspicious | 80 High | upfront_payment | TP |
| equipment_purchase | Suspicious | 80 High | upfront_payment | TP |
| unrealistic_remote_salary | Suspicious | 64 High | task_scheme, unrealistic_compensation | TP |
| guaranteed_selection | Suspicious | 60 High | guaranteed_selection | TP |
| urgent_payment | Suspicious | 85 Critical | upfront_payment, pressure_tactics | TP |
| otp_theft | Suspicious | 90 Critical | sensitive_credentials | TP |
| bank_credentials | Suspicious | 90 Critical | sensitive_credentials | TP |
| fake_recruiter | Suspicious | 80 High | upfront_payment | TP |
| multi_signal | Suspicious | 100 Critical | upfront_payment, sensitive_credentials, sensitive_identity_request, guaranteed_selection | TP |
| software_developer_legitimate | Legitimate | 0 Low | None | TN |
| realistic_internship | Legitimate | 0 Low | None | TN |
| transparent_unpaid_internship | Legitimate | 0 Low | None | TN |
| qualified_senior_salary | Legitimate | 0 Low | None | TN |
| no_application_fee | Legitimate | 0 Low | None | TN |
| normal_deadline | Legitimate | 0 Low | None | TN |
| scam_awareness_warning | Legitimate | 0 Low | None | TN |
| fees_in_context | Legitimate | 0 Low | None | TN |
| negated_registration_fee | Legitimate | 0 Low | None | TN |
| unverified_sparse_listing | Legitimate | 0 Low | None | TN |
| salary_35k_format | Legitimate | 0 Low | None | TN |
| salary_lpa_format | Legitimate | 0 Low | None | TN |
| messaging_with_official_process | Legitimate | 0 Low | None | TN |
| mentions_payment_without_request | Legitimate | 0 Low | None | TN |
| ocr_spacing_payment | Suspicious | 80 High | upfront_payment | TP |

Expected suspicious cases: upfront registration fee, refundable deposit, fee for offer letter, training/equipment fee, unrealistic short-hours pay, guaranteed selection, urgent payment, OTP theft, bank credential theft, messaging-only fake recruiter, combined indicators, and OCR-formatted payment request. Expected legitimate cases: ordinary and senior roles, realistic and transparent unpaid internships, explicit no-fee ads, normal deadlines, scam-awareness text, fee discussion, negation, sparse/unverified listings, salary formats, ordinary official WhatsApp contact, and salary-payment mention.

## API/UI and OCR checks

- Manual and screenshot endpoints both call `analyze_with_evidence`; OCR confidence is reflected in screenshot result confidence.
- API signals now expose ID, category, severity, confidence, matched evidence, weight, and actual contribution. Unverified information is returned separately.
- Frontend fallback scoring was removed; an unavailable API now produces an error instead of an inconsistent local score.
- OCR failure remains an error path and cannot be recorded as a low-risk assessment.

## Verification run

- New detection regression tests: 8 passed.
- Existing screenshot OCR tests: 8 passed.
- Python compile check: passed.
- FastAPI application import: passed (29 registered routes).
- TypeScript check: passed.
- Vite/Nitro production build: passed.
- The full existing unittest discovery cannot run `test_hybrid_engine.py` because `pytest` is not installed in the current virtual environment. That file also exercises the legacy `rule_engine.py`, not the active analysis route. No dependency was installed as part of this fix.
- Importing the existing Gemini adapter emits a deprecation warning for `google.generativeai`; this change did not migrate or add an AI SDK/service.

## Limitations and follow-up

Real employer/domain verification is not implemented. The system does not independently validate salary market rates, identify every paraphrase, or establish fraud. Add a larger, independently labeled, legally usable dataset and human-reviewed validation before using metrics for operational decisions. The current automated set is synthetic and intentionally targeted at known gaps.
