import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { AuthFormShell, passwordScore } from "@/components/AuthFormShell";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";

export const Route = createFileRoute("/signup")({
  component: SignUp,
});

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function SignUp() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirm: "",
  });
  const [show, setShow] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const score = passwordScore(form.password);

  const update = (key: keyof typeof form, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    Object.entries(form).forEach(([key, value]) => {
      if (!value.trim()) next[key] = "Required";
    });
    if (form.name.trim() && form.name.trim().length < 2) {
      next.name = "Name must be at least 2 characters";
    }
    if (form.email && !emailRegex.test(form.email)) next.email = "Enter a valid email address";
    if (
      form.password &&
      (form.password.length < 8 || !/[A-Z]/.test(form.password) || !/[0-9]/.test(form.password))
    ) {
      next.password = "Use at least 8 characters, one uppercase letter, and one number";
    }
    if (form.password !== form.confirm) next.confirm = "Passwords do not match";
    setErrors(next);
    if (Object.keys(next).length) return;
    setLoading(true);
    const ok = await auth.register({
      name: form.name,
      email: form.email,
      password: form.password,
    });
    setLoading(false);
    if (!ok) return; // register already showed a toast
    navigate({ to: "/dashboard" });
  };

  return (
    <AuthFormShell title="Create account" subtitle="Set up your student safety profile.">
      <form onSubmit={submit} className="space-y-4">
        <Field
          label="Full Name"
          value={form.name}
          onChange={(v) => update("name", v)}
          error={errors.name}
        />
        <Field
          label="Email"
          value={form.email}
          onChange={(v) => update("email", v)}
          error={errors.email}
        />
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              type={show ? "text" : "password"}
              value={form.password}
              onChange={(e) => update("password", e.target.value)}
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              aria-label={show ? "Hide password" : "Show password"}
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <Progress value={score} className="h-2" />
          <p className="text-xs text-muted-foreground">
            {score >= 75
              ? "Strong password"
              : score >= 50
                ? "Moderate password"
                : "Add length, number, uppercase, and symbol"}
          </p>
          {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="signup-confirm-password">Confirm Password</Label>
          <div className="relative">
            <Input
              id="signup-confirm-password"
              type={showConfirm ? "text" : "password"}
              value={form.confirm}
              onChange={(e) => update("confirm", e.target.value)}
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowConfirm((visible) => !visible)}
              className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={showConfirm ? "Hide confirm password" : "Show confirm password"}
              aria-pressed={showConfirm}
            >
              {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.confirm && <p className="text-xs text-destructive">{errors.confirm}</p>}
        </div>
        <Button
          type="submit"
          className="h-11 w-full bg-gradient-cyber shadow-glow"
          disabled={loading}
        >
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Sign Up
        </Button>
      </form>
      <p className="mt-5 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          to="/login"
          search={{ redirect: "/dashboard" }}
          className="text-primary hover:underline"
        >
          Login
        </Link>
      </p>
    </AuthFormShell>
  );
}

function Field({
  label,
  value,
  onChange,
  error,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  type?: string;
}) {
  const id = `signup-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
