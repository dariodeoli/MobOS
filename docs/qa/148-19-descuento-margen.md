# #148 §19 — Descuento del carrito en la ganancia y la comisión

- **Issues:** #148 (§19) · **Coordinación:** comisiones (#83), POS (descuento del
  carrito) · **Rama:** `slot/finanzas`
- **Fecha:** 2026-09-23 · **Resultado:** hallazgo real corregido + test cableado
  a `test:unit` y escenario en el arnés de integración.

## La cadena que tenía que verificarse

1. El POS admite descuento **por línea** (ya entra en el total de la línea) y
   descuento **del carrito** (`Order.discountPyg`, a nivel orden).
2. La ganancia del período tiene que ser la **venta neta − costo** (`Total −
   Costo`), el mismo criterio de Resumen → Ganancias y de la tarjeta «Margen
   real» de Caja.
3. La comisión del vendedor se liquida sobre ese margen real y la liquidación
   congela el mismo número.

## Hallazgo (antes)

El descuento del carrito bajaba `totalPyg` pero **no el margen**:
`aggregateReport` sumaba los totales de línea sin descontar `Order.discountPyg`.
En Reportes → Por vendedor/día/sucursal/cliente la fila mostraba, por ejemplo,
`Total 900.000 · Costo 600.000 · Ganancia 400.000` (no cierra), y
`type=commissions` calculaba la comisión sobre 400.000 en vez de 300.000. La
liquidación y la tarjeta «Margen real» de Caja arrastraban el mismo margen
inflado.

Impacto: **comisiones pagadas de más** y ganancia inflada en el tablero (dinero
real). Apareció al verificar los márgenes con costo real: el resto de la cadena
(unidad, reparaciones, repuestos PhoneCheck, consignación y seguro) ya sumaba
bien, pero el descuento del carrito no se reconocía.

## Fix

- `backend/lib/reporting.ts`
  - `analizarOrden`: la venta con costo reconocida para el margen es
    `Σ líneas con costo − Order.discountPyg` (nunca negativa).
  - `aggregateCommissions`: el margen de la orden descuenta el descuento del
    carrito con la misma regla (el reporte de comisiones, la exportación y la
    liquidación comparten la función).
- `backend/app/api/commission-settlements/route.ts`: la liquidación lee y pasa
  `discountPyg` (mismo número que el reporte).
- `backend/lib/finance.ts` + `backend/app/api/finance/route.ts`: `realMargin`
  acepta el descuento del carrito (tarjeta «Margen real» de Caja).

Reglas: la ganancia **no se inventa** (si el descuento supera al margen, queda
0) y **por producto** el descuento del carrito sigue perteneciendo a la orden —
no se reparte entre líneas, como ya documentaba el reporte.

## Verificación

**Unit (cableado a `test:unit` con `backend/tests/reporting-margen.test.ts`).**
Antes del fix:

```
✖ el descuento del carrito baja la ganancia y la comisión del vendedor
  actual: 40000, expected: 30000
```

Después:

```
reporting-margen.test.ts: descuento del carrito en ganancia, comisión y margen real: ok
test:reports: 23/23
```

**Arnés HTTP** (`backend/tests/reports-costos-comisiones.mjs`, escenario 2b):
venta de 1.000.000 con 100.000 de descuento del carrito y costo 600.000.

```
PASS: stock con costo real (+920000) · comisión 41800 sobre margen real 418000 ·
descuento de carrito 100000 → ganancia 300000 y comisión 30000 · 19 chequeos
```

La liquidación del día se compara contra esa misma comisión (sin duplicar).

## Coordinación

- **#83 (comisiones):** la comisión y su liquidación usan el margen neto del
  descuento; el porcentaje no cambia.
- **POS:** el dato sigue siendo `Order.discountPyg`; no se toca el flujo de
  autorización de descuentos.
- **#171 (Resumen/Análisis):** los totales del período y por día ya coinciden con
  `Total − Costo` también cuando hay descuentos del carrito.
- **Plataforma (nota):** `npm run test:reports` no está cableado a CI (sus tests
  puros no corrían en ningún job). Este fix deja la regresión en `test:unit` y en
  el arnés de integración; queda como mejora pendiente conectar el runner de
  reportes.

## Checks

`lint` 0 errores (2 warnings preexistentes) · `npm test` **620/620** ·
`test:unit` **71/71** + el test nuevo · `test:reports` **23/23** ·
`tsc --noEmit` ✓ · build FE ✓ · build BE con `BUILD_ID` ✓ · `prisma:validate` ✓ ·
`db:check` ✓ · **arnés de integración PASS** (19 chequeos del escenario de
costos/comisiones) · `test:e2e:smoke` **7/7** · e2e de finanzas/reportes **8/8**.
