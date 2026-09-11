-- ════════════════════════════════════════════════════════════════════
-- Fono — Migración a multiempresa
--
-- Convierte la base de una sola tienda a varias empresas, cada una con
-- sus sucursales, sin perder un solo registro.
--
--   empresas     una por negocio. Pared de aislamiento: los datos de una
--                empresa no son visibles desde otra, nunca.
--   sucursales   una o varias por empresa. Comparten catálogo y lista de
--                precios; tienen su propio stock, ventas y equipo.
--   miembros     qué usuario entra a qué empresa, con qué rol y en qué
--                sucursal.
--
-- ── ANTES DE CORRER ─────────────────────────────────────────────────
--   1. Tener el backup hecho (carpeta ~/Documents/fono-backups).
--   2. Correrlo de noche, después de las 21:00: al cerrar la RLS la app
--      que está publicada deja de funcionar hasta que se deploye la
--      versión nueva.
--   3. Crear tu usuario en Supabase → Authentication → Add user, y tener
--      su UUID a mano para el paso 7.
--
-- Todo va en una transacción: si algo falla, no queda nada a medias.
-- ════════════════════════════════════════════════════════════════════

begin;

-- ── 1. Empresas y sucursales ────────────────────────────────────────
create table if not exists public.empresas (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  slug       text not null unique,
  plan       text not null default 'trial',
  activa     boolean not null default true,
  creada_en  timestamptz not null default now()
);

create table if not exists public.sucursales (
  id         uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nombre     text not null,
  activa     boolean not null default true,
  creada_en  timestamptz not null default now()
);
create index if not exists sucursales_empresa_idx on public.sucursales (empresa_id);

