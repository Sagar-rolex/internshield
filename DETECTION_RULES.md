# Detection Rules and Scoring

## Shared processing path

Manual submissions and successfully OCR-extracted screenshot text both pass through `analyze_with_evidence` in `backend_fastapi/services/evidence_engine.py`. Text is Unicode/whitespace normalized; common character-spaced OCR output is compacted while currency and punctuation cues are retained. An unreadable screenshot returns an error and is never scored as Low.

## Signal weights

Each category is evaluated once per analysis. The score contribution is `round(weight × confidence)`; repeating the same phrase does not add points. Evidence is the matched text span, capped at 240 characters.

| Signal | Weight | Confidence | Contribution | Additional handling |
|---|---:|---:|---:|---|
| Applicant upfront payment request | 55 | 0.96 | 53 | Hard floor 80 (High) |
| OTP, PIN, password, CVV, or banking secret request | 65 | 0.99 | 64 | Hard floor 90 (Critical) |
| Sensitive identity document/number request | 18 | 0.75 | 14 | Warning signal only; not a hard fraud label |
| Suspicious payment channel | 30 | 0.88 | 26 | Adds concern alongside a payment request |
| Task based earnings scheme | 35 | 0.84 | 29 | Evaluated with job context |
| Extreme pay for simple/short work | 35 | 0.87 | 30 | Requires a high pay and low effort pattern |
| Guaranteed selection/offer | 40 | 0.91 | 36 | Hard floor 60 (High) |
| Pressure tactic | 15 | 0.82 | 12 | Elevated when paired with payment or other signals |
| Recruitment restricted to unofficial channel | 16 | 0.82 | 13 | WhatsApp/Gmail mention alone is not a fraud finding |
| Free email provider | 8 | 0.55 | 0 | Uncertainty only; no score contribution |
| Website not provided | 0 | 0 | 0 | Uncertainty only; absence is not fraud evidence |

When at least two independent medium/high/critical categories are triggered, add 5 points, plus 4 per further category up to 12 total. Duplicate phrases within one category do not create more signals. The final result is clamped to 0–100.

## Classification

- Low: 0–29
- Medium: 30–59
- High: 60–84
- Critical: 85–100

The existing Medium/High boundaries were retained. Critical starts at 85 so direct credential theft (floor 90) is distinguished. Explicit applicant payment (floor 80) and guaranteed selection (floor 60) cannot be averaged below High by Gemini. AI may contribute to less conclusive assessments but cannot reduce a rule score of 80 or greater. `safe` is true only below 30. `risk` is always calculated from the final integer score.

## Context and uncertainty

Payment evidence must describe an applicant action/requirement. Explicit negation and safety warnings (for example, “no application fee” and “never share your OTP”) are excluded. Fee mentions in descriptions are not sufficient by themselves. High salary alone, personal email alone, WhatsApp mention alone, and missing company details do not add risk points. Missing verification data is returned in `uncertainties`; it is not evidence that the employer is fraudulent.

## Limits

These are interpretable heuristics, not a trained classifier or a guarantee of legitimacy. Salary currency conversion and market benchmarks are not attempted; only clearly extreme short-hours/simple-task patterns are matched. Company identity and domains are not externally verified. Synthetic regression results are reported in `DETECTION_TEST_REPORT.md` and are not real-world accuracy estimates.
