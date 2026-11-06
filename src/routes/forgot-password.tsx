import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { AuthFormShell } from "@/components/AuthFormShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPassword,
});

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError("Email address is required");
      return;
    }
    setError("");
    toast.info("Password reset is not connected yet. Contact support for account recovery.");
  };

  return (
    <AuthFormShell title="Reset password" subtitle="We will send a mock reset link to your inbox.">
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label>Email Address</Label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@college.edu"
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <Button type="submit" className="h-11 w-full bg-gradient-cyber shadow-glow">
          <Send className="mr-2 h-4 w-4" />
          Send Reset Link
        </Button>
      </form>
      <p className="mt-5 text-center text-sm text-muted-foreground">
        Remembered it?{" "}
        <Link
          to="/login"
          search={{ redirect: "/dashboard" }}
          className="text-primary hover:underline"
        >
          Back to login
        </Link>
      </p>
    </AuthFormShell>
  );
}
