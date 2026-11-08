import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  Activity,
  Building2,
  FileWarning,
  History,
  PlusCircle,
  Save,
  Search,
  ShieldCheck,
} from "lucide-react";
import { ProtectedRoute, useAuth } from "@/components/AuthProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";

export const Route = createFileRoute("/dashboard")({
  component: DashboardRoute,
});

function DashboardRoute() {
  return (
    <ProtectedRoute role="user">
      <Dashboard />
    </ProtectedRoute>
  );
}

function Dashboard() {
  const { user } = useAuth();
  const dashboardQuery = useQuery({
    queryKey: ["user-dashboard", user?.id],
    queryFn: ({ signal }) => api.dashboard(signal),
    enabled: Boolean(user?.id),
    staleTime: 0,
  });
  const stats = useMemo(() => {
    const values = dashboardQuery.data?.stats;
    const displayValue = (value: number | undefined) =>
      dashboardQuery.isPending ? "…" : dashboardQuery.isError ? "—" : String(value ?? 0);
    return [
      {
        label: "Jobs Analyzed",
        value: displayValue(values?.jobsAnalyzed),
        icon: Activity,
        tone: "bg-primary/10 text-primary",
      },
      {
        label: "Scam Reports Submitted",
        value: displayValue(values?.reportsSubmitted),
        icon: FileWarning,
        tone: "bg-destructive/10 text-destructive",
      },
      {
        label: "Saved Results",
        value: displayValue(values?.savedResults),
        icon: Save,
        tone: "bg-accent/10 text-accent",
      },
      {
        label: "Verified Companies Checked",
        value: displayValue(values?.companyChecks),
        icon: Building2,
        tone: "bg-success/10 text-success",
      },
    ];
  }, [dashboardQuery.data, dashboardQuery.isError, dashboardQuery.isPending]);
  const recent = dashboardQuery.data?.recentAnalyses ?? [];

  return (
    <div className="container mx-auto min-w-0 px-4 py-8 sm:py-12">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Badge variant="outline" className="mb-3 border-primary/40 text-primary">
            <ShieldCheck className="mr-1.5 h-3 w-3" /> User Dashboard
          </Badge>
          <h1 className="break-words text-3xl font-bold sm:text-4xl">
            Welcome back, <span className="text-gradient-cyber">{user?.name.split(" ")[0]}</span>
          </h1>
          <p className="mt-2 text-muted-foreground">Your job-safety workspace is ready.</p>
        </div>
        <Badge className="bg-success/15 text-success hover:bg-success/15">Session Active</Badge>
      </div>

      <div className="mb-8 grid min-w-0 grid-cols-1 gap-4 min-[480px]:grid-cols-2 2xl:grid-cols-4">
        {stats.map((item) => (
          <Card
            key={item.label}
            className="glass min-w-0 p-4 shadow-card transition-all hover:-translate-y-1 sm:p-6"
          >
            <div
              className={`mb-4 flex h-11 w-11 items-center justify-center rounded-lg ${item.tone}`}
            >
              <item.icon className="h-5 w-5" />
            </div>
            <div className="text-3xl font-bold">{item.value}</div>
            <div className="mt-1 break-words text-sm text-muted-foreground">{item.label}</div>
          </Card>
        ))}
      </div>

      <div className="mb-8 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Analyze New Job", to: "/detect", icon: PlusCircle },
          { label: "Report Scam", to: "/report", icon: FileWarning },
          { label: "Check Company", to: "/company-verification", icon: Search },
          { label: "View History", to: "/history", icon: History },
        ].map((action) => (
          <Button
            key={action.label}
            asChild
            variant="outline"
            className="h-auto min-h-16 justify-start whitespace-normal px-3 py-3 text-left glass sm:min-h-20 sm:px-4"
          >
            <Link to={action.to}>
              <action.icon className="mr-3 h-5 w-5 text-primary" />
              {action.label}
            </Link>
          </Button>
        ))}
      </div>

      <Card className="min-w-0 overflow-hidden p-3 sm:p-6">
        <h2 className="mb-4 text-lg font-semibold">Recent Analysis</h2>
        {dashboardQuery.isError && (
          <p className="mb-3 text-sm text-destructive" role="alert">
            Your dashboard data could not be loaded. Please refresh and try again.
          </p>
        )}
        <div className="min-w-0 max-w-full overflow-x-auto overscroll-x-contain">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                <th className="px-2 py-3">Date</th>
                <th className="px-2 py-3">Company</th>
                <th className="px-2 py-3">Risk Level</th>
                <th className="px-2 py-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {dashboardQuery.isPending ? (
                <tr>
                  <td className="px-2 py-6 text-center text-muted-foreground" colSpan={4}>
                    Loading your activity…
                  </td>
                </tr>
              ) : recent.length === 0 && !dashboardQuery.isError ? (
                <tr>
                  <td className="px-2 py-6 text-center text-muted-foreground" colSpan={4}>
                    No analyses yet. Analyze a job to see your activity here.
                  </td>
                </tr>
              ) : (
                recent.map((analysis) => (
                  <tr key={analysis.id} className="border-b border-border/50">
                    <td className="px-2 py-3">
                      {new Date(analysis.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-2 py-3 font-medium">
                      {analysis.company || analysis.job_title || "Untitled job"}
                    </td>
                    <td className="px-2 py-3">
                      <Risk risk={analysis.risk} />
                    </td>
                    <td className="px-2 py-3 text-right text-muted-foreground">
                      {analysis.safe ? "Safe" : "Review"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Risk({ risk }: { risk: string }) {
  const cls =
    risk === "High"
      ? "bg-destructive/15 text-destructive"
      : risk === "Medium"
        ? "bg-warning/20 text-warning-foreground"
        : "bg-success/15 text-success";
  return <Badge className={`${cls} hover:${cls}`}>{risk}</Badge>;
}
