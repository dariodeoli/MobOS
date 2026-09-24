# #148 §17 — El día operativo de la auditoría de caja en UTC-3 (y reembolsos bien rotulados)

- **Issues:** #148 (§17 Caja y auditoría de efectivo) · #244 (mismo criterio de
  día paraguayo) · **Rama:** `slot/finanzas`
- **Fecha:** 2026-09-24 · **Resultado:** hallazgo real corregido; la auditoría de
  caja quedó con el mismo día operativo que el resto de Finanzas y el
  reembolsado dejó de mezclarse con pagos rechazados.

## Hallazgo (antes)

`/api/cash/audit` y `/api/cash/audit-operations` delimitaban el día de la
sucursal con el **`-04:00` heredado**, mientras el resto de Finanzas ya opera en
**UTC-3 fijo** (`cash/route.ts`, `reporting.ts` y la conciliación, #244). La
ventana del día arrancaba a las **04:00Z** en vez de las 03:00Z: los cobros de
**00:00–01:00 (hora paraguaya)** caían en la auditoría del **día anterior** y el
día mostraba de menos. Es el último `-04` que quedaba en el backend
(`grep -r "\-04:00" backend` → 0 tras el fix).

Además, el monto «reembolsado» por medio tomaba
`REJECTED ?? REFUNDED`: si un medio tenía un pago rechazado, ese monto se
mostraba como reembolsado y el reembolso real quedaba oculto.

## Fix

- `backend/app/api/cash/audit/route.ts`: `OFFSET = '-03:00'` (comentario con el
  criterio) y `refundedAmountPyg` = solo pagos `REFUNDED` (un rechazado nunca
  entró a la caja).
- `backend/app/api/cash/audit-operations/route.ts`: `OFFSET = '-03:00'` (mismo
  día operativo para la lista de operaciones y las marcas de auditoría).

## Verificación (`backend/tests/cash-audit-dia.mjs`, en el arnés)

Test determinístico (no depende de la hora de la corrida): crea un cobro en
efectivo, lo fija a las **03:30Z = 00:30 en Paraguay** del día, y compara la
auditoría contra un cálculo independiente en SQL con la ventana UTC-3:

- `audit?date=hoy` → efectivo y cantidad **exactos** al SQL de la ventana
  `[hoy 03:00Z, mañana 03:00Z)`; con el `-04` la ventana empezaba a las 04:00Z y
  el cobro quedaba afuera.
- `audit?date=ayer` → no cambia (el cobro no se corre al día anterior).
- `audit-operations?from=hoy&to=hoy` incluye la operación; `ayer` no.
- Un **reembolso parcial en efectivo** (por la ruta real de devoluciones) se
  informa como reembolsado del día: `refundedAmountPyg` = SQL REFUNDED.

Salida del arnés:

```
Día operativo de la auditoría de caja en UTC-3 (#148 §17)...
PASS: día operativo de la auditoría en UTC-3 — cobro 00:30 PY en «2026-09-24»
      (15116705 · 36 cobros), reembolso 100000 informado · 8 chequeos
```

## Coordinación

- **#244:** mismo criterio de día paraguayo (UTC-3) que la conciliación; la
  auditoría de caja era la última superficie con el `-04`.
- **Caja (sesiones):** `cash/route.ts` ya usaba UTC-3; el corte por sesión no
  cambia.
- **Frontend:** sin cambios; la pantalla ya muestra el día y el reembolsado por
  medio (`AuditoriaMedios`).

## Checks

`lint` 0 errores (1 warning preexistente) · `npm test` **668/668** (tras el
rebase con el fix de `main` de los avisos demo) · `tsc --noEmit` ✓ · build FE ✓ ·
build BE con `BUILD_ID` ✓ · `prisma:validate` ✓ · **arnés de integración PASS**
(8 chequeos nuevos) · sin marcadores de conflicto.
