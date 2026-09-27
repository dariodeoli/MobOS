# Abastecimiento F2 · cierre de costos (FIN #254)

- **Rama:** `slot/finanzas` · **Fecha:** 2026-09-26 · **Alcance:** FIN sobre la
  API de F2 (`docs/ABASTECIMIENTO-F2.md` §4-quater); la UI de compra rápida
  sigue de INV/PLT.

## Qué cierra

F2 permite registrar una compra **sin factura** (`costPyg: null`) y promete
completarla cuando el monto aparece. Faltaba el mecanismo: sin él, la compra no
generaba cuenta a pagar, las unidades recibidas quedaban con **costo pendiente**
(fuera de la ganancia, patrón #122) y el rendimiento por proveedor del panel F6
medía $0. El cierre de costos completa eso para lo que sigue vigente (las ventas
ya cerradas conservan su costo congelado; la unidad queda bien valuada para las
ventas siguientes y el seguro):

`PATCH /api/supply/purchases { id, action: 'costs', originalCost | lines[],
currency?, exchangeRatePyg?, paymentCondition?, dueAt? }`

| Regla | Detalle |
| --- | --- |
| Total | `originalCost` manda tal cual; si no viene, es la suma de las líneas (`unitCostPyg` × cantidad) con las reglas compartidas (`normalizarCosto`). |
| Por línea | `lines: [{ id, unitCostPyg }]` o `originalUnitCost` en la moneda de la compra; las líneas que no vienen quedan igual. |
| Moneda | Se puede fijar o cambiar al cerrar (PYG/USD/BRL); con moneda extranjera la cotización es obligatoria. |
| Cuenta a pagar | Nace con el monto real (contado saldado, crédito con vencimiento) o se corrige si sigue **impaga**. Con pagos o consumo reales → **409** (va por Finanzas). |
| Unidades recibidas | Las que quedaron con **costo pendiente** se completan con la misma cuenta proporcional de la recepción; si ya tienen costo sellado → **409**. |
| No toca | Cantidades, IMEI, necesidades ni stock. |
| Auditoría | `SUPPLY_PURCHASE_COST_UPDATED` · `SUPPLIER_PAYABLE_CREATED`/`_UPDATED` · `INVENTORY_UNIT_COST_COMPLETED`. |

## Evidencia

- Unit `backend/tests/supply.test.ts` → `normalizarCierreDeCostos`: total Gs/USD
  (con y sin cotización), costo por línea sin total, línea ajena, crédito sin
  vencimiento, volver a contado limpia el vencimiento. `npm --prefix backend run
  test:unit` → **114/114**.
- Arnés `backend/tests/supply-purchases.mjs` (F2): compra sin factura → cuenta a
  pagar al cerrar (contado saldado), 409 al ajustar una cuenta saldada, cierre a
  crédito con vencimiento en Finanzas, costo por línea sin total, y unidad
  recibida con costo pendiente que el cierre completa (`unidadesCompletadas`).
  `MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh` → **PASS**
  (`PASS: compra … cierre de costos …`, ver el conteo del arnés).
- Test-bomb arreglado de paso: `supply-demand.test.ts` (reserva con vencimiento)
  dependía del reloj real; ahora usa el reloj del fixture.

## Coordinación

- **INV/PLT (UI F2)**: el botón «Completar costo» de la compra usa
  `action:'costs'` con el total de la factura o el detalle por línea;
  `costPyg === null` marca las compras con factura pendiente. Los 409 se
  muestran tal cual (cuenta con pagos / unidades con costo sellado).
- **FIN (libro)**: la compra registrada en dos pasos no infla el «por pagar»
  hasta que exista el monto; recién ahí nace la cuenta (contado saldado o
  crédito con vencimiento).
