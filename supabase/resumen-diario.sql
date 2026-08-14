-- Cron: envía el resumen diario por correo todas las noches a las 21:00 de Paraguay.
-- Paraguay es UTC-3, así que 21:00 local = 00:00 UTC del día siguiente.
--
-- Ejecutar UNA vez en el SQL Editor de Supabase. Reemplazá antes:
--   <PROJECT_REF>  → la referencia de tu proyecto (el xxxx de https://xxxx.supabase.co)
--   <ANON_KEY>     → tu clave publishable (la misma del .env del frontend)

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
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/resumen-diario',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <ANON_KEY>',
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
