# SPEC 04 — Supabase: infraestructura + autenticación con email

> **Status:** Aprobado
> **Depends on:** SPEC 01, SPEC 02, SPEC 03
> **Date:** 2026-11-24
> **Objective:** Conectar la app a Supabase y reemplazar el login mock por Supabase Auth con email + contraseña y perfiles con username único.

## Por qué existe este spec

Hasta ahora la sesión es un mock en `localStorage` (`lib/session.tsx`). Este es el primer spec con base de datos: fija las convenciones de clientes Supabase (server/browser), refresco de sesión en `proxy.ts`, migraciones versionadas en `supabase/migrations/` y tipos generados. Los puntajes reales y el Salón de la Fama real se apoyarán en `public.profiles` en un spec posterior.

## Scope

**In:**

- Dependencias: `@supabase/ssr`, `@supabase/supabase-js`; devDependency `supabase` (CLI) usado con `npx`.
- `supabase init` → `supabase/config.toml` versionado. `supabase link` al proyecto remoto `dpbreylgdrwvpcfmutox`.
- Primera migración `supabase/migrations/<timestamp>_profiles.sql`: tabla `public.profiles`, RLS, trigger que crea el perfil al registrarse.
- Tipos generados en `lib/supabase/database.types.ts`; clientes tipados con `Database`.
- Scripts npm `db:push` y `db:types`.
- Clientes: `lib/supabase/server.ts` (Server Components / Actions / Route Handlers) y `lib/supabase/client.ts` (browser).
- `proxy.ts` en la raíz que refresca la sesión en cada request (helper en `lib/supabase/proxy.ts`).
- Server Actions en `app/auth/actions.ts`: `signUp`, `signIn`, `signOut`.
- Route Handler `app/auth/confirm/route.ts` para el enlace de confirmación de correo (`token_hash` + `type`).
- Confirmación de correo obligatoria; estado UI "REVISA TU CORREO" tras registrarse.
- `components/auth-form.tsx` adaptado: tab INICIAR SESIÓN = correo + contraseña; tab CREAR CUENTA = usuario + correo + contraseña; estados enviando/error; botones GOOGLE/GITHUB deshabilitados con "PRÓXIMAMENTE".
- `/auth` redirige a `/biblioteca` si ya hay sesión.
- `lib/session.tsx` reescrito sobre Supabase manteniendo la API `useSession()` para `nav.tsx`, `game-player.tsx` y `hall-of-fame.tsx`.
- "JUGAR COMO INVITADO" se mantiene (navega sin sesión).
- Logout desde el nav (click en el username, como hoy).
- `.env.example` actualizado con las variables de Supabase y limpiado de la línea suelta al final del archivo.

**Out of scope (for future specs):**

- OAuth Google / GitHub.
- Magic link.
- Recuperar / cambiar contraseña.
- Página `/cuenta` o edición de perfil / username.
- Rutas protegidas.
- Puntajes en base de datos, Salón de la Fama real (`saveScore` sigue en `localStorage` key `av_scores`).
- Migrar puntajes locales a la cuenta.
- Stack local con Docker (`supabase start`).
- SMTP propio (Resend u otro) para los correos de Auth.
- Tests automatizados (no hay test runner configurado).

## Data model

### Base de datos (migración `<timestamp>_profiles.sql`)

```sql
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  username   text not null unique check (username ~ '^[A-Z0-9_]{3,10}$'),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
-- SELECT para anon y authenticated (los usernames serán públicos en el Salón).
-- Sin políticas INSERT/UPDATE/DELETE: solo el trigger escribe.

-- public.handle_new_user(): security definer, set search_path = ''.
-- Inserta (new.id, upper(new.raw_user_meta_data ->> 'username')).
-- Trigger: after insert on auth.users for each row.
```

Convenciones:

- `username` siempre en mayúsculas en BD; el `check` hace imposible otra forma, así que `unique` ya es case-insensitive.
- Funciones `security definer` siempre con `set search_path = ''` y nombres calificados (`public.profiles`).

