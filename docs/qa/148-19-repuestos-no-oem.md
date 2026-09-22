# #148 §19 — Repuestos no-OEM de la inspección en el costo real y el margen

- **Issues:** #148 (§19) · **Coordinación:** PhoneCheck/inspección (#240/#242) e
  Inventario (costo por unidad) · **Rama:** `slot/finanzas`
- **Fecha:** 2026-09-22 · **Resultado:** hallazgo real corregido + test en el arnés.

## La cadena que tenía que verificarse

1. La inspección PhoneCheck (#240) detecta los hallazgos del equipo: checklist
   por ítem (pantalla, batería, cámaras…), grado A/B/C, batería, bloqueos y
   **repuestos no-OEM / reparaciones**.
2. Cuando esos repuestos se cambian o reparan, la tienda **gasta plata**: ese
   costo tiene que entrar al **costo real** del equipo.
3. Al venderlo, la línea congela **costo real = costo + seguro** (§19/#162) y el
   margen lo consume.

## Hallazgo (antes)

La inspección guardaba los repuestos no-OEM **solo como texto**
(`repuestosNoOem`), sin monto. El costo que se cargaba en la unidad (Inventario)
llegaba al margen, pero **no había forma de registrar el costo de los repuestos
detectados en la inspección**: quedaba afuera del margen y del seguro (margen
inflado) sin que nadie lo notara.

## Fix

- **Inspección** (`backend/app/api/inventory-units/route.ts`, acción
  `inspection`): campo nuevo `costoRepuestosPyg` (entero 0..2.147.483.647),
  validado y normalizado en el servidor.
- **UI** (`src/components/inventory/UnidadDetalle.jsx`): en el bloque
  «PhoneCheck · Inspección» se carga el **costo de repuestos y arreglos** con el
  campo de dinero compartido; su ayuda explica que suma al costo real del equipo
  para la ganancia y el seguro.
- **Margen** (`backend/app/api/orders/route.ts`): para ventas con IMEI/serial, la
  base del costo es `costo de la unidad + costo de repuestos de la inspección`
  (promedio redondeado si difieren; la línea guarda un costo por unidad).
- **Frontend** (`src/lib/phonecheck.js`): `costoRepuestosInspection()` normaliza
  el valor para UI/informes.

Semántica: `InventoryUnit.costPyg` es lo que se pagó por el equipo;
`inspection.costoRepuestosPyg` es lo gastado en repuestos/arreglos de la
inspección. Ambos suman al costo real.

## Verificación (`backend/tests/unit-cost-margin.mjs`, en el arnés)

Escenario nuevo: equipo de 800.000 → inspección con pantalla no-OEM y
**120.000** de repuestos → venta por IMEI a cliente con seguro 10%.

**Antes del fix** (arnés):

```
AssertionError: el costo de repuestos de la inspección tiene que sumar al costo base
  actual: 800000,
  expected: 920000
```

**Después del fix** (arnés):

```
PASS: inspección no-OEM con repuestos 120000 → costo real 920000 · seguro 92000 · 9 chequeos
PASS: venta por IMEI con costo de unidad 1250000 (base 1000000 + repuestos 250000) · seguro 125000 · 5 chequeos
PASS: trade-in con costo 1050000 y seguro 105000 (costo real 1155000) · 9 chequeos
PASS: aislamiento, niveles de token, PIN/lockout, ... y logout.
```

Además: unit test del normalizador (`src/lib/phonecheck.test.js`) y capturas de
la UI en la demo (`inspeccion-costo.jpg` y `inspeccion-costo-guardada.jpg`).

## Coordinación

- **#240/#242 (PhoneCheck):** el checklist detecta el repuesto y ahora puede
  capturar su costo en el mismo lugar de la inspección.
- **Inventario:** el costo de la unidad sigue siendo la fuente principal; la
  inspección agrega lo suyo sin duplicar (campos separados y documentados).
- **Trade-in:** sigue su camino propio (valor pagado + reparaciones de taller →
  costo del producto publicado, `docs/qa/148-19-trade-in-costo.md`).

## Checks

`lint` 0 errores (2 warnings preexistentes) · `npm test` **618/618** ·
`test:unit` **71/71** · build FE ✓ · build BE con `BUILD_ID` ✓ · `prisma:validate`
✓ · **arnés PASS** · `test:e2e:smoke` **7/7** · producción **v1.0.143**:
`release:smoke` ✓ · montos 5/5 · §17/§18/§19 8/8 · caja 2/2 · analytics 1/1 ·
recorrido #185 16/16 · tokens v2 en finanzas 8/8 · #171 6/6 · #209 6/6.
