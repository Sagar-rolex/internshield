import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Zap,
  TrendingUp,
  FileText,
  Image as ImageIcon,
  Upload,
  X,
  RotateCw,
  ScanLine,
  Eye,
  Info,
  Brain,
  Download,
} from "lucide-react";
import { generatePdfReport } from "@/lib/pdf-export";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { analyzeJob, type JobInput } from "@/lib/scam-detector";
import { ProtectedRoute } from "@/components/AuthProvider";
import { api, type AnalysisResult } from "@/lib/api";

export const Route = createFileRoute("/detect")({
  head: () => ({
    meta: [
      { title: "Scam Detector — Analyze Any Job Posting | ScamShield.AI" },
      {
        name: "description",
        content: "Paste job details or upload a screenshot — our AI scores scam probability in real-time.",
      },
    ],
  }),
  component: DetectRoute,
});

function DetectRoute() {
  return (
    <ProtectedRoute role="user">
      <Detect />
    </ProtectedRoute>
  );
}

// ── Constants ────────────────────────────────────────────────────────────────

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/jpg", "image/webp"]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

const MANUAL_STEPS = [
  "Checking scam indicators...",
  "Analyzing with AI...",
  "Preparing your safety report...",
] as const;

const SCREENSHOT_STEPS = [
  "Uploading screenshot...",
  "Extracting text...",
  "Checking scam indicators...",
  "Analyzing with AI...",
  "Preparing your safety report...",
] as const;

// ── Main component ───────────────────────────────────────────────────────────

