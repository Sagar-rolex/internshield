import { Shield } from "lucide-react";
import { Card } from "@/components/ui/card";

export function AuthFormShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative overflow-hidden px-4 py-14">
      <div className="absolute inset-0 grid-bg opacity-30" />
      <div className="absolute left-8 top-20 h-56 w-56 rounded-full bg-primary/20 blur-3xl" />
      <div className="absolute bottom-8 right-10 h-64 w-64 rounded-full bg-accent/20 blur-3xl" />
      <Card className="glass relative mx-auto w-full max-w-md p-7 shadow-card animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-cyber shadow-glow">
            <Shield className="h-7 w-7 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
        </div>
        {children}
      </Card>
    </div>
  );
}

export function passwordScore(password: string) {
  let score = 0;
  if (password.length >= 8) score += 25;
  if (/[A-Z]/.test(password)) score += 25;
  if (/[0-9]/.test(password)) score += 25;
  if (/[^A-Za-z0-9]/.test(password)) score += 25;
  return score;
}
