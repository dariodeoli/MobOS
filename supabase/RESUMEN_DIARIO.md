# Resumen diario por correo — guía de activación

Todas las noches a las 21:00 llega a tu Gmail el cierre del día: total vendido,
comparación con ayer, ventas por vendedor, comisiones a pagar, delivery y gastos.

Se configura **una sola vez**. Tu proyecto es `aicmzezndcznrivseeno`.

---

## Paso 1 — Cuenta de Resend (servicio de envío)

1. Entrá a **https://resend.com** → *Sign up* (podés entrar con GitHub).
2. Confirmá tu correo.
3. En el menú izquierdo → **API Keys** → *Create API Key*.
   - Name: `fono`
   - Permission: **Sending access**
4. Copiá la clave (empieza con `re_`). **Se muestra una sola vez.**

> Con el remitente de prueba `onboarding@resend.dev` podés enviar **solo a tu
> propio correo** (el de la cuenta de Resend). Alcanza y sobra para este uso.
> Si más adelante querés enviar a otras direcciones, hay que verificar un dominio.

---

## Paso 2 — Conectar el CLI de Supabase

No hace falta instalar nada: se usa con `npx`. En la Terminal:

```bash
cd "/Users/esteban/Documents/GitHub/fono-mobile-store"
npx -y supabase@latest login
```

Se abre el navegador para autorizar. Después:

```bash
npx -y supabase@latest link --project-ref aicmzezndcznrivseeno
```

Te va a pedir la **contraseña de la base** (la de cuando creaste el proyecto).
Si no la recordás: Supabase → Settings → Database → *Reset database password*.

---

## Paso 3 — Cargar las claves (secrets)

Reemplazá `re_TU_CLAVE` por la de Resend y `tucorreo@gmail.com` por tu Gmail:

```bash
npx -y supabase@latest secrets set RESEND_API_KEY=re_TU_CLAVE
npx -y supabase@latest secrets set RESUMEN_TO=tucorreo@gmail.com
npx -y supabase@latest secrets set RESUMEN_FROM="Fono Mobile Store <onboarding@resend.dev>"
```

> Estas claves quedan guardadas en Supabase, **no** en el código ni en GitHub.

---

## Paso 4 — Desplegar las funciones

```bash
npx -y supabase@latest functions deploy resumen-diario
npx -y supabase@latest functions deploy actualizar-dolar
```

La segunda activa además el **botón "Actualizar ahora"** del tipo de cambio,
que hoy da error porque nunca se desplegó.

---

## Paso 5 — Probar que llega el correo

```bash
curl -X POST "https://aicmzezndcznrivseeno.supabase.co/functions/v1/resumen-diario" \
  -H "Authorization: Bearer sb_publishable_JioGO0l2jULYOKiu22mzeA_dZAAevcd"
```

Respuesta esperada: `{"ok":true,"fecha":"...","ventas":20,"total":2448000,...}`
y el correo en tu bandeja. Si dice `ok:false`, el mensaje indica qué falta.

Para reenviar el resumen de **otro día**:

```bash
curl -X POST ".../functions/v1/resumen-diario?fecha=2026-07-15" -H "Authorization: Bearer ..."
```

---

## Paso 6 — Programar el envío automático

En Supabase → **SQL Editor**, abrí `resumen-diario.sql`, reemplazá
`<PROJECT_REF>` por `aicmzezndcznrivseeno` y `<ANON_KEY>` por tu clave
publishable, y ejecutalo. Hacé lo mismo con `actualizar-dolar.sql`.

Verificar / cancelar:

```sql
select * from cron.job;                     -- ver programaciones activas
select cron.unschedule('resumen-diario');   -- cancelar
```

---

## Cambiar el horario

En el SQL, `'0 0 * * *'` es 00:00 UTC = **21:00 Paraguay**.
- `'0 23 * * *'` → 20:00 Paraguay
- `'0 1  * * *'` → 22:00 Paraguay

## Cambiar el destinatario

```bash
npx -y supabase@latest secrets set RESUMEN_TO=otro@gmail.com
```

Para varios destinatarios, separalos con coma (requiere dominio verificado en
Resend si no son tu propia casilla).
