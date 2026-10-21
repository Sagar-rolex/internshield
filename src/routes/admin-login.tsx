import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { AuthFormShell } from "@/components/AuthFormShell";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/admin-login")({
  component: AdminLogin,
});

function AdminLogin() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("admin@internshield.com");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Admin email and password are required.");
      return;
    }
    setLoading(true);
    const ok = await auth.adminLogin(email, password);
    setLoading(false);
    if (!ok) {
      toast.error("Invalid admin credentials.");
      return;
    }
    toast.success("Login success animation complete.");
    window.setTimeout(() => navigate({ to: "/admin/dashboard" }), 0);
  };

  return (
    <AuthFormShell
      title="Admin Login"
      subtitle="Restricted operations console for InternShield administrators."
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label>Admin Email</Label>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Password</Label>
          <div className="relative">
            <Input
              type={show ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="admin123"
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <Button
          type="submit"
          className="h-11 w-full bg-gradient-cyber shadow-glow"
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <ShieldCheck className="mr-2 h-4 w-4" />
          )}{" "}
          Admin Login
        </Button>
      </form>
    </AuthFormShell>
  );
}
