# #280 · Gift cards reales (dominio POS)

Flujo mínimo aprobado y entregado: **emisión con código** desde el POS, **saldo**
consultable, **canje como medio de pago** en el cobro (parcial o total),
**historial** por tarjeta, **anulación** de gerencia y **auditoría**. Con paridad
en la demo.

## Cómo funciona

- **Emisión** — POS → **Gift cards** → monto, vencimiento opcional, nota,
  **cuenta que cobra la emisión** (opcional) y asociar al cliente de la venta.
  El código (`GC-XXXX-XXXX-XXXX`, Crockford sin I/L/O/U) se muestra **una sola
  vez** y en la base queda solo su `sha256` (docs/TOKENS.md). El movimiento
  `ISSUE` guarda la cuenta y su foto.
- **Canje** — Cobro → **+ Canjear gift card** → código → **Consultar saldo** →
  el monto se propone con lo pendiente (nunca más que el saldo). El servidor
  descuenta el saldo de forma atómica (`FOR UPDATE`) en la misma transacción del
  pedido y el pago queda con método `GIFT_CARD` (referencia `GC ••XXXX`).
- **Historial** — el detalle de cada tarjeta lista `Emitida`, `Canjeada` (con el
  pedido) y `Anulada`, y el saldo después de cada movimiento.
- **Auditoría** — `GIFT_CARD_ISSUED`, `GIFT_CARD_REDEEMED` y
  `GIFT_CARD_CANCELLED` en el historial de auditoría.

## Evidencia

- **Backend**: `backend/tests/gift-cards.mjs` (arnés HTTP) — emisión, consulta,
  canje en pago, rechazo por saldo, agotado, anulación, historial y auditoría.
- **e2e**: `e2e/qa-280-gift-cards.spec.js` — emisión y canje en el POS real +
  paridad en la demo sin llamadas al API.
- **Unit**: `src/lib/giftCards.test.js` (normalización del código y generador).
- **Capturas**: `gift-cards-emision.jpg`, `gift-cards-cobro.jpg`,
  `gift-cards-historial.jpg`, `gift-cards-demo-emision.jpg`,
  `gift-cards-demo-historial.jpg`.

## Coordinaciones

- **FIN (contabilidad)**: la emisión registra `GiftCardMovement(kind=ISSUE)` con
  `accountId` + `accountSnapshot` y monto; **hoy ese cobro no entra a Caja** (no
  es un `Payment`). Contrato para que Finanzas lo sume a los cortes de
  efectivo/conciliación como ingreso de gift card; el canje sí aparece como pago
  `GIFT_CARD` (etiqueta «Gift card») en pedido, cortes por tipo y analytics.
- **CMP (componentes)**: sin objetos nuevos; se usan los compartidos (`Modal`,
  `MoneyInput`, `Input`, `Select`, `ConfirmDialog`, `Aviso`, `GRILLA_DOS_COLUMNAS`).
