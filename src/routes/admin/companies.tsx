import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Building2, Loader2, Plus } from "lucide-react";
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
import { api, type ApiCompany } from "@/lib/api";

export const Route = createFileRoute("/admin/companies")({
  component: ManageCompanies,
});

function ManageCompanies() {
  const [companies, setCompanies] = useState<ApiCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<{
    open: boolean;
    mode: "add" | "edit";
    company: ApiCompany | null;
  }>({ open: false, mode: "add", company: null });

  const loadCompanies = async () => {
    try {
      const data = await api.companies();
      setCompanies(data.companies);
    } catch {
      toast.error("Backend unavailable — start it with `npm run backend`.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCompanies();
  }, []);

  const syncCompany = (company: ApiCompany | null, id?: string) => {
    setCompanies((current) => {
      if (!company) return current.filter((item) => item.id !== id);
      const exists = current.some((item) => item.id === company.id);
      return exists
        ? current.map((item) => (item.id === company.id ? company : item))
        : [company, ...current];
    });
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
    } catch {
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
        </div>
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
      <Tabs defaultValue="verified">
        <TabsList className="mb-6">
          <TabsTrigger value="verified">Verified Companies</TabsTrigger>
          <TabsTrigger value="blacklisted">Blacklisted Companies</TabsTrigger>
        </TabsList>
        <TabsContent value="verified">
          <CompanyList
            rows={companies.filter((company) => company.status === "Verified")}
            status="Verified"
            onChange={syncCompany}
          />
        </TabsContent>
        <TabsContent value="blacklisted">
          <CompanyList
            rows={companies.filter((company) => company.status === "Blacklisted")}
            status="Blacklisted"
            onChange={syncCompany}
          />
        </TabsContent>
      </Tabs>
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
          disabled={mode === "edit"}
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
                if (confirmDialog.company) {
                  await api.deleteCompany(confirmDialog.company.id);
                  onChange(null, confirmDialog.company.id);
                  toast.success(`${confirmDialog.company.name} deleted.`);
                }
                setConfirmDialog((d) => ({ ...d, open: false }));
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
              if (editDialog.company) {
                const { company: updated } = await api.updateCompany(editDialog.company.id, {
                  name,
                  domain,
                });
                onChange(updated);
                toast.success(`${name} updated.`);
              }
              setDialogState((d) => ({ ...d, open: false }));
            }}
            onCancel={() => setDialogState((d) => ({ ...d, open: false }))}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
