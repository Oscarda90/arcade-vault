"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signOut } from "@/app/auth/actions";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";

/** Usuario con sesión: name = profiles.username (mayúsculas, 3–10 chars). */
export interface User {
  name: string;
}

export interface SavedScore {
  game: string;
  score: number;
  name: string;
  at: number;
}

interface Session {
  user: User | null;
  loading: boolean; // true hasta resolver la sesión inicial
  logout: () => Promise<void>;
  refresh: () => Promise<void>; // re-lee sesión tras una Server Action
  saveScore: (entry: Omit<SavedScore, "at">) => void;
}

const LEGACY_USER_KEY = "av_user"; // sesión mock de SPEC 01: se borra al montar
const SCORES_KEY = "av_scores";

const SessionContext = createContext<Session | null>(null);

// Cliente del navegador; null si faltan env vars (la app sigue como invitado).
function getClient(): SupabaseClient<Database> | null {
  try {
    return createClient();
  } catch (err) {
    console.error("[session]", err instanceof Error ? err.message : err);
    return null;
  }
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  // Servidor e hidratación: invitado + loading, sin depender del navegador.
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  // Solo aplica el resultado de la lectura más reciente (evita carreras).
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    let next: User | null = null;

    const supabase = getClient();
    if (supabase) {
      try {
        const {
          data: { user: authUser },
        } = await supabase.auth.getUser();
        if (authUser) {
          const { data, error } = await supabase
            .from("profiles")
            .select("username")
            .eq("id", authUser.id)
            .maybeSingle();
          if (error) console.error("[session] Fallo al leer profiles:", error);
          if (data) next = { name: data.username };
        }
      } catch (err) {
        console.error("[session] Fallo al leer la sesión:", err);
      }
    }

    if (id !== requestId.current) return;
    setUser(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    try {
      localStorage.removeItem(LEGACY_USER_KEY);
    } catch {}

    void refresh();

    const supabase = getClient();
    if (!supabase) return;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        // Fuera del callback: llamar a supabase dentro de él puede bloquearse.
        setTimeout(() => void refresh(), 0);
      }
    });

    return () => subscription.unsubscribe();
  }, [refresh]);

  const logout = useCallback(async () => {
    await signOut();
    await refresh();
  }, [refresh]);

  const saveScore = useCallback((entry: Omit<SavedScore, "at">) => {
    try {
      const all = JSON.parse(localStorage.getItem(SCORES_KEY) || "[]") as SavedScore[];
      all.push({ ...entry, at: Date.now() });
      localStorage.setItem(SCORES_KEY, JSON.stringify(all));
    } catch {}
  }, []);

  const value = useMemo(
    () => ({ user, loading, logout, refresh, saveScore }),
    [user, loading, logout, refresh, saveScore],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession debe usarse dentro de <SessionProvider>");
  return ctx;
}
