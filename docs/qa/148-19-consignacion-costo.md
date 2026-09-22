# #148 §19 — Consignación en el costo real y el margen

- **Issues:** #148 (§19) · **Coordinación:** consignación (#33) e Inventario
  (unidad con consignador) · **Rama:** `slot/finanzas`
- **Fecha:** 2026-09-22 · **Resultado:** hallazgo real corregido + test en el arnés.

## La cadena que tenía que verificarse

1. Un equipo **en consignación** no es de la tienda: queda en Inventario con
   consignador (`consignorName`/`consignorPhone`) y un **monto a pagarle al
   venderse** (`consignorPyg`, #33).
2. Al venderlo, la tienda le paga ese monto al consignador: es **costo real de
   la venta**.
3. La línea congela **costo real = costo + seguro** (§19/#162) y el margen lo
   consume.

## Hallazgo (antes)

El monto de consignación se cargaba, se guardaba y se mostraba en la ficha
(«a pagar Gs X»), pero **ningún cálculo de Finanzas lo usaba**: al vender un
equipo consignado, el costo real era 0 (o el costo viejo del producto) y el
margen mostraba casi todo el precio como ganancia. El error es grande porque
justamente en consignación el equipo no se compró: no hay otro costo que lo
compense.

## Fix

`backend/app/api/orders/route.ts` — costo real por unidad en ventas con
IMEI/serial:

- `costo de la unidad` (lo pagado, si existe) **+**
- **monto de consignación** (lo que se le paga al consignador) **+**
- **repuestos/arreglos de la inspección PhoneCheck** (`costoRepuestosPyg`).

Precedencia si la unidad no tiene costo propio: consignación → costo del
producto; los repuestos se suman siempre que haya una base. Si no hay ningún
dato, la línea queda con **costo pendiente** (no se inventa un costo).

En la ficha de la unidad, el monto de consignación ahora aclara que **se paga al
vender el equipo y suma al costo real (ganancia y seguro)**.

## Verificación (`backend/tests/unit-cost-margin.mjs`, en el arnés)

Escenario nuevo: equipo consignado (sin costo propio) con **1.500.000** a pagar
al consignador → venta por IMEI a cliente con seguro 10%.

**Antes del fix** (arnés):

```
AssertionError: lo que se paga al consignador es el costo real de la venta
  actual: 0,
  expected: 1500000
```

**Después del fix** (arnés):

```
PASS: consignación 1500000 → costo real 1500000 · seguro 150000 · 13 chequeos
PASS: inspección no-OEM con repuestos 120000 → costo real 920000 · seguro 92000 · 9 chequeos
PASS: venta por IMEI con costo de unidad 1250000 (base 1000000 + repuestos 250000) · seguro 125000 · 5 chequeos
PASS: trade-in con costo 1050000 y seguro 105000 (costo real 1155000) · 9 chequeos
PASS: aislamiento, niveles de token, PIN/lockout, ... y logout.
```

## Coordinación

- **#33 (consignación):** el monto acordado ahora impacta la ganancia; la ficha
  lo explica.
- **Inventario:** sigue siendo la fuente de la unidad (costo, consignación,
  inspección); Finanzas suma los tres componentes.
- **Trade-in:** camino propio ya cubierto (valor + reparaciones de taller).

## Checks

`lint` 0 errores (2 warnings preexistentes) · `npm test` **618/618** ·
`test:unit` **71/71** · build FE ✓ · build BE con `BUILD_ID` ✓ · `prisma:validate`
✓ · **arnés PASS** · `test:e2e:smoke` **7/7**.
