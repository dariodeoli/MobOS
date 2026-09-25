# Épica #148 — §6: buscador y escáner de código de barras/QR en el POS

## Flujo implementado ✅

1. **Escaneo**: el POS interpreta el código (pistola o tipeo + Enter) y busca el producto en
   el catálogo; si no existe avisa «El código escaneado no está en el catálogo (código)»
   (`FormularioVenta`).
2. **Mostrar producto y preguntar**: abre el modal **«Producto escaneado»** con imagen,
   nombre, SKU, precio y stock del producto encontrado.
3. **Agregar al confirmar**: el producto entra al carrito solo cuando el vendedor confirma el
   modal (y respeta el flujo normal: cantidad, IMEI, descuentos).
4. **Buscador**: resultados con nombre/modelo/capacidad, precio, stock de la sucursal activa y
   variantes (tarjetas del catálogo, `PasoProductos`).

## Gap cerrado: los productos del catálogo demo no tenían SKU

En la demo, los productos del seed base (`prod()`) nacían **sin SKU** y el escáner no los
encontraba («El código escaneado no está en el catálogo»), así que la función no se podía
probar en la demo. El inventario serializado ya derivaba el SKU del id para los celulares;
ahora el catálogo demo **completa el SKU de todos los productos** (mismo criterio, `skuDemo`,
24 caracteres):

- `src/lib/demo/sku.js`: derivación pura y testeable (`sku.test.js`).
- `prepararDatosDemo`: los seeds nuevos nacen con SKU y la migración
  `demoSeedVersion 6` lo completa en los datos ya sembrados (idempotente).
- `e2e/demo-anonimo`: «el escáner del POS encuentra el producto y pide confirmación» (sin
  llamadas al API).

## Evidencia

- **e2e**: `e2e/pos-checkout.spec.js` → «el producto escaneado pide confirmación antes de
  entrar a la venta» y `e2e/demo-anonimo` (demo con SKU derivado).
- **Capturas**: `docs/qa/148-s6/escaner/rama-148-s6/` (390 y 1280: modal + agregado) y
  `docs/qa/148-s6/escaner/1.0.156-produccion/` (flujo del escáner en producción).
- **Sonda**: `scripts/qa-148-s6-escaner.mjs` (`QA_BASE_URL`, `QA_ETIQUETA`, `QA_SKU`), mide
  los botones del modal en mobile (≥44, #249) y deja `resultados.json`.

## Gap cerrado: el selector de IMEI del POS no funcionaba en la demo

`SerialUnitPicker` hablaba con el API directo (`/api/inventory-units`), así que
en la demo no listaba unidades y el flujo serializado quedaba solo con «vender
sin IMEI». Ahora usa los recursos con rama demo
(`resources.inventoryUnits.list` / `inventoryReservations.create|release`),
filtra por la sucursal del producto (como la API real) y la búsqueda de la demo
incluye el **SKU** (mismo criterio que el backend). Evidencia: e2e
`demo-anonimo` «el POS reserva un IMEI de la demo y la línea queda con el
serial», sin llamadas al API.
