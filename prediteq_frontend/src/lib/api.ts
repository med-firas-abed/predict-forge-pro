import {
  getAuthSession,
  refreshAuthSession,
  signOutAuth,
} from "@/lib/authClient";

const API_BASE = import.meta.env.VITE_API_URL ?? "";
if (!API_BASE && typeof window !== "undefined") {
  console.error(
    "[PrediTeq] VITE_API_URL is not set - all API calls will fail. " +
    "Set this in your Vercel/environment variables.",
  );
}

function isSessionFailure(status: number, body: string): boolean {
  if (status === 401) return true;
  if (status !== 403) return false;

  return /profile not found|profil introuvable|profil not found|account not approved|invalid or expired token/i.test(body);
}

async function forceSignOut(): Promise<never> {
  await signOutAuth();
  if (import.meta.env.MODE !== "test") {
    window.location.href = "/login";
  }
  throw new Error("Session expirée");
}

async function hasRecoverableSession(): Promise<boolean> {
  const currentSession = await getAuthSession();
  if (currentSession.data.session?.access_token) {
    return true;
  }

  const refreshedSession = await refreshAuthSession();
  if (refreshedSession.data.session?.access_token) {
    return true;
  }

  return false;
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data } = await getAuthSession();
  const token = data.session?.access_token;
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

async function refreshAuthHeaders(): Promise<Record<string, string>> {
  const { data, error } = await refreshAuthSession();
  if (error) return {};
  const token = data.session?.access_token;
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

async function fetchWithRetry(
  path: string,
  init: RequestInit,
  controller: AbortController,
): Promise<Response> {
  const runRequest = async (authHeaders: Record<string, string>) =>
    fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        ...(init.headers as Record<string, string>),
        ...authHeaders,
      },
      signal: controller.signal,
    });

  let res = await runRequest(await getAuthHeaders());

  if (res.status === 401) {
    const refreshedHeaders = await refreshAuthHeaders();
    if (Object.keys(refreshedHeaders).length > 0) {
      res = await runRequest(refreshedHeaders);
    }
  }

  return res;
}

export interface ApiRequestOptions extends RequestInit {
  timeoutMs?: number;
}

function buildJsonHeaders(requestOptions: ApiRequestOptions): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...((requestOptions.headers as Record<string, string> | undefined) ?? {}),
  };
}

export async function apiFetch<T = unknown>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const { timeoutMs = 30_000, ...requestOptions } = options;
  const controller = new AbortController();
  const timeoutId =
    timeoutMs > 0 ? window.setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const res = await fetchWithRetry(
      path,
      { ...requestOptions, headers: buildJsonHeaders(options) },
      controller,
    );

    if (!res.ok) {
      const body = await res.text();
      if (res.status === 401 || isSessionFailure(res.status, body)) {
        if (!(await hasRecoverableSession())) {
          return forceSignOut();
        }
      }
      throw new Error(`API ${res.status}: ${body}`);
    }
    return res.json();
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
  }
}

export async function apiStream(
  path: string,
  body: unknown,
): Promise<ReadableStream<Uint8Array> | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60_000);
  try {
    const res = await fetchWithRetry(
      path,
      {
        method: "POST",
        headers: buildJsonHeaders({}),
        body: JSON.stringify(body),
      },
      controller,
    );
    if (!res.ok) {
      const errorBody = await res.text();
      if (res.status === 401 || isSessionFailure(res.status, errorBody)) {
        if (!(await hasRecoverableSession())) {
          return forceSignOut();
        }
      }
      throw new Error(`API ${res.status}: ${errorBody}`);
    }
    return res.body;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

export async function apiBlob(
  path: string,
  body: unknown,
): Promise<Blob> {
  return apiBinary(path, {
    method: "POST",
    headers: buildJsonHeaders({}),
    body: JSON.stringify(body),
    timeoutMs: 60_000,
  });
}

export async function apiBinary(
  path: string,
  options: ApiRequestOptions = {},
): Promise<Blob> {
  const { timeoutMs = 60_000, ...requestOptions } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchWithRetry(path, requestOptions, controller);
    if (!res.ok) {
      const errorBody = await res.text();
      if (res.status === 401 || isSessionFailure(res.status, errorBody)) {
        if (!(await hasRecoverableSession())) {
          return forceSignOut();
        }
      }
      throw new Error(`API ${res.status}: ${errorBody}`);
    }
    return res.blob();
  } finally {
    clearTimeout(timeoutId);
  }
}

