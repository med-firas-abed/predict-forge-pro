import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import {
  fetchAllProfileRows,
  fetchProfileRow,
  getAuthSession,
  getAuthUser,
  onAuthStateChanged,
  setAuthSession,
  signOutAuth,
} from "@/lib/authClient";
import { repairText } from "@/lib/repairText";

export type UserRole = "admin" | "user";
export type AccountStatus = "pending" | "approved" | "rejected";

export interface AppUser {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  status: AccountStatus;
  machineId?: string;
  machineCode?: string;
  createdAt: string;
  approvedAt?: string;
}

interface E2EAuthOverride {
  currentUser: AppUser;
  allUsers: AppUser[];
}

interface AuthContextType {
  currentUser: AppUser | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string; status?: AccountStatus }>;
  signup: (data: { fullName: string; email: string; password: string; role: UserRole; machineId?: string }) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  allUsers: AppUser[];
  approveUser: (id: string) => Promise<void>;
  rejectUser: (id: string) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
  refreshUsers: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);
const E2E_AUTH_STORAGE_KEY = "__PREDITEQ_E2E_AUTH__";
const AUTH_USER_STORAGE_KEY = "__PREDITEQ_AUTH_USER__";

declare global {
  interface Window {
    __PREDITEQ_E2E_AUTH__?: unknown;
  }
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}

function rowToUser(row: Record<string, unknown>, email?: string): AppUser {
  const machine = row.machines as Record<string, unknown> | null;
  return {
    id: row.id as string,
    fullName: (row.full_name ?? "") as string,
    email: email ?? "",
    role: (row.role ?? "user") as UserRole,
    status: (row.status ?? "pending") as AccountStatus,
    machineId: (row.machine_id as string) || undefined,
    machineCode: machine ? (machine.code as string) : undefined,
    createdAt: (row.created_at ?? "") as string,
    approvedAt: (row.approved_at as string) || undefined,
  };
}

function isUserRole(value: unknown): value is UserRole {
  return value === "admin" || value === "user";
}

function isAccountStatus(value: unknown): value is AccountStatus {
  return value === "pending" || value === "approved" || value === "rejected";
}

function parseE2EUser(value: unknown): AppUser | null {
  if (!value || typeof value !== "object") return null;

  const raw = value as Record<string, unknown>;
  if (
    typeof raw.id !== "string" ||
    typeof raw.fullName !== "string" ||
    typeof raw.email !== "string" ||
    typeof raw.createdAt !== "string" ||
    !isUserRole(raw.role) ||
    !isAccountStatus(raw.status)
  ) {
    return null;
  }

  return {
    id: raw.id,
    fullName: raw.fullName,
    email: raw.email,
    role: raw.role,
    status: raw.status,
    machineId: typeof raw.machineId === "string" && raw.machineId.length > 0 ? raw.machineId : undefined,
    machineCode: typeof raw.machineCode === "string" && raw.machineCode.length > 0 ? raw.machineCode : undefined,
    createdAt: raw.createdAt,
    approvedAt: typeof raw.approvedAt === "string" && raw.approvedAt.length > 0 ? raw.approvedAt : undefined,
  };
}

function readE2EAuthOverride(): E2EAuthOverride | null {
  if (!import.meta.env.DEV || typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.__PREDITEQ_E2E_AUTH__ ?? window.localStorage.getItem(E2E_AUTH_STORAGE_KEY);
    if (!rawValue) return null;

    const payload = typeof rawValue === "string" ? JSON.parse(rawValue) as unknown : rawValue;
    if (!payload || typeof payload !== "object") return null;

    const parsedCurrentUser = parseE2EUser((payload as Record<string, unknown>).currentUser);
    if (!parsedCurrentUser) return null;

    const rawAllUsers = (payload as Record<string, unknown>).allUsers;
    const parsedAllUsers = Array.isArray(rawAllUsers)
      ? rawAllUsers.map(parseE2EUser).filter((user): user is AppUser => user !== null)
      : [];

    return {
      currentUser: parsedCurrentUser,
      allUsers: parsedAllUsers,
    };
  } catch {
    return null;
  }
}

