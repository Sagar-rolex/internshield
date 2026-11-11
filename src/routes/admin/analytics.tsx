import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  Building2,
  Download,
  FileWarning,
  Loader2,
  ShieldAlert,
  Users,
} from "lucide-react";
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

export const Route = createFileRoute("/admin/analytics")({ component: Analytics });

const colors = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];
const periods = [
  ["today", "Today"],
  ["7d", "Last 7 days"],
  ["30d", "Last 30 days"],
  ["90d", "Last 90 days"],
  ["year", "This year"],
  ["all", "All time"],
  ["custom", "Custom range"],
] as const;

function Analytics() {
  const [period, setPeriod] = useState("30d");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [data, setData] = useState<AdminAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (period === "custom" && (!dateFrom || !dateTo)) {
      setData(null);
      setLoading(false);
      setError("Choose both dates to view a custom range.");
      return;
    }
    setLoading(true);
    setError(null);
    api
      .analytics(
        period,
        period === "custom" ? dateFrom : undefined,
        period === "custom" ? dateTo : undefined,
      )
      .then(setData)
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "Could not load analytics."),
      )
      .finally(() => setLoading(false));
  }, [dateFrom, dateTo, period]);

  useEffect(() => {
    load();
  }, [load]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const blob = await api.exportAnalytics(
        period,
        period === "custom" ? dateFrom : undefined,
        period === "custom" ? dateTo : undefined,
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `internshield-analytics-${period}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Analytics export failed.");
    } finally {
      setExporting(false);
    }
  };

  const cards = data
    ? [
        { icon: Users, label: "Registered Users", value: data.cards.totalUsers },
        { icon: Users, label: "New Users in Range", value: data.cards.newUsers },
        { icon: Activity, label: "Jobs Analyzed", value: data.cards.jobsAnalyzed },
        {
          icon: ShieldAlert,
          label: "High / Critical Detections",
          value: data.cards.highRiskDetections,
        },
        { icon: FileWarning, label: "Reports in Range", value: data.cards.totalReports },
        { icon: Building2, label: "Company Checks", value: data.cards.companyChecks },
      ]
    : [];

  return (
    <AdminShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Badge variant="outline" className="mb-3 border-primary/40 text-primary">
            Database analytics
          </Badge>
          <h1 className="break-words text-3xl font-bold sm:text-4xl">Platform Analytics</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Aggregated from saved records. No synthetic growth values.
          </p>
        </div>
        <Button
          onClick={exportCsv}
          disabled={
            loading || exporting || !data || (period === "custom" && (!dateFrom || !dateTo))
          }
        >
          {exporting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          Export CSV
        </Button>
      </div>

      <Card className="mb-6 flex min-w-0 flex-wrap items-end gap-3 p-4">
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">Date range</span>
          <select
            value={period}
            onChange={(event) => setPeriod(event.target.value)}
            className="min-h-10 rounded-md border border-input bg-background px-3"
          >
            {periods.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {period === "custom" && (
          <>
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">From</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
                className="min-h-10 rounded-md border border-input bg-background px-3"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">Through</span>
              <input
                type="date"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
                className="min-h-10 rounded-md border border-input bg-background px-3"
              />
            </label>
          </>
        )}
        {data && (
          <span className="pb-2 text-xs text-muted-foreground">
            Grouping: {data.granularity}. Detection rate: {data.cards.detectionRate}%
          </span>
        )}
      </Card>

      {loading ? (
        <Card className="flex min-h-48 items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-primary" aria-label="Loading analytics" />
        </Card>
      ) : error ? (
        <Card className="mb-6 flex flex-col items-start gap-3 p-5" role="alert">
          <p>{error}</p>
          <Button onClick={load}>Retry</Button>
        </Card>
      ) : data ? (
        <>
          <div className="mb-6 grid min-w-0 grid-cols-1 gap-4 min-[480px]:grid-cols-2 xl:grid-cols-3">
            {cards.map((item) => (
              <Metric
                key={item.label}
                icon={item.icon}
                label={item.label}
                value={item.value.toLocaleString()}
              />
            ))}
          </div>

          <div className="mb-6 grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
            <ChartCard title="Job Analyses Over Time" empty={!data.monthly.some((row) => row.jobs)}>
              <LineTrendChart
                data={data.monthly.map((row) => ({ label: row.label, value: row.jobs }))}
                color="var(--chart-1)"
                label="Saved job analyses over the selected date range"
              />
            </ChartCard>
            <ChartCard
              title="User Registrations Over Time"
              empty={!data.monthly.some((row) => row.registrations)}
            >
              <LineTrendChart
                data={data.monthly.map((row) => ({ label: row.label, value: row.registrations }))}
                color="var(--chart-2)"
                label="Database user registrations over the selected date range"
              />
            </ChartCard>
            <ChartCard
              title="Reports by Time Bucket"
              empty={!data.monthly.some((row) => row.reports)}
            >
              <BarTrendChart
                data={data.monthly.map((row) => ({ label: row.label, values: [row.reports] }))}
                colors={["var(--chart-3)"]}
                label="Saved reports over the selected date range"
              />
            </ChartCard>
            <ChartCard
              title="Scam Detections Over Time"
              empty={!data.monthly.some((row) => row.scams)}
            >
              <LineTrendChart
                data={data.monthly.map((row) => ({ label: row.label, value: row.scams }))}
                color="var(--chart-4)"
                label="High and critical detections from saved analyses over the selected date range"
              />
            </ChartCard>
            <ChartCard title="Risk-Level Distribution" empty={!data.cards.jobsAnalyzed}>
              <DonutTrendChart
                data={data.riskDistribution.map((row, index) => ({
                  label: row.risk,
                  value: row.count,
                  color: colors[index % colors.length],
                }))}
              />
            </ChartCard>
          </div>

          <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3 lg:gap-6">
            <RowsCard
              title="Observed Scam Signal Categories"
              rows={data.scamCategories.map((row) => [row.category, row.count.toLocaleString()])}
              empty="No triggered signal categories are stored in this range."
            />
            <RowsCard
              title="Most Reported Companies"
              rows={data.topCompanies.map((row) => [row.company, row.reports.toLocaleString()])}
              empty="No reports are recorded in this range."
            />
            <RowsCard
              title="Report Status Distribution"
              rows={data.reportStatusDistribution.map((row) => [
                row.status,
                row.count.toLocaleString(),
              ])}
              empty="No reports are recorded in this range."
            />
            <RowsCard
              title="Company Status in Platform Records"
              rows={data.companyStatusDistribution.map((row) => [
                row.status,
                row.count.toLocaleString(),
              ])}
              empty="No company records yet."
            />
            <RowsCard
              title="Recent Administrative Actions"
              rows={data.recentAdminActions.map((row) => [
                row.summary,
                row.created_at.slice(0, 16).replace("T", " "),
              ])}
              empty="No administrative actions have been recorded yet."
            />
          </div>
        </>
      ) : null}
    </AdminShell>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
}) {
  return (
    <Card className="glass min-w-0 p-4 sm:p-5">
      <Icon className="mb-4 h-6 w-6 text-primary" />
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="break-words text-sm text-muted-foreground">{label}</div>
    </Card>
  );
}

function ChartCard({
  title,
  empty,
  children,
}: {
  title: string;
  empty: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card className="min-w-0 overflow-hidden p-4 sm:p-6">
      <h2 className="mb-4 font-semibold">{title}</h2>
      {empty ? <Empty>No records in this range.</Empty> : children}
    </Card>
  );
}

function RowsCard({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: Array<[string, string]>;
  empty: string;
}) {
  return (
    <Card className="min-w-0 overflow-hidden p-4 sm:p-6">
      <h2 className="mb-4 font-semibold">{title}</h2>
      {rows.length ? (
        <div className="space-y-3">
          {rows.map(([label, value]) => (
            <div
              key={label}
              className="flex min-w-0 items-center justify-between gap-3 rounded-lg bg-muted/40 p-3 text-sm"
            >
              <span className="min-w-0 break-words">{label}</span>
              <Badge className="shrink-0" variant="outline">
                {value}
              </Badge>
            </div>
          ))}
        </div>
      ) : (
        <Empty>{empty}</Empty>
      )}
    </Card>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
