-- ════════════════════════════════════════════════════════════════════
-- Activar + verificar Realtime para Fono Mobile Store
-- Pegá esto en Supabase → SQL Editor → New query → Run.
-- Al final devuelve la lista de tablas con realtime activo: tienen que
-- aparecer "entities" y "kv".
-- ════════════════════════════════════════════════════════════════════

-- DELETE manda la fila completa (no solo la PK) por el stream de realtime.
alter table public.entities replica identity full;
alter table public.kv       replica identity full;

-- Agregar las tablas a la publicación de realtime (idempotente).
do $$ begin
  alter publication supabase_realtime add table public.entities;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.kv;
exception when duplicate_object then null; end $$;

-- Verificación: estas dos filas deben aparecer en el resultado.
select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and tablename in ('entities', 'kv')
order by tablename;
