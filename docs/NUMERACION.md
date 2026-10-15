# Numeración de pedidos (#461)

## Formato de pantalla: `AUR-0003`

Todo lo que ve una persona (pantallas, comprobantes impresos y por correo, portal del cliente,
mensajes de WhatsApp, cronologías) muestra el número de **pedido** como **prefijo, guion y al menos
4 dígitos, sin «#»**: `AUR-0003`, `MOB-0042`, `MOB-10000`.

- Frontend: `codigoPedido()` en `src/utils/pedido.js` (única función; no armar el texto a mano).
- Backend: `displayOrderNumber()` en `backend/lib/order-number.ts` (correos, mensajes, historiales).
- Las cotizaciones (`COT-#0020`) y las órdenes de servicio (`OS-#0007`) conservan su formato propio:
  este criterio es solo para pedidos.

## Valor guardado: no cambia

El servidor sigue guardando `PREFIJO-#0001` (`formatOrderNumber`, índice único por empresa) y la demo
`AUR-0001`. **No se migra ningún dato**: `codigoPedido()`/`displayOrderNumber()` aceptan los dos
formatos (y `AUR 3`) y los muestran igual. La búsqueda de pedidos ya compara solo letras y dígitos,
así que buscar `AUR-0003` encuentra el guardado `AUR-#0003`.

Cualquier otro formato (por ejemplo `E2E-SEED-001`) se muestra tal cual.

## Unicidad

- Servidor: `nextOrderNumber()` bloquea el contador de la empresa dentro de la transacción y salta por
  encima del máximo ya usado; el índice `(tenantId, orderNumber)` rechaza duplicados. **Convertir una
  cotización toma un número nuevo**, igual que una venta del POS.
- Demo: `tomarNumeroPedidoDemo()` (`src/lib/demoTenant.js`) salta por encima de las ventas sembradas y
  de las guardadas en el navegador (las registra `storage.js`), así nunca repite un número. Convertir
  una cotización crea **un solo pedido** con todas sus líneas.
