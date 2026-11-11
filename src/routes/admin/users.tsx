import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/AdminShell";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  api,
  isRequestAborted,
  type AdminUserDetail,
  type ApiUser,
  type PaginatedUsersResponse,
} from "@/lib/api";

export const Route = createFileRoute("/admin/users")({ component: ManageUsers });

const EMPTY_PAGE: PaginatedUsersResponse = {
  users: [],
  total: 0,
  page: 1,
  page_size: 25,
  total_pages: 0,
};

function ManageUsers() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [role, setRole] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortBy, setSortBy] = useState("created_at");
  const [sortOrder, setSortOrder] = useState("desc");
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [result, setResult] = useState<PaginatedUsersResponse>(EMPTY_PAGE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ApiUser | null>(null);
  const [roleTarget, setRoleTarget] = useState<{ account: ApiUser; role: "user" | "admin" } | null>(
    null,
  );
  const [detailTarget, setDetailTarget] = useState<AdminUserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(
      () => {
        setLoading(true);
        setError(null);
        api
          .users({
            q: query.trim(),
            status,
            role,
            date_from: dateFrom,
            date_to: dateTo,
            sort_by: sortBy,
            sort_order: sortOrder,
            page,
            page_size: 25,
          })
          .then((data) => {
            if (!cancelled) setResult(data);
          })
          .catch((reason: unknown) => {
            if (cancelled || isRequestAborted(reason)) return;
            setError(reason instanceof Error ? reason.message : "Could not load users.");
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
  }, [dateFrom, dateTo, page, query, reload, role, sortBy, sortOrder, status]);

  const setFilter = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setPage(1);
  };

  const updateStatus = async (account: ApiUser, nextStatus: string) => {
    try {
      await api.updateUser(account.id, { status: nextStatus });
      toast.success(`${account.name} marked ${nextStatus}.`);
      setReload((value) => value + 1);
    } catch (reason) {
      if (!isRequestAborted(reason))
        toast.error(reason instanceof Error ? reason.message : "Failed to update account.");
    }
  };

  const deleteUser = async (account: ApiUser) => {
    setDeleteTarget(null);
    try {
      await api.deleteUser(account.id);
      toast.success(`${account.name} deleted.`);
      setReload((value) => value + 1);
    } catch (reason) {
      if (!isRequestAborted(reason))
        toast.error(reason instanceof Error ? reason.message : "Failed to delete user.");
    }
  };

  const changeRole = async () => {
    if (!roleTarget) return;
    const { account, role: nextRole } = roleTarget;
    setRoleTarget(null);
    try {
      await api.updateUser(account.id, { role: nextRole });
      toast.success(`${account.name} role updated to ${nextRole}.`);
      setReload((value) => value + 1);
    } catch (reason) {
      if (!isRequestAborted(reason))
        toast.error(reason instanceof Error ? reason.message : "Failed to update role.");
    }
  };

  const openDetails = async (account: ApiUser) => {
    setDetailTarget(null);
    setDetailLoading(true);
    try {
      setDetailTarget(await api.adminUser(account.id));
    } catch (reason) {
      if (!isRequestAborted(reason))
        toast.error(reason instanceof Error ? reason.message : "Could not load user details.");
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <AdminShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Badge variant="outline" className="mb-3 border-primary/40 text-primary">
            Manage Users
          </Badge>
          <h1 className="text-3xl font-bold sm:text-4xl">Users</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {result.total.toLocaleString()} matching accounts
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setFilter(setQuery)(event.target.value)}
            placeholder="Search name or email"
            className="pl-9"
            aria-label="Search users"
          />
        </div>
      </div>

      <Card className="mb-4 flex min-w-0 flex-wrap items-end gap-3 p-3 sm:p-4">
        <Filter
          label="Status"
          value={status}
          onChange={setFilter(setStatus)}
          options={[
            ["", "All statuses"],
            ["Active", "Active"],
            ["Inactive", "Inactive"],
            ["Review", "Review"],
          ]}
        />
        <Filter
          label="Role"
          value={role}
          onChange={setFilter(setRole)}
          options={[
            ["", "All roles"],
            ["user", "User"],
            ["admin", "Admin"],
          ]}
        />
        <label className="grid gap-1 text-xs text-muted-foreground">
          Registered from
          <input
            type="date"
            value={dateFrom}
            onChange={(event) => setFilter(setDateFrom)(event.target.value)}
            className="min-h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
          />
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          Registered through
          <input
            type="date"
            value={dateTo}
            onChange={(event) => setFilter(setDateTo)(event.target.value)}
            className="min-h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
          />
        </label>
        <Filter
          label="Sort by"
          value={sortBy}
          onChange={setFilter(setSortBy)}
          options={[
            ["created_at", "Registration date"],
            ["name", "Name"],
            ["email", "Email"],
          ]}
        />
        <Button
          type="button"
          variant="outline"
          className="min-h-10"
          onClick={() => {
            setSortOrder((value) => (value === "asc" ? "desc" : "asc"));
            setPage(1);
          }}
        >
          Order: {sortOrder === "asc" ? "Oldest" : "Newest"}
        </Button>
      </Card>

      <Card className="min-w-0 overflow-hidden p-3 sm:p-6">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-start gap-3 py-6" role="alert">
            <p>{error}</p>
            <Button variant="outline" onClick={() => setReload((value) => value + 1)}>
              Retry
            </Button>
          </div>
        ) : result.users.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No accounts match these filters.
          </div>
        ) : (
          <div className="min-w-0 max-w-full overflow-x-auto overscroll-x-contain">
            <table className="w-full min-w-[980px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="px-2 py-3">Profile</th>
                  <th className="px-2 py-3">Name</th>
                  <th className="px-2 py-3">Email</th>
                  <th className="px-2 py-3">College</th>
                  <th className="px-2 py-3">Registered</th>
                  <th className="px-2 py-3">Status</th>
                  <th className="px-2 py-3">Role</th>
                  <th className="px-2 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {result.users.map((account) => (
                  <tr key={account.id} className="border-b border-border/50">
                    <td className="px-2 py-3">
                      <Avatar>
                        <AvatarFallback>{account.photo || account.name.slice(0, 1)}</AvatarFallback>
                      </Avatar>
                    </td>
                    <td className="px-2 py-3 font-medium">{account.name}</td>
                    <td className="px-2 py-3 text-muted-foreground">{account.email}</td>
                    <td className="px-2 py-3">{account.college || "Not added"}</td>
                    <td className="px-2 py-3 text-muted-foreground">
                      {account.created_at?.slice(0, 10) || "Unavailable"}
                    </td>
                    <td className="px-2 py-3">
                      <Badge variant={account.status === "Active" ? "outline" : "secondary"}>
                        {account.status}
                      </Badge>
                    </td>
                    <td className="px-2 py-3">{account.role}</td>
                    <td className="px-2 py-3">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void openDetails(account)}
                          disabled={detailLoading}
                        >
                          Details
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void updateStatus(account, "Active")}
                          disabled={account.status === "Active"}
                        >
                          Activate
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void updateStatus(account, "Inactive")}
                          disabled={account.status !== "Active"}
                        >
                          Deactivate
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setRoleTarget({
                              account,
                              role: account.role === "admin" ? "user" : "admin",
                            })
                          }
                        >
                          {account.role === "admin" ? "Remove admin" : "Make admin"}
                        </Button>
                        {account.role !== "admin" && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => setDeleteTarget(account)}
                          >
                            Delete
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && !error && result.total_pages > 1 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm">
            <span className="text-muted-foreground">
              Page {result.page} of {result.total_pages} · {result.total} accounts
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
                disabled={page >= result.total_pages}
                onClick={() => setPage((value) => value + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete “{deleteTarget?.name}”?</DialogTitle>
            <DialogDescription>
              This permanently removes this user account and its linked platform activity. Admin
              accounts are protected.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 py-4">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && void deleteUser(deleteTarget)}
            >
              Delete account
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={roleTarget !== null} onOpenChange={(open) => !open && setRoleTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change role for {roleTarget?.account.name}?</DialogTitle>
            <DialogDescription>
              This account will have{" "}
              {roleTarget?.role === "admin" ? "administrator" : "regular user"} access. The backend
              checks administrator authorization and protects the last active administrator.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 py-4">
            <Button variant="outline" onClick={() => setRoleTarget(null)}>
              Cancel
            </Button>
            <Button onClick={() => void changeRole()}>Confirm role change</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={detailTarget !== null} onOpenChange={(open) => !open && setDetailTarget(null)}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{detailTarget?.user.name || "User details"}</DialogTitle>
            <DialogDescription>{detailTarget?.user.email}</DialogDescription>
          </DialogHeader>
          {detailTarget && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <Detail label="Role" value={detailTarget.user.role} />
                <Detail label="Status" value={detailTarget.user.status || "Unknown"} />
                <Detail label="College" value={detailTarget.user.college || "Not added"} />
                <Detail
                  label="Registered"
                  value={detailTarget.user.created_at?.slice(0, 10) || "Unavailable"}
                />
                <Detail label="Analyses" value={detailTarget.stats.analyses} />
                <Detail label="Reports" value={detailTarget.stats.reports} />
                <Detail label="Company checks" value={detailTarget.stats.companyChecks} />
              </div>
              <h3 className="font-semibold">Recent analyses</h3>
              {detailTarget.recentAnalyses.length ? (
                detailTarget.recentAnalyses.map((row) => (
                  <div key={row.id} className="rounded-lg bg-muted/40 p-3">
                    <div className="font-medium">
                      {row.job_title || "Untitled job"} · {row.risk}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {row.company} · {row.created_at.slice(0, 10)}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground">No analyses recorded.</p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
}

function Filter({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<readonly [string, string]>;
}) {
  return (
    <label className="grid gap-1 text-xs text-muted-foreground">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
      >
        {options.map(([option, labelText]) => (
          <option key={option || "all"} value={option}>
            {labelText}
          </option>
        ))}
      </select>
    </label>
  );
}

function Detail({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md bg-muted/40 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="break-words font-medium">{value}</div>
    </div>
  );
}
