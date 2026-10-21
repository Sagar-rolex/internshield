// ── Typed HTTP client ──
// Env-safe API base URL, automatic Authorization header injection,
// response-error unwrapping, and AbortController support for cleanup.

import type { AuthUser } from "@/components/AuthProvider";

const API_URL =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) ?? "http://127.0.0.1:4000/api";

const AUTH_KEY = "scamshield.auth.token";

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

type ApiError = { error: string };

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const isForm = options.body instanceof FormData;
  const headers: Record<string, string> = isForm
    ? { ...((options.headers as Record<string, string>) ?? {}) }
    : {
        "Content-Type": "application/json",
        ...((options.headers as Record<string, string>) ?? {}),
      };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  // Handle empty-body responses (e.g. 204)
  if (response.status === 204) return undefined as T;

  // Attempt to parse the body as JSON regardless of status code — the server
  // always returns structured JSON even on errors.
  let data: T & ApiError;
  try {
    data = (await response.json()) as T & ApiError;
  } catch {
    throw new Error("Unexpected server response. Is the backend running?");
  }

  if (!response.ok) {
    const message = data?.error ?? `API error ${response.status}`;
    const err = new Error(message) as Error & { status: number };
    err.status = response.status;
    throw err;
  }

  return data;
}

// ── Types ─────────────────────────────────────────────────────────────────

export type ApiUser = AuthUser & {
  id: string;
  status?: string;
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

// ── API surface ───────────────────────────────────────────────────────────

export const api = {
  // Auth
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
  users: () => request<{ users: ApiUser[] }>("/admin/users"),

  updateUser: (id: string, input: { name?: string; status?: string }) =>
    request<{ user: ApiUser }>(`/admin/users/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),

  deleteUser: (id: string) =>
    request<{ ok: boolean }>(`/admin/users/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),

  // Reports
  reports: () => request<{ reports: ApiReport[] }>("/reports"),

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
  companies: () => request<{ companies: ApiCompany[] }>("/companies"),

  addCompany: (input: { name: string; domain?: string; status?: string }) =>
    request<{ company: ApiCompany }>("/companies", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  updateCompany: (id: string, input: { name?: string; domain?: string; status?: string; reports?: number }) =>
    request<{ company: ApiCompany }>(`/companies/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),

  deleteCompany: (id: string) =>
    request<{ ok: boolean }>(`/companies/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),

  // Analysis
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
    const res = await request<{ analysis: AnalysisResult & { ocr_warning?: string } }>("/analyze-screenshot", {
      method: "POST",
      body: formData,
    });
    return res.analysis;
  },

  analyses: () => request<{ analyses: AnalysisResult[] }>("/analyses"),
};

// ── Analysis Types ───────────────────────────────────────────────────────────

export type AnalysisSignal = {
  name: string;
  weight: number;
  triggered: boolean;
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
  extracted_text: string;
  probability: number;
  risk: "Low" | "Medium" | "High";
  safe: boolean;
  trust_score: number;
  reasons: string[];
  positives: string[];
  keywords: string[];
  signals: AnalysisSignal[];
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
