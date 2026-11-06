import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  BarChart3,
  Building2,
  FileWarning,
  LayoutDashboard,
  LogOut,
  Menu,
  ShieldAlert,
  Users,
  X,
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
  const [menuOpen, setMenuOpen] = useState(false);

  const navigation = (onNavigate?: () => void) => (
    <nav className="space-y-1" aria-label="Admin navigation">
      {adminLinks.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          activeOptions={{ exact: item.to === "/admin/dashboard" }}
          activeProps={{ className: "bg-primary/15 text-primary" }}
          className="flex min-h-11 min-w-0 items-center rounded-md px-3 py-2 text-sm hover:bg-muted"
        >
          <item.icon className="mr-2 h-4 w-4 shrink-0" />
          <span className="min-w-0 break-words">{item.label}</span>
        </Link>
      ))}
      <Button variant="ghost" className="min-h-11 w-full justify-start" onClick={logout}>
        <LogOut className="mr-2 h-4 w-4 shrink-0" /> Logout
      </Button>
    </nav>
  );

  return (
    <ProtectedRoute role="admin">
      <div className="mx-auto grid w-full min-w-0 max-w-screen-2xl grid-cols-1 gap-4 px-3 py-4 sm:px-4 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-6 lg:py-8">
        <div className="flex min-w-0 items-center justify-between gap-3 lg:hidden">
          <div className="text-sm font-semibold text-muted-foreground">Admin Console</div>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            aria-expanded={menuOpen}
            aria-controls="admin-mobile-navigation"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X className="mr-2 h-4 w-4" /> : <Menu className="mr-2 h-4 w-4" />}
            {menuOpen ? "Close" : "Menu"}
          </Button>
        </div>
        {menuOpen && (
          <Card id="admin-mobile-navigation" className="glass min-w-0 p-3 lg:hidden">
            {navigation(() => setMenuOpen(false))}
          </Card>
        )}
        <Card className="glass hidden h-fit min-w-0 p-4 lg:sticky lg:top-20 lg:block">
          <div className="mb-4 break-words px-3 text-sm font-semibold text-muted-foreground">
            Admin Console
          </div>
          {navigation()}
        </Card>
        <div className="min-w-0 max-w-full">{children}</div>
      </div>
    </ProtectedRoute>
  );
}
