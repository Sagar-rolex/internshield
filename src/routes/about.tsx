import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Brain, Code2, Database, Cpu, GraduationCap, Target, Lightbulb } from "lucide-react";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About the Project | ScamShield.AI" },
      {
        name: "description",
        content:
          "How our AI-powered scam detector works and the team behind this college mini project.",
      },
    ],
  }),
  component: About,
});

const tech = [
  { name: "React.js", desc: "Modern UI library", icon: Code2 },
  { name: "Tailwind CSS", desc: "Utility-first styling", icon: Code2 },
  { name: "Node.js", desc: "ML inference backend", icon: Cpu },
  { name: "SQLite", desc: "Job & report storage", icon: Database },
  { name: "scikit-learn", desc: "Naive Bayes + TF-IDF", icon: Brain },
  { name: "Recharts", desc: "Analytics visualization", icon: Code2 },
];

const team = [
  { name: "Rolex", role: "Frontend & UI/UX", initials: "AS" },
  { name: "Zetsu", role: "ML Engineer", initials: "PI" },
  { name: "Sagar", role: "Backend / API", initials: "RV" },
  { name: "Ragas", role: "Data & Testing", initials: "SP" },
];

function About() {
  return (
    <div className="container mx-auto px-4 py-12 max-w-5xl">
      <div className="text-center mb-12">
        <Badge variant="outline" className="mb-3 border-primary/40 text-primary">
          <GraduationCap className="h-3 w-3 mr-1.5" /> Mini Project
        </Badge>
        <h1 className="text-4xl md:text-5xl font-bold">
          About <span className="text-gradient-cyber">ScamShield.AI</span>
        </h1>
        <p className="text-muted-foreground mt-4 max-w-2xl mx-auto">
          A college mini project that uses AI/ML to protect students from a rising wave of fake
          internship and job scams.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-6 mb-12">
        <Card className="p-6">
          <Target className="h-8 w-8 text-primary mb-3" />
          <h3 className="font-semibold mb-2">Purpose</h3>
          <p className="text-sm text-muted-foreground">
            Students are the top targets for fake hiring scams. This platform empowers them to
            verify any posting in seconds, before falling for fees or data theft.
          </p>
        </Card>
        <Card className="p-6">
          <Brain className="h-8 w-8 text-accent mb-3" />
          <h3 className="font-semibold mb-2">How AI/ML Helps</h3>
          <p className="text-sm text-muted-foreground">
            A Naive Bayes classifier trained on labeled job postings, combined with rule-based
            signals (keywords, email domains, salary anomalies), produces a risk score with
            explainable reasoning.
          </p>
        </Card>
        <Card className="p-6">
          <Lightbulb className="h-8 w-8 text-warning mb-3" />
          <h3 className="font-semibold mb-2">Why It Matters</h3>
          <p className="text-sm text-muted-foreground">
            Over ₹100 crore was lost to job-related scams in India last year. Educational tools like
            this can sharply reduce student exposure to fraud.
          </p>
        </Card>
      </div>

      <Card className="p-8 mb-12">
        <h2 className="text-2xl font-bold mb-6">Technology Stack</h2>
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
          {tech.map((t) => (
            <div key={t.name} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
              <div className="h-10 w-10 rounded-lg bg-gradient-cyber flex items-center justify-center shrink-0">
                <t.icon className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <div className="font-semibold text-sm">{t.name}</div>
                <div className="text-xs text-muted-foreground">{t.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-8">
        <h2 className="text-2xl font-bold mb-6">Project Team</h2>
        <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
          {team.map((m) => (
            <div
              key={m.name}
              className="text-center p-4 rounded-lg bg-muted/40 hover:bg-muted transition-colors"
            >
              <div className="h-16 w-16 rounded-full bg-gradient-cyber mx-auto flex items-center justify-center text-primary-foreground font-bold text-lg mb-3 shadow-glow">
                {m.initials}
              </div>
              <div className="font-semibold text-sm">{m.name}</div>
              <div className="text-xs text-muted-foreground mt-1">{m.role}</div>
            </div>
          ))}
        </div>
        <div className="mt-8 pt-6 border-t border-border text-center text-sm text-muted-foreground">
          Department of Computer Science & Engineering · Mini Project · Academic Year 2025–26
        </div>
      </Card>
    </div>
  );
}
