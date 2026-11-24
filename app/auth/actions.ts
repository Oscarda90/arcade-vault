"use server";

import { parseSignIn, parseSignUp, type AuthResult } from "@/lib/auth";
import { createClient, SupabaseConfigError } from "@/lib/supabase/server";

const DEFAULT_SITE_URL = "http://localhost:3000";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

// Crea el cliente; null (+ log) si falta configuración.
async function getClient(scope: string): Promise<ServerClient | null> {
  try {
    return await createClient();
  } catch (err) {
    if (err instanceof SupabaseConfigError) {
      console.error(`[auth:${scope}] ${err.message}`);
      return null;
    }
    throw err;
  }
}

export async function signUp(input: Record<string, unknown>): Promise<AuthResult> {
  const data = parseSignUp(input);
  if (!data) return { ok: false, error: "invalid" };

  try {
    const supabase = await getClient("signUp");
    if (!supabase) return { ok: false, error: "config" };

    const { username, email, password } = data;

    // Pre-check: la unicidad real la garantiza el unique de la BD.
    const { data: existing, error: lookupError } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", username)
      .maybeSingle();
    if (lookupError) {
      console.error("[auth:signUp] Fallo al consultar profiles:", lookupError);
      return { ok: false, error: "server" };
    }
    if (existing) return { ok: false, error: "taken" };

    const siteUrl = (process.env.SITE_URL || DEFAULT_SITE_URL).replace(/\/+$/, "");

    const { data: result, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username },
        emailRedirectTo: `${siteUrl}/auth/confirm`,
      },
    });

    if (error) {
      if (error.code === "user_already_exists" || error.code === "email_exists") {
        return { ok: false, error: "email_taken" };
      }
      // El trigger falló al insertar en profiles (carrera con el unique).
      if (/database error/i.test(error.message)) {
        return { ok: false, error: "taken" };
      }
      console.error("[auth:signUp] Supabase devolvió error:", error);
      return { ok: false, error: "server" };
    }

    // Con confirmación de correo, Supabase no devuelve error para un correo
    // ya registrado: devuelve un usuario sin identidades.
    if (result.user && result.user.identities?.length === 0) {
      return { ok: false, error: "email_taken" };
    }

    return { ok: true, next: "check-email" };
  } catch (err) {
    console.error("[auth:signUp] Fallo inesperado:", err);
    return { ok: false, error: "server" };
  }
}

export async function signIn(input: Record<string, unknown>): Promise<AuthResult> {
  const data = parseSignIn(input);
  if (!data) return { ok: false, error: "invalid" };

  try {
    const supabase = await getClient("signIn");
    if (!supabase) return { ok: false, error: "config" };

    const { error } = await supabase.auth.signInWithPassword(data);

    if (error) {
      if (error.code === "email_not_confirmed") return { ok: false, error: "unconfirmed" };
      if (error.code === "invalid_credentials") return { ok: false, error: "credentials" };
      console.error("[auth:signIn] Supabase devolvió error:", error);
      return { ok: false, error: "server" };
    }

    return { ok: true, next: "redirect" };
  } catch (err) {
    console.error("[auth:signIn] Fallo inesperado:", err);
    return { ok: false, error: "server" };
  }
}

export async function signOut(): Promise<void> {
  try {
    const supabase = await getClient("signOut");
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) console.error("[auth:signOut] Supabase devolvió error:", error);
  } catch (err) {
    console.error("[auth:signOut] Fallo inesperado:", err);
  }
}
