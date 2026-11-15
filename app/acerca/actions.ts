"use server";

import { Resend } from "resend";
import { escapeHtml, parseContact, type ContactResult } from "@/lib/contact";

const DEFAULT_FROM = "Arcade Vault <onboarding@resend.dev>";

export async function sendContactMessage(
  input: Record<string, unknown>,
): Promise<ContactResult> {
  const data = parseContact(input);

  // Honeypot relleno → éxito falso, sin llamar a Resend.
  const website = input.website;
  if (typeof website === "string" && website.trim() !== "") {
    const name = typeof input.name === "string" ? input.name.trim() : "";
    return { ok: true, name: data?.name ?? name };
  }

  if (!data) return { ok: false, error: "invalid" };

  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.CONTACT_TO_EMAIL;
  if (!apiKey || !to) {
    console.error(
      "[contacto] Falta configuración de correo:",
      [!apiKey && "RESEND_API_KEY", !to && "CONTACT_TO_EMAIL"]
        .filter(Boolean)
        .join(", "),
    );
    return { ok: false, error: "config" };
  }

  const from = process.env.CONTACT_FROM_EMAIL || DEFAULT_FROM;
  const { name, email, msg } = data;

  const text = `Nombre: ${name}\nCorreo: ${email}\n\n${msg}`;
  const html =
    `<div style="background:#0b0b14;color:#e8e8f0;font-family:ui-monospace,Menlo,Consolas,monospace;padding:24px;line-height:1.6">` +
    `<p style="margin:0 0 4px"><strong>Nombre:</strong> ${escapeHtml(name)}</p>` +
    `<p style="margin:0 0 16px"><strong>Correo:</strong> ${escapeHtml(email)}</p>` +
    `<p style="margin:0">${escapeHtml(msg).replace(/\r?\n/g, "<br>")}</p>` +
    `</div>`;

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to,
      replyTo: email,
      subject: `[Arcade Vault] Nuevo mensaje de ${name}`,
      text,
      html,
    });
    if (error) {
      console.error("[contacto] Resend devolvió error:", error);
      return { ok: false, error: "send" };
    }
  } catch (err) {
    console.error("[contacto] Fallo al enviar con Resend:", err);
    return { ok: false, error: "send" };
  }

  return { ok: true, name };
}
