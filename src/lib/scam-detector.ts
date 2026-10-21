// ── Scam detection engine ──
// Comprehensive, deterministic scoring over job postings. No random noise, no side effects.

export interface JobInput {
  title: string;
  company: string;
  email: string;
  salary: string;
  description: string;
  website: string;
  workType: string;
}

export interface ScamSignal {
  readonly name: string;
  readonly weight: number;
  readonly triggered: boolean;
}

export interface ScamResult {
  readonly probability: number;
  readonly risk: "Low" | "Medium" | "High";
  readonly safe: boolean;
  readonly reasons: readonly string[];
  readonly positives: readonly string[];
  readonly signals: readonly ScamSignal[];
}

// ── Thresholds ──
const RISK_HIGH_THRESHOLD = 60;
const RISK_MEDIUM_THRESHOLD = 30;
const MAX_PROBABILITY = 98;
const MIN_COMPANY_NAME_LENGTH = 2;
const MIN_WEBSITE_LENGTH = 5;

// Free email domains that are suspicious for formal hiring
const FREE_EMAIL_DOMAINS = [
  "gmail.com",
  "yahoo.com",
  "outlook.com",
  "hotmail.com",
  "rediffmail.com",
  "aol.com",
  "mail.com",
  "protonmail.com",
  "zoho.com",
] as const;

// ── Pattern Definitions ──

