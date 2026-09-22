# Épica #148 — §20 (resto) y §21: estado verificado en el código

## §20 — enlace público del carrito con Checkout y aviso de disponibilidad ✅

- **Backend** `app/api/suspended-sales/public/[token]/route.ts`: el payload público calcula
  por ítem `available` (stock actual vs. cantidad), y devuelve subtotal, descuento, envío y
  **total** — nunca datos internos.
- **Página** `pages/CarritoPublico.jsx`: lista productos con precios y descuentos, marca
  «Sin stock en este momento: lo confirmamos al cerrar» (L71) y cierra con el botón
  **Checkout — Gs [total]** (L111/L120).
- **Evidencia automatizada:** `e2e/pos-qa-173.spec.js` → «el borrador con enlace público se
  abre sin sesión y muestra el carrito» (verde en esta corrida).

## §21 — detalle del pedido: acciones y confirmación ✅ (implementado)

- **Cobrar saldo** y **nota editable** (#175), **recibo/impresión** con QR por nivel,
  **mensaje** de WhatsApp por estado (`orders/[orderId]/whatsapp-message`), **timeline** con
  menciones, **editar cliente**, y **cancelar / devolver / reembolsar** por el flujo de
  postventa con autorización (`orders/[orderId]` + `returnRequest`).
- **Animación de confirmación** al cerrar la venta con el número de pedido (#175).
- **Evidencia automatizada:** `e2e/pos-pedidos.spec.js` (detalle y comprobante) verde en
  esta corrida; `order-fulfillment` y `orders-credit-discounts` cubren estados y postventa.

**Capturas:** las nuevas (página pública con aviso de stock y detalle con acciones) se toman
en la próxima pasada con el demo/deploy vigente; las actuales de referencia son
`docs/qa/204/02-split-completo.jpg` (carrito) y `docs/qa/187b/15..16` (cierre con número).