### TypeScript

```ts
// lib/auth.ts
export const AUTH_LIMITS = { username: 10, email: 254, password: 72 } as const;
export const USERNAME_RE = /^[A-Z0-9_]{3,10}$/; // tras toUpperCase()
export const PASSWORD_MIN = 8;

export type AuthErrorCode =
  | 'invalid' // datos no pasan validación
  | 'taken' // username ya existe
  | 'email_taken' // correo ya registrado
  | 'credentials' // correo/contraseña incorrectos
  | 'unconfirmed' // correo sin confirmar
  | 'config' // faltan env vars
  | 'server'; // cualquier otro error de Supabase / red

export type AuthResult =
  | { ok: true; next: 'redirect' } // signIn → /biblioteca
  | { ok: true; next: 'check-email' } // signUp → pantalla REVISA TU CORREO
  | { ok: false; error: AuthErrorCode };

export function parseSignUp(
  raw: Record<string, unknown>,
): { username: string; email: string; password: string } | null;
export function parseSignIn(
  raw: Record<string, unknown>,
): { email: string; password: string } | null;
```

```ts
// lib/session.tsx (API pública, sin `login`)
export interface User {
  name: string;
} // = profiles.username
interface Session {
  user: User | null;
  loading: boolean; // true hasta resolver la sesión inicial
  logout: () => Promise<void>;
  refresh: () => Promise<void>; // re-lee sesión tras una Server Action
  saveScore: (entry: Omit<SavedScore, 'at'>) => void; // sin cambios, localStorage
}
```

Mapeo de errores en `auth-form.tsx` (línea estilo `[ERR]` de SPEC 03):

| `error`       | Texto                                             |
| ------------- | ------------------------------------------------- |
| `invalid`     | `[ERR] Datos inválidos. Revisa los campos.`       |
| `taken`       | `[ERR] Ese usuario ya existe.`                    |
| `email_taken` | `[ERR] Ese correo ya tiene cuenta.`               |
| `credentials` | `[ERR] Correo o contraseña incorrectos.`          |
| `unconfirmed` | `[ERR] Confirma tu correo antes de entrar.`       |
| `config`      | `[ERR] Servidor de autenticación no configurado.` |
| `server`      | `[ERR] Fallo de conexión. Reintenta.`             |

Variables de entorno:

| Variable                               | Ámbito   | Obligatoria | Default                 |
| -------------------------------------- | -------- | ----------- | ----------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | público  | Sí          | —                       |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | público  | Sí          | —                       |
| `SITE_URL`                             | servidor | No          | `http://localhost:3000` |

No se usa `service_role` / secret key en este spec.

Query params:

- `/auth/confirm?token_hash=…&type=email` → verifica y redirige a `/biblioteca`.
- `/auth?error=confirmacion` → `auth-form` muestra `[ERR] Enlace inválido o caducado.`

## Estructura de archivos

```
proxy.ts                         # NUEVO: llama updateSession; matcher excluye _next/static, imágenes, favicon
supabase/
  config.toml                    # NUEVO: supabase init
  migrations/<ts>_profiles.sql   # NUEVO
lib/
  auth.ts                        # NUEVO: límites, tipos, parseSignUp, parseSignIn
  session.tsx                    # REESCRIBE: provider sobre Supabase, misma API useSession()
  supabase/
    client.ts                    # NUEVO: createBrowserClient<Database>
    server.ts                    # NUEVO: createServerClient<Database> con cookies() async
    proxy.ts                     # NUEVO: updateSession(request)
    database.types.ts            # NUEVO: generado (npm run db:types)
app/
  auth/
    actions.ts                   # NUEVO: "use server"; signUp, signIn, signOut
    confirm/route.ts             # NUEVO: GET verifyOtp → redirect
components/
  auth-form.tsx                  # MODIFICA: campos, actions, estados, OAuth deshabilitado
  nav.tsx                        # MODIFICA: logout async (sin cambiar UI)
app/globals.css                  # MODIFICA: estilos de línea [ERR] y panel "REVISA TU CORREO" si no existen
.env.example                     # MODIFICA
package.json                     # MODIFICA: deps + scripts db:push, db:types
```

