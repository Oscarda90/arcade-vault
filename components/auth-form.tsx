"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { signIn, signUp } from "@/app/auth/actions";
import { AUTH_LIMITS, PASSWORD_MIN, type AuthErrorCode } from "@/lib/auth";
import { useSession } from "@/lib/session";

type FormError = AuthErrorCode | "confirmacion";

const ERROR_LINES: Record<FormError, string> = {
  invalid: "[ERR] Datos inválidos. Revisa los campos.",
  taken: "[ERR] Ese usuario ya existe.",
  email_taken: "[ERR] Ese correo ya tiene cuenta.",
  credentials: "[ERR] Correo o contraseña incorrectos.",
  unconfirmed: "[ERR] Confirma tu correo antes de entrar.",
  config: "[ERR] Servidor de autenticación no configurado.",
  server: "[ERR] Fallo de conexión. Reintenta.",
  confirmacion: "[ERR] Enlace inválido o caducado.",
};

export function AuthForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user: sessionUser, loading, refresh } = useSession();

  const modo = searchParams.get("modo");
  const initialTab = modo === "registro" ? "up" : "in";
  const [tab, setTab] = useState<"in" | "up">(initialTab);
  // Next conserva el estado de /auth entre navegaciones: resincroniza la tab si cambia ?modo.
  const [prevModo, setPrevModo] = useState(modo);
  if (modo !== prevModo) {
    setPrevModo(modo);
    setTab(initialTab);
  }

  // ?error=confirmacion (enlace del correo inválido): se muestra hasta la siguiente acción.
  const confirmParam = searchParams.get("error") === "confirmacion";
  const [error, setError] = useState<FormError | null>(confirmParam ? "confirmacion" : null);
  const [prevConfirm, setPrevConfirm] = useState(confirmParam);
  if (confirmParam !== prevConfirm) {
    setPrevConfirm(confirmParam);
    if (confirmParam) setError("confirmacion");
  }

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null); // correo del registro → "REVISA TU CORREO"
  const [pending, startTransition] = useTransition();

  // Con sesión, /auth no tiene sentido.
  useEffect(() => {
    if (!loading && sessionUser) router.replace("/biblioteca");
  }, [loading, sessionUser, router]);

  const switchTab = (next: "in" | "up") => {
    setTab(next);
    setError(null);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setError(null);

    startTransition(async () => {
      const res =
        tab === "in" ? await signIn({ email, password: pass }) : await signUp({ username, email, password: pass });

      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (res.next === "check-email") {
        setSentTo(email.trim());
        setPass("");
        return;
      }
      await refresh();
      router.push("/biblioteca");
    });
  };

  const backToSignIn = () => {
    setSentTo(null);
    setTab("in");
    setError(null);
  };

  return (
    <div className="av-auth-wrap fade-in">
      <div className="auth-card">
        <div className="auth-header">
          <div className="mark" />
          <h2 className="neon-cyan">ARCADE VAULT</h2>
          <div className="mono mt-1.5 text-[11px] tracking-[0.16em] text-ink-faint">ACCESO AL SISTEMA · v2.6</div>
        </div>

        {sentTo ? (
          <div className="terminal-success auth-check slide-in" role="status">
            <div className="term-bar">
              <span className="dot r"></span>
              <span className="dot y"></span>
              <span className="dot g"></span>
              <span className="term-title">VAULT-OS // AUTH</span>
            </div>
            <div className="term-body">
              <div className="line">
                <span className="prompt">vault@arcade:~$</span> ./register
              </div>
              <div className="line dim">[OK] Cuenta creada. Pendiente de activación…</div>
              <div className="line dim">[OK] Enlace de confirmación enviado a:</div>
              <div className="auth-check-mail">{sentTo}</div>
              <div className="success">
                &gt; REVISA TU CORREO<span className="caret">_</span>
              </div>
              <p className="auth-check-hint">Abre el enlace para activar tu cuenta. Puede tardar unos minutos; mira también en spam.</p>
              <button className="btn ghost mt-4 w-full" type="button" onClick={backToSignIn}>
                VOLVER A INICIAR SESIÓN
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="auth-tabs" role="tablist">
              <button role="tab" aria-selected={tab === "in"} className={tab === "in" ? "on" : ""} onClick={() => switchTab("in")}>
                INICIAR SESIÓN
              </button>
              <button role="tab" aria-selected={tab === "up"} className={tab === "up" ? "on" : ""} onClick={() => switchTab("up")}>
                CREAR CUENTA
              </button>
            </div>

            <form onSubmit={submit} aria-busy={pending}>
              {tab === "up" && (
                <div className="field slide-in">
                  <label htmlFor="auth-user">Usuario</label>
                  <input
                    id="auth-user"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="PX_KAI"
                    autoComplete="username"
                    maxLength={AUTH_LIMITS.username}
                    required
                  />
                </div>
              )}
              <div className="field">
                <label htmlFor="auth-email">Correo electrónico</label>
                <input
                  id="auth-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jugador@vault.gg"
                  autoComplete="email"
                  maxLength={AUTH_LIMITS.email}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="auth-pass">Contraseña</label>
                <input
                  id="auth-pass"
                  type="password"
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  placeholder="••••••••"
                  autoComplete={tab === "in" ? "current-password" : "new-password"}
                  maxLength={AUTH_LIMITS.password}
                  required
                />
                {tab === "up" && (
                  <span className="field-hint">
                    Mín. {PASSWORD_MIN} caracteres · usuario 3–{AUTH_LIMITS.username}: A-Z 0-9 _
                  </span>
                )}
              </div>

              {error && (
                <div className="auth-err" role="alert">
                  {ERROR_LINES[error]}
                </div>
              )}

              <button className="btn lg mt-2 w-full" type="submit" disabled={pending}>
                {pending ? "▶ CONECTANDO…" : tab === "in" ? "ENTRAR AL VAULT" : "CREAR Y JUGAR"}
              </button>
            </form>
          </>
        )}

        <button className="btn ghost mt-2.5 w-full" type="button" onClick={() => router.push("/biblioteca")}>
          JUGAR COMO INVITADO
        </button>

        <div className="auth-divider">O CONTINÚA CON</div>
        <div className="social">
          <button className="btn ghost" type="button" disabled title="Próximamente">
            ◆ GOOGLE · PRÓXIMAMENTE
          </button>
          <button className="btn ghost" type="button" disabled title="Próximamente">
            ▣ GITHUB · PRÓXIMAMENTE
          </button>
        </div>

        <div className="mt-[18px] text-center text-[11px] tracking-[0.1em] text-ink-faint">
          AL ENTRAR ACEPTAS LOS TÉRMINOS DEL SALÓN ARCADE
        </div>
      </div>
    </div>
  );
}
