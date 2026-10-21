import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Loader2, MessageCircle, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Message = { role: "user" | "bot"; text: string };

type Intent = {
  name: string;
  keywords: string[];
  answer: string;
};

const MIN_REPLY_DELAY_MS = 1500;

const INTENTS: Intent[] = [
  {
    name: "payment-scam",
    keywords: [
      "fee",
      "fees",
      "pay",
      "payment",
      "deposit",
      "registration",
      "training fee",
      "security amount",
      "money",
      "upi",
      "refund",
    ],
    answer:
      "If a company asks you to pay a registration fee, training fee, security deposit, laptop fee, or refundable amount before joining, treat it as high risk. Real employers pay candidates; they do not charge candidates to get hired. Do not pay, save screenshots, verify the company domain, and report it.",
  },
  {
    name: "email-domain",
    keywords: [
      "email",
      "gmail",
      "yahoo",
      "outlook",
      "domain",
      "mail",
      "recruiter email",
      "hr email",
    ],
    answer:
      "Check whether the recruiter uses an official company domain, such as hr@company.com. Free email addresses like Gmail/Yahoo/Outlook are not always scams, but they are suspicious for formal hiring. Cross-check the email domain with the company's official website and LinkedIn page.",
  },
  {
    name: "whatsapp-telegram",
    keywords: [
      "whatsapp",
      "telegram",
      "dm",
      "chat only",
      "message only",
      "no interview",
      "call only",
    ],
    answer:
      "WhatsApp or Telegram-only hiring is a major warning sign, especially if there is no official email, interview process, offer letter, or company website. Ask for communication from an official company email and verify the recruiter profile before sharing documents.",
  },
  {
    name: "salary",
    keywords: [
      "salary",
      "stipend",
      "ctc",
      "package",
      "lpa",
      "lpm",
      "income",
      "earn",
      "too good",
      "work from home",
    ],
    answer:
      "Very high salary or stipend promises for freshers, part-time work, or simple data-entry roles are risky. Compare the offer with market rates, check the role requirements, and be extra careful if the offer also asks for payment, documents, or urgent joining.",
  },
  {
    name: "documents",
    keywords: [
      "aadhaar",
      "pan",
      "bank",
      "otp",
      "kyc",
      "documents",
      "passport",
      "account number",
      "upi pin",
      "personal details",
    ],
    answer:
      "Never share OTPs, UPI PINs, passwords, bank details, or full identity documents with an unverified recruiter. For legitimate hiring, sensitive documents are usually collected after formal selection through official HR systems, not random chat links.",
  },
  {
    name: "company-verification",
    keywords: [
      "verify",
      "verification",
      "company",
      "real company",
      "fake company",
      "website",
      "linkedin",
      "glassdoor",
      "blacklist",
    ],
    answer:
      "To verify a company, check its official website, domain age, LinkedIn page, employee profiles, office address, reviews, and whether the job exists on the company's own careers page. You can also use Company Verification in this app to compare it with verified and blacklisted records.",
  },
  {
    name: "report-scam",
    keywords: [
      "report",
      "complaint",
      "submit",
      "scam report",
      "blacklist",
      "fraud",
      "fake job",
      "fake internship",
    ],
    answer:
      "Use the Report Scam page to submit the company name, recruiter contact, screenshots, source link, and what they asked you to do. Strong evidence includes payment requests, fake offer letters, suspicious links, and chat screenshots.",
  },
  {
    name: "how-detector-works",
    keywords: [
      "how",
      "work",
      "detect",
      "analysis",
      "score",
      "risk",
      "ai",
      "signals",
      "probability",
    ],
    answer:
      "The detector checks multiple scam signals: suspicious phrases, payment requests, free email domains, unrealistic salary, missing website, vague job description, WhatsApp-only communication, and company reputation. It combines those signals into a risk level and explains the red flags.",
  },
  {
    name: "safe-steps",
    keywords: [
      "what should i do",
      "safe",
      "protect",
      "avoid",
      "next step",
      "steps",
      "help",
      "advice",
    ],
    answer:
      "Before applying, verify the company website, search the recruiter on LinkedIn, avoid paying any fee, do not share OTPs or banking details, compare salary with market rates, and run the job post through Analyze Job. If anything feels urgent or secretive, pause and verify first.",
  },
];

