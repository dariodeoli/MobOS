# Cliente ocasional (#149)

Pedido **sin ficha**, **cambiar/quitar** el cliente de un pedido (con auditoría
y cronología) y **crear la ficha desde el pedido en un clic**, reutilizando el
buscador y el alta rápida del POS (`CheckoutCustomer`).

## Backend (contrato también para POS)

`PATCH /api/orders/:orderId` — dos acciones nuevas:

| Acción | Cuerpo | Efecto |
|---|---|---|
| `setCustomer` | `{ customerId: string \| null }` | Vincula, cambia o **quita** la ficha (`null` = ocasional). Valida tenant y que no esté archivada. |
| `createCustomer` | `{ customer: { name, phone?, countryCode?, email?, document? } }` | Crea la ficha **o reutiliza** la existente (documento > teléfono > nombre) y vincula el pedido. `name` obligatorio (no acepta «Consumidor final»). |

- Auditoría: `ORDER_CUSTOMER_CHANGED` · `ORDER_CUSTOMER_REMOVED` ·
  `ORDER_CUSTOMER_CREATED` (metadata con ficha anterior/nueva y `matched`).
- Los tres entran en la **cronología del pedido** (`GET /api/orders/:id/history`)
  con las etiquetas: «Cliente: X → Y», «Cliente quitado…» y «Ficha creada desde
  el pedido…».
- El pedido sigue guardando el **snapshot** de lo vendido; vincular/quitar no
  recalcula precios ni pagos.

## UI (ficha del pedido)

En la sección **Cliente** del detalle (`PedidoDetalle`):
- Sin ficha: **Asignar cliente** y **Crear ficha** (modal con el buscador/alta
  rápida del POS, `CheckoutCustomer`).
- Con ficha: **Cambiar cliente** y **Quitar cliente** (confirmación aparte).
- Todo queda auditado y visible en la cronología del pedido.

## Verificación

- Integración HTTP: `backend/tests/orders-customer.mjs`
  (`PASS: cliente ocasional … · 16 chequeos`) — pedido sin cliente, crear y
  vincular, deduplicación por teléfono, cambiar, quitar, auditoría, cronología,
  validaciones y permisos.
- e2e: `e2e/qa-149-cliente-ocasional.spec.js` (proyecto admin, **1/1**):
  prepara el pedido ocasional, crea la ficha desde la ficha del pedido, cambia
  por una existente (auto-selección por nombre exacto del buscador del POS),
  quita el cliente y comprueba los tres movimientos en la cronología.
- `npm run lint` 0 errores · `npm test` · `backend test:unit` ·
  `prisma:validate` · builds FE/BE con `BUILD_ID` · `test:e2e:smoke`.

## Notas

- No hubo migración: `Order.customerId` ya era opcional.
- POS mantiene su parte (checkout sin ficha y alta rápida en la venta); el
  backend y la ficha del pedido quedan compartidos con este contrato.
