# Épica #148 — §12: estados de entrega y sincronización

## Implementado (main) ✅

- **Estados completos por método** (#191): delivery (`PROCESSING → READY_TO_SHIP → SHIPPED →
  IN_TRANSIT → DELIVERED` + `PARTIAL`/`NOT_DELIVERED`) y retiro/retiro en otra sucursal/
  traslado (`PROCESSING → (IN_TRANSIT) → READY_FOR_PICKUP → PICKED_UP` + `PARTIAL`), con
  rechazo de estados incompatibles (409 con motivo) y convergencia de datos viejos.
- **Sincronía con pedidos**: el PATCH de `/api/orders/[orderId]` y el del reparto
  (`/api/delivery/orders/[orderId]/status`) comparten la misma validación; al entregar con
  saldo se exige autorización y se actualiza el crédito del cliente.
- **Sincronía con delivery**: `/api/delivery/orders?estado=activos|entregados` refleja el
  estado real (retirado cuenta como entregado y sale de activos).
- **Inventario**: el stock se descuenta al confirmar la venta; el estado de entrega no lo
  vuelve a tocar (no hay doble descuento al entregar).
- **Timeline**: cada cambio queda como `ORDER_FULFILLMENT_UPDATED` con actor real y se ve en
  la cronología del pedido y en el tracking público (línea de progreso con fechas).
- **Notificaciones (WhatsApp por estado)**: plantillas `IN_TRANSIT` (en camino),
  `READY_TO_SHIP` y `READY_FOR_PICKUP` (listo para retirar) con el enlace de seguimiento
  (`orders/[orderId]/whatsapp-message`).

## Coordinaciones pendientes

- **PLT (notificaciones)**: que un cambio de entrega genere también **notificación in-app**
  para el vendedor/cliente (el panel ya existe; hoy el aviso sale por WhatsApp).
- **DSN (piloto del carrito)**: usar los estados de esta máquina para el piloto visual del
  carrito/seguimiento (los textos y la línea de progreso ya salen del backend).

## Evidencia

- Arnés: `order-fulfillment.mjs` (#152/#191) y `delivery.mjs` (reparto, cobro y rendición).
- e2e: `pos-pedidos` (detalle y cronología), `public-tracking` (encabezado y pasos por método).