`game-player.tsx` y `hall-of-fame.tsx` no cambian (siguen usando `user` y `saveScore`).

## Implementation plan

1. `npm install @supabase/ssr @supabase/supabase-js` y `npm install -D supabase`. Actualizar `.env.example` (variables de la tabla, comentario "publishable key del dashboard → API Keys"; quitar la línea suelta final). Verificar: `npm run build` pasa.
2. `npx supabase init` y `npx supabase link --project-ref dpbreylgdrwvpcfmutox`. Añadir scripts `"db:push": "supabase db push"` y `"db:types": "supabase gen types typescript --linked --schema public > lib/supabase/database.types.ts"`. Verificar: `supabase/config.toml` existe; `.gitignore` de `supabase/` excluye `.temp`.
3. `npx supabase migration new profiles` y escribir la migración del Data model. `npm run db:push`. Verificar con MCP `list_tables`: existe `public.profiles` con RLS activado; `get_advisors` (security) sin avisos sobre `profiles` ni `handle_new_user`.
4. `npm run db:types`. Verificar: `database.types.ts` contiene `profiles`.
5. Leer `node_modules/next/dist/docs/01-app/` (`proxy.md`, `cookies`, Server Actions) antes de escribir framework code. Crear `lib/supabase/client.ts`, `server.ts` y `proxy.ts` según la guía de `@supabase/ssr` (cookies `getAll`/`setAll`). Si faltan env vars: `server.ts`/`client.ts` lanzan un error con nombre de variable; `updateSession` deja pasar la request sin tocar cookies.
6. Crear `proxy.ts` raíz llamando `updateSession` (`supabase.auth.getUser()`). Verificar: `npm run dev`, navegar `/`, sin errores; la app funciona igual.
7. Crear `lib/auth.ts` (tipos, límites, parsers con `trim`, username `toUpperCase()`, regex email de SPEC 03, password 8–72).
8. Crear `app/auth/actions.ts`:
   - `signUp`: `parseSignUp` → `invalid`; pre-check `profiles` por username → `taken`; `auth.signUp({ email, password, options: { data: { username }, emailRedirectTo: SITE_URL + "/auth/confirm" } })`. Error de BD del trigger (unique) → `taken`; correo existente → `email_taken`; resto → `server`. Éxito → `check-email`.
   - `signIn`: `parseSignIn` → `invalid`; `signInWithPassword`; `email_not_confirmed` → `unconfirmed`; `invalid_credentials` → `credentials`; éxito → `redirect`.
   - `signOut`: `auth.signOut()`.
   - Env faltante → `console.error` + `config`. Nunca lanzar al cliente.
