import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Eye, EyeOff, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { AuthFormShell } from "@/components/AuthFormShell";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/login")({
  component: Login,
});

function Login() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!email.trim()) next.email = "Email is required";
    if (!password) next.password = "Password is required";
    setErrors(next);
    if (Object.keys(next).length) return;
    setLoading(true);
    const ok = await auth.login(email, password);
    setLoading(false);
    if (!ok) {
      toast.error("Invalid credentials. Please check your email and password.");
      return;
    }
    toast.success("Session timeout reminder enabled.", {
      description: "UI only: you will be notified before inactivity logout.",
    });
    window.setTimeout(() => navigate({ to: "/dashboard" }), 0);
  };

  return (
    <AuthFormShell
      title="Welcome back"
      subtitle="Sign in to continue protecting your career search."
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label>Email Address</Label>
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email"
          />
          {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
        </div>
        <div className="space-y-2">
          <Label>Password</Label>
          <div className="relative">
            <Input
              type={show ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
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
          {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
        </div>
        <div className="flex items-center justify-between text-sm">
          <label className="flex items-center gap-2 text-muted-foreground">
            <Checkbox /> Remember Me
          </label>
          <Link to="/forgot-password" className="text-primary hover:underline">
            Forgot Password?
          </Link>
        </div>
        <Button
          type="submit"
          className="h-11 w-full bg-gradient-cyber shadow-glow"
          disabled={loading}
        >
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Login
        </Button>
      </form>
      <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" /> or continue with{" "}
        <span className="h-px flex-1 bg-border" />
      </div>
      <div className="flex justify-center">
        <Button
          variant="outline"
          className="w-full max-w-xs"
          onClick={() => toast.info("Google login is UI only in this prototype.")}
        >
          <Mail className="mr-2 h-4 w-4" /> Google
        </Button>
      </div>
      <p className="mt-5 text-center text-sm text-muted-foreground">
        New here?{" "}
        <Link to="/signup" className="text-primary hover:underline">
          Create an account
        </Link>
      </p>
    </AuthFormShell>
  );
}
