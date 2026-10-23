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
import { api, type ApiUser } from "@/lib/api";

export const Route = createFileRoute("/admin/users")({
  component: ManageUsers,
});

function ManageUsers() {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<ApiUser | null>(null);

  const loadUsers = async () => {
    try {
      const data = await api.users();
      setUsers(data.users);
    } catch {
      toast.error("Backend unavailable — start it with `npm run backend`.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const filtered = users.filter((u) =>
    `${u.name} ${u.email} ${u.college ?? ""}`.toLowerCase().includes(query.toLowerCase()),
  );

  const updateStatus = async (user: ApiUser, status: string) => {
    if (!user.id) return;
    try {
      await api.updateUser(user.id, { status });
      toast.success(`${user.name} marked ${status}.`);
      loadUsers();
    } catch {
      toast.error(`Failed to update ${user.name}.`);
    }
  };

  const deleteUser = async (user: ApiUser) => {
    if (!user.id) return;
    setDeleteTarget(null);
    try {
      await api.deleteUser(user.id);
      toast.success(`${user.name} deleted.`);
      loadUsers();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete user.";
      toast.error(message);
    }
  };

  return (
    <AdminShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Badge variant="outline" className="mb-3 border-primary/40 text-primary">
            Manage Users
          </Badge>
          <h1 className="text-4xl font-bold">Users</h1>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search users..."
            className="pl-9"
            aria-label="Search users"
          />
        </div>
      </div>
      <Card className="p-6">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="min-w-0 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="px-2 py-3">Profile Photo</th>
                  <th className="px-2 py-3">Name</th>
                  <th className="px-2 py-3">Email</th>
                  <th className="px-2 py-3">College</th>
                  <th className="px-2 py-3">Status</th>
                  <th className="px-2 py-3">Role</th>
                  <th className="px-2 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((user) => (
                  <tr key={user.email} className="border-b border-border/50">
                    <td className="px-2 py-3">
                      <Avatar>
                        <AvatarFallback>{user.photo}</AvatarFallback>
                      </Avatar>
                    </td>
                    <td className="px-2 py-3 font-medium">{user.name}</td>
                    <td className="px-2 py-3 text-muted-foreground">{user.email}</td>
                    <td className="px-2 py-3">{user.college ?? "Not added"}</td>
                    <td className="px-2 py-3">
                      <Badge variant={user.status === "Active" ? "outline" : "secondary"}>
                        {user.status}
                      </Badge>
                    </td>
                    <td className="px-2 py-3">{user.role}</td>
                    <td className="px-2 py-3">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updateStatus(user, "Active")}
                        >
                          Activate
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updateStatus(user, "Inactive")}
                        >
                          Deactivate
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => setDeleteTarget(user)}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Delete confirmation */}
      <Dialog open={deleteTarget !== null} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete "{deleteTarget?.name}"?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. The user account will be permanently removed (admin
              accounts are protected).
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 py-4">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => deleteTarget && deleteUser(deleteTarget)}>
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
}
