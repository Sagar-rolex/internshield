import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/AdminShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api, type ApiReport } from "@/lib/api";

export const Route = createFileRoute("/admin/reports")({
  component: ManageReports,
});

function ManageReports() {
  const [reports, setReports] = useState<ApiReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<ApiReport | null>(null);
  const [detailsTarget, setDetailsTarget] = useState<ApiReport | null>(null);

  const loadReports = async () => {
    try {
      const data = await api.reports();
      setReports(data.reports);
    } catch {
      toast.error("Backend unavailable — start it with `npm run backend`.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, []);

  const update = async (report: ApiReport, status: string) => {
    try {
      await api.updateReport(report.id, { status });
      toast.success(`${report.company} marked ${status}.`);
      loadReports();
    } catch {
      toast.error(`Failed to update ${report.company}.`);
    }
  };

  const remove = async (report: ApiReport) => {
    setDeleteTarget(null);
    try {
      await api.deleteReport(report.id);
      toast.success(`${report.company} report deleted.`);
      loadReports();
    } catch {
      toast.error(`Failed to delete ${report.company}.`);
    }
  };

  return (
    <AdminShell>
      <div className="mb-6">
        <Badge variant="outline" className="mb-3 border-primary/40 text-primary">
          Manage Scam Reports
        </Badge>
        <h1 className="text-4xl font-bold">Scam Reports</h1>
      </div>
      <Card className="p-6">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="px-2 py-3">Company</th>
                  <th className="px-2 py-3">Reporter</th>
                  <th className="px-2 py-3">Date</th>
                  <th className="px-2 py-3">Status</th>
                  <th className="px-2 py-3">Risk Level</th>
                  <th className="px-2 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((report) => (
                  <tr key={report.id} className="border-b border-border/50">
                    <td className="px-2 py-3 font-medium">{report.company}</td>
                    <td className="px-2 py-3">{report.reporter}</td>
                    <td className="px-2 py-3 text-muted-foreground">{report.date}</td>
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
                          onClick={() => update(report, "Approved")}
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => update(report, "Rejected")}
                        >
                          Reject
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setDetailsTarget(report)}
                        >
                          View Details
                        </Button>
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
      </Card>

      {/* Delete confirmation */}
      <Dialog open={deleteTarget !== null} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete "{deleteTarget?.company}" report?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. The report will be permanently removed.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 py-4">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => deleteTarget && remove(deleteTarget)}>
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Details drawer (replaces toast dump) */}
      <Dialog open={detailsTarget !== null} onOpenChange={(v) => !v && setDetailsTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{detailsTarget?.company}</DialogTitle>
            <DialogDescription>Submitted by {detailsTarget?.reporter}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2 text-sm">
            <div>
              <span className="font-medium">Date:</span> {detailsTarget?.date}
            </div>
            <div>
              <span className="font-medium">Risk:</span> {detailsTarget?.risk_level}
            </div>
            <div>
              <span className="font-medium">Status:</span> {detailsTarget?.status}
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