function clearE2EAuthOverride() {
  if (!import.meta.env.DEV || typeof window === "undefined") {
    return;
  }

  delete window.__PREDITEQ_E2E_AUTH__;
  window.localStorage.removeItem(E2E_AUTH_STORAGE_KEY);
}

function readPersistedAuthUser(): AppUser | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(AUTH_USER_STORAGE_KEY);
    if (!rawValue) return null;
    return parseE2EUser(JSON.parse(rawValue));
  } catch {
    return null;
  }
}

function persistAuthUser(user: AppUser | null) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (!user) {
      window.localStorage.removeItem(AUTH_USER_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(user));
  } catch {
    // Ignore storage write failures so auth can still work.
  }
}

interface BackendLoginResponse {
  status: AccountStatus;
  access_token: string;
  refresh_token: string;
  user: {
    id: string;
    email: string;
    role: UserRole;
    machine_id?: string | null;
    machine_code?: string | null;
    full_name?: string;
  };
}

interface StatusApiResponse {
  id: string;
  email: string;
  role: UserRole;
  status: AccountStatus;
  machine_id?: string | null;
  machine_code?: string | null;
  full_name?: string | null;
  fullName?: string | null;
  created_at?: string | null;
  createdAt?: string | null;
  approved_at?: string | null;
  approvedAt?: string | null;
}

interface ProfileSeed {
  id: string;
  email?: string;
  fullName?: string;
  machineId?: string;
  machineCode?: string;
  createdAt?: string;
  approvedAt?: string;
}

function firstNonEmpty(...values: Array<string | null | undefined>): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
}

function profileSeedFromAuthUser(
  user: { id: string; email?: string | null; created_at?: string | null; user_metadata?: unknown },
  fallback?: AppUser | null,
): ProfileSeed {
  const metadata = user.user_metadata && typeof user.user_metadata === "object"
    ? user.user_metadata as Record<string, unknown>
    : null;

  const metadataFullName = typeof metadata?.full_name === "string"
    ? metadata.full_name
    : typeof metadata?.fullName === "string"
      ? metadata.fullName
      : undefined;

  const metadataApprovedAt = typeof metadata?.approved_at === "string"
    ? metadata.approved_at
    : typeof metadata?.approvedAt === "string"
      ? metadata.approvedAt
      : undefined;

  return {
    id: user.id,
    email: firstNonEmpty(user.email ?? undefined, fallback?.email) ?? "",
    fullName: firstNonEmpty(fallback?.fullName, metadataFullName),
    machineId: fallback?.machineId,
    machineCode: fallback?.machineCode,
    createdAt: firstNonEmpty(fallback?.createdAt, user.created_at ?? undefined),
    approvedAt: firstNonEmpty(fallback?.approvedAt, metadataApprovedAt),
  };
}

function profileSeedFromAppUser(user: AppUser): ProfileSeed {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    machineId: user.machineId,
    machineCode: user.machineCode,
    createdAt: user.createdAt,
    approvedAt: user.approvedAt,
  };
}

