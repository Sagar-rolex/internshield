import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/AdminShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api, isRequestAborted, type ApiReport } from "@/lib/api";

export const Route = createFileRoute("/admin/reports")({ component: ManageReports });

function ManageReports() {
  const [reports, setReports] = useState<ApiReport[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [risk, setRisk] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ApiReport | null>(null);
  const [detailsTarget, setDetailsTarget] = useState<ApiReport | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(
      () => {
        setLoading(true);
        setError(null);
        api
          .reports({ q: query.trim(), status, risk_level: risk, page, page_size: 25 })
          .then((response) => {
            if (cancelled) return;
            setReports(response.reports);
            setTotal(response.total);
            setTotalPages(response.total_pages);
          })
          .catch((reason: unknown) => {
            if (!cancelled && !isRequestAborted(reason))
              setError(reason instanceof Error ? reason.message : "Could not load reports.");
          })
          .finally(() => {
            if (!cancelled) setLoading(false);
          });
      },
      query.trim() ? 250 : 0,
    );
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [page, query, reload, risk, status]);

  const update = async (report: ApiReport, nextStatus: string) => {
    try {
      await api.updateReport(report.id, { status: nextStatus });
      toast.success(`${report.company} marked ${nextStatus}.`);
      setReload((value) => value + 1);
    } catch (reason) {
      if (!isRequestAborted(reason))
        toast.error(reason instanceof Error ? reason.message : "Failed to update report.");
    }
  };

  const remove = async (report: ApiReport) => {
    setDeleteTarget(null);
    try {
      await api.deleteReport(report.id);
      toast.success(`${report.company} report deleted.`);
      setReload((value) => value + 1);
    } catch (reason) {
      if (!isRequestAborted(reason))
        toast.error(reason instanceof Error ? reason.message : "Failed to delete report.");
    }
  };

  return (
    <AdminShell>
      <div className="mb-6">
        <Badge variant="outline" className="mb-3 border-primary/40 text-primary">
          Manage Scam Reports
        </Badge>
        <h1 className="text-3xl font-bold sm:text-4xl">Scam Reports</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {total.toLocaleString()} matching reports
        </p>
      </div>
      <Card className="mb-4 flex min-w-0 flex-wrap items-end gap-3 p-3 sm:p-4">
        <label className="grid w-full max-w-sm gap-1 text-xs text-muted-foreground">
          Search
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
            <Input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              className="pl-9"
              placeholder="Company or reporter"
            />
          </div>
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          Status
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
            className="min-h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
          >
            <option value="">All statuses</option>
            {["Pending", "Review", "Approved", "Rejected"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          Risk
          <select
            value={risk}
            onChange={(event) => {
              setRisk(event.target.value);
              setPage(1);
            }}
            className="min-h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
          >
            <option value="">All risks</option>
            {["Low", "Medium", "High"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
      </Card>
      <Card className="min-w-0 overflow-hidden p-3 sm:p-6">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-start gap-3 py-6" role="alert">
            <p>{error}</p>
            <Button variant="outline" onClick={() => setReload((value) => value + 1)}>
              Retry
            </Button>
          </div>
        ) : reports.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No reports match these filters.
          </div>
        ) : (
          <div className="min-w-0 max-w-full overflow-x-auto overscroll-x-contain">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="px-2 py-3">Company</th>
                  <th className="px-2 py-3">Reporter</th>
                  <th className="px-2 py-3">Date</th>
                  <th className="px-2 py-3">Status</th>
                  <th className="px-2 py-3">Risk</th>
                  <th className="px-2 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((report) => (
                  <tr key={report.id} className="border-b border-border/50">
                    <td className="px-2 py-3 font-medium">{report.company}</td>
                    <td className="px-2 py-3">{report.reporter}</td>
                    <td className="px-2 py-3 text-muted-foreground">{report.date.slice(0, 10)}</td>
                    <td className="px-2 py-3">
                      <Badge variant="outline">{report.status}</Badge>
                    </td>
                    <td className="px-2 py-3">
                      <Badge variant={report.risk_level === "High" ? "destructive" : "secondary"}>
                        {report.risk_level}
                      </Badge>
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setDetailsTarget(report)}
                        >
                          Details
                        </Button>
                        {report.status !== "Approved" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void update(report, "Approved")}
                          >
                            Confirm
                          </Button>
                        )}
                        {report.status !== "Rejected" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void update(report, "Rejected")}
                          >
                            Reject
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => setDeleteTarget(report)}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && !error && totalPages > 1 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm">
            <span className="text-muted-foreground">
              Page {page} of {totalPages} · {total} reports
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((value) => value - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                disabled={page >= totalPages}
                onClick={() => setPage((value) => value + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete “{deleteTarget?.company}” report?</DialogTitle>
            <DialogDescription>
              This permanently removes the report and its database record.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 py-4">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => deleteTarget && void remove(deleteTarget)}>
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={detailsTarget !== null}
        onOpenChange={(open) => !open && setDetailsTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{detailsTarget?.company}</DialogTitle>
            <DialogDescription>Submitted by {detailsTarget?.reporter}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2 text-sm">
            <div>
              <b>Date:</b> {detailsTarget?.date.slice(0, 10)}
            </div>
            <div>
              <b>Risk:</b> {detailsTarget?.risk_level}
            </div>
            <div>
              <b>Status:</b> {detailsTarget?.status}
            </div>
            <div className="rounded-md bg-muted p-3">
              {detailsTarget?.details || "No additional details provided."}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
}