9. Crear `app/auth/confirm/route.ts`: lee `token_hash` y `type`, `verifyOtp`, redirige a `/biblioteca` o `/auth?error=confirmacion`.
10. Manual en dashboard Supabase (documentar en el PR): Auth → URL Configuration: Site URL `http://localhost:3000`, Redirect URL `http://localhost:3000/auth/confirm`. Template "Confirm signup": enlace `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`. "Confirm email" activado.
11. Reescribir `lib/session.tsx`: browser client; al montar `getUser()` + leer `profiles.username`; `onAuthStateChange` para cambios; `refresh()` repite la lectura; `logout()` llama la action `signOut` y luego `refresh()`. Mantener `saveScore` intacto. Primer render (server e hidratación): `user = null`, `loading = true`. Quitar `login` y `USER_KEY` (borrar `av_user` de `localStorage` al montar).
12. Adaptar `components/auth-form.tsx`: campos según tab, `maxLength` de `AUTH_LIMITS`, `required`; submit con `useTransition` → action; botón deshabilitado con "▶ CONECTANDO…"; error → línea `[ERR]` de la tabla; `redirect` → `refresh()` + `router.push("/biblioteca")`; `check-email` → panel "REVISA TU CORREO" con el correo usado y botón "VOLVER A INICIAR SESIÓN". `?error=confirmacion` → muestra su `[ERR]`. Si `user` existe y `!loading` → `router.replace("/biblioteca")`. GOOGLE/GITHUB `disabled`, texto "◆ GOOGLE · PRÓXIMAMENTE" / "▣ GITHUB · PRÓXIMAMENTE". "JUGAR COMO INVITADO" → `router.push("/biblioteca")`.
13. `components/nav.tsx`: adaptar a `logout` async; mientras `loading` mostrar el botón de iniciar sesión sin parpadeo de username.
14. Estilos de `[ERR]` y panel "REVISA TU CORREO" en `app/globals.css`, reutilizando `.terminal-error` / `.terminal-success` de SPEC 03 si encajan. Seguir `/frontend-design` según `CLAUDE.md`.
15. Prueba real end-to-end con un correo propio: registro → correo → enlace → sesión iniciada en `/biblioteca` → logout → login.

## Acceptance criteria

- [ ] `npm run build` termina sin errores, con y sin `.env.local`.
- [ ] `npm run lint` termina sin errores.
- [ ] `supabase/migrations/` contiene exactamente una migración y `npm run db:push` no reporta cambios pendientes.
- [ ] `public.profiles` existe en el proyecto remoto con RLS activado.
- [ ] `get_advisors` (security) no reporta avisos sobre `profiles` ni `handle_new_user`.
- [ ] `lib/supabase/database.types.ts` incluye `profiles` y los clientes compilan tipados.
- [ ] Registro válido muestra "REVISA TU CORREO" y llega un correo de confirmación.
- [ ] El enlace del correo lleva a `/biblioteca` con sesión iniciada; el nav muestra el username en mayúsculas.
- [ ] Tras confirmar, existe una fila en `profiles` con ese `id` y username en mayúsculas.
- [ ] Registrar `px_kai` y luego `PX_KAI` con otro correo → `[ERR] Ese usuario ya existe.`
- [ ] Username de 2 chars, de 11 chars o con `-` → `[ERR] Datos inválidos…` sin llamar a Supabase.
- [ ] Contraseña de 7 chars → `[ERR] Datos inválidos…`.
- [ ] Login antes de confirmar → `[ERR] Confirma tu correo antes de entrar.`
- [ ] Login con contraseña incorrecta → `[ERR] Correo o contraseña incorrectos.`
- [ ] Enlace de confirmación manipulado → `/auth` con `[ERR] Enlace inválido o caducado.`
- [ ] Durante el envío el botón muestra "CONECTANDO…" y está deshabilitado.
- [ ] Recargar la página mantiene la sesión.
- [ ] Click en el username del nav cierra sesión; el nav vuelve a "Iniciar Sesión" sin recargar.
- [ ] Con sesión, abrir `/auth` redirige a `/biblioteca`.
- [ ] "JUGAR COMO INVITADO" navega a `/biblioteca` sin sesión; jugar y guardar puntaje sigue escribiendo en `av_scores`.
- [ ] GOOGLE y GITHUB están deshabilitados y muestran "PRÓXIMAMENTE".
- [ ] Sin `.env.local`, `/` carga y enviar login muestra `[ERR] Servidor de autenticación no configurado.`
- [ ] Ninguna secret / service_role key en el bundle (`grep` en `.next/static` sin resultados).
- [ ] Sin errores de hidratación en consola en `/`, `/auth` y `/biblioteca`.

## Decisions

