export const CONTACT_LIMITS = { name: 80, email: 254, msg: 2000 } as const;

export type ContactInput = { name: string; email: string; msg: string };

export type ContactErrorCode = "invalid" | "config" | "send";

export type ContactResult =
  | { ok: true; name: string } // name ya trimmeado, para "GRACIAS, {NAME}."
  | { ok: false; error: ContactErrorCode };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function field(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (v.length === 0 || v.length > max) return null;
  return v;
}

// Valida y normaliza (trim). null si inválido.
export function parseContact(raw: Record<string, unknown>): ContactInput | null {
  const name = field(raw.name, CONTACT_LIMITS.name);
  const email = field(raw.email, CONTACT_LIMITS.email);
  const msg = field(raw.msg, CONTACT_LIMITS.msg);
  if (!name || !email || !msg || !EMAIL_RE.test(email)) return null;
  return { name, email, msg };
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}
