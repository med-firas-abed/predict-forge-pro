import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";

export interface AuthSessionTokens {
  access_token: string;
  refresh_token: string;
}

export function onAuthStateChanged(
  callback: (event: AuthChangeEvent, session: Session | null) => void,
) {
  return supabase.auth.onAuthStateChange(callback);
}

export async function getAuthSession() {
  return supabase.auth.getSession();
}

export async function refreshAuthSession() {
  return supabase.auth.refreshSession();
}

export async function getAuthUser() {
  return supabase.auth.getUser();
}

export async function setAuthSession(tokens: AuthSessionTokens) {
  return supabase.auth.setSession(tokens);
}

export async function signOutAuth() {
  return supabase.auth.signOut();
}

export async function sendPasswordResetEmail(email: string, redirectTo: string) {
  return supabase.auth.resetPasswordForEmail(email, { redirectTo });
}

export async function updateAuthPassword(password: string) {
  return supabase.auth.updateUser({ password });
}

export async function fetchProfileRow(profileId: string) {
  return supabase
    .from("profiles")
    .select("*, machines(code)")
    .eq("id", profileId)
    .single();
}

export async function fetchAllProfileRows() {
  return supabase
    .from("profiles")
    .select("*, machines(code)")
    .order("created_at", { ascending: false });
}
