-- ════════════════════════════════════════════════════════════════════
-- Fono Mobile Store — Esquema Supabase
-- Pegá TODO este archivo en: Supabase → SQL Editor → New query → Run.
-- Es idempotente: se puede correr varias veces sin romper nada.
-- ════════════════════════════════════════════════════════════════════

-- Colecciones con muchas filas (productos, vendedores, ventas, gastos, ads, celulares).
-- Cada fila es una entidad guardada como JSON en "data".
create table if not exists public.entities (
  collection text not null,
  id         text not null,
  data       jsonb not null,
  created_at timestamptz not null default now(),
  primary key (collection, id)
);

create index if not exists entities_collection_idx
  on public.entities (collection, created_at);

-- Blobs únicos (config de la tienda, configuración de Trade-In).
create table if not exists public.kv (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- ── Seguridad (RLS) ─────────────────────────────────────────────────
-- App interna sin login propio de Supabase: el acceso se hace con la
-- clave publishable (rol anon). Abrimos lectura/escritura a ese rol.
-- Nota: cualquiera con la URL + publishable key puede leer/escribir,
-- igual que hoy con localStorage. Suficiente para uso interno.
alter table public.entities enable row level security;
alter table public.kv       enable row level security;

drop policy if exists "entities abierta" on public.entities;
create policy "entities abierta" on public.entities
  for all to anon using (true) with check (true);

drop policy if exists "kv abierta" on public.kv;
create policy "kv abierta" on public.kv
  for all to anon using (true) with check (true);

-- ── Realtime ────────────────────────────────────────────────────────
-- Habilita que los cambios se transmitan en vivo a todos los dispositivos.
do $$ begin
  alter publication supabase_realtime add table public.entities;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.kv;
exception when duplicate_object then null; end $$;

-- Para que los eventos DELETE incluyan la fila completa (no solo la PK).
alter table public.entities replica identity full;
alter table public.kv       replica identity full;
