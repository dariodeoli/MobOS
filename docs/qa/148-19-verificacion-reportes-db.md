# #148 §19 — Verificación independiente: reportes y comisiones contra la base

- **Issues:** #148 (§19) · #83 · **Rama:** `slot/finanzas`
- **Fecha:** 2026-09-23 · **Resultado:** sonda nueva en el arnés de integración
  que recalcula desde la base los números del reporte de márgenes y del reporte
  de comisiones, y los compara uno a uno.
- **Corre en CI** (job *Integration*) en cada integración: es la red que cubre
  la cadena de costo real completa.

## Qué verifica

`backend/tests/reports-margen-db.mjs` (invocada por `integration-http.sh` al
final, con el seed de costos ya creado):

1. **Reporte por vendedor** (`/api/reports?...&groupBy=seller`) contra SQL:
   - por orden: **venta con costo** = Σ líneas con costo − descuento del
     carrito (piso 0); **costo** = Σ costo congelado × cantidad; **ganancia** =
     `max(0, venta con costo − costo)` pisada **una sola vez por venta**; las
     **líneas sin costo** quedan informadas aparte;
   - por vendedor: pedidos, unidades, bruto, descuento, delivery, total,
     cobrado (solo pagos confirmados), saldo, costo, ganancia, venta sin costo,
     líneas sin costo y **comisión de procesadora** (de la foto `feePercent`).
2. **Totales del período** (incluye la base del margen y los estados de cobro).
3. **Reporte de comisiones** (`type=commissions`): margen por vendedor = la
   misma cuenta por venta, porcentaje (regla por usuario → rol → sin regla) y
   comisión redondeada, más los totales.
4. **Autotest:** una desviación de ganancia o de costo hace fallar la
   comparación (si el auditor no puede fallar, no sirve).

Con eso quedan cubiertos los hallazgos de la ronda de márgenes: costo real por
unidad (unidad + reparaciones + repuestos PhoneCheck + consignación + seguro),
descuento del carrito, **una sola fórmula de margen por venta** y **ventas con
costo pendiente fuera de la ganancia**.

## Evidencia (arnés de integración)

```
Verificación independiente: reportes y comisiones recalculados contra la base (#148 §19)...
PASS: reportes y comisiones contra la base — 72 orden(es), 2 vendedor(es), 56 comparaciones
```

Los números de malla salen de la propia base: si la API se desvía aunque sea en
un guaraní, el arnés frena la integración.

## Cómo correrla

- Dentro del arnés (recomendado, con el seed completo):
  `MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh`
- Directa contra un backend sembrado:
  `PG_BIN=... node backend/tests/reports-margen-db.mjs <BASE_URL> <ADMIN_TOKEN> <DATABASE_URL> <from> <to>`

## Coordinación

- **#83 / #171:** la sonda es la red de la cadena de margen; reportes,
  comisiones y liquidación ya comparten la regla y ahora también su verificación
  independiente.
- **Plataforma:** no requiere infra nueva; el job de integración ya corre el
  arnés en CI.

## Checks

`lint` 0 errores (1 warning preexistente) · `npm test` **655/655** ·
`tsc --noEmit` ✓ · build FE ✓ · build BE con `BUILD_ID` ✓ · `prisma:validate` ✓ ·
`db:check` ✓ · **arnés de integración PASS** (56 comparaciones del auditor +
el resto del arnés) · `test:e2e:smoke` **7/7** · sin marcadores de conflicto.
