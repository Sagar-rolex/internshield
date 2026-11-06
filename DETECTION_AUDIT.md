# Detection Engine Audit

## Scope and existing flow

Manual analysis and screenshot analysis both call `analyze_with_evidence` in `backend_fastapi/services/evidence_engine.py`. Screenshot analysis first extracts text with OCR and rejects unreadable/low quality output; it then reaches the same engine. The API response exposes `probability`, `risk`, `safe`, evidence reasons/signals, and optional Gemini scores. The detector classifies only Low, Medium, and High.

## Root causes identified before scoring changes

1. **Important payment wording is missed.** Payment rules depend on a few regex word orders. Examples such as “pay ₹500 to receive your offer letter”, “fee must be paid before joining”, “refundable deposit of Rs 10,000”, “pay to secure your position”, and requests for equipment/document verification fees are not consistently covered. Currency/Indian salary extraction also requires a currency marker and misses common formats such as `35K` and `0.5 LPA`.
2. **Context and negation are not handled.** A literal match such as “No registration fee required” still matches the registration pattern; warnings such as “never share your OTP” can be treated as a credential request. Conversely, negation can prevent some positive phrase variants from matching at all. There is no clause-level context check.
3. **Several high-risk signals are too weak or absent.** Payment signals total 25–35 points before the hard-flag floor, while guaranteed selection is only 15; pressure wording is only 12. There is no explicit guaranteed earnings / pay-for-offer-letter / sensitive identity request coverage. “Critical” does not exist in the API result.
4. **Harmless missing information adds risk points.** No website adds 10 points and a missing company/email is not represented as uncertainty. This can push sparse but otherwise benign text into Medium without evidence of fraud.
5. **Independent signals and duplicates are not modeled explicitly.** The engine adds one match per category (which limits repeated keyword inflation), but uses first-match regexes, combines guarantee and urgency with `elif`, and has no signal IDs, confidence, severity, or source spans. Different phrase matches from a single underlying request can add multiple category weights.
6. **Risk aggregation can dilute hard evidence.** When Gemini is configured, `validation_score` multiplies down the rule score (as low as 50%), and a low AI contextual score then averages with it. A concrete payment/credential signal is therefore not guaranteed to survive as High. AI output also does not provide grounded evidence spans.
7. **Rules were not the only displayed assessment path.** The Detect page fell back to `src/lib/scam-detector.ts` when the API failed and displayed the local score as if it were an analysis. This second engine could disagree with the backend and create a stale/mismatched result path. The fallback has now been removed; API errors leave the result unavailable instead of inventing an alternate score.
8. **OCR uses the same rule engine, but quality was not reflected in risk confidence.** OCR rejects unreadable text, which avoids a false Low result; successful OCR confidence/quality was returned separately and did not lower the assessment confidence or mark it uncertain. Screenshot confidence now incorporates OCR confidence.

## Initial scoring configuration

The rule engine uses additive weights and caps at 100: payment 35, training/deposit 25, credential request 35, suspicious payment channel 25, task scheme 25, unofficial messaging 20, guarantee 15, urgency 12, personal email 15, missing website 10. A hard-flag floor raises a matched payment, credential, task, or suspicious payment channel to at least 65. Thresholds are Low 0–29, Medium 30–59, High 60–100. The hybrid aggregator uses the same thresholds but has no hard-signal floor of its own.

## Frontend/API consistency

The backend response is the source for normal successful analysis and the result screen reads `probability` and `risk`. On request failure the frontend substitutes a separate local algorithm. This audit identified a real consistency defect; the implementation will make backend results authoritative and preserve an explicit error state if the API is unavailable.

## Baseline and scope

This audit is based on source inspection. Baseline and post-change results are recorded in `DETECTION_TEST_REPORT.md` using a synthetic, separate validation set. The small set is a regression check, not a claim of real-world accuracy. Rules remain heuristic and company identity cannot be verified from the advertisement alone.

`backend_fastapi/services/rule_engine.py` is a legacy implementation still referenced by the older `test_hybrid_engine.py`, but the running manual and screenshot API routes import `evidence_engine.py`. This fix targets the active endpoint path; the legacy module/test suite remains technical debt and should be removed or migrated in a separate cleanup.

## Implemented remediation

Added action/context-based payment and credential rules; negation and safety-warning handling; severity, confidence, contribution, signal IDs and evidence spans; an explicit Critical class; hard floors for explicit fees, guaranteed selection, and credential theft; independent-category reinforcement; zero-risk uncertainty reporting for missing verification details; score bounds; API size bounds; OCR confidence propagation; and frontend use of backend results only. Per-case checks and metrics are in `DETECTION_TEST_REPORT.md`.
