-- Cron: envía el resumen diario por correo todas las noches a las 21:00 de Paraguay.
-- Paraguay es UTC-3, así que 21:00 local = 00:00 UTC del día siguiente.
--
-- Ya tiene tus datos cargados: copiá todo y ejecutalo en el SQL Editor de Supabase.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Borra una programación anterior con el mismo nombre (si existiera).
select cron.unschedule('resumen-diario')
where exists (select 1 from cron.job where jobname = 'resumen-diario');

select cron.schedule(
  'resumen-diario',
  '0 0 * * *',          -- 00:00 UTC = 21:00 Paraguay
  $$
  select net.http_post(
    url     := 'https://aicmzezndcznrivseeno.supabase.co/functions/v1/resumen-diario',
    headers := jsonb_build_object(
      'Authorization', 'Bearer sb_publishable_JioGO0l2jULYOKiu22mzeA_dZAAevcd',
      'Content-Type', 'application/json'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- Útiles:
--   select * from cron.job;                       -- ver programaciones
--   select cron.unschedule('resumen-diario');     -- cancelar
--
-- Para cambiar el horario, reemplazá '0 0 * * *':
--   '0 23 * * *' → 20:00 Paraguay
--   '0 1  * * *' → 22:00 Paraguay