async function fetchProfileViaApi(seed?: ProfileSeed): Promise<AppUser | null> {
  const { data } = await getAuthSession();
  const token = data.session?.access_token;
  const apiBase = import.meta.env.VITE_API_URL ?? "";

  if (!token || !apiBase) return null;

  try {
    const res = await fetch(`${apiBase}/me/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;

    const status = (await res.json()) as StatusApiResponse;
    return {
      id: status.id,
      fullName: firstNonEmpty(status.full_name, status.fullName, seed?.fullName) ?? "",
      email: status.email,
      role: status.role,
      status: status.status,
      machineId: status.machine_id || seed?.machineId || undefined,
      machineCode: status.machine_code || seed?.machineCode || undefined,
      createdAt: firstNonEmpty(status.created_at, status.createdAt, seed?.createdAt) ?? "",
      approvedAt: firstNonEmpty(status.approved_at, status.approvedAt, seed?.approvedAt),
    };
  } catch {
    return null;
  }
}

async function fetchProfile(seed: ProfileSeed): Promise<AppUser | null> {
  const { data, error } = await fetchProfileRow(seed.id);
  if (error || !data) {
    return fetchProfileViaApi(seed);
  }
  return rowToUser(data, seed.email);
}

async function fetchAllProfiles(): Promise<AppUser[]> {
  try {
    // Use backend API to get users with emails resolved from auth.users
    const data = await apiFetch<Array<Record<string, unknown>>>("/admin/users");
    return data.map((d) => rowToUser(d, (d.email as string) || ""));
  } catch {
    // Fallback to Supabase direct (emails will be empty)
    const { data, error } = await fetchAllProfileRows();
    if (error || !data) return [];
    return data.map((d) => rowToUser(d));
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(() => readPersistedAuthUser());
  const [allUsers, setAllUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const currentUserRef = useRef<AppUser | null>(null);
  const manualLogoutRef = useRef(false);

  useEffect(() => {
    currentUserRef.current = currentUser;
    persistAuthUser(currentUser);
  }, [currentUser]);

  useEffect(() => {
    let mounted = true;

    const e2eOverride = readE2EAuthOverride();
    if (e2eOverride) {
      setCurrentUser(e2eOverride.currentUser);
      setAllUsers(e2eOverride.allUsers);
      setLoading(false);
      return () => { mounted = false; };
    }

    async function restoreFromAuthUser(
      user: { id: string; email?: string | null; created_at?: string | null; user_metadata?: unknown },
      fallback?: AppUser | null,
    ) {
      const profile = await fetchProfile(profileSeedFromAuthUser(user, fallback ?? currentUserRef.current));
      if (mounted) {
        setCurrentUser(profile ?? fallback ?? null);
      }
      return profile ?? fallback ?? null;
    }

    // Restore session on mount and keep the last approved account visible
    // while Supabase rehydrates its persisted session from local storage.
    async function restoreSession() {
      const cachedUser = readPersistedAuthUser();
      if (cachedUser && mounted) {
        setCurrentUser(cachedUser);
      }

      try {
        const { data: { session } } = await getAuthSession();

        if (session?.user) {
          await restoreFromAuthUser(session.user, cachedUser);
          return;
        }

        const { data: { user } } = await getAuthUser();
        if (user) {
          await restoreFromAuthUser(user, cachedUser);
          return;
        }

        if (mounted) {
          setCurrentUser(null);
        }
      } catch {
        if (mounted && !cachedUser) {
          setCurrentUser(null);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }
    restoreSession();

    // Listen for sign-out and token refresh failures
    const { data: { subscription } } = onAuthStateChanged(
      (event, session) => {
        if (!mounted) {
          return;
        }

        if (event === "SIGNED_OUT") {
          if (manualLogoutRef.current) {
            manualLogoutRef.current = false;
            setCurrentUser(null);
            return;
          }

          const cachedUser = readPersistedAuthUser();
          if (cachedUser) {
            setCurrentUser(cachedUser);
          }
          return;
        }

        if (
          (event === "INITIAL_SESSION" || event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") &&
          session?.user
        ) {
          fetchProfile(profileSeedFromAuthUser(session.user, currentUserRef.current)).then((profile) => {
            if (!mounted) return;
            if (profile) {
              setCurrentUser(profile);
            }
          });
        }
      }
    );

    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  const refreshUsers = useCallback(async () => {
    const e2eOverride = readE2EAuthOverride();
    if (e2eOverride) {
      setCurrentUser(e2eOverride.currentUser);
      setAllUsers(e2eOverride.allUsers);
      return;
    }

    const users = await fetchAllProfiles();
    setAllUsers(users);
    if (currentUser) {
      const updated = await fetchProfile(profileSeedFromAppUser(currentUser));
      if (updated) setCurrentUser(updated);
    }
  }, [currentUser]);

  const login = useCallback(async (email: string, password: string) => {
    const apiBase = import.meta.env.VITE_API_URL ?? "";
    try {
      const res = await fetch(`${apiBase}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const body = await res.text();
        const normalizedBody = repairText(body);
        if (res.status === 403 && /attente d'approbation/i.test(normalizedBody)) {
          return {
            success: false,
            error: "Votre compte est en attente d'approbation.",
            status: "pending" as AccountStatus,
          };
        }
        if (res.status === 403 && /refus(?:ée|e)/i.test(normalizedBody)) {
          return {
            success: false,
            error: "Votre demande d'accès a été refusée. Contactez votre administrateur.",
            status: "rejected" as AccountStatus,
          };
        }
        if (res.status === 401) {
          return { success: false, error: "Email ou mot de passe incorrect." };
        }
        return { success: false, error: normalizedBody || "Erreur de connexion." };
      }

      const data = (await res.json()) as BackendLoginResponse;
      await setAuthSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      });

      setCurrentUser({
        id: data.user.id,
        fullName: data.user.full_name ?? "",
        email: data.user.email,
        role: data.user.role,
        status: data.status,
        machineId: data.user.machine_id || undefined,
        machineCode: data.user.machine_code || undefined,
        createdAt: "",
        approvedAt: undefined,
      });

      return { success: true };
    } catch {
      return { success: false, error: "Erreur de connexion." };
    }
  }, []);

  const signup = useCallback(async (data: { fullName: string; email: string; password: string; role: UserRole; machineId?: string }) => {
    try {
      await apiFetch("/auth/signup", {
        method: "POST",
        body: JSON.stringify({
          full_name: data.fullName,
          email: data.email,
          password: data.password,
          role: data.role,
          machine_id: data.machineId || null,
        }),
      });
      return { success: true };
    } catch (err: unknown) {
      const msg = repairText(err instanceof Error ? err.message : "Erreur lors de l'inscription.");
      if (msg.includes("409")) {
        return { success: false, error: "Un compte avec cet email existe déjà." };
      }
      if (msg.includes("403")) {
        return { success: false, error: "L'inscription admin n'est pas autorisée. Contactez un administrateur existant." };
      }
      return { success: false, error: msg };
    }
  }, []);

  const logout = useCallback(async () => {
    if (readE2EAuthOverride()) {
      clearE2EAuthOverride();
      setAllUsers([]);
      setCurrentUser(null);
      return;
    }

    manualLogoutRef.current = true;
    await signOutAuth();
    setAllUsers([]);
    setCurrentUser(null);
  }, []);

  const approveUser = useCallback(async (id: string) => {
    await apiFetch(`/admin/users/${id}/approve`, { method: "PATCH" });
    await refreshUsers();
  }, [refreshUsers]);

  const rejectUser = useCallback(async (id: string) => {
    await apiFetch(`/admin/users/${id}/reject`, { method: "PATCH" });
    await refreshUsers();
  }, [refreshUsers]);

  // deleteUser — suppression définitive (profil + Supabase Auth user)
  // Le backend (DELETE /admin/users/{id}) applique trois garde-fous :
  // 1. interdit auto-suppression  2. interdit suppression du dernier admin
  // 3. requiert require_admin (ne fonctionne que si l'appelant est admin approuvé)
  const deleteUser = useCallback(async (id: string) => {
    await apiFetch(`/admin/users/${id}`, { method: "DELETE" });
    await refreshUsers();
  }, [refreshUsers]);

  return (
    <AuthContext.Provider value={{
      currentUser,
      isAuthenticated: !!currentUser && currentUser.status === "approved",
      loading,
      login, signup, logout,
      allUsers,
      approveUser, rejectUser, deleteUser,
      refreshUsers,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

