import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Building2, Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/AdminShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, isRequestAborted, type ApiCompany } from "@/lib/api";

export const Route = createFileRoute("/admin/companies")({
  component: ManageCompanies,
});

function ManageCompanies() {
  const [companies, setCompanies] = useState<ApiCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"Verified" | "Blacklisted">("Verified");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [reload, setReload] = useState(0);
  const [dialog, setDialog] = useState<{
    open: boolean;
    mode: "add" | "edit";
    company: ApiCompany | null;
  }>({ open: false, mode: "add", company: null });

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(
      () => {
        setLoading(true);
        setError(null);
        api
          .companies({ q: query.trim(), status, page, page_size: 25 })
          .then((data) => {
            if (cancelled) return;
            setCompanies(data.companies);
            setTotal(data.total);
            setTotalPages(data.total_pages);
          })
          .catch((reason: unknown) => {
            if (!cancelled && !isRequestAborted(reason))
              setError(reason instanceof Error ? reason.message : "Could not load companies.");
          })
          .finally(() => {
            if (!cancelled) setLoading(false);
          });
      },
      query.trim() ? 250 : 0,
    );
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [page, query, reload, status]);

  const syncCompany = (company: ApiCompany | null, id?: string) => {
    setCompanies((current) => {
      if (!company) return current.filter((item) => item.id !== id);
      const exists = current.some((item) => item.id === company.id);
      return exists
        ? current.map((item) => (item.id === company.id ? company : item))
        : [company, ...current];
    });
    setReload((value) => value + 1);
  };

  if (loading) {
    return (
      <AdminShell>
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </AdminShell>
    );
  }

  const handleSave = async (name: string, domain: string) => {
    try {
      if (dialog.mode === "add") {
        const { company } = await api.addCompany({ name, domain, status: "Verified" });
        syncCompany(company);
        toast.success(`${name} added.`);
      } else if (dialog.company) {
        const { company } = await api.updateCompany(dialog.company.id, { name, domain });
        syncCompany(company);
        toast.success(`${name} updated.`);
      }
      setDialog((d) => ({ ...d, open: false }));
    } catch (error) {
      if (isRequestAborted(error)) return;
      toast.error("Failed to save company.");
    }
  };

  return (
    <AdminShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Badge variant="outline" className="mb-3 border-primary/40 text-primary">
            Manage Companies
          </Badge>
          <h1 className="text-3xl font-bold sm:text-4xl">Companies</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Statuses describe records maintained on this platform; they are not independent
            verification of a company.
          </p>
        </div>
        <label className="relative w-full sm:w-72">
          <span className="sr-only">Search companies</span>
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder="Search name or domain"
            className="pl-9"
          />
        </label>
        <Dialog open={dialog.open} onOpenChange={(v) => setDialog((d) => ({ ...d, open: v }))}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> Add Company
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{dialog.mode === "add" ? "Add Company" : "Edit Company"}</DialogTitle>
              <DialogDescription>
                {dialog.mode === "add"
                  ? "Enter the company name and domain to add it to the database."
                  : "Update the company details."}
              </DialogDescription>
            </DialogHeader>
            <CompanyForm
              mode={dialog.mode}
              company={dialog.company}
              onSave={handleSave}
              onCancel={() => setDialog((d) => ({ ...d, open: false }))}
            />
          </DialogContent>
        </Dialog>
      </div>
      <Tabs
        value={status === "Verified" ? "verified" : "blacklisted"}
        onValueChange={(value) => {
          setStatus(value === "verified" ? "Verified" : "Blacklisted");
          setPage(1);
        }}
      >
        <TabsList className="mb-6">
          <TabsTrigger value="verified">Verified Companies</TabsTrigger>
          <TabsTrigger value="blacklisted">Blacklisted Companies</TabsTrigger>
        </TabsList>
        <TabsContent value="verified">
          <CompanyList rows={companies} status="Verified" onChange={syncCompany} />
        </TabsContent>
        <TabsContent value="blacklisted">
          <CompanyList rows={companies} status="Blacklisted" onChange={syncCompany} />
        </TabsContent>
      </Tabs>
      {loading ? (
        <Card className="mt-4 flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </Card>
      ) : error ? (
        <Card className="mt-4 flex flex-col items-start gap-3 p-4" role="alert">
          <p>{error}</p>
          <Button variant="outline" onClick={() => setReload((value) => value + 1)}>
            Retry
          </Button>
        </Card>
      ) : total === 0 ? (
        <Card className="mt-4 p-6 text-center text-sm text-muted-foreground">
          No company records match this tab or search.
        </Card>
      ) : (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">
            Page {page} of {totalPages} · {total} companies
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((value) => value - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              disabled={page >= totalPages}
              onClick={() => setPage((value) => value + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </AdminShell>
  );
}

function CompanyForm({
  mode,
  company,
  onSave,
  onCancel,
}: {
  mode: "add" | "edit";
  company: ApiCompany | null;
  onSave: (name: string, domain: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(company?.name ?? "");
  const [domain, setDomain] = useState(company?.domain ?? "");

  return (
    <div className="grid gap-4 py-4">
      <div className="space-y-2">
        <Label htmlFor="name">Company Name *</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. TechNova Labs"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="domain">Domain</Label>
        <Input
          id="domain"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="e.g. technova.example"
        />
      </div>
      <div className="flex justify-end gap-2 pt-4">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={() => onSave(name, domain)} disabled={!name.trim()}>
          {mode === "add" ? "Add" : "Save"}
        </Button>
      </div>
    </div>
  );
}

function CompanyList({
  rows,
  status,
  onChange,
}: {
  rows: ApiCompany[];
  status: "Verified" | "Blacklisted";
  onChange: (company: ApiCompany | null, id?: string) => void;
}) {
  const actions =
    status === "Verified" ? ["Edit", "Delete", "Blacklist"] : ["Edit", "Delete", "Verify"];

  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    action: string;
    company: ApiCompany | null;
  }>({ open: false, action: "", company: null });

  const runAction = async (company: ApiCompany, action: string) => {
    // For destructive actions, require confirmation
    if (action === "Delete") {
      setConfirmDialog({ open: true, action, company });
      return;
    }

    try {
      if (action === "Blacklist") {
        const { company: updated } = await api.updateCompany(company.id, { status: "Blacklisted" });
        onChange(updated);
        toast.success(`${company.name} blacklisted.`);
      } else if (action === "Verify") {
        const { company: updated } = await api.updateCompany(company.id, { status: "Verified" });
        onChange(updated);
        toast.success(`${company.name} verified.`);
      } else if (action === "Edit") {
        setDialogState({ open: true, mode: "edit", company });
      }
    } catch (error) {
      if (!isRequestAborted(error)) toast.error(`Could not update ${company.name}.`);
    }
  };

  // Local state for the edit dialog
  const [editDialog, setDialogState] = useState<{
    open: boolean;
    mode: "add" | "edit";
    company: ApiCompany | null;
  }>({ open: false, mode: "add", company: null });

  return (
    <>
      <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-3">
        {rows.map((row) => (
          <Card key={row.id} className="min-w-0 overflow-hidden p-4 sm:p-5">
            <div className="mb-4 flex items-start justify-between">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10">
                <Building2 className="h-5 w-5 text-primary" />
              </div>
              <Badge variant={status === "Verified" ? "outline" : "destructive"}>{status}</Badge>
            </div>
            <h2 className="break-words font-semibold">{row.name}</h2>
            <p className="break-all text-sm text-muted-foreground">{row.domain || "No domain"}</p>
            <p className="mt-3 text-xs text-muted-foreground">Last checked: {row.last_checked}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {actions.map((action) => (
                <Button
                  key={action}
                  size="sm"
                  variant={action === "Delete" ? "destructive" : "outline"}
                  onClick={() => runAction(row, action)}
                >
                  {action}
                </Button>
              ))}
            </div>
          </Card>
        ))}
      </div>

      {/* Confirm dialog for delete */}
      <Dialog
        open={confirmDialog.open}
        onOpenChange={(v) => setConfirmDialog((d) => ({ ...d, open: v }))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete "{confirmDialog.company?.name}"?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. The company will be permanently removed from the
              database.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 py-4">
            <Button
              variant="outline"
              onClick={() => setConfirmDialog((d) => ({ ...d, open: false }))}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                try {
                  if (confirmDialog.company) {
                    await api.deleteCompany(confirmDialog.company.id);
                    onChange(null, confirmDialog.company.id);
                    toast.success(`${confirmDialog.company.name} deleted.`);
                  }
                  setConfirmDialog((d) => ({ ...d, open: false }));
                } catch (error) {
                  if (!isRequestAborted(error)) toast.error("Failed to delete company.");
                }
              }}
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog
        open={editDialog.open}
        onOpenChange={(v) => setDialogState((d) => ({ ...d, open: v }))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Company</DialogTitle>
            <DialogDescription>Update the company details below.</DialogDescription>
          </DialogHeader>
          <CompanyForm
            mode="edit"
            company={editDialog.company}
            onSave={async (name, domain) => {
              try {
                if (editDialog.company) {
                  const { company: updated } = await api.updateCompany(editDialog.company.id, {
                    name,
                    domain,
                  });
                  onChange(updated);
                  toast.success(`${name} updated.`);
                }
                setDialogState((d) => ({ ...d, open: false }));
              } catch (error) {
                if (!isRequestAborted(error)) toast.error(`Failed to update ${name}.`);
              }
            }}
            onCancel={() => setDialogState((d) => ({ ...d, open: false }))}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
