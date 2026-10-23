import { Link } from "@tanstack/react-router";
import { LogOut, Menu, Moon, Shield, Sun, X } from "lucide-react";
import { useState } from "react";
import { useTheme } from "./ThemeProvider";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const guestNav = [
  { to: "/", label: "Home" },
  { to: "/detect", label: "Analyze Job" },
  { to: "/company-verification", label: "Company Verification" },
  { to: "/about", label: "About" },
  { to: "/contact", label: "Contact" },
  { to: "/login", label: "Login" },
];

const userNav = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/detect", label: "Analyze Job" },
  { to: "/report", label: "Report Scam" },
  { to: "/history", label: "History" },
  { to: "/profile", label: "Profile" },
];

const adminNav = [
  { to: "/admin/dashboard", label: "Admin Dashboard" },
  { to: "/admin/users", label: "Users" },
  { to: "/admin/reports", label: "Scam Reports" },
  { to: "/admin/companies", label: "Companies" },
  { to: "/admin/analytics", label: "Analytics" },
];

export function Header() {
  const { theme, toggle } = useTheme();
  const { role, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const nav = role === "admin" ? adminNav : role === "user" ? userNav : guestNav;

  return (
    <header className="sticky top-0 z-50 w-full glass">
      <div className="container mx-auto flex h-16 items-center justify-between gap-2 px-4">
        <Link to="/" className="flex min-w-0 items-center gap-2 group">
          <div className="relative">
            <Shield className="h-7 w-7 text-primary group-hover:animate-pulse-glow" />
            <div className="absolute inset-0 blur-lg bg-primary/40 -z-10" />
          </div>
          <span className="whitespace-nowrap font-bold text-base tracking-tight sm:text-lg">
            ScamShield<span className="text-gradient-cyber">.AI</span>
          </span>
        </Link>

        <nav className="hidden xl:flex items-center gap-1">
          {nav.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              activeOptions={{ exact: n.to === "/" }}
              activeProps={{ className: "bg-primary/15 text-primary" }}
              className="px-4 py-2 rounded-md text-sm font-medium hover:bg-muted transition-colors"
            >
              {n.label}
            </Link>
          ))}
          {role !== "guest" && <LogoutButton onLogout={logout} />}
        </nav>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
            {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="xl:hidden"
            onClick={() => setOpen(!open)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>
      {open && (
        <div className="md:hidden border-t border-border bg-background/95 backdrop-blur">
          <nav className="flex flex-col p-4 gap-1">
            {nav.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                onClick={() => setOpen(false)}
                activeOptions={{ exact: n.to === "/" }}
                activeProps={{ className: "bg-primary/15 text-primary" }}
                className="px-4 py-2 rounded-md text-sm font-medium hover:bg-muted"
              >
                {n.label}
              </Link>
            ))}
            {role !== "guest" && (
              <LogoutButton
                onLogout={() => {
                  setOpen(false);
                  logout();
                }}
                mobile
              />
            )}
          </nav>
        </div>
      )}
    </header>
  );
}

function LogoutButton({ onLogout, mobile = false }: { onLogout: () => void; mobile?: boolean }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant={mobile ? "outline" : "ghost"} className={mobile ? "justify-start" : ""}>
          <LogOut className="mr-2 h-4 w-4" /> Logout
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="glass">
        <AlertDialogHeader>
          <AlertDialogTitle>End your session?</AlertDialogTitle>
          <AlertDialogDescription>
            You will be signed out and returned to guest access.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onLogout}>Logout</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