function Detect() {
  const [method, setMethod] = useState<"manual" | "screenshot">("manual");

  // Manual form state
  const [manualInput, setManualInput] = useState({
    title: "",
    company: "",
    website: "",
    description: "",
  });
  const [manualResult, setManualResult] = useState<AnalysisResult | null>(null);

  // Screenshot state
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const screenshotRef = useRef<string | null>(null);
  const [screenshotResult, setScreenshotResult] = useState<AnalysisResult | null>(null);

  // Shared analysis state
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  // Unified result — whichever method produced it
  const result: AnalysisResult | null = manualResult ?? screenshotResult;
  const activeSteps = method === "screenshot" ? SCREENSHOT_STEPS : MANUAL_STEPS;

  const handleManualChange = (
    key: keyof typeof manualInput,
    value: string,
  ) => setManualInput((prev) => ({ ...prev, [key]: value }));

  const handleMethodChange = (newMethod: "manual" | "screenshot") => {
    setMethod(newMethod);
    setLoading(false);
    setCurrentStep(0);
  };

  // ── Screenshot drag & drop ───────────────────────────────────────────────

  const setPreview = (file: File | null) => {
    if (screenshotRef.current) URL.revokeObjectURL(screenshotRef.current);
    screenshotRef.current = null;
    if (!file) {
      setScreenshotPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setScreenshotPreview(url);
    screenshotRef.current = url;
  };

  useEffect(() => {
    return () => {
      if (screenshotRef.current) URL.revokeObjectURL(screenshotRef.current);
    };
  }, []);

  const validateImage = (file: File): string | null => {
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      return "Unsupported file format. Please upload JPG, JPEG, PNG, or WEBP.";
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return "File is too large. Maximum size is 5 MB.";
    }
    return null;
  };

  const handleImageSelect = (file: File | null) => {
    if (!file) return;
    const error = validateImage(file);
    if (error) {
      toast.error(error);
      return;
    }
    setScreenshotFile(file);
    setPreview(file);
    setScreenshotResult(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    handleImageSelect(e.dataTransfer.files[0] ?? null);
  };

  const removeImage = () => {
    setScreenshotFile(null);
    setPreview(null);
    setScreenshotResult(null);
  };

  // ── Manual analysis ──────────────────────────────────────────────────────

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!manualInput.title.trim()) {
      toast.error("Please enter a job title.");
      return;
    }
    if (!manualInput.company.trim()) {
      toast.error("Please enter a company name.");
      return;
    }

    setLoading(true);
    setManualResult(null);
    setScreenshotResult(null);

    let stepInterval: number | null = null;
    try {
      // Animate steps
      setCurrentStep(0);
      stepInterval = window.setInterval(() => {
        setCurrentStep((s) => Math.min(s + 1, MANUAL_STEPS.length - 1));
      }, 400);

      let analysis: AnalysisResult | null = null;

      try {
        const res = await api.analyzeManual({
          title: manualInput.title,
          company: manualInput.company,
          website: manualInput.website,
          description: manualInput.description,
        });
        analysis = res.analysis;
        if (res.analysis) {
          const a: AnalysisResult = res.analysis;
          setManualResult(a);
        } else {
          throw new Error("No analysis returned from server.");
        }
      } catch (apiError: unknown) {
        if (apiError instanceof Error && (apiError as Error & { status?: number }).status === 401) {
          toast.error("Session expired. Please log in again.");
          setLoading(false);
          return;
        }
        // Backend unavailable — use client-side rule engine as graceful fallback
        const fallback: JobInput = {
          title: manualInput.title,
          company: manualInput.company,
          website: manualInput.website,
          description: manualInput.description,
          email: "",
          salary: "",
          workType: "Remote",
        };
        const local = analyzeJob(fallback);
        const mapped: AnalysisResult = {
          id: `local-${Date.now()}`,
          input_type: "manual",
          job_title: manualInput.title,
          company: manualInput.company,
          website: manualInput.website,
          description: manualInput.description,
          image_path: "",
          extracted_text: "",
          probability: local.probability,
          risk: local.risk,
          safe: local.safe,
          trust_score: Math.max(0, 100 - local.probability),
          reasons: [...local.reasons],
          positives: [...local.positives],
          keywords: local.reasons.length
            ? [local.reasons[0]]
            : [],
          signals: local.signals.map((s) => ({
            name: s.name,
            weight: s.weight,
            triggered: s.triggered,
          })),
          ai: {
            available: false,
            reason: "AI analysis temporarily unavailable. Showing rule-based results.",
          },
          recommendations: local.safe
            ? [
                "This posting looks reasonable — verify via the official website before applying.",
                "Never share OTPs or banking credentials with recruiters.",
              ]
            : [
                "Do not pay any registration or processing fee.",
                "Verify the company through its official website.",
                "Do not share OTP, PIN, or banking credentials.",
              ],
          ocr_mode: "manual",
          created_at: new Date().toISOString(),
        };
        analysis = mapped;
        setManualResult(mapped);
        toast.info(
          "Backend unavailable — showing local analysis (rule-based only).",
        );
      }

      if (analysis) {
        toast[analysis.safe ? "success" : "warning"](
          analysis.safe
            ? "Looks legitimate"
            : `${analysis.risk} risk detected — ${analysis.probability}% scam probability`,
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Analysis failed. Please try again.";
      toast.error(msg);
    } finally {
      if (stepInterval !== null) window.clearInterval(stepInterval);
      setLoading(false);
      setCurrentStep(0);
    }
  };

  // ── Screenshot analysis ──────────────────────────────────────────────────

  const handleScreenshotSubmit = async () => {
    if (!screenshotFile) {
      toast.error("Please upload a screenshot.");
      return;
    }

    setLoading(true);
    setScreenshotResult(null);
    setManualResult(null);

    let stepInterval: number | null = null;
    try {
      setCurrentStep(0);
      stepInterval = window.setInterval(() => {
        setCurrentStep((s) => Math.min(s + 1, SCREENSHOT_STEPS.length - 1));
      }, 500);

      try {
        await new Promise((r) => setTimeout(r, 800)); // brief UX delay so steps are visible
        const payload = await api.analyzeScreenshot(screenshotFile);

        if (!payload || typeof payload.probability !== "number") {
          throw new Error("OCR or analysis failed. Please try a clearer image.");
        }

        if (payload.ocr_warning) {
          toast.warning(payload.ocr_warning);
        }

        setScreenshotResult(payload);
        toast[payload.safe ? "success" : "warning"](
          payload.safe
            ? "Screenshot looks legitimate — low risk."
            : `${payload.risk} risk detected — ${payload.probability}% scam probability`,
        );
      } catch (apiError: unknown) {
        const msg =
          apiError instanceof Error
            ? apiError.message
            : "Screenshot analysis failed. Please try again.";
        const status =
          apiError instanceof Error
            ? (apiError as Error & { status?: number }).status
            : undefined;
        if (status === 401) {
          toast.error("Session expired. Please log in again.");
        } else {
          toast.error(msg);
        }
        return;
      }
    } finally {
      if (stepInterval !== null) window.clearInterval(stepInterval);
      setLoading(false);
      setCurrentStep(0);
    }
  };

  return (
    <div className="container mx-auto px-4 py-12 max-w-6xl">
      {/* Header */}
      <div className="text-center mb-8">
        <Badge variant="outline" className="mb-3 border-primary/40 text-primary">
          <Shield className="h-3 w-3 mr-1.5" /> AI Detector
        </Badge>
        <h1 className="text-4xl md:text-5xl font-bold">
          Analyze a <span className="text-gradient-cyber">Job Posting</span>
        </h1>
        <p className="text-muted-foreground mt-3 max-w-xl mx-auto">
          Choose how you want to check — enter details manually or upload a screenshot and let
          us do the rest.
        </p>
      </div>

      {/* Method selector */}
      <Card className="p-6 md:p-7 mb-6">
        <h2 className="font-semibold text-base mb-4">How would you like to analyze the job?</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <MethodCard
            selected={method === "manual"}
            icon={FileText}
            title="Enter Job Details"
            description="Manually enter the basic information about the job or internship."
            onClick={() => handleMethodChange("manual")}
          />
          <MethodCard
            selected={method === "screenshot"}
            icon={ImageIcon}
            title="Upload Screenshot"
            description="Upload a screenshot and let the system extract and analyze the information."
            onClick={() => handleMethodChange("screenshot")}
          />
        </div>
      </Card>

      {/* Main content: form + results */}
      <div className="grid lg:grid-cols-5 gap-6">
        {/* Left: active form */}
        <div className="lg:col-span-3">
          {loading ? (
            <AnalyzeSteps
              steps={[...activeSteps]}
              currentStep={currentStep}
            />
          ) : method === "manual" ? (
            <ManualForm
              input={manualInput}
              onChange={handleManualChange}
              onSubmit={handleManualSubmit}
              loading={false}
            />
          ) : (
            <ScreenshotUpload
              file={screenshotFile}
              preview={screenshotPreview}
              onFileSelect={handleImageSelect}
              onDrop={handleDrop}
              onRemove={removeImage}
              onAnalyze={handleScreenshotSubmit}
            />
          )}
        </div>

        {/* Right: results */}
        <div className="lg:col-span-2 space-y-4">
          {loading && (
            <Card className="p-8 text-center">
              <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto mb-4" />
              <div className="font-semibold">Running analysis...</div>
              <p className="text-xs text-muted-foreground mt-1">
                This should take just a few seconds.
              </p>
            </Card>
          )}

          {!loading && !result && (
            <Card className="p-8 text-center border-dashed">
              <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <div className="font-semibold">Awaiting analysis</div>
              <div className="text-sm text-muted-foreground mt-2">
                Submit the {method === "manual" ? "form" : "screenshot"} to see your safety report.
              </div>
            </Card>
          )}

          {!loading && result && <ResultView result={result} screenshotPreview={screenshotPreview} />}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function MethodCard({
  selected,
  icon: Icon,
  title,
  description,
  onClick,
}: {
  selected: boolean;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={
        "text-left rounded-xl border-2 p-5 transition-all flex gap-4 items-start " +
        (selected
          ? "border-primary bg-primary/5 shadow-glow"
          : "border-border hover:border-primary/50 hover:bg-muted/50")
      }
    >
      <span
        className={
          "flex h-11 w-11 items-center justify-center rounded-lg shrink-0 " +
          (selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")
        }
      >
        <Icon className="h-5 w-5" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="font-semibold text-sm block">{title}</span>
        <span className="text-xs text-muted-foreground mt-1 block leading-relaxed">
          {description}
        </span>
      </span>
      <span
        aria-hidden
        className={
          "h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 " +
          (selected
            ? "border-primary bg-primary"
            : "border-muted-foreground/30")
        }
      >
        {selected && <span className="h-2 w-2 rounded-full bg-white" />}
      </span>
    </button>
  );
}

function ManualForm({
  input,
  onChange,
  onSubmit,
  loading,
}: {
  input: { title: string; company: string; website: string; description: string };
  onChange: (k: keyof typeof input, v: string) => void;
  onSubmit: (e: React.FormEvent) => Promise<void>;
  loading: boolean;
}) {
  const loadExample = () => {
    onChange("title", "Work From Home Data Entry Job");
    onChange("company", "FastCash Hiring");
    onChange("website", "");
    onChange(
      "description",
      "Urgent hiring! No experience needed. Earn $$$ from home. Pay registration fee of ₹999 to confirm slot. WhatsApp only.",
    );
    toast.info("Example scam loaded — click Analyze");
  };

  return (
    <Card className="p-6 md:p-8">
      <form onSubmit={onSubmit} className="space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">Job Details</h2>
          <Button type="button" variant="ghost" size="sm" onClick={loadExample}>
            Try example
          </Button>
        </div>

        <div className="space-y-2">
          <Label htmlFor="detect-title">Job Title *</Label>
          <Input
            id="detect-title"
            value={input.title}
            onChange={(e) => onChange("title", e.target.value)}
            placeholder="e.g. Software Development Intern"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="detect-company">Company Name *</Label>
          <Input
            id="detect-company"
            value={input.company}
            onChange={(e) => onChange("company", e.target.value)}
            placeholder="e.g. Acme Technologies"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="detect-website">Company Website</Label>
          <Input
            id="detect-website"
            type="text"
            value={input.website}
            onChange={(e) => onChange("website", e.target.value)}
            placeholder="https://company.com"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="detect-description">Job Description</Label>
          <Textarea
            id="detect-description"
            rows={5}
            value={input.description}
            onChange={(e) => onChange("description", e.target.value)}
            placeholder="Paste the full job or internship description here..."
          />
        </div>

        <Button
          type="submit"
          size="lg"
          disabled={loading}
          className="w-full bg-gradient-cyber shadow-glow h-12 text-base"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Analyzing...
            </>
          ) : (
            <>
              <Zap className="mr-2 h-5 w-5" /> Analyze Job Posting
            </>
          )}
        </Button>
      </form>
    </Card>
  );
}

function ScreenshotUpload({
  file,
  preview,
  onFileSelect,
  onDrop,
  onRemove,
  onAnalyze,
}: {
  file: File | null;
  preview: string | null;
  onFileSelect: (f: File | null) => void;
  onDrop: (e: React.DragEvent) => void;
  onRemove: () => void;
  onAnalyze: () => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const openPicker = () => inputRef.current?.click();

  return (
    <Card className="p-6 md:p-8">
      <h2 className="font-semibold text-lg">Upload Job Posting Screenshot</h2>
      <p className="text-sm text-muted-foreground mt-2">
        Have a screenshot of a suspicious posting? Upload it and we&apos;ll extract the text and
        check it for scam indicators.
      </p>

      {!file && (
        <>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              setDragOver(false);
              onDrop(e);
            }}
            onClick={openPicker}
            role="button"
            tabIndex={0}
            aria-label="Upload screenshot: drag and drop or click to browse"
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openPicker();
              }
            }}
            className={
              "mt-6 rounded-xl border-2 border-dashed p-8 md:p-10 flex flex-col items-center text-center cursor-pointer transition-colors " +
              (dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/40")
            }
          >
            <Upload className="h-10 w-10 text-muted-foreground" />
            <div className="font-semibold mt-3">Drag &amp; drop your screenshot here</div>
            <div className="text-sm text-muted-foreground mt-1">or click to browse</div>
            <div className="text-xs text-muted-foreground mt-3">
              Supported: JPG, JPEG, PNG · Maximum size: 5 MB
            </div>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => onFileSelect(e.target.files?.[0] ?? null)}
          />
        </>
      )}

      {file && preview && (
        <div className="mt-6 space-y-3">
          <img
            src={preview}
            alt="Uploaded job posting screenshot preview"
            className="w-full rounded-xl border object-contain max-h-72 bg-muted"
          />
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <div className="min-w-0">
              <div className="font-medium truncate">{file.name}</div>
              <div className="text-xs text-muted-foreground">
                {(file.size / 1024 / 1024).toFixed(2)} MB
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button type="button" variant="outline" size="sm" onClick={openPicker}>
                <RotateCw className="mr-2 h-4 w-4" /> Replace
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={onRemove}>
                <X className="mr-2 h-4 w-4" /> Remove
              </Button>
            </div>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => onFileSelect(e.target.files?.[0] ?? null)}
          />
          <Button
            size="lg"
            className="w-full bg-gradient-cyber shadow-glow h-12 text-base"
            onClick={onAnalyze}
          >
            <ScanLine className="mr-2 h-5 w-5" /> Analyze Screenshot
          </Button>
        </div>
      )}
    </Card>
  );
}

