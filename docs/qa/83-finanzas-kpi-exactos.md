# #83 · Los KPI de Finanzas se calculan sobre todo el historial

- **Issues:** #83 (Finanzas) · #148 (§17/§18 de control) · **Rama:**
  `slot/finanzas`
- **Fecha:** 2026-09-24 · **Resultado:** hallazgo real corregido; «Por cobrar»,
  «Por pagar» y «Margen real» de la tarjeta de Caja ya no dependen del tope de
  las listas.

## Hallazgo (antes)

`GET /api/finance` (los KPI de la fila superior de **Caja**) sumaba los totales
de las **filas devueltas**:

- `receivables` y `margin` salían de la consulta de órdenes con `take: 5000`;
- `payables`, de la de compras con `take: 5000`.

Con más de 5.000 órdenes o compras, los tres números quedaban **cortos en
silencio** (y el «Margen real» era, en realidad, el de las últimas 5.000
órdenes). Es la misma clase de bug que el control de créditos (#83, ronda
anterior): un tope de lista no puede cambiar un total de control.

## Fix

- `backend/app/api/finance/route.ts`: los tres KPI se calculan con
  **agregaciones SQL sobre todo el historial** (filtradas por sucursal cuando
  corresponde, con `Prisma.sql` parametrizado):
  - **Por cobrar**: Σ `GREATEST(0, total − cobrado confirmado)` de órdenes no
    canceladas (pendientes), con su cantidad de órdenes.
  - **Por pagar**: Σ `GREATEST(0, costo final de la compra − pagos)` de compras
    (prorrateo `finalTotalCostPyg` igual que `purchasePayable`), con su cantidad.
  - **Margen real**: ingresos por línea − descuentos de carrito − costo
    congelado (con las líneas sin costo contadas aparte), el mismo criterio que
    `realMargin`.
- Las listas (`receivables.rows`, `payables.rows`) siguen acotadas a 5.000 como
  ventana de pantalla (los tests de delivery/finance-consolidated las usan) y la
  respuesta ahora informa `orders`/`purchases` con el conteo completo.

## Verificación (`backend/tests/finance-totales.mjs`, en el arnés y CI)

Mide la API, siembra **5.100 ventas** con costo (100.000 / costo 60.000) y
**5.100 compras** (50.000), y compara el **delta exacto** de cada KPI (no
depende de los datos que ya tenga la base):

```
KPI de finanzas: por cobrar, por pagar y margen sobre todo el historial (#83)...
PASS: KPI de finanzas sin totales truncados — +5100 ventas (por cobrar +510000000,
      margen +204000000) y +5100 compras (por pagar +255000000); listas cortadas
      en 5.000 · 13 chequeos
```

Antes del fix los deltas habrían sido los de las 5.000 filas (510.000.000 → no;
20,4% de la siembra quedaría afuera en cada KPI). Además se verifica que las
listas sigan siendo parciales (`rows.length ≤ 5000` y menor que el total
informado) y el test limpia lo que siembra.

## Coordinación

- **Caja** (único consumidor de los KPI): los tres números ahora son completos.
- **Delivery / finance-consolidated** (arnés): siguen usando `rows`; el contrato
  de las listas no cambió.
- Nota de limpieza (fuera de alcance): `accounts[].balance` se calcula pero
  ninguna pantalla lo consume; y las consultas de filas siguen trayendo 5.000
  registros por request (candidato de #247).

## Checks

`lint` 0 errores (1 warning preexistente) · `npm test` **673/673** ·
`tsc --noEmit` ✓ · build FE ✓ · build BE con `BUILD_ID` ✓ · `prisma:validate` ✓ ·
**arnés de integración PASS** (13 chequeos nuevos) · e2e finanzas **4/4** ·
sin marcadores de conflicto.
