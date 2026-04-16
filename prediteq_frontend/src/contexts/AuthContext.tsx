import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { supabase } from "@/lib/supabase";

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
  refreshUsers: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

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

async function fetchProfile(userId: string, email?: string): Promise<AppUser | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*, machines(code)")
    .eq("id", userId)
    .single();
  if (error || !data) return null;
  return rowToUser(data, email);
}

async function fetchAllProfiles(): Promise<AppUser[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*, machines(code)")
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return data.map((d) => rowToUser(d));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [allUsers, setAllUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    // Restore session on mount — getUser() validates server-side & refreshes token
    async function restoreSession() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user && mounted) {
          const profile = await fetchProfile(user.id, user.email ?? "");
          if (mounted) setCurrentUser(profile);
        }
      } catch {
        // no valid session
      } finally {
        if (mounted) setLoading(false);
      }
    }
    restoreSession();

    // Listen for sign-out and token refresh failures
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event) => {
        if (event === "SIGNED_OUT" && mounted) {
          setCurrentUser(null);
        }
        if (event === "TOKEN_REFRESHED" && mounted) {
          // Re-fetch profile in case role/status changed
          supabase.auth.getUser().then(({ data: { user } }) => {
            if (user && mounted) {
              fetchProfile(user.id, user.email ?? "").then(profile => {
                if (mounted) setCurrentUser(profile);
              });
            }
          });
        }
      }
    );

    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (currentUser?.role === "admin" && currentUser.status === "approved") {
      fetchAllProfiles().then(setAllUsers);
    }
  }, [currentUser]);

  const refreshUsers = useCallback(async () => {
    const users = await fetchAllProfiles();
    setAllUsers(users);
    if (currentUser) {
      const updated = await fetchProfile(currentUser.id, currentUser.email);
      if (updated) setCurrentUser(updated);
    }
  }, [currentUser]);

  const login = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      const msg = error.message.includes("Email not confirmed")
        ? "Veuillez confirmer votre email avant de vous connecter."
        : "Email ou mot de passe incorrect.";
      return { success: false, error: msg };
    }

    const profile = await fetchProfile(data.user.id, data.user.email ?? email);
    if (!profile) return { success: false, error: "Profil introuvable." };

    if (profile.status === "pending") {
      await supabase.auth.signOut();
      return { success: false, error: "Votre compte est en attente d'approbation.", status: "pending" as AccountStatus };
    }
    if (profile.status === "rejected") {
      await supabase.auth.signOut();
      return { success: false, error: "Votre demande d'accès a été refusée. Contactez votre administrateur.", status: "rejected" as AccountStatus };
    }
    setCurrentUser(profile);
    return { success: true };
  }, []);

  const signup = useCallback(async (data: { fullName: string; email: string; password: string; role: UserRole; machineId?: string }) => {
    const { error: authError, data: signUpData } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: {
          full_name: data.fullName,
          role: data.role,
          machine_id: data.machineId || null,
        },
      },
    });
    if (authError) {
      if (authError.message.includes("already registered")) {
        return { success: false, error: "Un compte avec cet email existe déjà." };
      }
      return { success: false, error: authError.message };
    }

    // Auto-approve first admin (bootstrap: no admin exists yet to approve)
    if (data.role === "admin" && signUpData.user) {
      const { count } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("status", "approved");
      if (count === 0) {
        await supabase.from("profiles")
          .update({ status: "approved", approved_at: new Date().toISOString() })
          .eq("id", signUpData.user.id);
      }
    }

    await supabase.auth.signOut();
    return { success: true };
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setCurrentUser(null);
  }, []);

  const approveUser = useCallback(async (id: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("profiles")
      .update({ status: "approved", approved_at: new Date().toISOString(), approved_by: user?.id })
      .eq("id", id);
    await refreshUsers();
  }, [refreshUsers]);

  const rejectUser = useCallback(async (id: string) => {
    await supabase.from("profiles")
      .update({ status: "rejected" })
      .eq("id", id);
    await refreshUsers();
  }, [refreshUsers]);

  return (
    <AuthContext.Provider value={{
      currentUser,
      isAuthenticated: !!currentUser && currentUser.status === "approved",
      loading,
      login, signup, logout,
      allUsers,
      approveUser, rejectUser,
      refreshUsers,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
