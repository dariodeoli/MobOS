# #148 §19 — Una sola fórmula de margen por venta (reporte y comisiones)

- **Issues:** #148 (§19) · **Coordinación:** comisiones y liquidación (#83),
  reportes unificados (#171) · **Rama:** `slot/finanzas`
- **Fecha:** 2026-09-23 · **Resultado:** hallazgo real corregido; el reporte, el
  Análisis, las comisiones y la liquidación usan la misma cuenta de margen.

## Qué se verificó

Con el costo real ya cubierto (unidad + reparaciones + repuestos PhoneCheck +
consignación + seguro + trade-in) y el descuento del carrito neteado, quedaba
comparar **todas** las superficies del mismo indicador: Reportes (por
vendedor/día/sucursal/cliente y totales), Análisis → Ganancias, Comisiones y su
liquidación por vendedor.

## Hallazgo (antes)

El margen de una venta se calculaba con **dos reglas distintas**:

- Reporte (`analizarOrden`) y Ganancias: **por venta** →
  `margen = max(0, venta con costo − costo)`.
- Comisiones (`aggregateCommissions`) y liquidación: **por línea** →
  `Σ max(0, línea − costo)`.

Con una línea vendida bajo costo (liquidación o descuento fuerte) las reglas
dan distinto. Venta mixta: línea A con costo 200.000 y 100.000 de descuento
(queda en 100.000) + línea B con costo 100.000 vendida a 500.000. El margen de
la venta es `600.000 − 300.000 = 300.000`:

- Reporte: **Ganancia 300.000** (correcto).
- Comisiones y liquidación: pagaban sobre **400.000** (la pérdida de la línea A
  no descontaba). Comisión 10%: 40.000 en vez de 30.000.

Evidencia unit (antes del fix):

```
✖ la comisión usa el mismo margen que el reporte
  actual: 400, expected: 300
```

## Fix

`backend/lib/reporting.ts` — una sola cuenta compartida:

- `costosDeOrden(orden)`: unidades, costo y venta con costo por venta (la venta
  con costo es neta del descuento del carrito; las líneas sin costo quedan
  informadas aparte).
- `margenDeOrden(costos)`: `max(0, venta con costo − costo)`, pisado **una sola
  vez por venta**.

La usan `analizarOrden`/`acumularOrden` (Reportes y Ganancias) y
`aggregateCommissions` (reporte de comisiones, export CSV y liquidación): el
vendedor nunca cobra sobre un margen distinto al que muestra el reporte.

## Verificación

- Unit cableado a `test:unit` (`backend/tests/reporting-margen.test.ts`) y suite
  de reportes (`reporting.test.ts`, **24/24**).
- Arnés HTTP (`backend/tests/reports-costos-comisiones.mjs`, escenario 2c):

```
PASS: stock con costo real (+920000) · comisión 41800 sobre margen real 418000 ·
descuento de carrito 100000 → ganancia 300000 y comisión 30000 ·
línea bajo costo → margen 300000 y comisión 30000 · 27 chequeos
```

La liquidación del día se sigue comparando contra esa comisión (sin duplicar).

## Coordinación

- **#83 (comisiones):** la liquidación congela el margen por venta; coincide con
  el reporte fila a fila.
- **#171 (Resumen/Análisis):** Ganancias y Reportes comparten el criterio
  `venta − costo` de cada venta.
- **POS:** no cambia el flujo de descuentos; la regla es de cálculo.

## Checks

`lint` 0 errores (2 warnings preexistentes) · `npm test` **620/620** ·
`test:unit` **71/71** + el test de margen · `test:reports` **24/24** ·
`tsc --noEmit` ✓ · build FE ✓ · build BE con `BUILD_ID` ✓ · `prisma:validate` ✓ ·
`db:check` ✓ · **arnés de integración PASS** (27 chequeos del escenario de
costos/comisiones) · `test:e2e:smoke` **7/7**.
