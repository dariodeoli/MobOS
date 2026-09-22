# Épica #148 — §6: escáner de código de barras/QR en el POS

## Flujo implementado ✅

1. **Escaneo**: el POS interpreta el código (pistola o tipeo + Enter) y busca el producto en
   el catálogo; si no existe avisa «El código escaneado no está en el catálogo (código)»
   (`FormularioVenta` L742).
2. **Mostrar producto y preguntar**: abre el modal **«Producto escaneado»** (L2079-2084) con
   imagen, nombre, modelo/capacidad, precio y stock del producto encontrado.
3. **Agregar al confirmar**: el producto entra al carrito solo cuando el vendedor confirma el
   modal (y respeta el flujo normal: cantidad, IMEI, descuentos).

## Evidencia

- **e2e**: `e2e/pos-checkout.spec.js` → «POS: el producto escaneado pide confirmación antes de
  entrar a la venta» → **1 passed** (verificado hoy).
- Capturas: el modal se captura en la próxima pasada (el trigger del escaneo requiere simular
  la pistola; las capturas actuales del catálogo/carrito están en `docs/qa/187b/`).
