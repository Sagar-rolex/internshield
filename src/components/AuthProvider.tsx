import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Navigate, useLocation } from "@tanstack/react-router";
import { toast } from "sonner";
import { Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api, cancelAuthenticatedRequests, setToken } from "@/lib/api";
import { AUTH_SESSION_CHANGE_EVENT } from "@/lib/auth-events";

export type Role = "guest" | "user" | "admin";

export type AuthUser = {
  id: string;
  role: Exclude<Role, "guest">;
  name: string;
  email: string;
  phone?: string;
  college?: string;
  course?: string;
  status?: string;
  photo?: string;
};

type RegisterInput = {
  name: string;
  email: string;
  password: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  role: Role;
  loading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  register: (input: RegisterInput) => Promise<boolean>;
  adminLogin: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
};

const STORAGE_KEY = "scamshield.auth.user";

const AuthContext = createContext<AuthContextValue | null>(null);

function safeParseUser(raw: string | null): AuthUser | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.id === "string" &&
      typeof parsed.role === "string" &&
      typeof parsed.name === "string" &&
      typeof parsed.email === "string"
    ) {
      return parsed as AuthUser;
    }
    return null;
  } catch {
    return null;
  }
}

/** Persist both user object and bearer token together. */
function persistSession(next: AuthUser | null, token: string | null) {
  try {
    if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Keep the in-memory session usable when browser storage is unavailable.
  }
  if (next && token) setToken(token);
  if (!next) setToken(null);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const userRef = useRef<AuthUser | null>(null);
  const logoutInFlight = useRef(false);

  const removeUserQueries = useCallback(
    (userId: string | undefined) => {
      if (userId) {
        queryClient.removeQueries({ queryKey: ["user-dashboard", userId], exact: true });
      }
    },
    [queryClient],
  );

  const applySession = useCallback(
    (next: AuthUser | null) => {
      const previous = userRef.current;
      const changed = previous?.id !== next?.id || previous?.role !== next?.role;
      if (changed) {
        cancelAuthenticatedRequests();
        removeUserQueries(previous?.id);
        removeUserQueries(next?.id);
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent(AUTH_SESSION_CHANGE_EVENT, {
              detail: { userId: next?.id ?? null },
            }),
          );
        }
      }
      userRef.current = next;
      setUser(next);
    },
    [removeUserQueries],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = safeParseUser(localStorage.getItem(STORAGE_KEY));
    userRef.current = stored;
    setUser(stored);
    setLoading(false);
  }, []);

  // Cross-tab sync (logout in another tab kills local session too)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) {
        if (e.key === "scamshield.auth.token") {
          if (e.newValue === null) {
            applySession(null);
          }
        }
        return;
      }
      applySession(safeParseUser(localStorage.getItem(STORAGE_KEY)));
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [applySession]);

  const persist = useCallback(
    (next: AuthUser | null, token: string | null = null) => {
      applySession(next);
      if (next) logoutInFlight.current = false;
      if (typeof window === "undefined") return;
      persistSession(next, token);
    },
    [applySession],
  );

  const loginInFlight = useRef(false);

  const login = useCallback(
    async (email: string, password: string) => {
      if (loginInFlight.current) return false;
      loginInFlight.current = true;
      try {
        const { user: next, token } = await api.login(email, password);
        if (next.role !== "user") {
          toast.error("Invalid credentials. Please check your account type.");
          return false;
        }
        persist(next, token);
        toast.success("Login successful. Welcome back.");
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Login failed.";
        toast.error(message);
        return false;
      } finally {
        loginInFlight.current = false;
      }
    },
    [persist],
  );

  const registerInFlight = useRef(false);

  const register = useCallback(
    async (input: RegisterInput) => {
      if (registerInFlight.current) return false;
      registerInFlight.current = true;
      try {
        const { user: next, token } = await api.register(input);
        persist(next, token);
        toast.success("Account created successfully.");
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Registration failed.";
        toast.error(message);
        return false;
      } finally {
        registerInFlight.current = false;
      }
    },
    [persist],
  );

  const adminLoginInFlight = useRef(false);

  const adminLogin = useCallback(
    async (email: string, password: string) => {
      if (adminLoginInFlight.current) return false;
      adminLoginInFlight.current = true;
      try {
        const { user: next, token } = await api.adminLogin(email, password);
        if (next.role !== "admin") {
          toast.error("Invalid credentials. Please use an admin account.");
          return false;
        }
        persist(next, token);
        toast.success("Admin login successful.");
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Admin login failed.";
        toast.error(message);
        return false;
      } finally {
        adminLoginInFlight.current = false;
      }
    },
    [persist],
  );

  const logout = useCallback(() => {
    if (!userRef.current || logoutInFlight.current) return;
    logoutInFlight.current = true;

    // Start revocation while the bearer token still exists. It is intentionally
    // not awaited: local sign-out and route protection must not depend on Render.
    void api.logout().catch((error: unknown) => {
      if ((error as { status?: number } | null)?.status !== 401) {
        toast.info(
          "You are signed out on this device, but the server could not confirm token revocation.",
        );
      }
    });
    persist(null);
    toast.success("You have been logged out.");
  }, [persist]);

  const valueMemo: AuthContextValue = {
    user,
    role: user?.role ?? "guest",
    loading,
    login,
    register,
    adminLogin,
    logout,
  };

  return <AuthContext.Provider value={valueMemo}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export function ProtectedRoute({
  role,
  children,
}: {
  role: "user" | "admin";
  children: React.ReactNode;
}) {
  const auth = useAuth();
  const location = useLocation();
  const redirect = location.pathname === "/detect" ? "/detect" : "/dashboard";

  if (auth.loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!auth.user) return <Navigate to="/login" search={{ redirect }} replace />;

  if (auth.role !== role) {
    // Admin superset: allow admin into "user" guarded routes
    if (role === "user" && auth.role === "admin") return <>{children}</>;
    return <Navigate to="/unauthorized" replace />;
  }

  return <>{children}</>;
}

export function UnauthorizedPanel() {
  return (
    <div className="container mx-auto flex min-h-[70vh] items-center justify-center px-4 py-16">
      <Card className="glass max-w-md p-8 text-center shadow-card">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/15">
          <ShieldAlert className="h-7 w-7 text-destructive" />
        </div>
        <h1 className="text-3xl font-bold">Unauthorized Access</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          This area is protected. Please sign in with an account that has the required permissions.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button asChild variant="outline">
            <a href="/login">User Login</a>
          </Button>
          <Button asChild>
            <a href="/admin-login">Admin Login</a>
          </Button>
        </div>
      </Card>
    </div>
  );
}
