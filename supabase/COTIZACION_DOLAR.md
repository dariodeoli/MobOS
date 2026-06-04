# Cotización del dólar automática (cada 4 h)

La conversión USD → ₲ del Trade-In se actualiza sola leyendo **Cambios Chaco**
(vía la API pública DolarPy) y guardándola en la tabla `kv` (clave `tradein`).
El frontend recibe el cambio por **realtime**, así que todos los dispositivos
ven el valor nuevo sin recargar.

Piezas:
- `functions/actualizar-dolar/index.ts` — Edge Function que trae el valor y lo guarda.
- `actualizar-dolar.sql` — programa el cron cada 4 horas.
- Botón **🔄 Actualizar ahora** en Centro de Control → Trade-In (dispara la función a mano).

## 1. Desplegar la Edge Function

Con el [CLI de Supabase](https://supabase.com/docs/guides/cli) instalado y logueado:

```bash
cd fono-mobile-store
supabase link --project-ref <PROJECT_REF>      # una sola vez
supabase functions deploy actualizar-dolar
```

> La función usa `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`, que Supabase
> **inyecta automáticamente** en las Edge Functions. No hay que configurar nada.

Probarla a mano:

```bash
curl -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/actualizar-dolar" \
  -H "Authorization: Bearer <ANON_KEY>"
# → {"ok":true,"rate":6100,"market":6100,"ajuste":0,"fuente":"Cambios Chaco"}
```

## 2. Programar el cron (cada 4 horas)

En el **SQL Editor** de Supabase, abrí `actualizar-dolar.sql`, reemplazá
`<PROJECT_REF>` y `<ANON_KEY>`, y ejecutalo. Eso habilita `pg_cron` + `pg_net`
y agenda la llamada a las 0, 4, 8, 12, 16 y 20 h.

Verificar / borrar:

```sql
select * from cron.job;                       -- ver programaciones
select cron.unschedule('actualizar-dolar-4h'); -- borrar
```

## 3. Ajuste propio (markup)

Si el valor de la casa de cambio te queda corto, en Trade-In hay un campo
**“Ajuste (₲ a sumar)”**. La función calcula `exchangeRate = mercado + ajuste`.
Ej.: mercado 6.100 + ajuste 200 → se usa 6.300.

## Cambiar la casa de cambio

En `functions/actualizar-dolar/index.ts`, la constante `FUENTE` define cuál se
lee (`cambioschaco`, `bonanza`, `familiar`, `gnbfusion`, etc., según las claves
que devuelve DolarPy). Cambiala y volvé a desplegar.