const FALLBACK_ANSWER =
  "I can help with fake internship and job scam checks. Ask about payment requests, suspicious emails, WhatsApp hiring, salary red flags, document safety, company verification, reporting scams, or how the detector works.";

function normalize(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\w\s@.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreIntent(query: string, intent: Intent) {
  return intent.keywords.reduce((score, keyword) => {
    const normalizedKeyword = normalize(keyword);
    if (!normalizedKeyword) return score;
    if (query === normalizedKeyword) return score + 5;
    if (query.includes(normalizedKeyword))
      return score + (normalizedKeyword.includes(" ") ? 4 : 2);
    return score;
  }, 0);
}

function generateReply(rawQuery: string) {
  const query = normalize(rawQuery);
  if (!query) return FALLBACK_ANSWER;

  const ranked = INTENTS.map((intent) => ({ intent, score: scoreIntent(query, intent) })).sort(
    (a, b) => b.score - a.score,
  );

  if (ranked[0]?.score > 0) return ranked[0].intent.answer;

  if (query.includes("internship") || query.includes("job") || query.includes("offer")) {
    return "For any internship or job offer, first verify the company, recruiter email, salary realism, interview process, and whether they ask for money or sensitive documents. Paste the posting into Analyze Job for a structured risk check.";
  }

  return FALLBACK_ANSWER;
}

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="max-w-[86%] rounded-2xl bg-muted px-3 py-3 text-sm shadow-sm">
        <div className="mb-2 flex items-center gap-2 text-xs font-medium text-primary">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Analyzing your question...
        </div>
        <div className="flex items-center gap-1">
          <span className="h-2 w-2 animate-bounce rounded-full bg-primary/70" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-primary/70 [animation-delay:120ms]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-primary/70 [animation-delay:240ms]" />
          <span className="ml-2 text-xs text-muted-foreground">Checking scam signals</span>
        </div>
      </div>
    </div>
  );
}

export function Chatbot() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "bot",
      text: "Hi! I'm ShieldBot. Ask me anything about spotting fake internships and job scams.",
    },
  ]);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const canSend = useMemo(() => input.trim().length > 0 && !loading, [input, loading]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  // Focus input when panel opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const send = async () => {
    if (!canSend) return;

    const userMsg = input.trim();
    const startedAt = performance.now();
    setInput("");
    setLoading(true);
    setMessages((current) => [...current, { role: "user", text: userMsg }]);

    const reply = generateReply(userMsg);
    const elapsed = performance.now() - startedAt;
    const remainingDelay = Math.max(MIN_REPLY_DELAY_MS - elapsed, 0);

    window.setTimeout(() => {
      setMessages((current) => [...current, { role: "bot", text: reply }]);
      setLoading(false);
    }, remainingDelay);
  };

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-cyber text-primary-foreground shadow-glow transition-transform hover:scale-110"
        aria-label={open ? "Close chat" : "Open chat"}
        aria-expanded={open}
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Chat with ShieldBot"
          className="glass fixed bottom-24 right-6 z-50 flex h-[480px] w-[340px] max-w-[calc(100vw-2rem)] animate-in flex-col rounded-2xl shadow-card fade-in slide-in-from-bottom-4"
        >
          <div className="flex items-center gap-2 border-b border-border p-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-cyber">
              <Bot className="h-4 w-4 text-primary-foreground" />
            </div>
            <div>
              <div className="text-sm font-semibold">ShieldBot</div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />{" "}
                {loading ? "Typing..." : "Online"}
              </div>
            </div>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                    message.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                  }`}
                >
                  {message.text}
                </div>
              </div>
            ))}
            {loading && <TypingIndicator />}
            <div ref={messagesEndRef} />
          </div>
          <div className="flex gap-2 border-t border-border p-3">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") send();
                if (e.key === "Escape") setOpen(false);
              }}
              placeholder={loading ? "ShieldBot is typing..." : "Ask about scams..."}
              className="text-sm"
              disabled={loading}
            />
            <Button size="icon" onClick={send} disabled={!canSend} aria-label="Send message">
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}