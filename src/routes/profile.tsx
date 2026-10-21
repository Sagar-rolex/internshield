import { createFileRoute } from "@tanstack/react-router";
import { KeyRound, LogOut, Pencil, Phone, School, UserRound } from "lucide-react";
import { toast } from "sonner";
import { ProtectedRoute, useAuth } from "@/components/AuthProvider";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/profile")({
  component: ProfileRoute,
});

function ProfileRoute() {
  return (
    <ProtectedRoute role="user">
      <Profile />
    </ProtectedRoute>
  );
}

function Profile() {
  const { user, logout } = useAuth();
  return (
    <div className="container mx-auto max-w-4xl px-4 py-12">
      <Card className="glass overflow-hidden shadow-card">
        <div className="bg-gradient-hero p-8 text-primary-foreground">
          <Avatar className="h-24 w-24 border-4 border-white/30">
            <AvatarFallback className="bg-white/20 text-2xl text-white">
              {user?.photo}
            </AvatarFallback>
          </Avatar>
          <h1 className="mt-5 text-3xl font-bold">{user?.name}</h1>
          <p className="text-primary-foreground/80">{user?.email}</p>
        </div>
        <div className="grid gap-4 p-6 md:grid-cols-2">
          <Info icon={Phone} label="Phone Number" value={user?.phone ?? "Not added"} />
          <Info icon={School} label="College" value={user?.college ?? "Not added"} />
          <Info icon={UserRound} label="Course" value={user?.course ?? "Not added"} />
          <Info icon={KeyRound} label="Role" value="Verified User" />
        </div>
        <div className="flex flex-wrap gap-3 border-t p-6">
          <Button onClick={() => toast.info("Edit profile is UI only in this prototype.")}>
            <Pencil className="mr-2 h-4 w-4" /> Edit Profile
          </Button>
          <Button
            variant="outline"
            onClick={() => toast.info("Change password is UI only in this prototype.")}
          >
            <KeyRound className="mr-2 h-4 w-4" /> Change Password
          </Button>
          <Button variant="destructive" onClick={logout}>
            <LogOut className="mr-2 h-4 w-4" /> Logout
          </Button>
        </div>
      </Card>
    </div>
  );
}

function Info({ icon: Icon, label, value }: { icon: typeof Phone; label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card/50 p-4">
      <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="h-4 w-4 text-primary" /> {label}
      </div>
      <Badge variant="outline" className="max-w-full whitespace-normal text-left">
        {value}
      </Badge>
    </div>
  );
}
