# Épica #148 — §5 (carrito) y §10 (botón principal): estado

## §5 — carrito ✅

- **Agotado**: la línea y el catálogo marcan «Agotado» cuando el stock de la sucursal es 0
  (y «Sobre pedido» lo exceptúa).
- **Stock por sucursal**: el catálogo del POS carga productos con el stock de la sucursal
  activa («N en stock» en cada tarjeta y en el detalle de la línea).
- **Descuento individual visible**: además de los campos del detalle, la línea muestra un
  chip **«descuento − Gs X»** en el pie, **visible también con la línea colapsada** (nuevo
  en esta pasada, `FilaVenta`).

## §10 — botón principal por estado ✅

- Verde **«Confirmar venta»** con pago completo; **naranja «Crear pedido»** con pago parcial;
  **rojo «Crear pedido a crédito»** sin pago con crédito activado, o **«Crear pedido sin
  pago»**; y **«Guardar pedido»** cuando la venta queda sin finalizar (falta cliente/datos).
- Evidencia: capturas `docs/qa/204/01-split-usd.jpg` (parcial → «Crear pedido») y
  `02-split-completo.jpg` (completo → «Confirmar venta»); los estados de crédito y guardar
  salen del mismo ternario del botón (`PasoCobro`), cubiertos por el e2e del flujo de venta.

**Checks de la pasada:** build ✓ · lint 0 errores · e2e del split en verde · smoke 7.
