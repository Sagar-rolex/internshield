import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FileWarning, Upload, CheckCircle2, X } from "lucide-react";
import { toast } from "sonner";
import { ProtectedRoute } from "@/components/AuthProvider";

export const Route = createFileRoute("/report")({
  head: () => ({
    meta: [
      { title: "Report a Scam | ScamShield.AI" },
      {
        name: "description",
        content: "Help protect others — report suspicious job postings to our AI scam database.",
      },
    ],
  }),
  component: ReportRoute,
});

function ReportRoute() {
  return (
    <ProtectedRoute role="user">
      <Report />
    </ProtectedRoute>
  );
}

function Report() {
  const [submitted, setSubmitted] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const previewRef = useRef<string | null>(null);

  // Clean up blob URL on unmount or when file is removed
  useEffect(() => {
    return () => {
      if (previewRef.current) {
        URL.revokeObjectURL(previewRef.current);
        previewRef.current = null;
      }
    };
  }, []);

  const handleFile = (f: File | null) => {
    setFile(f);
    if (previewRef.current) {
      URL.revokeObjectURL(previewRef.current);
      previewRef.current = null;
    }
    if (f && f.type.startsWith("image/")) {
      const url = URL.createObjectURL(f);
      previewRef.current = url;
      setPreview(url);
    } else {
      setPreview(null);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    toast.success("Report submitted — thank you for protecting others!");
  };

  if (submitted) {
    return (
      <div className="container mx-auto px-4 py-20 max-w-xl text-center">
        <div className="h-20 w-20 rounded-full bg-success/15 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="h-10 w-10 text-success" />
        </div>
        <h1 className="text-3xl font-bold">Report Received</h1>
        <p className="text-muted-foreground mt-3">
          Our team will review this submission within 24 hours. If verified, the company will be
          added to the blacklist.
        </p>
        <Button
          className="mt-6"
          onClick={() => {
            setSubmitted(false);
            setFile(null);
            if (previewRef.current) {
              URL.revokeObjectURL(previewRef.current);
              previewRef.current = null;
            }
            setPreview(null);
          }}
        >
          Submit another report
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-12 max-w-3xl">
      <div className="text-center mb-10">
        <Badge variant="outline" className="mb-3 border-destructive/40 text-destructive">
          <FileWarning className="h-3 w-3 mr-1.5" /> Community Reporting
        </Badge>
        <h1 className="text-4xl md:text-5xl font-bold">
          Report a <span className="text-gradient-cyber">Scam Posting</span>
        </h1>
        <p className="text-muted-foreground mt-3">
          Help us add fraudulent companies to the public blacklist.
        </p>
      </div>

      <Card className="p-6 md:p-8">
        <form onSubmit={submit} className="space-y-5">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="company">Company Name *</Label>
              <Input id="company" required placeholder="e.g. FastCash Hiring" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="jobTitle">Job Title</Label>
              <Input id="jobTitle" placeholder="e.g. Marketing Intern" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="recruiter">Recruiter Email / Phone</Label>
              <Input id="recruiter" placeholder="hr@scam.com or +91..." />
            </div>
            <div className="space-y-2">
              <Label htmlFor="source">Source (where you saw it)</Label>
              <Input id="source" placeholder="LinkedIn / WhatsApp / Email" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="details">What happened? *</Label>
            <Textarea
              id="details"
              required
              rows={5}
              placeholder="Describe the scam — what they asked for, red flags you noticed, etc."
            />
          </div>

          <div className="space-y-2">
            <Label>Screenshot (optional)</Label>
            {!file ? (
              <label
                className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-lg p-8 cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors"
              >
                <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                <span className="text-sm font-medium">Click to upload</span>
                <span className="text-xs text-muted-foreground mt-1">PNG, JPG up to 10MB</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
                />
              </label>
            ) : (
              <div className="relative rounded-lg border border-border p-3 flex items-center gap-3">
                {preview && (
                  <img src={preview} alt="Screenshot preview" className="h-16 w-16 object-cover rounded" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{file.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {(file.size / 1024).toFixed(1)} KB
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => handleFile(null)}
                  aria-label="Remove screenshot"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          <Button type="submit" size="lg" className="w-full bg-gradient-cyber shadow-glow h-12">
            <FileWarning className="mr-2 h-5 w-5" /> Submit Report
          </Button>
        </form>
      </Card>
    </div>
  );
}