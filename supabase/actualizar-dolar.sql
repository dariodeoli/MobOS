-- Cron que actualiza la cotización del dólar cada 4 horas (0, 4, 8, 12, 16, 20 h).
-- Llama a la Edge Function `actualizar-dolar`, que lee Cambios Chaco y guarda el
-- valor en la tabla kv. Corre en el servidor aunque nadie tenga la app abierta.
--
-- Ejecutar UNA vez en el SQL Editor de Supabase. Reemplazá:
--   <PROJECT_REF>  → la referencia de tu proyecto (xxxx en https://xxxx.supabase.co)
--   <ANON_KEY>     → tu clave anónima/publishable (la misma del frontend, .env)

-- 1) Habilitar las extensiones necesarias (idempotente).
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2) (Opcional) borrar una programación anterior con el mismo nombre.
select cron.unschedule('actualizar-dolar-4h')
where exists (select 1 from cron.job where jobname = 'actualizar-dolar-4h');

-- 3) Programar cada 4 horas.
select cron.schedule(
  'actualizar-dolar-4h',
  '0 */4 * * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/actualizar-dolar',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <ANON_KEY>',
      'Content-Type', 'application/json'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- Para revisar / borrar después:
--   select * from cron.job;
--   select cron.unschedule('actualizar-dolar-4h');
