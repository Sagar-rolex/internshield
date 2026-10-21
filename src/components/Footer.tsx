import { Shield, Github, Twitter, Linkedin, Mail } from "lucide-react";
import { Link } from "@tanstack/react-router";

export function Footer() {
  return (
    <footer className="border-t border-border mt-24 bg-card/30">
      <div className="container mx-auto px-4 py-12">
        <div className="grid md:grid-cols-4 gap-8">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Shield className="h-6 w-6 text-primary" />
              <span className="font-bold text-lg">ScamShield<span className="text-gradient-cyber">.AI</span></span>
            </div>
            <p className="text-sm text-muted-foreground">
              AI-powered detection of fake internships and job scams to protect students.
            </p>
          </div>
          <div>
            <h4 className="font-semibold mb-3">Explore</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link to="/detect" className="hover:text-primary">Scam Detector</Link></li>
              <li><Link to="/dashboard" className="hover:text-primary">Dashboard</Link></li>
              <li><Link to="/report" className="hover:text-primary">Report Scam</Link></li>
              <li><Link to="/about" className="hover:text-primary">About Project</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-3">College</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>Department of Computer Science</li>
              <li>Mini Project — 2026</li>
              <li>Built with React + AI/ML</li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-3">Connect</h4>
            <div className="flex gap-3">
              {[Github, Twitter, Linkedin, Mail].map((Icon, i) => (
                <span
                  key={i}
                  className="h-9 w-9 rounded-md bg-muted flex items-center justify-center opacity-50"
                  title="Social links are placeholders in the prototype"
                >
                  <Icon className="h-4 w-4" />
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-10 pt-6 border-t border-border text-center text-xs text-muted-foreground">
          © 2026 ScamShield.AI · Built for educational purposes · All scam detections use simulated AI models
        </div>
      </div>
    </footer>
  );
}