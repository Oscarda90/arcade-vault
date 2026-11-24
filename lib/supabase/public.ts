import "server-only";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { SupabaseConfigError } from "./server";

/**
 * Cliente Supabase anónimo y sin cookies, para lecturas públicas dentro de
 * "use cache" (allí no se puede leer cookies()). Ve solo lo que la RLS permite a `anon`.
 * Nunca usarlo para mutaciones ni datos del usuario: para eso, lib/supabase/server.ts.
 */
export function createPublicClient(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url) throw new SupabaseConfigError("NEXT_PUBLIC_SUPABASE_URL");
  if (!key) throw new SupabaseConfigError("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");

  return createSupabaseClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
