import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Building2, CheckCircle2, Search, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api, type ApiCompany } from "@/lib/api";

export const Route = createFileRoute("/company-verification")({
  component: CompanyVerification,
});

function CompanyVerification() {
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState(false);
  const [companies, setCompanies] = useState<ApiCompany[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Load companies on mount
    api
      .companies()
      .then((data) => {
        setCompanies(data.companies);
      })
      .catch(() => {
        setError("Backend unavailable — start it with `npm run backend`.");
      });
  }, []);

  const matches = companies.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) {
      toast.error("Enter a company name to verify.");
      return;
    }
    setSearched(true);
    toast.success("Company verification complete.");
  };

  return (
    <div className="container mx-auto min-w-0 max-w-5xl px-4 py-8 sm:py-12">
      <div className="mb-10 text-center">
        <Badge variant="outline" className="mb-3 border-primary/40 text-primary">
          <Building2 className="mr-1.5 h-3 w-3" /> Company Verification
        </Badge>
        <h1 className="break-words text-3xl font-bold sm:text-4xl">
          Check a Company Before You Apply
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
          Search verified and blacklisted company records from the ScamShield intelligence database.
        </p>
      </div>
      {error && (
        <div className="mb-6 p-4 rounded-md bg-destructive/10 border border-destructive/30 text-sm text-destructive">
          {error}
        </div>
      )}
      <Card className="glass mx-auto mb-8 w-full max-w-2xl p-3 sm:p-5">
        <form onSubmit={submit} className="flex min-w-0 gap-2 sm:gap-3">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search company name..."
            aria-label="Search company name"
          />
          <Button
            type="submit"
            className="min-h-11 shrink-0 bg-gradient-cyber"
            aria-label="Search companies"
          >
            <Search className="h-4 w-4" />
          </Button>
        </form>
      </Card>
      <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {(searched ? matches : companies).map((company) => (
          <Card key={company.id} className="min-w-0 overflow-hidden p-4 sm:p-5">
            <div className="mb-4 flex items-start justify-between">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10">
                {company.status === "Verified" ? (
                  <CheckCircle2 className="h-5 w-5 text-success" />
                ) : (
                  <ShieldAlert className="h-5 w-5 text-destructive" />
                )}
              </div>
              <Badge variant={company.status === "Verified" ? "outline" : "destructive"}>
                {company.status}
              </Badge>
            </div>
            <h2 className="break-words font-semibold">{company.name}</h2>
            <p className="mt-1 break-all text-sm text-muted-foreground">{company.domain}</p>
            <div className="mt-4 border-t pt-4 text-sm">
              Reports: <span className="font-mono">{company.reports}</span>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              Last checked: {company.last_checked}
            </div>
          </Card>
        ))}
      </div>
      {searched && matches.length === 0 && (
        <p className="mt-8 text-center text-muted-foreground">No matching company found.</p>
      )}
    </div>
  );
}
