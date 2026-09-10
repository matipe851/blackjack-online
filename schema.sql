-- ============================================================
--  Blackjack online — esquema + seguridad (RLS)
--  Pegá y ejecutá TODO esto en Supabase → SQL Editor.
-- ============================================================

-- ---------- Tablas ----------

-- Estado PÚBLICO de la partida (lo que el navegador puede ver).
-- public_view ya viene "filtrado": no incluye el mazo ni la carta tapada.
create table if not exists public.games (
  id           uuid primary key default gen_random_uuid(),
  room_code    text unique not null,
  host_id      uuid not null references auth.users(id) on delete cascade,
  status       text not null default 'lobby',   -- lobby | playing | dealer | results
  round        int  not null default 1,
  banca_seat   int  not null default 0,
  current_seat int,
  players      jsonb not null default '[]',
  public_view  jsonb not null default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Membresía de cada sala (una fila por jugador). Base de la seguridad.
create table if not exists public.game_players (
  id        uuid primary key default gen_random_uuid(),
  game_id   uuid not null references public.games(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  seat      int  not null,
  joined_at timestamptz not null default now(),
  unique (game_id, user_id),
  unique (game_id, seat)
);

-- Estado SECRETO: mazo restante, manos completas y banderas.
-- Nadie puede leer esta tabla desde el navegador (sin políticas = acceso denegado).
-- Solo las funciones del servidor (service_role) la tocan.
create table if not exists public.game_secret (
  game_id uuid primary key references public.games(id) on delete cascade,
  data    jsonb not null default '{}'
);

-- ---------- Función de membresía (evita recursión en las políticas) ----------
create or replace function public.is_game_member(gid uuid)
returns boolean
language sql
security definer            -- corre como dueño: no re-dispara RLS (sin recursión)
stable
set search_path = public
as $$
  select exists (
    select 1 from public.game_players gp
    where gp.game_id = gid and gp.user_id = auth.uid()
  );
$$;
grant execute on function public.is_game_member(uuid) to anon, authenticated;

-- ---------- Habilitar RLS ----------
alter table public.games        enable row level security;
alter table public.game_players enable row level security;
alter table public.game_secret  enable row level security;   -- sin políticas => denegado a todos por API

-- ---------- Políticas ----------
-- Un jugador puede LEER las partidas de las que es miembro.
drop policy if exists games_select on public.games;
create policy games_select on public.games
  for select using ( public.is_game_member(id) );

-- Un jugador puede LEER la lista de miembros de sus partidas.
drop policy if exists gp_select on public.game_players;
create policy gp_select on public.game_players
  for select using ( public.is_game_member(game_id) );

-- No definimos INSERT/UPDATE/DELETE para usuarios: todas las escrituras
-- pasan por las funciones del servidor con la service_role key, que ignora RLS.
-- game_secret no tiene ninguna política => inaccesible desde el cliente.

-- ---------- Realtime ----------
-- Solo publicamos las tablas públicas. game_secret NUNCA se publica.
alter table public.games        replica identity full;
alter table public.game_players replica identity full;
do $$
begin
  begin
    alter publication supabase_realtime add table public.games;
  exception when duplicate_object then null; end;
  begin
    alter publication supabase_realtime add table public.game_players;
  exception when duplicate_object then null; end;
end $$;
