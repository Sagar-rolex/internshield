import { Link } from "@tanstack/react-router";
import {
  BarChart3,
  Building2,
  FileWarning,
  LayoutDashboard,
  LogOut,
  ShieldAlert,
  Users,
} from "lucide-react";
import { ProtectedRoute, useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const adminLinks = [
  { to: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/admin/users", label: "Manage Users", icon: Users },
  { to: "/admin/reports", label: "Scam Reports", icon: FileWarning },
  { to: "/admin/companies", label: "Companies", icon: Building2 },
  { to: "/admin/analytics", label: "Analytics", icon: BarChart3 },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { logout } = useAuth();
  return (
    <ProtectedRoute role="admin">
      <div className="container mx-auto grid gap-6 px-4 py-8 lg:grid-cols-[260px_1fr]">
        <Card className="glass h-fit p-4 lg:sticky lg:top-24">
          <div className="mb-4 px-3 text-sm font-semibold text-muted-foreground">Admin Console</div>
          <nav className="space-y-1">
            {adminLinks.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: item.to === "/admin/dashboard" }}
                activeProps={{ className: "bg-primary/15 text-primary" }}
                className="flex items-center rounded-md px-3 py-2 text-sm hover:bg-muted"
              >
                <item.icon className="mr-2 h-4 w-4" /> {item.label}
              </Link>
            ))}
            <Button variant="ghost" className="w-full justify-start" onClick={logout}>
              <LogOut className="mr-2 h-4 w-4" /> Logout
            </Button>
          </nav>
        </Card>
        <div className="min-w-0">{children}</div>
      </div>
    </ProtectedRoute>
  );
}