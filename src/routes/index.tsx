import { createFileRoute, Link } from "@tanstack/react-router";
import { Shield, ShieldAlert, ShieldCheck, Sparkles, Search, AlertTriangle, Brain, Mail, DollarSign, Building2, Activity, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ScamShield.AI — Detect Fake Internships & Job Scams Using AI" },
      { name: "description", content: "Paste any job posting and our AI flags scam keywords, fake emails, unrealistic salaries and more in seconds." },
    ],
  }),
  component: Home,
});

const features = [
  { icon: Search, title: "Suspicious Keyword Detection", desc: "Scans 50+ known scam phrases like 'registration fee' or 'pay to apply'." },
  { icon: Mail, title: "Fake Email Detection", desc: "Flags recruiters using free email domains instead of company addresses." },
  { icon: DollarSign, title: "Unrealistic Salary Analysis", desc: "Compares offered compensation against role and market benchmarks." },
  { icon: Building2, title: "Company Verification", desc: "Checks for missing websites, vague descriptions, and unverifiable info." },
  { icon: Brain, title: "Scam Pattern Analysis", desc: "ML model trained on thousands of confirmed fraudulent listings." },
  { icon: Activity, title: "Real-time Risk Scoring", desc: "Instant probability score with explainable reasoning for every signal." },
];

const alerts = [
  { company: "Global Tech Solutions Pvt", role: "Data Entry Intern", risk: "High", reason: "Asked for ₹2,500 registration fee" },
  { company: "FastCash Hiring", role: "Remote Marketing Exec", risk: "High", reason: "Salary of ₹80k for fresher, gmail recruiter" },
  { company: "BrightCareer Hub", role: "HR Intern", risk: "Medium", reason: "No company website, WhatsApp-only contact" },
];

function Home() {
  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-40" />
        <div className="absolute top-20 -left-20 h-72 w-72 rounded-full bg-primary/30 blur-3xl animate-float" />
        <div className="absolute bottom-10 right-0 h-72 w-72 rounded-full bg-accent/30 blur-3xl animate-float" style={{ animationDelay: "2s" }} />

        <div className="container relative mx-auto px-4 pt-20 pb-28 text-center">
          <Badge variant="outline" className="mb-6 border-primary/40 text-primary py-1 px-3">
            <Sparkles className="h-3 w-3 mr-1.5" /> Powered by AI/ML — Live Analysis
          </Badge>
          <h1 className="text-5xl md:text-7xl font-bold leading-tight max-w-4xl mx-auto">
            Detect Fake Internships &<br />
            <span className="text-gradient-cyber animate-gradient bg-gradient-cyber bg-clip-text">Job Scams Using AI</span>
          </h1>
          <p className="mt-6 text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
            A cybersecurity-grade platform that analyzes job postings for scam indicators in seconds — protecting students from fraud.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Button asChild size="lg" className="bg-gradient-cyber shadow-glow text-base h-12 px-8">
              <Link to="/detect"><Shield className="mr-2 h-5 w-5" /> Check Scam</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 px-8">
              <Link to="/dashboard">View Dashboard</Link>
            </Button>
          </div>

          {/* Floating shield illustration */}
          <div className="mt-16 flex justify-center">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-cyber blur-3xl opacity-50 animate-pulse-glow rounded-full" />
              <div className="relative h-40 w-40 rounded-3xl bg-gradient-cyber shadow-glow flex items-center justify-center animate-float">
                <Shield className="h-20 w-20 text-primary-foreground" strokeWidth={1.5} />
              </div>
            </div>
          </div>

          <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
            {[
              { label: "Scams Detected", value: "12,847" },
              { label: "Verified Jobs", value: "5,219" },
              { label: "Users Protected", value: "8,400+" },
              { label: "Accuracy", value: "96.4%" },
            ].map((s) => (
              <div key={s.label} className="glass rounded-xl p-4">
                <div className="text-2xl md:text-3xl font-bold text-gradient-cyber">{s.value}</div>
                <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AI Features */}
      <section className="container mx-auto px-4 py-20">
        <div className="text-center mb-14">
          <Badge variant="outline" className="mb-3 border-accent/40 text-accent"><Brain className="h-3 w-3 mr-1.5" /> AI Engine</Badge>
          <h2 className="text-4xl md:text-5xl font-bold">Six layers of <span className="text-gradient-cyber">scam intelligence</span></h2>
          <p className="text-muted-foreground mt-4 max-w-2xl mx-auto">Each posting is run through a stack of detection modules trained on real-world fraud patterns.</p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f) => (
            <Card key={f.title} className="p-6 group hover:shadow-glow hover:-translate-y-1 transition-all duration-300 border-border/50">
              <div className="h-12 w-12 rounded-xl bg-gradient-cyber flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <f.icon className="h-6 w-6 text-primary-foreground" />
              </div>
              <h3 className="font-semibold text-lg mb-2">{f.title}</h3>
              <p className="text-sm text-muted-foreground">{f.desc}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Recent alerts */}
      <section className="container mx-auto px-4 py-20">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-10">
          <div>
            <Badge variant="outline" className="mb-3 border-destructive/40 text-destructive"><AlertTriangle className="h-3 w-3 mr-1.5" /> Live Alerts</Badge>
            <h2 className="text-3xl md:text-4xl font-bold">Recent scam alerts</h2>
          </div>
          <Button asChild variant="ghost"><Link to="/dashboard">View all →</Link></Button>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {alerts.map((a) => (
            <Card key={a.company} className="p-6 border-destructive/30 bg-destructive/5 hover:shadow-card transition-all">
              <div className="flex items-start justify-between mb-3">
                <ShieldAlert className="h-8 w-8 text-destructive" />
                <Badge variant="destructive">{a.risk} Risk</Badge>
              </div>
              <h3 className="font-semibold">{a.company}</h3>
              <p className="text-sm text-muted-foreground mt-1">{a.role}</p>
              <div className="mt-4 pt-4 border-t border-border/50 text-xs text-muted-foreground">
                <strong className="text-destructive">Flagged:</strong> {a.reason}
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="container mx-auto px-4 py-20">
        <Card className="relative overflow-hidden border-primary/30 p-12 text-center bg-gradient-hero">
          <div className="absolute inset-0 grid-bg opacity-30" />
          <div className="relative">
            <ShieldCheck className="h-14 w-14 text-primary-foreground mx-auto mb-4" />
            <h2 className="text-3xl md:text-4xl font-bold text-primary-foreground">Don't fall for the next fake offer.</h2>
            <p className="text-primary-foreground/80 mt-3 max-w-xl mx-auto">Run any suspicious internship or job posting through ScamShield before you apply.</p>
            <Button asChild size="lg" variant="secondary" className="mt-6 h-12 px-8">
              <Link to="/detect"><Zap className="mr-2 h-5 w-5" /> Analyze a posting now</Link>
            </Button>
          </div>
        </Card>
      </section>
    </div>
  );
}