- **Yes:** infra + auth en un spec. Auth sin infra no existe; puntajes quedan fuera para que el spec sea manejable.
- **No:** incluir puntajes y Salón real. Demasiados dominios para un spec.
- **Yes:** Supabase CLI como devDependency + `supabase/migrations/`. Esquema reproducible y versionado.
- **No:** cambios solo vía dashboard / MCP. Sin historial en el repo.
- **Yes:** solo proyecto remoto. Sin Docker para desarrollar.
- **No:** `supabase start` local. Coste de setup sin beneficio aún.
- **Yes:** tipos generados en `lib/supabase/database.types.ts`.
- **Yes:** email + contraseña. Nativo, sin apps OAuth externas.
- **No:** OAuth ahora (requiere apps en Google/GitHub) ni magic link.
- **Yes:** botones OAuth deshabilitados con "PRÓXIMAMENTE". Mantiene el diseño del template.
- **Yes:** `public.profiles` con username único creado por trigger. Unicidad garantizada en BD; base para puntajes.
- **No:** username en `user_metadata`. No garantiza unicidad ni es consultable públicamente.
- **Yes:** username 3–10, `A-Z0-9_`, guardado en mayúsculas. Coincide con el mock y el estilo del Salón.
- **Yes:** login con correo. Nativo de Supabase, no expone si un username existe.
- **No:** login con usuario o correo.
- **Yes:** confirmación de correo obligatoria con `token_hash` en `/auth/confirm`. Funciona aunque el enlace se abra en otro navegador.
- **No:** flujo PKCE `?code=`. Falla si el enlace se abre en otro navegador (falta el code verifier).
- **Yes:** Server Actions para signUp/signIn/signOut. Coherente con SPEC 03, validación autoritativa en servidor.
- **No:** llamadas de auth directas desde el cliente.
- **Yes:** `lib/session.tsx` reescrito con la misma API `useSession()`. Consumidores casi sin cambios.
- **No:** leer la sesión en el layout server. Con `cacheComponents` obliga a `Suspense` en el layout.
- **Yes:** modo invitado se mantiene; `av_scores` intacto hasta el spec de puntajes.
- **Yes:** ninguna ruta protegida; `/auth` redirige si hay sesión.
- **No:** recuperar contraseña ni `/cuenta`. Specs futuros.
- **Yes:** publishable key (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`). Formato de keys actual de Supabase.
- **No:** service_role / secret key. No hace falta; RLS + trigger cubren todo.
- **Yes:** env faltante → error controlado, build no falla. Mismo criterio que SPEC 03.

## Risks

| Risk                                                                          | Mitigation                                                                                                      |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| SMTP por defecto de Supabase limita a pocos correos/hora                      | Aceptado en dev; SMTP propio en spec futuro. Probar con pocos registros.                                        |
| `proxy.ts` / `cookies()` con semántica distinta en Next 16.4                  | Leer `node_modules/next/dist/docs/01-app/` (`proxy.md`) antes del paso 5.                                       |
| Carrera de username entre pre-check y trigger                                 | `unique` en BD; error del trigger se mapea a `taken`.                                                           |
| Template de correo del dashboard no actualizado → enlace con formato distinto | Paso 10 explícito; criterio de aceptación de confirmación end-to-end.                                           |
| Browser client no detecta cookies cambiadas por una Server Action             | `refresh()` explícito tras cada action + `router.refresh()`.                                                    |
| Trigger `security definer` con `search_path` abierto                          | `set search_path = ''`; revisar `get_advisors`.                                                                 |
| `supabase gen types ... >` en Windows escribe UTF-16                          | Ejecutar `db:types` desde Git Bash o verificar encoding; si falla, generar con MCP `generate_typescript_types`. |
| Usuarios con `av_user` mock en `localStorage` ven sesión fantasma             | `session.tsx` borra `av_user` al montar.                                                                        |

## What is **not** in this spec

- OAuth Google / GitHub y magic link.
- Recuperar / cambiar contraseña.
- Página de cuenta / edición de perfil.
- Rutas protegidas.
- Puntajes en BD, Salón real, migración de puntajes locales.
- Supabase local con Docker.
- SMTP propio.
- Tests automatizados.

Each one of those, if it lands, goes in its own spec.
