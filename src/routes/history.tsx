import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  CalendarDays,
  Download,
  History as HistoryIcon,
  Loader2,
  ShieldAlert,
  Image as ImageIcon,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { ProtectedRoute } from "@/components/AuthProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, type AnalysisResult } from "@/lib/api";

export const Route = createFileRoute("/history")({
  component: HistoryRoute,
});

function HistoryRoute() {
  return (
    <ProtectedRoute role="user">
      <HistoryContent />
    </ProtectedRoute>
  );
}

function HistoryContent() {
  const [analyses, setAnalyses] = useState<AnalysisResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AnalysisResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        const { analyses: rows } = await api.analyses();
        if (!cancelled) {
          setAnalyses(rows ?? []);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : "Could not load history.";
          setError(msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Badge variant="outline" className="mb-3 border-primary/40 text-primary">
            <HistoryIcon className="mr-1.5 h-3 w-3" /> Saved History
          </Badge>
          <h1 className="text-4xl font-bold">Analysis History</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Every analysis you run from the Detect page is saved here for review.
          </p>
        </div>
        <Button variant="outline" onClick={() => toast.info("History export will be available soon.")}>
          <Download className="mr-2 h-4 w-4" /> Export
        </Button>
      </div>

      <Card className="p-6">
        {loading && (
          <div className="flex items-center justify-center py-16 gap-3 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading history...
          </div>
        )}

        {!loading && error && (
          <div className="py-12 text-center space-y-3">
            <ShieldAlert className="h-8 w-8 text-destructive mx-auto" />
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                setError(null);
                setLoading(true);
                try {
                  const { analyses: rows } = await api.analyses();
                  setAnalyses(rows ?? []);
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Could not load history.");
                } finally {
                  setLoading(false);
                }
              }}
            >
              Retry
            </Button>
          </div>
        )}

        {!loading && !error && analyses.length === 0 && (
          <div className="py-12 text-center space-y-3">
            <HistoryIcon className="h-8 w-8 text-muted-foreground mx-auto" />
            <p className="text-sm font-medium">No analyses yet</p>
            <p className="text-xs text-muted-foreground">
              Go to Detect to run your first analysis — results will appear here.
            </p>
            <Button asChild size="sm">
              <a href="/detect">Analyze a posting</a>
            </Button>
          </div>
        )}

        {!loading && !error && analyses.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="px-2 py-3">Date</th>
                  <th className="px-2 py-3">Type</th>
                  <th className="px-2 py-3">Company / Title</th>
                  <th className="px-2 py-3">Risk</th>
                  <th className="px-2 py-3">Score</th>
                  <th className="px-2 py-3 text-right">Details</th>
                </tr>
              </thead>
              <tbody>
                {analyses.map((row) => (
                  <tr key={row.id} className="border-b border-border/50 hover:bg-muted/40">
                    <td className="px-2 py-3 whitespace-nowrap">
                      <CalendarDays className="mr-2 inline h-4 w-4 text-muted-foreground" />
                      {row.created_at || "—"}
                    </td>
                    <td className="px-2 py-3">
                      <Badge variant="outline" className="text-xs">
                        {row.input_type === "screenshot" ? (
                          <>
                            <ImageIcon className="mr-1 h-3 w-3" /> Screenshot
                          </>
                        ) : (
                          <>
                            <FileText className="mr-1 h-3 w-3" /> Manual
                          </>
                        )}
                      </Badge>
                    </td>
                    <td className="px-2 py-3 font-medium truncate max-w-[180px]">
                      {row.company || row.job_title || "—"}
                    </td>
                    <td className="px-2 py-3">
                      <Badge
                        variant={row.risk === "High" ? "destructive" : row.risk === "Medium" ? "secondary" : "outline"}
                        className={
                          row.risk === "Low"
                            ? "bg-success/15 text-success border-success/20"
                            : row.risk === "Medium"
                              ? "bg-warning/20 text-warning-foreground border-warning/30"
                              : ""
                        }
                      >
                        {row.risk}
                      </Badge>
                    </td>
                    <td className="px-2 py-3 font-mono text-xs tabular-nums">{row.probability}%</td>
                    <td className="px-2 py-3 text-right">
                      <Button variant="ghost" size="sm" onClick={() => setSelected(row)}>
                        View
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>
              {selected?.company || selected?.job_title || "Analysis"} — {selected?.risk} risk
            </DialogTitle>
          </DialogHeader>
          {selected && <AnalysisDetail analysis={selected} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AnalysisDetail({ analysis }: { analysis: AnalysisResult }) {
  return (
    <div className="space-y-4 pt-2">
      {/* Header scores */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-muted p-3 text-center">
          <div className="text-xs text-muted-foreground">Scam Probability</div>
          <div className="text-2xl font-bold tabular-nums">{analysis.probability}%</div>
        </div>
        <div className="rounded-lg bg-muted p-3 text-center">
          <div className="text-xs text-muted-foreground">Trust Score</div>
          <div className="text-2xl font-bold tabular-nums">{analysis.trust_score}%</div>
        </div>
        <div className="rounded-lg bg-muted p-3 text-center">
          <div className="text-xs text-muted-foreground">Risk Level</div>
          <Badge
            variant={analysis.risk === "High" ? "destructive" : "secondary"}
            className={
              analysis.risk === "Low"
                ? "bg-success/15 text-success"
                : analysis.risk === "Medium"
                  ? "bg-warning/20 text-warning-foreground"
                  : ""
            }
          >
            {analysis.risk}
          </Badge>
        </div>
      </div>

      {analysis.extracted_text && (
        <div className="rounded-lg border p-3">
          <div className="text-xs font-semibold text-muted-foreground mb-2">Extracted Text</div>
          <pre className="text-xs whitespace-pre-wrap font-mono max-h-32 overflow-auto">
            {analysis.extracted_text.slice(0, 4000)}
          </pre>
        </div>
      )}

      {analysis.reasons.length > 0 && (
        <div>
          <div className="text-sm font-semibold mb-2">Why this posting was flagged</div>
          <ul className="space-y-1.5">
            {analysis.reasons.map((r, i) => (
              <li key={i} className="text-sm flex gap-2">
                <span className="text-destructive mt-0.5 shrink-0">●</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {analysis.signals.length > 0 && (
        <div>
          <div className="text-sm font-semibold mb-2">Rule-Based Breakdown</div>
          <div className="space-y-1.5">
            {analysis.signals.map((s) => (
              <div key={s.name} className="flex items-center justify-between text-xs">
                <span className={s.triggered ? "text-destructive font-medium" : "text-muted-foreground"}>
                  {s.triggered ? "●" : "○"} {s.name}
                </span>
                <span className="font-mono">{s.triggered ? `+${s.weight}` : "0"}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="text-sm font-semibold mb-2">AI Analysis</div>
        {analysis.ai.available ? (
          <p className="text-sm leading-relaxed whitespace-pre-wrap">
            {analysis.ai.explanation || "No detailed explanation provided."}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {analysis.ai.reason ?? "AI analysis was not available for this run."}
          </p>
        )}
      </div>

      <div>
        <div className="text-sm font-semibold mb-2">Safety Recommendations</div>
        <ul className="space-y-1.5">
          {analysis.recommendations.map((r, i) => (
            <li key={i} className="text-sm flex gap-2">
              <ShieldAlert className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <span>{r}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
