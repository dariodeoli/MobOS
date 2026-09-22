# #148 §19 — Costo real/margen con reparaciones y repuestos de la unidad (no-OEM)

- **Issues:** #148 (§19) · **Coordinación:** Inventario (costo por unidad) y
  checklist/inspección (#240/#241) · **Rama:** `slot/finanzas`
- **Fecha:** 2026-09-22 · **Resultado:** hallazgo real corregido + test en el arnés.

## La cadena que tenía que verificarse

1. El equipo entra con su IMEI/serial: en Inventario vive como **unidad** con su
   propio **costo** (`InventoryUnit.costPyg`), donde se cargan reparaciones y
   repuestos (hoy a mano en la ficha de la unidad; el rediseño #240/#241 los
   tomará del checklist, incluida la detección **no-OEM**).
2. Al venderlo se identifica el IMEI de cada equipo.
3. La línea congela el **costo real = costo + seguro** (§19/#162) y el margen lo
   consume (`unitCostPyg × cantidad`).

## Hallazgo (antes)

La venta usaba **siempre el costo del producto** (`Product.costPyg`) como base:
el costo real de la **unidad** —con sus reparaciones y repuestos ya cargados en
Inventario— nunca llegaba al margen ni al seguro. Un equipo comprado a
1.000.000 con 250.000 de repuestos (pantalla no original + batería) se vendía
con base 1.000.000: **margen inflado** y seguro calculado sobre un costo viejo.

## Fix

`backend/app/api/orders/route.ts`: cuando la venta lleva el IMEI/serial de
**todas** las unidades de la línea, la base del costo es el **costo real de esas
unidades** (Inventario). La línea guarda un costo por unidad: si los costos
difieren, se congela el promedio redondeado. Si no hay seriales o las unidades
no tienen costo, se mantiene el costo del producto (comportamiento anterior).

Con eso, cualquier reparación/repuesto que se cargue en la unidad (hoy a mano,
mañana desde el checklist no-OEM de #240/#241) impacta automáticamente en el
**costo real, el seguro y el margen**.

## Verificación (`backend/tests/unit-cost-margin.mjs`, en el arnés)

Alta de un equipo con IMEI (producto 1.000.000) → la unidad recibe 250.000 de
reparaciones/repuestos → venta por IMEI a un cliente con seguro 10%.

**Antes del fix** (arnés):

```
AssertionError: el costo base tiene que ser el de la unidad con reparaciones
  actual: 1000000,
  expected: 1250000
```

**Después del fix** (arnés):

```
PASS: venta por IMEI con costo de unidad 1250000 (base 1000000 + repuestos 250000) · seguro 125000 · 5 chequeos
PASS: trade-in con costo 1050000 y seguro 105000 (costo real 1155000) · 9 chequeos
PASS: aislamiento, niveles de token, PIN/lockout, seller forzado, sucursales, rollback, pagos, rate limit de errores, backup/restauración, consistencia y logout.
```

## Coordinación

- **Inventario**: el campo que ya se edita en la ficha de la unidad es la fuente
  del costo real; el puente lo lleva al margen sin campos nuevos.
- **#240/#241 (checklist/inspección y no-OEM)**: cuando el checklist detecte el
  repuesto, alcanza con cargar su costo en la unidad (o en el costo del equipo
  del trade-in, que ya viaja al producto: `docs/qa/148-19-trade-in-costo.md`);
  el margen y el seguro lo toman solos.
- **Taller (ServiceOrder)**: sus costos (repuestos/mano de obra) son hoy el
  margen del servicio; la vinculación automática orden ↔ unidad queda para la
  épica del rediseño (F3), con este puente ya listo del lado del margen.

## Checks

`lint` 0 errores (2 warnings preexistentes, uno de ellos en
`src/components/inventory/UnidadDetalle.jsx`) · `npm test` 539/539 ·
`test:unit` 71/71 · build FE ✓ · build BE con `BUILD_ID` ✓ · `prisma:validate` ✓ ·
arnés de integración **PASS** · `test:e2e:smoke` 7/7.
