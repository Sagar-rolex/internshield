import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Activity, Building2, FileWarning, Loader2, ShieldAlert, Users } from "lucide-react";
import { AdminShell } from "@/components/AdminShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  BarTrendChart,
  DonutTrendChart,
  LineTrendChart,
} from "@/components/admin/LightweightCharts";
import { api, type AdminAnalyticsResponse } from "@/lib/api";

export const Route = createFileRoute("/admin/dashboard")({ component: AdminDashboard });

const chartColors = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

function AdminDashboard() {
  const [data, setData] = useState<AdminAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    api
      .analytics("all")
      .then(setData)
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "Could not load admin analytics."),
      )
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const cards = data
    ? [
        { label: "Registered Users", value: data.cards.totalUsers, icon: Users },
        { label: "Active Users", value: data.cards.activeUsers, icon: Users },
        { label: "Inactive Users", value: data.cards.inactiveUsers, icon: Users },
        { label: "Users in Review", value: data.cards.reviewUsers, icon: Users },
        { label: "Jobs Analyzed", value: data.cards.jobsAnalyzed, icon: Activity },
        { label: "Scams Detected", value: data.cards.scamsDetected, icon: ShieldAlert },
        { label: "High / Critical Risk", value: data.cards.highRiskDetections, icon: ShieldAlert },
        { label: "Medium Risk", value: data.cards.mediumRiskDetections, icon: ShieldAlert },
        { label: "Low Risk", value: data.cards.lowRiskDetections, icon: ShieldAlert },
        { label: "Total Reports", value: data.cards.totalReports, icon: FileWarning },
        { label: "Pending Reports", value: data.cards.reportsPending, icon: FileWarning },
        {
          label: "Platform-Verified Companies",
          value: data.cards.verifiedCompanies,
          icon: Building2,
        },
        { label: "Company Checks", value: data.cards.companyChecks, icon: Building2 },
      ]
    : [];

  return (
    <AdminShell>
      <div className="mb-8">
        <Badge variant="outline" className="mb-3 border-primary/40 text-primary">
          Live database overview
        </Badge>
        <h1 className="break-words text-3xl font-bold sm:text-4xl">Admin Dashboard</h1>
        <p className="mt-2 text-muted-foreground">
          Counts and charts are calculated from saved platform records.
        </p>
      </div>

      {loading ? (
        <Card className="mb-6 flex min-h-48 items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-primary" aria-label="Loading dashboard" />
        </Card>
      ) : error ? (
        <Card className="mb-6 flex flex-col items-start gap-3 p-5" role="alert">
          <p className="font-medium">Admin analytics could not be loaded.</p>
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button onClick={load}>Retry</Button>
        </Card>
      ) : data ? (
        <>
          <div className="mb-6 grid min-w-0 grid-cols-1 gap-4 min-[480px]:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {cards.map((card) => (
              <Card key={card.label} className="glass min-w-0 p-4 shadow-card sm:p-5">
                <card.icon className="mb-4 h-6 w-6 text-primary" />
                <div className="text-2xl font-bold tabular-nums">{card.value.toLocaleString()}</div>
                <div className="break-words text-sm text-muted-foreground">{card.label}</div>
              </Card>
            ))}
          </div>

          <div className="mb-6 grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
            <Card className="min-w-0 overflow-hidden p-4 sm:p-6">
              <h2 className="mb-2 font-semibold">Monthly Activity</h2>
              <p className="mb-4 text-xs text-muted-foreground">
                Saved jobs, high/critical detections, and submitted reports
              </p>
              {data.monthly.length ? (
                <>
                  <BarTrendChart
                    data={data.monthly.map((row) => ({
                      label: row.label,
                      values: [row.jobs, row.scams, row.reports],
                    }))}
                    colors={["var(--chart-1)", "var(--chart-4)", "var(--chart-3)"]}
                    label="Database job analyses, scam detections, and reports over time"
                  />
                  <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
                    <span>
                      <i className="mr-2 inline-block h-2.5 w-2.5 rounded-sm bg-[var(--chart-1)]" />
                      Job analyses
                    </span>
                    <span>
                      <i className="mr-2 inline-block h-2.5 w-2.5 rounded-sm bg-[var(--chart-4)]" />
                      High/critical detections
                    </span>
                    <span>
                      <i className="mr-2 inline-block h-2.5 w-2.5 rounded-sm bg-[var(--chart-3)]" />
                      Reports
                    </span>
                  </div>
                </>
              ) : (
                <EmptyState>No saved activity is available for this chart.</EmptyState>
              )}
            </Card>
            <Card className="min-w-0 overflow-hidden p-4 sm:p-6">
              <h2 className="mb-2 font-semibold">User Registrations</h2>
              <p className="mb-4 text-xs text-muted-foreground">
                Grouped from user registration dates
              </p>
              {data.monthly.some((row) => row.registrations > 0) ? (
                <LineTrendChart
                  data={data.monthly.map((row) => ({ label: row.label, value: row.registrations }))}
                  color="var(--chart-2)"
                  label="User registrations from database records"
                />
              ) : (
                <EmptyState>No registration history is available for this chart.</EmptyState>
              )}
            </Card>
          </div>

          <div className="mb-6 grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3 lg:gap-6">
            <Card className="min-w-0 overflow-hidden p-4 sm:p-6">
              <h2 className="mb-4 font-semibold">Risk Distribution</h2>
              {data.cards.jobsAnalyzed ? (
                <DonutTrendChart
                  data={data.riskDistribution.map((row, index) => ({
                    label: row.risk,
                    value: row.count,
                    color: chartColors[index % chartColors.length],
                  }))}
                />
              ) : (
                <EmptyState>No job analyses have been saved.</EmptyState>
              )}
            </Card>
            <Card className="min-w-0 overflow-hidden p-4 sm:p-6">
              <h2 className="mb-4 font-semibold">Observed Scam Signal Categories</h2>
              {data.scamCategories.length ? (
                <DonutTrendChart
                  data={data.scamCategories.map((row, index) => ({
                    label: row.category,
                    value: row.count,
                    color: chartColors[index % chartColors.length],
                  }))}
                />
              ) : (
                <EmptyState>
                  No triggered signal categories are stored in current analysis records.
                </EmptyState>
              )}
            </Card>
            <Card className="min-w-0 overflow-hidden p-4 sm:p-6">
              <h2 className="mb-2 font-semibold">Scam Detections Over Time</h2>
              <p className="mb-4 text-xs text-muted-foreground">
                High and critical stored analysis risk levels
              </p>
              {data.monthly.some((row) => row.scams > 0) ? (
                <LineTrendChart
                  data={data.monthly.map((row) => ({ label: row.label, value: row.scams }))}
                  color="var(--chart-4)"
                  label="High and critical detections over time"
                />
              ) : (
                <EmptyState>No high or critical detections are recorded.</EmptyState>
              )}
            </Card>
          </div>

          <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
            <RecentCard title="Recent Scam Reports">
              {data.recentReports.map((row) => (
                <ActivityRow
                  key={row.id}
                  title={row.company}
                  subtitle={`${row.reporter} · ${row.date.slice(0, 10)}`}
                  badge={row.status}
                />
              ))}
            </RecentCard>
            <RecentCard title="Recently Registered Users">
              {data.recentUsers.map((row) => (
                <ActivityRow
                  key={row.id}
                  title={row.name}
                  subtitle={`${row.email} · ${row.created_at?.slice(0, 10) || "Date unavailable"}`}
                  badge={row.status || "Unknown"}
                />
              ))}
            </RecentCard>
            <RecentCard title="Recently Platform-Verified Companies">
              {data.recentCompanies.map((row) => (
                <ActivityRow
                  key={row.id}
                  title={row.name}
                  subtitle={`${row.domain || "No domain"} · ${row.last_checked.slice(0, 10)}`}
                  badge={row.status}
                />
              ))}
            </RecentCard>
            <RecentCard title="Latest Job Analyses">
              {data.recentAnalyses.map((row) => (
                <ActivityRow
                  key={row.id}
                  title={row.job_title || "Untitled job"}
                  subtitle={`${row.company} · ${row.created_at.slice(0, 10)}`}
                  badge={`${row.risk} · ${row.probability}%`}
                />
              ))}
            </RecentCard>
            <RecentCard title="Recent Administrative Actions">
              {data.recentAdminActions.map((row) => (
                <ActivityRow
                  key={row.id}
                  title={row.summary}
                  subtitle={`${row.actor} · ${row.created_at.slice(0, 16).replace("T", " ")}`}
                  badge={row.action}
                />
              ))}
            </RecentCard>
          </div>
        </>
      ) : null}
    </AdminShell>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function RecentCard({ title, children }: { title: string; children: React.ReactNode }) {
  const hasRows = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <Card className="min-w-0 overflow-hidden p-4 sm:p-6">
      <h2 className="mb-4 font-semibold">{title}</h2>
      {hasRows ? (
        <div className="space-y-3">{children}</div>
      ) : (
        <EmptyState>No records yet.</EmptyState>
      )}
    </Card>
  );
}

function ActivityRow({
  title,
  subtitle,
  badge,
}: {
  title: string;
  subtitle: string;
  badge: string;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-lg bg-muted/40 p-3 text-sm">
      <div className="min-w-0">
        <div className="break-words font-medium">{title}</div>
        <div className="break-words text-xs text-muted-foreground">{subtitle}</div>
      </div>
      <Badge variant="outline" className="max-w-40 shrink-0 truncate">
        {badge}
      </Badge>
    </div>
  );
}
