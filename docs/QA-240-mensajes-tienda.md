# #240 → Portal — Mensajes de la tienda al cliente (con visto/no visto)

El portal ya mostraba los avisos del sistema (pagos, retiros, garantías) y el
seguimiento; faltaba el canal **humano**: el equipo no tenía dónde dejarle un
mensaje al cliente que quedara en su cuenta. Ahora se publica desde la ficha y
el visto/no visto cierra el circuito.

## Entregado

| Archivo | Cambio |
|---|---|
| `backend/prisma/schema.prisma` + migración `20261128000000_customer_notices` | `CustomerNotice` (empresa + cliente, autor, contenido, vencimiento opcional, `firstViewedAt`/`lastViewedAt`). Aditiva e idempotente; `db:check` limpio |
| `backend/app/api/customers/[id]/notices/route.ts` (nuevo) | **POST** publica (ADMIN/GERENTE/VENDEDOR, vencimiento opcional) y **DELETE** elimina; auditoría `CUSTOMER_NOTICE_CREATED/DELETED` |
| `backend/app/api/customers/[id]/route.ts` | El perfil devuelve `customerNotices` (con autor y visto/no visto) |
| `backend/app/api/customers/[id]/timeline/route.ts` | Eventos **«Mensaje al cliente»** y **«Mensaje visto por el cliente»** (con el contenido), excluyendo las auditorías internas |
| `backend/app/api/portal/[token]/route.ts` | Sección **`mensajes`** (activos, sin vencer, últimos 5) y marca del visto al abrir la cuenta; `nuevo` en el primer render |
| `src/components/customers/CustomerProfile.jsx` | Bloque **«Mensajes al cliente»** en la Cronología: publicar, listar con **Visto/Sin ver** y eliminar; en demo vive en la pestaña |
| `src/pages/CuentaPublica.jsx` | Sección **«Mensajes de la tienda»** con chip **Nuevo** (sostenido durante la carga aunque la página repita el fetch) |
| `src/lib/demoClientes.js` | Demo: dos mensajes de Lucía (uno visto, uno nuevo) y el marcado del visto en memoria |

## Decisiones (documentadas)

- **Vencimiento opcional**: un mensaje vencido deja de mostrarse en el portal
  (no se borra: la ficha lo conserva).
- **El visto se marca al abrir la cuenta** (como el informe), en el mismo GET
  del portal que ya está rate-limited; el chip «Nuevo» se calcula en ese primer
  render y se mantiene durante la carga.
- **Sin costos ni datos internos** en el portal: contenido y fecha.
- **Demo**: los mensajes y su visto viven en memoria de la pestaña (al recargar
  se vuelve al seed), igual que el resto de la demo.
- **Timeline**: el envío y el visto aparecen en la cronología del cliente con el
  contenido del mensaje (no con códigos crudos).

## Verificación

```bash
# e2e (cuenta real + demo), con capturas
MOBOS_E2E_PGDATA=/tmp/mobos-e2e-pg-MOS-CRM MOBOS_E2E_PGPORT=5510 \
  MOBOS_E2E_API_PORT=3110 MOBOS_E2E_WEB_PORT=5210 \
  npx playwright test e2e/qa-240-mensajes-tienda.spec.js --project=admin

# integración HTTP: mensaje → portal (nuevo → visto) → ficha y cronología
node backend/tests/customer-portal.mjs <BASE_URL> <ADMIN> <SELLER> <CAJERA> <DATABASE_URL> <PG_BIN>
```

| Evidencia | Qué cubre |
|---|---|
| `docs/QA-240-mensajes-tienda/01-ficha-mensaje.png` | La ficha publica el mensaje y lo muestra **Sin ver** |
| `docs/QA-240-mensajes-tienda/02-portal-mensaje.png` | El portal lo lista con el chip **Nuevo** |
| `docs/QA-240-mensajes-tienda/03-ficha-visto.png` | La ficha queda en **Visto** y la cronología con «Mensaje visto por el cliente» |
| `docs/QA-240-mensajes-tienda/04-demo-portal-mensajes.png` | Demo: los mensajes de Lucía en su cuenta |
| `e2e/qa-240-mensajes-tienda.spec.js` | **2/2** (cuenta real y demo) |
| `backend/tests/customer-portal.mjs` | Mensaje creado → portal `nuevo: true` → segunda apertura `false` → perfil con `firstViewedAt` + cronología con ambos eventos |
| `src/lib/demoClientes.test.js` | Demo: dos mensajes, visto marcado y segunda apertura sin «Nuevo» |
| `npm run db:check` | Migración aplicada en base fresca, re-aplicada sin diferencias |

## Checks de esta entrega

`npm run lint` 0 errores · builds FE/BE con `BUILD_ID` ✓ · `prisma:validate` ✓ ·
`npm test` ✓ · backend `test:unit` ✓ · `db:check` ✓ · `test:e2e:smoke` ✓ ·
e2e nuevos 2/2 · mini arnés HTTP PASS · sin marcadores de conflicto.
