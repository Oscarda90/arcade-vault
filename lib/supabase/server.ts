import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";

/** Falta configuración de Supabase (env vars). */
export class SupabaseConfigError extends Error {
  constructor(variable: string) {
    super(`Falta la variable de entorno ${variable}`);
    this.name = "SupabaseConfigError";
  }
}

/**
 * Cliente Supabase para Server Components, Server Actions y Route Handlers.
 * Crear uno nuevo por request (no reutilizar entre requests).
 */
export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url) throw new SupabaseConfigError("NEXT_PUBLIC_SUPABASE_URL");
  if (!key) throw new SupabaseConfigError("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");

  const cookieStore = await cookies();

  return createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Llamado desde un Server Component: no puede escribir cookies.
          // Es seguro ignorarlo: proxy.ts refresca la sesión en cada request.
        }
      },
    },
  });
}
