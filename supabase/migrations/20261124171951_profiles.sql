-- SPEC 04 — perfiles públicos con username único.
-- El username vive siempre en mayúsculas: el check lo garantiza, así que
-- el unique ya es case-insensitive.

create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  username   text not null unique check (username ~ '^[A-Z0-9_]{3,10}$'),
  created_at timestamptz not null default now()
);

comment on table public.profiles is 'Perfil público de cada usuario (username del Salón de la Fama).';

alter table public.profiles enable row level security;

-- Los usernames son públicos (Salón de la Fama).
create policy "profiles are readable by everyone"
  on public.profiles
  for select
  to anon, authenticated
  using (true);

-- Sin políticas INSERT / UPDATE / DELETE: solo el trigger escribe.

-- Crea el perfil al registrarse, con el username de raw_user_meta_data.
-- Si el username es inválido o está tomado, el insert falla y el signUp
-- se revierte (el error se mapea a "taken" en la Server Action).
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, username)
  values (new.id, upper(new.raw_user_meta_data ->> 'username'));
  return new;
end;
$$;

-- Solo la invoca el trigger: nadie debe poder llamarla vía API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
