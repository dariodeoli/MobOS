# #148 §9 — Montos y monedas (verificación y correcciones)

- **Issue:** #148 (épica POS) · **Sección:** §9 · **Rama:** `slot/finanzas`
- **Fecha:** 2026-09-22 · **Entrega:** límites consistentes y bloqueo con
  mensaje claro en el tope real de almacenamiento.

## 1. Qué pedía §9 y qué encontré

- **Pedido**: general hasta **10.000.000.000**, ventas hasta
  **99.000.000.000**, sin truncar, consistente en POS/Gastos/Pagos/Cuentas/
  Reportes/Comisiones.
- **Realidad verificada**:
  - Los campos **no truncan** lo que se escribe ✓ y `MoneyInput` marcaba
    `aria-invalid` al pasar el límite del contexto ✓, pero
    `LIMITE_MONTO_VENTAS` (99B) **no lo usaba ningún campo** y ningún formulario
    bloqueaba con esos límites.
  - Los importes viven en columnas enteras de **32 bits**: el tope real de
    almacenamiento es **2.147.483.647**. Un monto entre 2,1 mil millones y
    10/99 mil millones se escribía y el backend lo rechazaba con un mensaje
    vago (“Monto convertido fuera de rango”).
  - Conclusión: los límites de producto de §9 (10B/99B) **no se pueden cumplir
    sin migrar las columnas de dinero** (ver §4).

## 2. Verificación con datos reales (`scripts/qa-148-montos-monedas.mjs`)

| Caso | Resultado |
| --- | --- |
| Movimiento de 3.000.000.000 | **400** con mensaje explícito: «El monto convertido supera el máximo que el sistema puede guardar (Gs 2.147.483.647).» |
| Cheque de 2.000.000.000 | **201** y se puede anular (200) |
| Producto/venta por 3.000.000.000 | **400** (mensaje del catálogo: «Precio y stock deben ser enteros válidos.» — a mejorar por INV) |
| Gastos (UI) | el campo conserva `3.000.000.000`, queda marcado y el guardado explica el tope (captura `gastos-tope.jpg`) |
| Caja (UI) | el total contado avisa el mismo tope (captura `caja-tope.jpg`) |

## 3. Correcciones entregadas

- **Convivencia con lo ya integrado**: main ya traía el «largo máximo del
  campo» (`largoMaximoMonto`/`maxLength`: el monto más grande documentado
  entra completo y no se puede escribir de más). Esta entrega agrega el
  **acotado al tope real** y el **bloqueo con mensaje**, sin truncar lo escrito.
- **Fuente única** en `src/utils/moneda.js`: `LIMITE_MONTO_ALMACENABLE`
  (2.147.483.647), `limiteMonto(max)` (acota el límite del contexto al tope
  real) y `errorMonto(valor, max)` (mensaje de bloqueo).
- **`MoneyInput`** acota su límite al tope almacenable y lo marca igual: aplica
  a **POS, Gastos, Pagos, Cuentas** y cualquier campo de dinero de la app.
- **Bloqueo con mensaje claro** en mis pantallas: Gastos (incluye el convertido
  de moneda extranjera), Caja (apertura, cierre propio y turno ajeno) y
  Conciliación (monto recibido).
- **Backend**: mensajes explícitos con el tope en `/api/finance` (movimientos),
  `/api/cash` (apertura/cierre) y pagos.
- **Tests**: `moneda.test.js` (tope, acotado y mensaje) y la regla de objetos
  actualizada para exigir el acotado del campo.

## 4. Migración entregada (bigint, #278)

La unidad cross-dominio quedó implementada el 27/09 (slot FIN con apoyo INV):

- **Migración `20261228000000_money_bigint`**: 81 columnas de dinero pasan de
  `integer` (32 bits) a `bigint`, aditiva e idempotente (solo altera lo que
  todavía está en `integer`). Lista completa en el SQL.
- **Schema Prisma**: los mismos 81 campos quedan `BigInt`; Prisma devuelve
  `bigint` en lecturas y acepta `number` en escrituras. El borde se normaliza
  con `numero()`/`numeroOpcional()` (`backend/lib/montos.ts`) y las respuestas
  JSON serializan los importes como número (`BigInt.prototype.toJSON` en
  `backend/lib/prisma.ts`, seguro hasta 2^53).
- **Topes reales**: general **10.000.000.000**; ventas **99.000.000.000**,
  consistentes en POS, Gastos, Pagos, Cuentas, Reportes y Comisiones. La UI ya
  no acota al viejo techo de 32 bits (`LIMITE_MONTO_ALMACENABLE` = tope de
  ventas); los formularios marcan y bloquean con el mensaje del tope.
- **Backend**: validaciones de dinero en caja, finanzas, pagos, compras,
  cotizaciones, créditos, autorizaciones, garantías, servicios y valuaciones
  pasan a esos topes (stock, cantidades y días siguen en 32 bits).
- **Evidencia**: `docs/QA-278-CIERRE-FIN.md` (sonda
  `scripts/qa-148-montos-monedas.mjs` + e2e `qa-148-9-pos-montos`), y
  `npm run db:check` contra la base migrada.

## 5. Pendientes históricos de esta verificación

- **POS**: el guardado bloquea el exceso con mensaje (entregado por el slot POS
  en v1.0.170; la migración renueva el tope de venta a 99B).
- **Inventario**: el mensaje de rechazo de precio/stock (hoy «Precio y stock
  deben ser enteros válidos») es cosmético y del catálogo.

## 6. Checks

`lint` 0 errores · `npm test` 507/507 · build FE ✓ · build BE con `BUILD_ID` ✓ ·
`test:unit` 71/71 · arnés de integración HTTP completo **PASS** · e2e de
finanzas/demo 13/13 · `test:e2e:smoke` 7/7.

Reproducir:

```bash
QA_API_URL=http://localhost:3115 QA_BASE_URL=http://localhost:5215 \
  node scripts/qa-148-montos-monedas.mjs
```
