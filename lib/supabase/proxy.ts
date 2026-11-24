import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./database.types";

/**
 * Refresca la sesión de Supabase en cada request y reescribe las cookies
 * de auth en la respuesta. Sin env vars, deja pasar la request intacta.
 */
export async function updateSession(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) return NextResponse.next({ request });

  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        // Cabeceras anti-caché que exige @supabase/ssr al escribir cookies de auth.
        Object.entries(headers).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });

  // No poner código entre createServerClient y getUser(): el refresco debe
  // ocurrir antes de generar la respuesta.
  try {
    await supabase.auth.getUser();
  } catch (err) {
    // Red caída / Supabase inaccesible: la app debe seguir sirviendo páginas.
    console.error("[proxy] No se pudo refrescar la sesión de Supabase:", err);
  }

  return response;
}
