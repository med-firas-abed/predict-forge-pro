import { supabase } from "./supabase";

const API_BASE = import.meta.env.VITE_API_URL ?? "";
if (!API_BASE && typeof window !== "undefined") {
  console.error(
    "[PrediTeq] VITE_API_URL is not set — all API calls will fail. " +
    "Set this in your Vercel/environment variables."
  );
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = {
    "Content-Type": "application/json",
    ...(await getAuthHeaders()),
    ...(options.headers as Record<string, string> ?? {}),
  };
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(`${API_BASE}${path}`, { ...options, headers, signal: controller.signal });
    if (res.status === 401) {
      await supabase.auth.signOut();
      window.location.href = "/login";
      throw new Error("Session expirée");
    }
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`API ${res.status}: ${body}`);
    }
    return res.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function apiStream(
  path: string,
  body: unknown
): Promise<ReadableStream<Uint8Array> | null> {
  const headers = {
    "Content-Type": "application/json",
    ...(await getAuthHeaders()),
  };
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60_000);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (res.status === 401) {
      await supabase.auth.signOut();
      window.location.href = "/login";
      throw new Error("Session expirée");
    }
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`API ${res.status}: ${body}`);
    }
    // Caller is responsible for consuming the stream.
    // Timeout remains active to abort stalled streams after 60s.
    return res.body;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

export async function apiBlob(
  path: string,
  body: unknown
): Promise<Blob> {
  const headers = {
    "Content-Type": "application/json",
    ...(await getAuthHeaders()),
  };
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60_000);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (res.status === 401) {
      await supabase.auth.signOut();
      window.location.href = "/login";
      throw new Error("Session expirée");
    }
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`API ${res.status}: ${body}`);
    }
    return res.blob();
  } finally {
    clearTimeout(timeoutId);
  }
}
