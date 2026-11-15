"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";

/** Sesión mock: nombre en mayúsculas, máx. 10 chars. */
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
  login: (u: User | null) => void;
  logout: () => void;
  saveScore: (entry: Omit<SavedScore, "at">) => void;
}

const USER_KEY = "av_user";
const SCORES_KEY = "av_scores";

const SessionContext = createContext<Session | null>(null);

// --- store externo sobre localStorage (para useSyncExternalStore) ---
const listeners = new Set<() => void>();
let cachedRaw: string | null = null;
let cachedUser: User | null = null;

function readRaw(): string | null {
  try {
    return localStorage.getItem(USER_KEY);
  } catch {
    return null;
  }
}

function getSnapshot(): User | null {
  const raw = readRaw();
  // Snapshot estable: solo se re-parsea si cambió el string guardado.
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      cachedUser = JSON.parse(raw || "null") as User | null;
    } catch {
      cachedUser = null;
    }
  }
  return cachedUser;
}

// Servidor y primer render de hidratación: siempre invitado.
const getServerSnapshot = (): User | null => null;

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb); // cambios desde otras pestañas
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

function writeUser(u: User | null) {
  try {
    if (u) localStorage.setItem(USER_KEY, JSON.stringify(u));
    else localStorage.removeItem(USER_KEY);
  } catch {}
  listeners.forEach((l) => l());
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const user = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const login = useCallback((u: User | null) => writeUser(u), []);
  const logout = useCallback(() => writeUser(null), []);

  const saveScore = useCallback((entry: Omit<SavedScore, "at">) => {
    try {
      const all = JSON.parse(localStorage.getItem(SCORES_KEY) || "[]") as SavedScore[];
      all.push({ ...entry, at: Date.now() });
      localStorage.setItem(SCORES_KEY, JSON.stringify(all));
    } catch {}
  }, []);

  const value = useMemo(() => ({ user, login, logout, saveScore }), [user, login, logout, saveScore]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession debe usarse dentro de <SessionProvider>");
  return ctx;
}
