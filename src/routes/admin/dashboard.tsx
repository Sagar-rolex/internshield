import { createFileRoute } from "@tanstack/react-router";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Building2, FileWarning, ShieldAlert, Users, Activity } from "lucide-react";
import { AdminShell } from "@/components/AdminShell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/admin/dashboard")({
  component: AdminDashboard,
});

const cards = [
  { label: "Total Users", value: "8,420", icon: Users },
  { label: "Jobs Analyzed", value: "42,318", icon: Activity },
  { label: "Scams Detected", value: "12,847", icon: ShieldAlert },
  { label: "Reports Pending", value: "218", icon: FileWarning },
  { label: "Verified Companies", value: "5,219", icon: Building2 },
];

const monthly = [
  { month: "Jan", analysis: 4200, scams: 820 },
  { month: "Feb", analysis: 5100, scams: 940 },
  { month: "Mar", analysis: 6200, scams: 1120 },
  { month: "Apr", analysis: 7300, scams: 1320 },
  { month: "May", analysis: 8100, scams: 1580 },
  { month: "Jun", analysis: 9200, scams: 1810 },
];

const categories = [
  { name: "Pay-to-Apply", value: 31 },
  { name: "Fake Hiring", value: 28 },
  { name: "Data Theft", value: 18 },
  { name: "Pyramid", value: 13 },
  { name: "Investment", value: 10 },
];

const recentReports = [
  { company: "FastCash Hiring", reporter: "Nisha Rao", risk: "High", status: "Pending" },
  { company: "BrightCareer Hub", reporter: "Rahul Mehta", risk: "Medium", status: "Review" },
  { company: "WorkFromHome India Ltd", reporter: "Sara Khan", risk: "High", status: "Approved" },
];

const COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

function AdminDashboard() {
  return (
    <AdminShell>
      <div className="mb-8">
        <Badge variant="outline" className="mb-3 border-primary/40 text-primary">
          Premium Dashboard
        </Badge>
        <h1 className="text-4xl font-bold">Admin Dashboard</h1>
        <p className="mt-2 text-muted-foreground">
          Operational overview of users, analysis volume, reports, and company intelligence.
        </p>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map((card) => (
          <Card key={card.label} className="glass p-5 shadow-card">
            <card.icon className="mb-4 h-6 w-6 text-primary" />
            <div className="text-2xl font-bold">{card.value}</div>
            <div className="text-sm text-muted-foreground">{card.label}</div>
          </Card>
        ))}
      </div>

      <div className="mb-6 grid gap-6 xl:grid-cols-2">
        <Card className="p-6">
          <h2 className="mb-4 font-semibold">Monthly Analysis</h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="analysis" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
              <Bar dataKey="scams" fill="var(--chart-3)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card className="p-6">
          <h2 className="mb-4 font-semibold">Scam Categories</h2>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={categories}
                dataKey="value"
                nameKey="name"
                innerRadius={60}
                outerRadius={100}
              >
                {categories.map((_, i) => (
                  <Cell key={i} fill={COLORS[i]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="p-6">
          <h2 className="mb-4 font-semibold">User Growth</h2>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="analysis" stroke="var(--chart-2)" strokeWidth={3} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
        <Card className="p-6">
          <h2 className="mb-4 font-semibold">Recent Reports</h2>
          <div className="space-y-3">
            {recentReports.map((report) => (
              <div
                key={report.company}
                className="flex items-center justify-between rounded-lg bg-muted/40 p-3 text-sm"
              >
                <div>
                  <div className="font-medium">{report.company}</div>
                  <div className="text-muted-foreground">{report.reporter}</div>
                </div>
                <Badge variant={report.risk === "High" ? "destructive" : "outline"}>
                  {report.status}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </AdminShell>
  );
}
