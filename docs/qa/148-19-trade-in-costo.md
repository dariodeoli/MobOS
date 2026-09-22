# #148 §19 — Costo real del equipo recibido (trade-in) para margen y seguro

- **Issue:** #148 (§19) · **Coordinación:** valuación por grado (#112), inventario
  (ruta de trade-ins) y margen/seguro de Finanzas
- **Fecha:** 2026-09-22 · **Rama:** `slot/finanzas`
- **Resultado:** hallazgo real corregido + test de integración en el arnés.

## La cadena que tenía que verificarse

1. La **valuación con grado** (`DeviceValuation`: modelo + capacidad + condición,
   con valor base y máximo, #112) sugiere cuánto pagar por el equipo recibido.
2. El equipo se recibe como parte de pago (medio `TRADE_IN`) con un **valor
   pagado** (`TradeInDevice.valuePyg`).
3. Pasa por taller: se le suman **reparaciones** (`repairCostPyg`).
4. Se publica a stock: nace el producto que se venderá después.
5. Al venderlo, la línea congela el **costo real = costo + seguro** (§19/#162),
   que es lo que consume el margen.

## Hallazgo (antes)

Al publicar el trade-in a stock, el producto se creaba **sin costo**
(`/api/trade-ins` → `STOCK`). Consecuencias en la venta posterior:

- `baseUnitCostPyg` quedaba vacío → `costPending: true` → el margen mostraba el
  equipo como costo pendiente (ganancia inflada).
- El seguro (§19) no se calculaba: su base es el costo del producto
  (`insurancePyg = costo × tasa`), que no existía.

Divergencia demo/real: la **demo** sí cargaba el costo
(`precioCosto: valor + reparaciones` en `tradeInPipeline`), por eso el recorrido
de la demo no lo mostraba.

## Fix

`backend/app/api/trade-ins/route.ts` (publicación `STOCK`):

- El producto se crea con `costPyg = valuePyg + repairCostPyg` (lo pagado por la
  valuación + las reparaciones acumuladas), con guarda de rango `INT_MAX`.
- La metadata de auditoría `TRADE_IN_PUBLISHED` ahora registra `costPyg` para la
  trazabilidad.

El valor sugerido por grado sigue siendo **editable** (nunca un tope): el costo
que llega al margen es el valor realmente pagado. El producto publicado queda
`USED` (los grados A/B/C son categoría de valuación, no condición de producto);
la inspección fina por checklist está en la épica #240.

## Verificación (`backend/tests/trade-in-cost.mjs`, en el arnés)

Recorre la cadena completa por API: venta con canje (valor 900.000) → taller
(+150.000) → publicación a stock → venta a un cliente con seguro 10%.

**Antes del fix** (arnés):

```
AssertionError: el costo del equipo (valor + reparaciones) tiene que llegar a la venta
  actual: 0,
  expected: 1050000
```

**Después del fix** (arnés):

```
PASS: trade-in con costo 1050000 y seguro 105000 (costo real 1155000) · 9 chequeos
PASS: aislamiento, niveles de token, PIN/lockout, seller forzado, sucursales, rollback, pagos, rate limit de errores, backup/restauración, consistencia y logout.
```

El test queda registrado en `backend/tests/integration-http.sh` (gate de
integración): si alguien vuelve a publicar sin costo, el arnés lo frena.

## Checks

`lint` 0 errores · `npm test` 539/539 · `test:unit` 71/71 · build FE ✓ · build BE
con `BUILD_ID` ✓ · `prisma:validate` ✓ · arnés de integración **PASS** ·
`test:e2e:smoke` 7/7.

Reproducir:

```bash
MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh
```
