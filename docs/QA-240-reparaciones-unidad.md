# #240 · Repuestos no-OEM: vínculo orden de servicio ↔ unidad y costo real

Cierra el pendiente de la épica que anotó Finanzas: *«el vínculo automático orden
de servicio ↔ unidad y los campos no-OEM por unidad»*. Los campos no-OEM ya
vivían en la inspección de la unidad; faltaba que el costo de la reparación del
taller llegue al **costo real del equipo** (base del margen y del seguro, #148
§19) sin volver a tipearlo.

## Qué entró

- **Modelo** (`backend/prisma/schema.prisma` + migración
  `20261204000000_service_order_unit_repairs`, aditiva e idempotente):
  `ServiceOrder.inventoryUnitId` (relación con `InventoryUnit`) y
  `ServiceOrder.repairsAppliedAt`.
- **Acción explícita y auditada** (`POST /api/inventory-units/:id/repairs`):
  con la orden y la unidad del mismo serial, suma el costo de la orden
  (`repuestos + mano de obra + otros`) al `inspection.costoRepuestosPyg` de la
  unidad, deja la referencia de la orden en `repuestosNoOem` y vincula la orden.
  Se aplica **una sola vez** (reclamo atómico: el segundo intento responde 409),
  exige rol de administración/gerencia de la sucursal, rechaza seriales que no
  coinciden y órdenes sin costo. Audita `INVENTORY_REPAIR_APPLIED` (unidad) y
  `SERVICE_ORDER_COST_APPLIED` (orden).
- **Ficha de la unidad** (`src/components/inventory/UnidadDetalle.jsx`): bloque
  **«Reparaciones del taller»** con las órdenes del serial (ya venían en la
  cronología), su costo y el botón **«Pasar al costo»**; al aplicarse queda el
  badge **Aplicada** con la fecha y el gasto se refleja en «Costo de repuestos y
  arreglos». En la demo el vínculo se simula en el navegador.
- **Cronología del serial**: los eventos de reparación ahora exponen costo,
  número de orden y si el costo ya se aplicó a la unidad.

## Verificación

- `npm run lint` 0 errores · `npm test` **751 ✓** · backend `test:unit` **75 ✓** ·
  builds FE/BE con `BUILD_ID` · `prisma:validate` ✓ · `db:check` sin diferencias.
- **e2e** (`e2e/inventario-unidades.spec.js`, caso «la reparación del taller se
  pasa al costo real de la unidad»): orden de 125.000 (100.000 repuestos +
  20.000 mano de obra + 5.000 otros) → se aplica, queda `Aplicada`, el costo
  persiste en la inspección (`costoRepuestosPyg = 125000`), la orden guarda
  `inventoryUnitId` y no se puede repetir.
- **Integración HTTP** (`backend/tests/unit-repairs.mjs`, sumado a
  `integration-http.sh`): vínculo, costo único, cronología y rechazos
  (ya aplicada, sin costo, otro serial).
- Capturas: `docs/qa/240-reparaciones-unidad/01-reparacion-pendiente.jpg` y
  `02-reparacion-aplicada.jpg`.

## Novedades para el dueño

- Cuando el taller repara un equipo que está en stock, el costo del arreglo se
  pasa al equipo con un clic y **suma al costo real**: la ganancia y el seguro
  lo toman solos, sin volver a cargarlo a mano.
- La ficha del equipo muestra las órdenes del taller de ese serial, cuánto costó
  cada una y cuáles ya están aplicadas (no se puede sumar dos veces).
- Queda auditado quién lo aplicó y cuándo, tanto en el equipo como en la orden.
