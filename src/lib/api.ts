// ── Typed HTTP client ──
// Env-safe API base URL, automatic Authorization header injection,
// response-error unwrapping, and AbortController support for cleanup.

import type { AuthUser } from "@/components/AuthProvider";

const configuredApiUrl =
  typeof import.meta !== "undefined" ? import.meta.env?.VITE_API_URL?.trim() : undefined;
const defaultApiUrl = import.meta.env.DEV
  ? "http://127.0.0.1:4001/api"
  : "https://internshield-backend.onrender.com/api";
const API_URL = (configuredApiUrl || defaultApiUrl).replace(/\/+$/, "");

const AUTH_KEY = "scamshield.auth.token";
const authenticatedRequests = new Set<AbortController>();

/** Stop in-flight requests made with the current session token. */
export function cancelAuthenticatedRequests() {
  for (const controller of authenticatedRequests) controller.abort();
  authenticatedRequests.clear();
}

export function isRequestAborted(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

// ── Token management (bearer token stored in localStorage) ────────────────
// NOTE: In production, httpOnly cookies are preferred. localStorage tokens
// are acceptable for a prototype / college project, provided the backend
// issues short-lived tokens and supports revocation.

export function getToken(): string | null {
  try {
    return localStorage.getItem(AUTH_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(AUTH_KEY, token);
    else localStorage.removeItem(AUTH_KEY);
  } catch {
    // Storage full or not available — fail silently for prototypes.
  }
}

// ── Core request helper ───────────────────────────────────────────────────

type ApiError = { error?: unknown; detail?: unknown };

function errorMessage(data: ApiError, status: number): string {
  if (typeof data.error === "string" && data.error.trim()) return data.error;
  if (typeof data.detail === "string" && data.detail.trim()) return data.detail;
  if (Array.isArray(data.detail)) {
    const firstMessage = data.detail.find(
      (item): item is { msg: string } =>
        typeof item === "object" && item !== null && "msg" in item && typeof item.msg === "string",
    )?.msg;
    if (firstMessage) return firstMessage;
  }
  if (status >= 500) return "The service could not complete the request. Please try again.";
  return `Request failed (${status}). Please check the request and try again.`;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  trackAuthenticatedRequest = true,
): Promise<T> {
  const token = getToken();
  const sessionController = token && trackAuthenticatedRequest ? new AbortController() : null;
  if (sessionController) authenticatedRequests.add(sessionController);
  const isForm = options.body instanceof FormData;
  const headers: Record<string, string> = isForm
    ? { ...((options.headers as Record<string, string>) ?? {}) }
    : {
        "Content-Type": "application/json",
        ...((options.headers as Record<string, string>) ?? {}),
      };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  try {
    let response: Response;
    try {
      response = await fetch(`${API_URL}${path}`, {
        ...options,
        headers,
        signal:
          sessionController && options.signal
            ? AbortSignal.any([sessionController.signal, options.signal])
            : (sessionController?.signal ?? options.signal),
        // Authentication uses the Authorization bearer token; cookies are not used by this API.
        credentials: "omit",
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw error;
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new Error("The assistant took too long to respond. Please retry.");
      }
      throw new Error(
        "Could not reach the backend service. Check your connection and API configuration, then retry.",
      );
    }

    // Handle empty-body responses (e.g. 204)
    if (response.status === 204) return undefined as T;

    // Attempt to parse the body as JSON regardless of status code — the server
    // always returns structured JSON even on errors.
    let data: T & ApiError;
    try {
      data = (await response.json()) as T & ApiError;
    } catch {
      if (!response.ok && response.status >= 500) {
        throw new Error("The service could not complete the request. Please try again.");
      }
      throw new Error("The service returned an unreadable response. Please try again.");
    }

    if (!response.ok) {
      const message = errorMessage(data, response.status);
      const err = new Error(message) as Error & { status: number };
      err.status = response.status;
      throw err;
    }

    return data;
  } finally {
    if (sessionController) authenticatedRequests.delete(sessionController);
  }
}

// ── Types ─────────────────────────────────────────────────────────────────

export type ApiUser = AuthUser & {
  id: string;
  status?: string;
  created_at?: string;
};

export type PaginatedUsersResponse = {
  users: ApiUser[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
};

export type AdminUserDetail = {
  user: ApiUser;
  stats: { analyses: number; reports: number; companyChecks: number };
  recentAnalyses: Array<{
    id: string;
    job_title: string;
    company: string;
    risk: string;
    created_at: string;
  }>;
};

export type ApiReport = {
  id: string;
  company: string;
  reporter: string;
  date: string;
  status: string;
  risk_level: string;
  details?: string;
};

export type ApiCompany = {
  id: string;
  name: string;
  domain: string;
  status: "Verified" | "Blacklisted";
  reports: number;
  last_checked: string;
};

export type UserDashboardResponse = {
  stats: {
    jobsAnalyzed: number;
    reportsSubmitted: number;
    savedResults: number;
    companyChecks: number;
  };
  recentAnalyses: AnalysisResult[];
};

export type AdminAnalyticsResponse = {
  period: string;
  dateRange: { from: string | null; to: string | null };
  granularity: "hour" | "day" | "week" | "month";
  cards: {
    totalUsers: number;
    activeUsers: number;
    inactiveUsers: number;
    reviewUsers: number;
    newUsers: number;
    jobsAnalyzed: number;
    scamsDetected: number;
    highRiskDetections: number;
    mediumRiskDetections: number;
    lowRiskDetections: number;
    totalReports: number;
    reportsPending: number;
    verifiedCompanies: number;
    totalCompanies: number;
    companyChecks: number;
    detectionRate: number;
  };
  monthly: Array<{
    bucket: string;
    label: string;
    jobs: number;
    scams: number;
    registrations: number;
    reports: number;
  }>;
  riskDistribution: Array<{ risk: string; count: number }>;
  scamCategories: Array<{ category: string; count: number }>;
  reportStatusDistribution: Array<{ status: string; count: number }>;
  companyStatusDistribution: Array<{ status: string; count: number }>;
  topCompanies: Array<{ company: string; reports: number }>;
  recentUsers: ApiUser[];
  recentReports: ApiReport[];
  recentCompanies: ApiCompany[];
  recentAnalyses: Array<{
    id: string;
    job_title: string;
    company: string;
    risk: string;
    probability: number;
    created_at: string;
  }>;
  recentAdminActions: Array<{
    id: string;
    actor: string;
    action: string;
    entity_type: string;
    entity_id: string;
    summary: string;
    created_at: string;
  }>;
};

// ── API surface ───────────────────────────────────────────────────────────

export const api = {
  // Auth
  logout: () =>
    request<{ ok: boolean }>(
      "/auth/logout",
      {
        method: "POST",
        signal: AbortSignal.timeout(4000),
      },
      false,
    ),

  login: (email: string, password: string) =>
    request<{ user: ApiUser; token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  adminLogin: (email: string, password: string) =>
    request<{ user: ApiUser; token: string }>("/auth/admin-login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  register: (input: { name: string; email: string; password: string }) =>
    request<{ user: ApiUser; token: string }>("/auth/register", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  // Users (admin)
  users: (
    filters: {
      q?: string;
      status?: string;
      role?: string;
      date_from?: string;
      date_to?: string;
      sort_by?: string;
      sort_order?: string;
      page?: number;
      page_size?: number;
    } = {},
  ) => {
    const query = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== "") query.set(key, String(value));
    });
    const suffix = query.toString();
    return request<PaginatedUsersResponse>(`/admin/users${suffix ? `?${suffix}` : ""}`);
  },

  adminUser: (id: string) => request<AdminUserDetail>(`/admin/users/${encodeURIComponent(id)}`),

  updateUser: (id: string, input: { name?: string; status?: string; role?: "user" | "admin" }) =>
    request<{ user: ApiUser }>(`/admin/users/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),

  deleteUser: (id: string) =>
    request<{ ok: boolean }>(`/admin/users/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),

  // Reports
  reports: (
    filters: {
      q?: string;
      status?: string;
      risk_level?: string;
      page?: number;
      page_size?: number;
    } = {},
  ) => {
    const query = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== "") query.set(key, String(value));
    });
    const suffix = query.toString();
    return request<{
      reports: ApiReport[];
      total: number;
      page: number;
      page_size: number;
      total_pages: number;
    }>(`/reports${suffix ? `?${suffix}` : ""}`);
  },

  updateReport: (id: string, input: { status?: string; riskLevel?: string }) =>
    request<{ report: ApiReport }>(`/reports/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),

  deleteReport: (id: string) =>
    request<{ ok: boolean }>(`/reports/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),

  // Companies
  companies: (filters: { q?: string; status?: string; page?: number; page_size?: number } = {}) => {
    const query = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== "") query.set(key, String(value));
    });
    const suffix = query.toString();
    return request<{
      companies: ApiCompany[];
      total: number;
      page: number;
      page_size: number;
      total_pages: number;
    }>(`/companies${suffix ? `?${suffix}` : ""}`);
  },

  addCompany: (input: { name: string; domain?: string; status?: string }) =>
    request<{ company: ApiCompany }>("/companies", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  updateCompany: (
    id: string,
    input: { name?: string; domain?: string; status?: string; reports?: number },
  ) =>
    request<{ company: ApiCompany }>(`/companies/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),

  deleteCompany: (id: string) =>
    request<{ ok: boolean }>(`/companies/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),

  // Analysis
  dashboard: (signal?: AbortSignal) => request<UserDashboardResponse>("/dashboard", { signal }),

  analyzeManual: (input: {
    title: string;
    company: string;
    website?: string;
    description?: string;
    email?: string;
    salary?: string;
    workType?: string;
  }) =>
    request<{ analysis: AnalysisResult }>("/analyze", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  analyzeScreenshot: async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await request<{ analysis: AnalysisResult & { ocr_warning?: string } }>(
      "/analyze-screenshot",
      {
        method: "POST",
        body: formData,
      },
    );
    return res.analysis;
  },

  analyses: () => request<{ analyses: AnalysisResult[] }>("/analyses"),
  analysisImage: (id: string) =>
    request<{ url: string }>(`/analyses/${encodeURIComponent(id)}/image`),

  deleteAnalysisImage: (id: string) =>
    request<{ ok: boolean }>(`/analyses/${encodeURIComponent(id)}/image`, {
      method: "DELETE",
    }),

  chat: (input: ChatInput) =>
    request<ChatResponse>("/chat", {
      method: "POST",
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(70_000),
    }),

  analytics: (period = "all", dateFrom?: string, dateTo?: string) => {
    const query = new URLSearchParams({ period });
    if (dateFrom) query.set("date_from", dateFrom);
    if (dateTo) query.set("date_to", dateTo);
    return request<AdminAnalyticsResponse>(`/analytics?${query.toString()}`);
  },

  exportAnalytics: async (period = "all", dateFrom?: string, dateTo?: string) => {
    const query = new URLSearchParams({ period });
    if (dateFrom) query.set("date_from", dateFrom);
    if (dateTo) query.set("date_to", dateTo);
    const token = getToken();
    const response = await fetch(`${API_URL}/admin/analytics.csv?${query.toString()}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: "omit",
    });
    if (!response.ok) {
      let message = "Analytics export failed.";
      try {
        const body = (await response.json()) as ApiError;
        message = errorMessage(body, response.status);
      } catch {
        // Retain the safe fallback if the backend did not return JSON.
      }
      throw new Error(message);
    }
    return response.blob();
  },
};

// ── Analysis Types ───────────────────────────────────────────────────────────

export type AnalysisSignal = {
  id?: string;
  category?: string;
  name: string;
  weight: number;
  triggered: boolean;
  severity?: string;
  confidence?: number;
  contribution?: number;
  evidence?: string;
};

export type ChatTurn = { role: "user" | "assistant"; content: string };
export type ChatInput = { message: string; history: ChatTurn[] };
export type ChatResponse = {
  reply: string;
  model: string;
  analysis_context_used: boolean;
};

export type AnalysisAI = {
  available: boolean;
  explanation?: string;
  red_flags?: string[];
  risk_factors?: string[];
  confidence?: number;
  partial?: boolean;
  reason?: string;
  detail?: string;
};

export type AnalysisResult = {
  id: string;
  input_type: "manual" | "screenshot";
  job_title: string;
  company: string;
  website: string;
  description: string;
  image_path: string;
  has_image: boolean;
  extracted_text: string;
  probability: number;
  risk: "Low" | "Medium" | "High" | "Critical";
  safe: boolean;
  trust_score: number;
  reasons: string[];
  positives: string[];
  keywords: string[];
  signals: AnalysisSignal[];
  uncertainties: string[];
  ai: AnalysisAI;
  recommendations: string[];
  ocr_mode: string;
  created_at: string;
  // New hybrid engine fields
  rule_score?: number;
  ai_score?: number;
  final_score?: number;
  ai_findings?: {
    red_flags: string[];
    suspicious_evidence: string[];
    explanation: string;
    recommendations: string[];
    confidence: number;
  };
  ai_error?: string;
};
