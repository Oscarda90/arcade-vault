"use client";

import { startTransition, useEffect, useId, useRef, useState } from "react";
import { sendContactMessage } from "@/app/acerca/actions";
import { CONTACT_LIMITS, type ContactErrorCode } from "@/lib/contact";

type Status = "idle" | "sending" | "success" | "error";

const EMPTY = { name: "", email: "", msg: "" };

const ERROR_LINES: Record<ContactErrorCode, string> = {
  invalid: "[ERR] Datos inválidos. Revisa los campos.",
  config: "[ERR] Servidor de correo no configurado.",
  send: "[ERR] Fallo en la transmisión. Reintenta.",
};

function TermBar() {
  return (
    <div className="term-bar">
      <span className="dot r"></span>
      <span className="dot y"></span>
      <span className="dot g"></span>
      <span className="term-title">VAULT-OS // TERMINAL</span>
    </div>
  );
}

export function ContactForm() {
  const id = useId();
  const [form, setForm] = useState(EMPTY);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<ContactErrorCode | null>(null);
  const [sentName, setSentName] = useState("");
  const [shake, setShake] = useState(false);
  const honeypot = useRef<HTMLInputElement>(null);
  const shakeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (shakeTimer.current) clearTimeout(shakeTimer.current);
    },
    [],
  );

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (status === "sending") return;
    if (!form.name.trim() || !form.email.trim() || !form.msg.trim()) {
      setShake(true);
      if (shakeTimer.current) clearTimeout(shakeTimer.current);
      shakeTimer.current = setTimeout(() => setShake(false), 400);
      return;
    }
    setStatus("sending");
    startTransition(async () => {
      try {
        const res = await sendContactMessage({
          ...form,
          website: honeypot.current?.value ?? "",
        });
        if (res.ok) {
          setSentName(res.name);
          setStatus("success");
        } else {
          setError(res.error);
          setStatus("error");
        }
      } catch {
        // Red caída o acción no encontrada tras un deploy: se trata como fallo de envío.
        setError("send");
        setStatus("error");
      }
    });
  };

  const reset = () => {
    setForm(EMPTY);
    setSentName("");
    setError(null);
    setStatus("idle");
  };

  const retry = () => {
    setError(null);
    setStatus("idle");
  };

  const sending = status === "sending";

  return (
    <form className={"contact-form" + (shake ? " shake" : "")} onSubmit={onSubmit}>
      {status === "idle" || status === "sending" ? (
        <>
          <div className="field">
            <label htmlFor={id + "-name"}>NOMBRE</label>
            <input
              id={id + "-name"}
              name="name"
              value={form.name}
              maxLength={CONTACT_LIMITS.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="px_kai"
            />
          </div>
          <div className="field">
            <label htmlFor={id + "-email"}>CORREO ELECTRÓNICO</label>
            <input
              id={id + "-email"}
              name="email"
              type="email"
              value={form.email}
              maxLength={CONTACT_LIMITS.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="jugador@vault.gg"
            />
          </div>
          <div className="field">
            <label htmlFor={id + "-msg"}>MENSAJE</label>
            <textarea
              id={id + "-msg"}
              name="msg"
              rows={5}
              value={form.msg}
              maxLength={CONTACT_LIMITS.msg}
              onChange={(e) => setForm({ ...form, msg: e.target.value })}
              placeholder="Cuéntanos qué tienes en mente…"
            ></textarea>
          </div>
          <div className="hp-field" aria-hidden="true">
            <label htmlFor={id + "-website"}>Website</label>
            <input
              ref={honeypot}
              id={id + "-website"}
              name="website"
              type="text"
              tabIndex={-1}
              autoComplete="off"
              defaultValue=""
            />
          </div>
          <button
            className="btn xl press"
            type="submit"
            style={{ width: "100%" }}
            disabled={sending}
            aria-busy={sending}
          >
            {sending ? "▶  TRANSMITIENDO…" : "▶  ENVIAR MENSAJE"}
          </button>
        </>
      ) : status === "success" ? (
        <div className="terminal-success" role="status">
          <TermBar />
          <div className="term-body">
            <div className="line"><span className="prompt">vault@arcade:~$</span> ./send_message --to=team</div>
            <div className="line dim">[OK] Conectando con servidor…</div>
            <div className="line dim">[OK] Validando contenido…</div>
            <div className="line dim">[OK] Transmitiendo paquete…</div>
            <div className="line success">
              &gt; MENSAJE RECIBIDO. TE RESPONDEREMOS PRONTO. GRACIAS, {sentName.toUpperCase()}.
              <span className="caret">_</span>
            </div>
            <div style={{ marginTop: 18 }}>
              <button className="btn ghost" type="button" onClick={reset}>ENVIAR OTRO MENSAJE</button>
            </div>
          </div>
        </div>
      ) : (
        <div className="terminal-error" role="alert">
          <TermBar />
          <div className="term-body">
            <div className="line"><span className="prompt">vault@arcade:~$</span> ./send_message --to=team</div>
            <div className="line dim">[OK] Conectando con servidor…</div>
            <div className="line err">{ERROR_LINES[error ?? "send"]}</div>
            <div style={{ marginTop: 18 }}>
              <button className="btn ghost" type="button" onClick={retry}>REINTENTAR</button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
