import { createFileRoute } from "@tanstack/react-router";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Activity, Building2, FileWarning, Percent, ShieldAlert } from "lucide-react";
import { AdminShell } from "@/components/AdminShell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/admin/analytics")({
  component: Analytics,
});

const monthly = [
  { month: "Jan", jobs: 4200, rate: 19, reports: 210 },
  { month: "Feb", jobs: 5100, rate: 18, reports: 260 },
  { month: "Mar", jobs: 6200, rate: 21, reports: 310 },
  { month: "Apr", jobs: 7300, rate: 22, reports: 390 },
  { month: "May", jobs: 8100, rate: 24, reports: 430 },
  { month: "Jun", jobs: 9200, rate: 20, reports: 470 },
];

const categories = [
  { name: "Pay-to-Apply", value: 3110 },
  { name: "Fake Hiring", value: 4280 },
  { name: "Data Theft", value: 2140 },
  { name: "Pyramid", value: 1840 },
];

const companies = [
  "FastCash Hiring",
  "Global Tech Solutions Pvt",
  "BrightCareer Hub",
  "EarnHome Networks",
];
const activity = [
  "Approved FastCash report",
  "Verified CampusEdge AI",
  "Deactivated spam reporter",
  "Reviewed 28 pending reports",
];

function Analytics() {
  return (
    <AdminShell>
      <div className="mb-6">
        <Badge variant="outline" className="mb-3 border-primary/40 text-primary">
          Analytics Page
        </Badge>
        <h1 className="text-4xl font-bold">Platform Analytics</h1>
      </div>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={Activity} label="Jobs Analyzed" value="42,318" />
        <Metric icon={Percent} label="Scam Detection Rate" value="21.4%" />
        <Metric icon={FileWarning} label="Monthly Reports" value="470" />
        <Metric icon={Building2} label="Most Reported Companies" value="4" />
      </div>
      <div className="mb-6 grid gap-6 xl:grid-cols-2">
        <Card className="p-6">
          <h2 className="mb-4 font-semibold">Jobs Analyzed</h2>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="jobs" stroke="var(--chart-1)" strokeWidth={3} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
        <Card className="p-6">
          <h2 className="mb-4 font-semibold">Monthly Reports</h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="reports" fill="var(--chart-2)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="p-6">
          <h2 className="mb-4 font-semibold">Top Scam Categories</h2>
          <div className="space-y-3">
            {categories.map((cat) => (
              <Row key={cat.name} label={cat.name} value={cat.value.toLocaleString()} />
            ))}
          </div>
        </Card>
        <Card className="p-6">
          <h2 className="mb-4 font-semibold">Most Reported Companies</h2>
          <div className="space-y-3">
            {companies.map((company, index) => (
              <Row key={company} label={company} value={`#${index + 1}`} />
            ))}
          </div>
        </Card>
        <Card className="p-6">
          <h2 className="mb-4 font-semibold">Recent Activity</h2>
          <div className="space-y-3">
            {activity.map((item) => (
              <Row key={item} label={item} value="Now" />
            ))}
          </div>
        </Card>
      </div>
    </AdminShell>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof ShieldAlert;
  label: string;
  value: string;
}) {
  return (
    <Card className="glass p-5">
      <Icon className="mb-4 h-6 w-6 text-primary" />
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-muted/40 p-3 text-sm">
      <span>{label}</span>
      <Badge variant="outline">{value}</Badge>
    </div>
  );
}
