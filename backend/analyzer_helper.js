// Scam pattern definitions for Node server
const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "rediffmail.com", "aol.com", "mail.com", "protonmail.com", "zoho.com"
]);

const SCAM_PATTERNS = [
  {
    name: "Registration Fee",
    weight: 35,
    regex: /(?:registration|processing|training|application|onboarding|interview|exam|badge|kit|material|equipment|security)\s+(?:fee|charge|deposit|amount|cost|payment)|pay\s+to\s+apply|investment\s+required/i
  },
  {
    name: "Credential Request",
    weight: 35,
    regex: /(?:share|send|enter|provide)\s+(?:your\s+)?(?:otp|upi\s*pin|password|bank\s+account\s+details|debit\s+card|credit\s+card)|bank\s+login\s+details/i
  },
  {
    name: "Suspicious Payment Method",
    weight: 25,
    regex: /western\s+union|money\s*gram|cryptocurrency|bitcoin|usdt|gift\s+card|wire\s+transfer/i
  },
  {
    name: "Unofficial Messaging",
    weight: 20,
    regex: /(?:whatsapp\s+only|telegram\s+only|wa\.me\/|t\.me\/|contact\s+(?:via|on)\s+whatsapp)/i
  },
  {
    name: "Task Scam",
    weight: 25,
    regex: /(?:like\s+(?:and|&)\s+subscribe|youtube\s+video\s+review|daily\s+task\s+earning|ad\s+clicking|copy\s+paste\s+work)/i
  },
  {
    name: "Unrealistic Guarantee",
    weight: 15,
    regex: /(?:100%\s+guaranteed\s+job|direct\s+selection|no\s+interview\s+needed|earn\s+\d+\s+per\s+day\s+without\s+experience)/i
  }
];

export function analyzeJobTextNode(title, company, website, description, email, salary) {
  const fullText = `${title} ${company} ${description} ${email} ${salary}`.toLowerCase();
  const reasons = [];
  const positives = [];
  const signals = [];
  let score = 0;
  let hasCritical = false;

  for (const pattern of SCAM_PATTERNS) {
    const match = fullText.match(pattern.regex);
    const triggered = Boolean(match);
    if (triggered) {
      reasons.push(`${pattern.name} detected: "${match[0]}"`);
      score += pattern.weight;
      if (pattern.weight >= 35) hasCritical = true;
    }
    signals.push({ name: pattern.name, weight: pattern.weight, triggered });
  }

  const emailDomain = (email || "").split("@")[1]?.toLowerCase() || "";
  const isFree = FREE_EMAIL_DOMAINS.has(emailDomain);
  if (isFree) {
    reasons.push(`Uses free personal email domain (@${emailDomain})`);
    score += 15;
    signals.push({ name: "Free Email Domain", weight: 15, triggered: true });
  } else {
    signals.push({ name: "Free Email Domain", weight: 15, triggered: false });
    if (emailDomain) positives.push(`Professional corporate email domain (@${emailDomain})`);
  }

  if (!website || website.length < 5) {
    reasons.push("No official company website provided");
    score += 10;
    signals.push({ name: "Missing Website", weight: 10, triggered: true });
  } else {
    signals.push({ name: "Missing Website", weight: 10, triggered: false });
    positives.push("Company website provided");
  }

  if (hasCritical && score < 60) score = 65;

  const probability = Math.min(98, score);
  const risk = probability >= 60 ? "High" : probability >= 30 ? "Medium" : "Low";
  const safe = probability < 30;

  return {
    probability,
    risk,
    safe,
    trust_score: Math.max(0, 100 - probability),
    reasons,
    positives,
    signals,
    recommendations: [
      "Never pay any registration or training fee for a job.",
      "Do not share OTP, PIN, or banking credentials.",
      "Verify the company via its official website.",
    ]
  };
}

export function analyzeScreenshotNode(imageBuffer, filename) {
  // Extract text or simulate OCR text from screenshot
  // In demo node mode, we analyze the buffer size / signature or provide rich OCR text
  const demoExtractedText = `URGENT HIRING! Work From Home Data Entry Operator. FastCash Hiring Pvt Ltd. Earn Rs 50,000 per month. Pay registration fee of Rs 999 via UPI. Contact via WhatsApp only at wa.me/99999999. 100% guaranteed job offer. fastcash@gmail.com`;

  const analysis = analyzeJobTextNode(
    "Data Entry Intern",
    "FastCash Hiring",
    "",
    demoExtractedText,
    "fastcash@gmail.com",
    "₹50,000/month"
  );

  return {
    extracted_text: demoExtractedText,
    ...analysis
  };
}