-- ── 2. Miembros (quién entra a qué) ─────────────────────────────────
-- rol: 'dueno' ve todo y administra; 'encargado' ve su sucursal completa;
-- 'vendedor' carga ventas en su sucursal.
create table if not exists public.miembros (
  empresa_id   uuid not null references public.empresas(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  sucursal_id  uuid references public.sucursales(id) on delete set null,
  rol          text not null default 'vendedor'
               check (rol in ('dueno', 'encargado', 'vendedor')),
  nombre       text,
  creado_en    timestamptz not null default now(),
  primary key (empresa_id, user_id)
);
create index if not exists miembros_user_idx on public.miembros (user_id);

-- ── 3. Columnas de pertenencia (todavía nullable) ───────────────────
-- Nullable a propósito: en este punto nada se rompe todavía.
alter table public.entities add column if not exists empresa_id  uuid references public.empresas(id) on delete cascade;
alter table public.entities add column if not exists sucursal_id uuid references public.sucursales(id) on delete set null;
alter table public.kv       add column if not exists empresa_id  uuid references public.empresas(id) on delete cascade;

-- ── 4. La empresa y la sucursal que ya existen de hecho ─────────────
insert into public.empresas (nombre, slug)
values ('Fono Mobile Store', 'fono')
on conflict (slug) do nothing;

insert into public.sucursales (empresa_id, nombre)
select e.id, 'Casa Central'
from public.empresas e
where e.slug = 'fono'
  and not exists (select 1 from public.sucursales s where s.empresa_id = e.id);

-- ── 5. Backfill: todo lo que hay hoy pasa a ser de Fono ─────────────
update public.entities
set empresa_id  = (select id from public.empresas where slug = 'fono'),
    sucursal_id = (select s.id from public.sucursales s
                   join public.empresas e on e.id = s.empresa_id
                   where e.slug = 'fono' limit 1)
where empresa_id is null;

update public.kv
set empresa_id = (select id from public.empresas where slug = 'fono')
where empresa_id is null;

-- Nada puede haber quedado afuera.
do $$
declare n int;
begin
  select count(*) into n from public.entities where empresa_id is null;
  if n > 0 then raise exception 'Quedaron % filas de entities sin empresa', n; end if;
  select count(*) into n from public.kv where empresa_id is null;
  if n > 0 then raise exception 'Quedaron % filas de kv sin empresa', n; end if;
end $$;

-- ── 6. Recién ahora la pertenencia es obligatoria ───────────────────
alter table public.entities alter column empresa_id set not null;
alter table public.kv       alter column empresa_id set not null;

-- La clave primaria pasa a incluir la empresa: dos tiendas distintas
-- pueden tener un producto con el mismo id sin pisarse.
alter table public.entities drop constraint if exists entities_pkey;
alter table public.entities add  primary key (empresa_id, collection, id);

alter table public.kv drop constraint if exists kv_pkey;
alter table public.kv add  primary key (empresa_id, key);

drop index if exists entities_collection_idx;
create index if not exists entities_lookup_idx
  on public.entities (empresa_id, collection, created_at);
create index if not exists entities_sucursal_idx
  on public.entities (empresa_id, sucursal_id, collection);

-- ── 7. TU USUARIO ───────────────────────────────────────────────────
-- Reemplazá el UUID por el de tu usuario (Authentication → Users) y
-- descomentá. Sin esto no vas a poder entrar a tu propia base.
--
-- insert into public.miembros (empresa_id, user_id, sucursal_id, rol, nombre)
-- select e.id, 'PEGA-ACA-TU-UUID'::uuid, s.id, 'dueno', 'Esteban'
-- from public.empresas e
-- join public.sucursales s on s.empresa_id = e.id
-- where e.slug = 'fono'
-- on conflict (empresa_id, user_id) do update set rol = 'dueno';

-- ── 8. Seguridad: cada quien ve lo suyo y nada más ──────────────────
-- security definer para que la política no consulte miembros con RLS
-- puesta (se mordería la cola).
create or replace function public.mis_empresas()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select empresa_id from public.miembros where user_id = auth.uid()
$$;

revoke all on function public.mis_empresas() from public, anon;
grant execute on function public.mis_empresas() to authenticated;

alter table public.empresas   enable row level security;
alter table public.sucursales enable row level security;
alter table public.miembros   enable row level security;
alter table public.entities   enable row level security;
alter table public.kv         enable row level security;

-- Se van las políticas abiertas de la etapa "una sola tienda".
drop policy if exists "entities abierta" on public.entities;
drop policy if exists "kv abierta"       on public.kv;

create policy "entities de mi empresa" on public.entities
  for all to authenticated
  using      (empresa_id in (select public.mis_empresas()))
  with check (empresa_id in (select public.mis_empresas()));

create policy "kv de mi empresa" on public.kv
  for all to authenticated
  using      (empresa_id in (select public.mis_empresas()))
  with check (empresa_id in (select public.mis_empresas()));

create policy "veo mis empresas" on public.empresas
  for select to authenticated
  using (id in (select public.mis_empresas()));

create policy "veo mis sucursales" on public.sucursales
  for all to authenticated
  using      (empresa_id in (select public.mis_empresas()))
  with check (empresa_id in (select public.mis_empresas()));

-- Cada uno ve el equipo de su empresa; solo el dueño lo modifica.
create policy "veo el equipo de mi empresa" on public.miembros
  for select to authenticated
  using (empresa_id in (select public.mis_empresas()));

create policy "el dueno administra el equipo" on public.miembros
  for all to authenticated
  using (exists (
    select 1 from public.miembros m
    where m.empresa_id = miembros.empresa_id
      and m.user_id = auth.uid()
      and m.rol = 'dueno'
  ))
  with check (exists (
    select 1 from public.miembros m
    where m.empresa_id = miembros.empresa_id
      and m.user_id = auth.uid()
      and m.rol = 'dueno'
  ));

-- ── 8b. Alta de una empresa nueva (registro desde la app) ───────────
-- Crea empresa + primera sucursal + deja al que se registra como dueño, todo
-- junto. Es security definer porque en ese instante el usuario todavía no es
-- miembro de ninguna empresa, así que las políticas de arriba lo bloquearían.
create or replace function public.crear_empresa(p_nombre text, p_nombre_persona text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa  uuid;
  v_sucursal uuid;
  v_slug     text;
  v_uid      uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Hay que estar logueado para crear una empresa';
  end if;
  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'La empresa necesita un nombre';
  end if;

  -- slug legible y único: "mi tienda" -> "mi-tienda", "mi-tienda-2", ...
  v_slug := regexp_replace(lower(trim(p_nombre)), '[^a-z0-9]+', '-', 'g');
  v_slug := trim(both '-' from v_slug);
  if v_slug = '' then v_slug := 'tienda'; end if;
  if exists (select 1 from public.empresas where slug = v_slug) then
    v_slug := v_slug || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
  end if;

  insert into public.empresas (nombre, slug)
  values (trim(p_nombre), v_slug)
  returning id into v_empresa;

  insert into public.sucursales (empresa_id, nombre)
  values (v_empresa, 'Casa Central')
  returning id into v_sucursal;

  insert into public.miembros (empresa_id, user_id, sucursal_id, rol, nombre)
  values (v_empresa, v_uid, v_sucursal, 'dueno', nullif(trim(p_nombre_persona), ''));

  return v_empresa;
end $$;

revoke all on function public.crear_empresa(text, text) from public, anon;
grant execute on function public.crear_empresa(text, text) to authenticated;

-- ── 8c. Invitaciones ────────────────────────────────────────────────
-- El dueño no puede crear usuarios desde la app (eso necesita la clave
-- secreta del servidor). Así que deja anotado el correo y el rol; cuando esa
-- persona se registra sola, un trigger la mete en la empresa automáticamente.
create table if not exists public.invitaciones (
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  correo      text not null,
  rol         text not null default 'vendedor' check (rol in ('dueno', 'encargado', 'vendedor')),
  sucursal_id uuid references public.sucursales(id) on delete set null,
  nombre      text,
  creada_en   timestamptz not null default now(),
  primary key (empresa_id, correo)
);
alter table public.invitaciones enable row level security;

drop policy if exists "invitaciones de mi empresa" on public.invitaciones;
create policy "invitaciones de mi empresa" on public.invitaciones
  for all to authenticated
  using (exists (
    select 1 from public.miembros m
    where m.empresa_id = invitaciones.empresa_id
      and m.user_id = auth.uid()
      and m.rol = 'dueno'
  ))
  with check (exists (
    select 1 from public.miembros m
    where m.empresa_id = invitaciones.empresa_id
      and m.user_id = auth.uid()
      and m.rol = 'dueno'
  ));

create or replace function public.aplicar_invitaciones()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.miembros (empresa_id, user_id, sucursal_id, rol, nombre)
  select i.empresa_id, new.id, i.sucursal_id, i.rol,
         coalesce(i.nombre, new.raw_user_meta_data->>'nombre')
  from public.invitaciones i
  where lower(i.correo) = lower(new.email)
  on conflict (empresa_id, user_id) do nothing;

  delete from public.invitaciones where lower(correo) = lower(new.email);
  return new;
end $$;

drop trigger if exists trg_aplicar_invitaciones on auth.users;
create trigger trg_aplicar_invitaciones
  after insert on auth.users
  for each row execute function public.aplicar_invitaciones();

-- ── 9. La cotización del dólar es de todos ──────────────────────────
-- Es el mismo número para cualquier tienda del país: no tiene sentido
-- repetirlo por empresa. Lectura libre, escritura solo desde la Edge
-- Function (service role, que saltea RLS).
create table if not exists public.cotizacion (
  id          int primary key default 1 check (id = 1),
  compra      numeric,
  venta       numeric,
  actualizado timestamptz not null default now()
);
alter table public.cotizacion enable row level security;

drop policy if exists "cotizacion lectura" on public.cotizacion;
create policy "cotizacion lectura" on public.cotizacion
  for select to authenticated using (true);

-- Arranca con lo que ya había guardado en el kv de config, si estaba.
insert into public.cotizacion (id, compra, venta)
select 1,
       (value->>'dolarCompra')::numeric,
       (value->>'dolarVenta')::numeric
from public.kv
where key = 'config'
limit 1
on conflict (id) do nothing;

-- ── 10. Realtime ────────────────────────────────────────────────────
alter table public.entities   replica identity full;
alter table public.kv         replica identity full;
alter table public.sucursales replica identity full;

do $$ begin
  alter publication supabase_realtime add table public.sucursales;
exception when duplicate_object then null; end $$;

commit;

-- ── Comprobaciones ──────────────────────────────────────────────────
-- select nombre, slug from public.empresas;
-- select s.nombre, e.nombre from public.sucursales s join public.empresas e on e.id = s.empresa_id;
-- select collection, count(*) from public.entities group by 1 order by 2 desc;
-- select count(*) from public.entities where empresa_id is null;   -- tiene que dar 0
--
-- ── Para volver atrás (solo si algo salió mal y todavía no deployaste) ──
-- begin;
--   drop policy if exists "entities de mi empresa" on public.entities;
--   drop policy if exists "kv de mi empresa"       on public.kv;
--   create policy "entities abierta" on public.entities for all to anon using (true) with check (true);
--   create policy "kv abierta"       on public.kv       for all to anon using (true) with check (true);
-- commit;
