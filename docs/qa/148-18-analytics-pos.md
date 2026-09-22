# #148 §18 — Analytics del POS al día (Finanzas)

- **Issue:** #148 (épica POS) · **Sección:** §18 · **Rama:** `slot/finanzas`
- **Fecha:** 2026-09-22 · **Entrega:** cortes netos del tablero del POS.

## Qué faltaba y qué se completó

El tablero del POS (#156) ya cubría ventas del día vs ayer, pedidos, ítems por
pedido, AOV, ventas netas (con bruto y descuentos), top productos, ventas por
vendedor y por sucursal, y cobros por medio y por cuenta. Faltaba lo siguiente:

| Ítem de §18 | Estado |
| --- | --- |
| **Pagos netos por tipo** | ✅ Ahora cada tipo muestra **bruto, reembolsado y neto** (neto = cobrado − reembolsado); los reembolsados no suman cobro y se informan en la fila. |
| **Efectivo** | ✅ Métrica propia del período (cobros CASH − reembolsos CASH) y **Reembolsos** del período como métrica. |
| **Pagos por cuenta y sucursal** | ✅ «Cobros netos por cuenta» (existía, ahora neto) y **«Cobros netos por sucursal»** (nuevo). |
| **Ventas por caja** | ✅ Lista con las sesiones del período (responsable, fecha, pedidos, ventas y efectivo) reutilizando el corte por sesión de la unidad anterior. |
| **Top productos** | ✅ Ya estaba (por línea, con unidades y monto). |
| **Ventas por vendedor** | ✅ Ya estaba. |
| **Gift cards** | ⚠️ El producto **no tiene tarjetas de regalo**; el equivalente es el **saldo a favor** (`STORE_CREDIT`), que ya se ve en «cobros netos por tipo» con su etiqueta. Agregar gift cards reales es una decisión de producto (modelo, emisión, canje) fuera de esta unidad. |

Además: los tipos de cobro se muestran con **etiquetas humanas** (Efectivo,
Transferencia, Tarjeta / POS, Pix, USDT-Cripto, Saldo a favor…) en vez de los
códigos crudos, y en la **demo** los pagos ahora llevan su medio y su cuenta
reales (antes todos se contaban como efectivo), así el tablero demo muestra el
sistema completo.

## Evidencia

`scripts/qa-148-analytics-pos.mjs` (sesión real y demo) con capturas
`docs/qa/148-18-analytics-pos/real-analytics.jpg` y `demo-analytics.jpg`:

- **Real (7 días)**: Efectivo 19.790.000 · Transferencia 12.180.000 ·
  Tarjeta / POS 10.750.000 · Pix 700.000 (con conteo de pagos por tipo).
- **Demo (hoy)**: Efectivo, Transferencia… y la lista «Ventas por caja» con la
  sesión abierta y su efectivo.

## Checks

`lint` 0 errores · `npm test` 506/506 (incluye el caso nuevo de netos/efectivo/
sucursal en `posAnalytics.test.js`) · build FE ✓ · build BE con `BUILD_ID` ✓ ·
`test:unit` 71/71 · arnés de integración HTTP completo **PASS** · e2e del
analytics del POS ✓ (los otros dos fallos de la corrida completa fueron flakes
de carga en tests ajenos al analytics; el test corre en verde aislado) ·
`test:e2e:smoke` 7/7.

Reproducir:

```bash
QA_API_URL=http://localhost:3115 QA_BASE_URL=http://localhost:5215 \
  node scripts/qa-148-analytics-pos.mjs
```
