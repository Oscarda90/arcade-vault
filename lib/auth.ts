export const AUTH_LIMITS = { username: 10, email: 254, password: 72 } as const;
export const USERNAME_RE = /^[A-Z0-9_]{3,10}$/; // tras toUpperCase()
export const PASSWORD_MIN = 8;

// Mismo criterio que el formulario de contacto (SPEC 03, lib/contact.ts).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type AuthErrorCode =
  | "invalid" // datos no pasan validación
  | "taken" // username ya existe
  | "email_taken" // correo ya registrado
  | "credentials" // correo/contraseña incorrectos
  | "unconfirmed" // correo sin confirmar
  | "config" // faltan env vars
  | "server"; // cualquier otro error de Supabase / red

export type AuthResult =
  | { ok: true; next: "redirect" } // signIn → /biblioteca
  | { ok: true; next: "check-email" } // signUp → pantalla REVISA TU CORREO
  | { ok: false; error: AuthErrorCode };

function parseEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (v.length === 0 || v.length > AUTH_LIMITS.email || !EMAIL_RE.test(v)) return null;
  return v;
}

function parseUsername(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toUpperCase();
  return USERNAME_RE.test(v) ? v : null;
}

// La contraseña no se recorta: los espacios son caracteres válidos.
function parsePassword(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value.length < PASSWORD_MIN || value.length > AUTH_LIMITS.password) return null;
  return value;
}

// Valida y normaliza. null si inválido.
export function parseSignUp(
  raw: Record<string, unknown>,
): { username: string; email: string; password: string } | null {
  const username = parseUsername(raw.username);
  const email = parseEmail(raw.email);
  const password = parsePassword(raw.password);
  if (!username || !email || !password) return null;
  return { username, email, password };
}

export function parseSignIn(
  raw: Record<string, unknown>,
): { email: string; password: string } | null {
  const email = parseEmail(raw.email);
  const password = parsePassword(raw.password);
  if (!email || !password) return null;
  return { email, password };
}
