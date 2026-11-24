import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

let browserClient: SupabaseClient<Database> | null = null;

/**
 * Cliente Supabase para el navegador (Client Components).
 * Lanza un error con el nombre de la variable si falta configuración.
 */
export function createClient(): SupabaseClient<Database> {
  if (browserClient) return browserClient;

  // Referencias estáticas: Next solo inlinea NEXT_PUBLIC_* escritas literalmente.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url) throw new Error("Falta la variable de entorno NEXT_PUBLIC_SUPABASE_URL");
  if (!key) throw new Error("Falta la variable de entorno NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");

  browserClient = createBrowserClient<Database>(url, key);
  return browserClient;
}
