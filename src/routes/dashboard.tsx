import { createFileRoute, Link } from "@tanstack/react-router";
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

export const Route = createFileRoute("/dashboard")({
  component: DashboardRoute,
});

const stats = [
  { label: "Jobs Analyzed", value: "34", icon: Activity, tone: "bg-primary/10 text-primary" },
  {
    label: "Scam Reports Submitted",
    value: "8",
    icon: FileWarning,
    tone: "bg-destructive/10 text-destructive",
  },
  { label: "Saved Results", value: "12", icon: Save, tone: "bg-accent/10 text-accent" },
  {
    label: "Verified Companies Checked",
    value: "19",
    icon: Building2,
    tone: "bg-success/10 text-success",
  },
];

const recent = [
  { date: "12 Jul 2026", company: "TechNova Labs", risk: "Low", status: "Saved" },
  { date: "11 Jul 2026", company: "FastCash Hiring", risk: "High", status: "Reported" },
  { date: "09 Jul 2026", company: "BrightCareer Hub", risk: "Medium", status: "Reviewed" },
  { date: "07 Jul 2026", company: "CampusEdge AI", risk: "Low", status: "Verified" },
];

function DashboardRoute() {
  return (
    <ProtectedRoute role="user">
      <Dashboard />
    </ProtectedRoute>
  );
}

function Dashboard() {
  const { user } = useAuth();
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
              {recent.map((row) => (
                <tr key={`${row.date}-${row.company}`} className="border-b border-border/50">
                  <td className="px-2 py-3">{row.date}</td>
                  <td className="px-2 py-3 font-medium">{row.company}</td>
                  <td className="px-2 py-3">
                    <Risk risk={row.risk} />
                  </td>
                  <td className="px-2 py-3 text-right text-muted-foreground">{row.status}</td>
                </tr>
              ))}
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
