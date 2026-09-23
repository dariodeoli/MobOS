# #148 §19 — Reportes con costo real por unidad y comisiones al día

- **Issues:** #148 (§19) · **Coordinación:** Inventario (unidades y costos),
  comisiones (#83) · **Rama:** `slot/finanzas`
- **Fecha:** 2026-09-22 · **Resultado:** hallazgo real corregido + un borde de
  doble conteo + comisiones verificadas sobre el margen real.

## Qué se revisó

1. **Reportes con costo real por unidad**: el valor del stock y los márgenes.
2. **Comisiones al día**: la regla (margen × porcentaje), el reporte y la
   liquidación, con los costos reales ya publicados (unidad, consignación,
   repuestos de inspección, seguro).

## Hallazgos

### 1) El valor del stock usaba el costo viejo del producto (corregido)

`/api/reports` valuaba el stock como `stock × Product.costPyg`: ignoraba el
**costo real de cada unidad** (ediciones de costo, reparaciones y **repuestos de
la inspección PhoneCheck**). El reporte subestimaba el inventario.

**Fix:** cada unidad `AVAILABLE`/`RESERVED` se valúa con **su costo** (cae al del
producto si la unidad no tiene costo propio) **+ repuestos de la inspección**; el
stock no serializado sigue con `stock × costo del producto`. `stockWithoutCost`
ahora cuenta productos cuyo costo efectivo es desconocido (ni producto ni
unidades).

### 2) Borde de doble conteo en consignación (corregido)

Al probar el caso consignado con costo de producto, la base sumaba **costo del
producto + consignación** (el equipo se contaba dos veces). En consignación el
equipo no es de la tienda: el costo de venta es **lo que se le paga al
consignador + repuestos**. Precedencia final del costo por unidad:
**consignación → costo de la unidad → costo del producto**, más repuestos.

### 3) Comisiones: sin gap de código (verificado)

La comisión se calcula como **margen real × porcentaje** (costos congelados de la
venta, ya con consignación/repuestos/seguro) y la **liquidación** usa la misma
función que el reporte. No hacía falta tocar el cálculo: se agregó evidencia.

## Verificación (`backend/tests/reports-costos-comisiones.mjs`, en el arnés)

1. Valor del stock: se mide el reporte antes y después de crear una unidad de
   800.000 con **120.000** de repuestos de inspección → el delta debe ser
   920.000. **Antes:** `actual: 800000 / expected: 920000`. **Después:**
   `PASS: stock con costo real (+920000)`.
2. Comisiones: regla del 10% para el vendedor, venta consignada con seguro →
   `PASS: comisión 41800 sobre margen real 418000` (margen = 2.200.000 −
   1.620.000 de costo real − 162.000 de seguro).
3. Liquidación: coincide con la comisión del reporte (o informa que ya existía
   una del período, sin duplicar).

Los cuatro escenarios de costos del arnés siguen verdes (unidad por IMEI,
repuestos de inspección, consignación y trade-in) y el arnés completo pasa.

## Coordinación

- **Inventario:** la unidad sigue siendo la fuente del costo real; los reportes
  ahora la leen por unidad.
- **#83 (comisiones):** el porcentaje se aplica al margen real; la liquidación
  coincide con el reporte. Con los costos reales, una venta consignada ya no
  infla la comisión del vendedor.
- **#240 (PhoneCheck):** los repuestos cargados en la inspección impactan en el
  stock y en el margen de la misma forma.

## Checks

`lint` 0 errores (2 warnings preexistentes) · `npm test` **618/618** ·
`test:unit` **71/71** · build FE ✓ · build BE con `BUILD_ID` ✓ · `prisma:validate`
✓ · **arnés PASS** (con los cinco escenarios de costos) · `test:e2e:smoke` **7/7**.