// Pattern categories with descriptive flags
const SCAM_PATTERNS = [
  {
    category: "Upfront Payment or Fees",
    weight: 35,
    regex:
      /(?:registration|processing|training|application|onboarding|interview|kit|material|equipment|exam|badge|laptop|security|verification)\s+(?:fee|charge|deposit|amount|cost|payment)|(?:pay|deposit|transfer|send)\s+(?:₹|\$|rs\.?|inr|usd)?\s*\d+\s*(?:to apply|for training|refundable|before interview|as security)|pay\s+to\s+apply|investment\s+required/i,
    reason: (match: string) => `Demands upfront payment or fee ("${match}")`,
  },
  {
    category: "Credential or Sensitive Data Theft",
    weight: 35,
    regex:
      /(?:share|send|enter|provide)\s+(?:your\s+)?(?:otp|upi\s*pin|password|bank\s+account\s+details|debit\s+card|credit\s+card|net\s*banking)|bank\s+login\s+details/i,
    reason: (match: string) => `Requests sensitive banking credentials or OTP ("${match}")`,
  },
  {
    category: "Suspicious Payment Methods & Check Scams",
    weight: 25,
    regex:
      /western\s+union|money\s*gram|cryptocurrency|bitcoin|usdt|crypto\s+wallet|gift\s+card|steam\s+card|apple\s+card|cashier(?:'s)?\s+check|check\s+deposit|wire\s+transfer/i,
    reason: (match: string) => `Requires untraceable or suspicious payment methods ("${match}")`,
  },
  {
    category: "Unofficial Messaging Channels",
    weight: 20,
    regex:
      /(?:contact|apply|dm|reach\s+out|message)\s+(?:via|on|at|through)?\s*(?:whatsapp|telegram|signal|google\s+chat|viber)|whatsapp\s+only|telegram\s+only|wa\.me\/|t\.me\/|join\s+telegram\s+group/i,
    reason: (match: string) => `Directs applicants solely to off-platform messaging apps ("${match}")`,
  },
  {
    category: "Task, Rating, or Ponzi Scams",
    weight: 25,
    regex:
      /(?:like\s+(?:and|&)\s+subscribe|youtube\s+video\s+(?:like|review)|daily\s+task\s+earning|ad\s+clicking|copy\s+paste\s+work|sms\s+sending\s+job|earn\s+(?:daily|per\s+day|hourly)\s*(?:₹|\$|rs\.?|inr)?\s*\d+|daily\s+payouts?|part[\s-]time\s+data\s+entry\s+earn\s+money)/i,
    reason: (match: string) => `Indicates a micro-task, review, or fake daily payout scheme ("${match}")`,
  },
  {
    category: "Unrealistic Guarantees & False Urgency",
    weight: 15,
    regex:
      /100%\s+guaranteed\s+(?:job|placement|selection)|no\s+interview\s+(?:needed|required|direct\s+joining)|direct\s+selection|limited\s+slots?\s+hurry|only\s+\d+\s+seats?\s+left|urgent\s+hiring\s+apply\s+immediately|make\s+money\s+fast|earn\s+\$?\d{3,}\s+per\s+day\s+without\s+effort/i,
    reason: (match: string) => `Employs false guarantees or high-pressure urgency ("${match}")`,
  },
];

// ── Helpers ──

function extractEmail(text: string): string {
  const match = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return match ? match[0].toLowerCase() : "";
}

function extractWebsite(text: string): string {
  const match = text.match(/https?:\/\/[^\s/$.?#].[^\s]*/i);
  return match ? match[0] : "";
}

function extractSalaryText(text: string): string {
  const match = text.match(
    /(?:₹|\$|Rs\.?|INR|USD)\s*[\d,]+(?:\.\d+)?\s*(?:LPA|lakh|crore|k|per month|\/month|pm|per day|\/day|daily|weekly|hourly|\/hr)?/i,
  );
  return match ? match[0] : "";
}

function emailMatchesCompany(emailDomain: string, company: string): boolean {
  if (!emailDomain || !company) return false;
  const domainRoot = emailDomain.replace(/\.[^.]+$/, "").toLowerCase();
  const companyClean = company.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (companyClean.length < 3) return false;
  return domainRoot.includes(companyClean) || companyClean.includes(domainRoot);
}

function isUnrealisticSalary(raw: string, titleAndDesc: string): boolean {
  if (!raw) return false;
  const cleanNum = parseFloat(raw.replace(/[^0-9.]/g, ""));
  if (!cleanNum || cleanNum <= 0) return false;

  const hasLakhOrLpa = /lakh|lpa/i.test(raw);
  const hasRupee = /₹|rs|inr/i.test(raw);
  const hasPerMonth = /month|pm/i.test(raw);
  const hasPerDay = /day|daily/i.test(raw);
  const hasDollar = /\$|usd/i.test(raw);

  // Check for intern or entry-level roles
  const isEntryRole =
    /intern|student|trainee|fresher|data\s+entry|typing|assistant|beginner/i.test(
      titleAndDesc,
    );

  // Daily payout anomalies (e.g., earn 5000/day for data entry or internship)
  if (hasPerDay && cleanNum >= (hasRupee ? 3000 : 300) && isEntryRole) return true;

  // Indian currency analysis
  if (hasLakhOrLpa) {
    return isEntryRole ? cleanNum > 30 : cleanNum > 70;
  }
  if (hasRupee && hasPerMonth) {
    return isEntryRole ? cleanNum > 100_000 : cleanNum > 300_000;
  }

  // USD / generic monthly analysis
  if (hasDollar || (!hasRupee && !hasLakhOrLpa)) {
    if (hasPerMonth) return isEntryRole ? cleanNum > 10_000 : cleanNum > 25_000;
    // Annual generic
    return isEntryRole ? cleanNum > 120_000 : cleanNum > 500_000;
  }

  return false;
}

// ── Core Analyser ──

export function analyzeJob(input: JobInput): ScamResult {
  const title = (input.title ?? "").trim();
  const company = (input.company ?? "").trim();
  const rawDescription = (input.description ?? "").trim();

  // Combine full text for contextual extraction
  const fullText = `${title} ${company} ${rawDescription}`;
  const textLower = fullText.toLowerCase();

  // Extract fields if not explicitly provided
  const email = (input.email || extractEmail(fullText)).trim().toLowerCase();
  const website = (input.website || extractWebsite(fullText)).trim();
  const salary = (input.salary || extractSalaryText(fullText)).trim();

  const reasons: string[] = [];
  const positives: string[] = [];
  const triggeredSignals: { name: string; weight: number; triggered: boolean }[] = [];

  let accumulatedRisk = 0;
  let hasCriticalFlag = false;

  // 1. Scan for pattern-based scam indicators in text
  for (const pattern of SCAM_PATTERNS) {
    const match = fullText.match(pattern.regex);
    if (match) {
      const matchText = match[0].trim();
      reasons.push(pattern.reason(matchText));
      triggeredSignals.push({
        name: pattern.category,
        weight: pattern.weight,
        triggered: true,
      });
      accumulatedRisk += pattern.weight;
      if (pattern.weight >= 30) {
        hasCriticalFlag = true;
      }
    } else {
      triggeredSignals.push({
        name: pattern.category,
        weight: pattern.weight,
        triggered: false,
      });
    }
  }

  // 2. Email verification
  const emailDomain = email.split("@")[1]?.toLowerCase() ?? "";
  const isFreeEmail = (FREE_EMAIL_DOMAINS as readonly string[]).includes(emailDomain);
  const isCompanyDomainMatch = emailMatchesCompany(emailDomain, company);

  if (isFreeEmail) {
    reasons.push(`Uses free personal email domain (@${emailDomain}) for official correspondence`);
    triggeredSignals.push({ name: "Free Email Recruiter", weight: 18, triggered: true });
    accumulatedRisk += 18;
  } else if (emailDomain && isCompanyDomainMatch) {
    positives.push(`Corporate email domain (@${emailDomain}) aligns with company name`);
    triggeredSignals.push({ name: "Free Email Recruiter", weight: 18, triggered: false });
  } else {
    triggeredSignals.push({ name: "Free Email Recruiter", weight: 18, triggered: false });
  }

  // 3. Salary analysis
  const unrealisticSalary = isUnrealisticSalary(salary, `${title} ${rawDescription}`);
  if (unrealisticSalary) {
    reasons.push(`Compensation (${salary}) is unrealistically high for the role`);
    triggeredSignals.push({ name: "Unrealistic Compensation", weight: 20, triggered: true });
    accumulatedRisk += 20;
  } else if (salary && !unrealisticSalary) {
    positives.push(`Clear and realistic compensation structure specified (${salary})`);
    triggeredSignals.push({ name: "Unrealistic Compensation", weight: 20, triggered: false });
  } else {
    triggeredSignals.push({ name: "Unrealistic Compensation", weight: 20, triggered: false });
  }

  // 4. Website and domain validation
  const noWebsite = !website || website.length < MIN_WEBSITE_LENGTH;
  const isHttpInsecure = Boolean(website) && website.startsWith("http://");

  if (noWebsite) {
    reasons.push("No official corporate website or domain provided");
    triggeredSignals.push({ name: "Missing Website", weight: 12, triggered: true });
    accumulatedRisk += 12;
  } else if (isHttpInsecure) {
    reasons.push("Website URL uses unencrypted HTTP instead of secure HTTPS");
    triggeredSignals.push({ name: "Missing Website", weight: 12, triggered: true });
    accumulatedRisk += 12;
  } else {
    positives.push("Verifiable company website provided over HTTPS");
    triggeredSignals.push({ name: "Missing Website", weight: 12, triggered: false });
  }

  // 5. Description depth and substance analysis
  const isTooShort = rawDescription.length < 100;
  const hasJobSkillsOrDuties =
    /(?:responsibilities|requirements|qualifications|skills|role|eligibility|duties|what you will do|experience)/i.test(
      rawDescription,
    );

  if (isTooShort) {
    reasons.push("Job description is very brief and lacks role specifics");
    triggeredSignals.push({ name: "Vague Description", weight: 12, triggered: true });
    accumulatedRisk += 12;
  } else if (!hasJobSkillsOrDuties && !hasCriticalFlag) {
    reasons.push("Posting lacks structured job responsibilities or qualifications");
    triggeredSignals.push({ name: "Vague Description", weight: 8, triggered: true });
    accumulatedRisk += 8;
  } else {
    triggeredSignals.push({ name: "Vague Description", weight: 12, triggered: false });
    // Only praise description if no critical scam markers exist
    if (!hasCriticalFlag && accumulatedRisk < 30) {
      positives.push("Structured job description with clear expectations provided");
    }
  }

  // 6. Company identity check
  const missingCompany = company.length < MIN_COMPANY_NAME_LENGTH;
  if (missingCompany) {
    reasons.push("Company name is omitted or incomplete");
    triggeredSignals.push({ name: "Missing Company Info", weight: 10, triggered: true });
    accumulatedRisk += 10;
  } else {
    triggeredSignals.push({ name: "Missing Company Info", weight: 10, triggered: false });
  }

  // Ensure critical flags trigger at least High or High-Medium risk
  if (hasCriticalFlag && accumulatedRisk < RISK_HIGH_THRESHOLD) {
    accumulatedRisk = Math.max(accumulatedRisk, 65);
  }

  // Final score clamping
  const probability = Math.min(MAX_PROBABILITY, Math.max(0, accumulatedRisk));
  const risk: ScamResult["risk"] =
    probability >= RISK_HIGH_THRESHOLD
      ? "High"
      : probability >= RISK_MEDIUM_THRESHOLD
        ? "Medium"
        : "Low";

  const safe = probability < RISK_MEDIUM_THRESHOLD;

  return {
    probability,
    risk,
    safe,
    reasons,
    positives,
    signals: triggeredSignals,
  };
}