function AnalyzeSteps({
  steps,
  currentStep,
}: {
  steps: string[];
  currentStep: number;
}) {
  const icons: Record<number, React.ComponentType<{ className?: string }>> = {
    0: Upload,
    1: ScanLine,
    2: AlertTriangle,
    3: Brain,
    4: FileText,
  };

  return (
    <Card className="p-6 md:p-8">
      <div className="space-y-3">
        {steps.map((label, idx) => {
          const done = idx < currentStep;
          const active = idx === currentStep;
          const Icon = icons[idx] ?? Zap;

          return (
            <div
              key={label}
              className={
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm " +
                (active ? "bg-primary/10 text-primary font-medium" : done ? "text-foreground" : "text-muted-foreground")
              }
            >
              <span
                className={
                  "flex h-7 w-7 items-center justify-center rounded-full shrink-0 " +
                  (done
                    ? "bg-success text-white"
                    : active
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground")
                }
              >
                {done ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : active ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
              </span>
              {label}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ── Unified Result View ────────────────────────────────────────────────────

function ResultView({
  result,
  screenshotPreview,
}: {
  result: AnalysisResult;
  screenshotPreview: string | null;
}) {
  const riskColor =
    result.risk === "High"
      ? "destructive"
      : result.risk === "Medium"
        ? "warning"
        : "success";
  const Icon = result.safe ? ShieldCheck : ShieldAlert;
  const gradient = result.safe
    ? "bg-gradient-safe"
    : result.risk === "High"
      ? "bg-gradient-danger"
      : "bg-gradient-hero";

  // Some newer backend fields use different naming — normalize
  const probability = result.probability ?? 0;
  const trustScore = result.trust_score ?? Math.max(0, 100 - probability);
  const ruleScore = result.rule_score ?? 0;
  const aiScore = result.ai_score ?? 0;
  const finalScore = result.final_score ?? probability;

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Download PDF Action Bar */}
      <div className="flex items-center justify-between bg-muted/60 p-4 rounded-xl border border-border">
        <div>
          <h3 className="font-semibold text-sm">Safety Report Ready</h3>
          <p className="text-xs text-muted-foreground">Download the complete assessment as a professional PDF report.</p>
        </div>
        <Button
          onClick={() => {
            generatePdfReport(result);
            toast.success("PDF report generated and download initiated!");
          }}
          className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm gap-2"
        >
          <Download className="h-4 w-4" /> Download PDF Report
        </Button>
      </div>

      {/* OCR warning if demo engine was used */}
      {"ocr_warning" in result && (result as { ocr_warning?: string }).ocr_warning && (
        <Card className="p-3 border-warning/40 bg-warning/10 text-sm flex gap-2">
          <Info className="h-4 w-4 text-warning shrink-0 mt-0.5" />
          <span>{(result as { ocr_warning?: string }).ocr_warning}</span>
        </Card>
      )}

      {/* Score Breakdown — Hybrid Engine */}
      <Card className="p-4">
        <h3 className="font-semibold mb-3 text-sm">Hybrid Engine Scores</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-muted p-3 text-center">
            <div className="text-xs text-muted-foreground">Rule Engine</div>
            <div className="text-2xl font-bold tabular-nums text-primary">{ruleScore}</div>
            <div className="text-xs text-muted-foreground">0–98</div>
          </div>
          <div className="rounded-lg bg-muted p-3 text-center">
            <div className="text-xs text-muted-foreground">AI Analysis</div>
            <div className="text-2xl font-bold tabular-nums text-accent">{aiScore}</div>
            <div className="text-xs text-muted-foreground">0–100</div>
          </div>
          <div className="rounded-lg bg-muted p-3 text-center">
            <div className="text-xs text-muted-foreground">Final Score</div>
            <div className="text-2xl font-bold tabular-nums">
              {result.safe ? (
                <span className="text-success">{finalScore}</span>
              ) : (
                <span className="text-destructive">{finalScore}</span>
              )}
            </div>
            <div className="text-xs text-muted-foreground">0–100</div>
          </div>
        </div>
      </Card>

      {/* Probability card */}
      <Card className={`p-6 ${gradient} text-primary-foreground border-0 shadow-glow`}>
        <div className="flex items-center justify-between mb-3">
          <Icon className="h-10 w-10" />
          <Badge className="bg-white/20 text-white border-0">
            {result.safe ? "SAFE" : "UNSAFE"}
          </Badge>
        </div>
        <div className="text-5xl font-bold tabular-nums">{probability}%</div>
        <div className="text-sm opacity-90 mt-1">Scam Probability</div>
        <Progress value={probability} className="mt-4 bg-white/20" />
      </Card>

      {/* Risk + Trust */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Risk Level</div>
          <div className="flex items-center gap-2 mt-1">
            <Badge
              variant={riskColor === "destructive" ? "destructive" : "secondary"}
              className={
                riskColor === "success"
                  ? "bg-success/15 text-success"
                  : riskColor === "warning"
                    ? "bg-warning/20 text-warning-foreground"
                    : ""
              }
            >
              {result.risk}
            </Badge>
          </div>
          <div className="text-xl font-bold mt-1 flex items-center gap-1.5">
            <TrendingUp className="h-4 w-4 text-primary" /> {result.risk} Risk
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Trust Score</div>
          <div className="text-3xl font-bold mt-1 tabular-nums">{trustScore}%</div>
          <Progress value={trustScore} className="mt-3 h-2" />
        </Card>
      </div>

      {/* Why flagged */}
      {result.reasons.length > 0 && (
        <Card className="p-5 border-destructive/30">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <h3 className="font-semibold">Why this posting was flagged</h3>
          </div>
          <ul className="space-y-2">
            {result.reasons.map((r, i) => (
              <li key={i} className="text-sm flex gap-2">
                <span className="text-destructive mt-0.5 flex-shrink-0">●</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Suspicious keywords */}
      {(result.keywords.length > 0 || result.reasons.length > 0) && (
        <Card className="p-5">
          <h3 className="font-semibold mb-3 text-sm">Suspicious Keywords</h3>
          {result.keywords.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {result.keywords.map((k, i) => (
                <Badge key={i} variant="outline" className="border-destructive/40 text-destructive bg-destructive/5">
                  {k}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Detected scam phrases are shown inline in the red flags above (e.g. registration fee,
              processing fee, WhatsApp-only contact, guaranteed job).
            </p>
          )}
        </Card>
      )}

      {/* Rule-based analysis */}
      {result.signals.length > 0 && (
        <Card className="p-5">
          <h3 className="font-semibold mb-3 text-sm flex items-center gap-2">
            <Info className="h-4 w-4" /> Rule-Based Analysis
          </h3>
          <div className="space-y-2">
            {result.signals.map((s) => (
              <div key={s.name} className="flex items-center justify-between text-xs">
                <span
                  className={s.triggered ? "text-destructive font-medium" : "text-muted-foreground"}
                >
                  {s.triggered ? "●" : "○"} {s.name}
                </span>
                <span className="font-mono">{s.triggered ? `+${s.weight}` : "0"}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* AI analysis */}
      <Card className="p-5">
        <h3 className="font-semibold mb-3 text-sm flex items-center gap-2">
          <Brain className="h-4 w-4" /> AI Analysis
        </h3>
        {result.ai_findings && result.ai?.available ? (
          <div className="space-y-3">
            {result.ai_findings.explanation && (
              <div className="text-sm leading-relaxed whitespace-pre-wrap">
                {result.ai_findings.explanation}
              </div>
            )}
            {result.ai_findings.red_flags && result.ai_findings.red_flags.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-warning mb-2">Red Flags</div>
                <ul className="space-y-1">
                  {result.ai_findings.red_flags.map((f, i) => (
                    <li key={i} className="text-sm flex gap-2">
                      <span className="text-warning mt-0.5 shrink-0">◆</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {result.ai_findings.suspicious_evidence && result.ai_findings.suspicious_evidence.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-warning mb-2">Suspicious Evidence</div>
                <ul className="space-y-1">
                  {result.ai_findings.suspicious_evidence.map((e, i) => (
                    <li key={i} className="text-sm flex gap-2">
                      <span className="text-warning mt-0.5 shrink-0">◆</span>
                      <span>{e}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {result.ai_findings.confidence !== undefined && (
              <div className="text-xs text-muted-foreground">
                AI Confidence: {Math.round(result.ai_findings.confidence * 100)}%
              </div>
            )}
          </div>
        ) : result.ai?.available ? (
          <div className="text-sm leading-relaxed whitespace-pre-wrap">
            {result.ai.explanation || "No detailed explanation provided by the model."}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">
            {(result.ai_error || result.ai?.reason) ?? "AI analysis is temporarily unavailable."}
            {" We completed rule-based analysis — see the sections above."}
          </div>
        )}
      </Card>

      {/* Screenshot: Extracted text */}
      {result.input_type === "screenshot" && (
        <>
          {result.extracted_text && (
            <Card className="p-5">
              <h3 className="font-semibold mb-3 text-sm flex items-center gap-2">
                <Eye className="h-4 w-4" /> Extracted Text
              </h3>
              <div className="rounded-lg bg-muted p-4 text-sm whitespace-pre-wrap max-h-52 overflow-auto font-mono">
                {result.extracted_text}
              </div>
            </Card>
          )}
          {screenshotPreview && (
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" className="w-full">
                  <ImageIcon className="mr-2 h-4 w-4" /> View Original Screenshot
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl p-0 overflow-hidden">
                <DialogHeader className="px-6 pt-6">
                  <DialogTitle>Original Screenshot</DialogTitle>
                </DialogHeader>
                <div className="p-4 pt-0 overflow-auto max-h-[70vh]">
                  <img
                    src={screenshotPreview}
                    alt="Original uploaded screenshot"
                    className="w-full rounded-lg object-contain"
                  />
                </div>
              </DialogContent>
            </Dialog>
          )}
        </>
      )}

      {/* Positive signals */}
      {result.positives.length > 0 && (
        <Card className="p-5 border-success/30">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="h-5 w-5 text-success" />
            <h3 className="font-semibold">Positive Signals</h3>
          </div>
          <ul className="space-y-2">
            {result.positives.map((p, i) => (
              <li key={i} className="text-sm flex gap-2 text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-success flex-shrink-0 mt-0.5" />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Safety Recommendations */}
      <Card className="p-5">
        <h3 className="font-semibold mb-3 text-sm">Safety Recommendations</h3>
        <ul className="space-y-2">
          {result.recommendations.map((rec, i) => (
            <li key={i} className="text-sm flex gap-2">
              <ShieldCheck className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
              <span>{rec}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
