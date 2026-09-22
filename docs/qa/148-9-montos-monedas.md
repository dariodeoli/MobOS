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

## 4. Pendiente (reportado a la épica)

- **Migrar las columnas de dinero a BigInt** para habilitar 10B/99B: `Order`,
  `OrderItem`, `Payment`, `Product`, `CashSession`/`CashMovement`, comisiones,
  listas de precios, compras y los límites de empresa; validaciones por
  contexto (general/ventas) y serialización de BigInt en las rutas y sumas SQL.
  Es cross-dominio y necesita una unidad propia con `db:check`.
- **POS**: los campos marcan el exceso, pero el guardado de la venta no lo
  bloquea (su validación devuelve en silencio); le toca al slot POS.
- **Inventario**: el mensaje de rechazo de precio/stock es vago; le toca a INV.

## 5. Checks

`lint` 0 errores · `npm test` 507/507 · build FE ✓ · build BE con `BUILD_ID` ✓ ·
`test:unit` 71/71 · arnés de integración HTTP completo **PASS** · e2e de
finanzas/demo 13/13 · `test:e2e:smoke` 7/7.

Reproducir:

```bash
QA_API_URL=http://localhost:3115 QA_BASE_URL=http://localhost:5215 \
  node scripts/qa-148-montos-monedas.mjs
```
