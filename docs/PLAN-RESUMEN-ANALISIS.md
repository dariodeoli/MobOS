# Plan de unificación Resumen ↔ Análisis (#145, fase 1)

Resumen (vista ejecutiva) y Análisis (vista extendida) muestran indicadores
solapados calculados por caminos distintos. Este documento fija la
arquitectura objetivo, el inventario de solapamientos y las fases de
migración. **La fase 1 no migra pantallas**: deja el plan, elimina la
duplicación de fórmulas de bajo riesgo, agrega la red de tests y completa
metadatos. Los permisos y las rutas no cambian.

## 1. Estado actual (inventario)

| Vista / pestaña | Fuente de datos | Métricas propias | Endpoint |
| --- | --- | --- | --- |
| Resumen | Caché local (`listVentas`, `listGastos`, `productosById`) vía `armarResumenDia` | Facturado, cobrado/pendiente, ticket, comisión, delivery, gastos, ranking, medios, serie, top productos, stock bajo | API puntual: `/api/credits`, `/api/payments?overdue`, reservas y garantías |
| Análisis → Reportes | API | Totales, margen real, descuentos, comisiones de cobro, inventario/rotación, curvas ABC, agrupaciones | `/api/reports` (`groupBy`, `type=commissions`) |
| Análisis → Ganancias | Caché local (`calcularGanancia`) | Ingresos − costo − gastos − ads por día/semana/mes/año y calendario | — |
| Análisis → Ganadores | Caché local (`productosGanadores`) | Productos por cantidad y monto (1 por venta) | — |
| Análisis → Asistente | Caché local (`asistente.js`) | Las mismas métricas en formato pregunta/respuesta | — |

Límites conocidos del modo API: `hydrateApi` pide `/api/orders` sin `limit`
(tope 100 órdenes para la caché), `/api/finance` devuelve 150 movimientos y
`ads` queda vacío. Reportes, en cambio, trabaja contra `/api/reports`
(servidor, tope 5000 órdenes con flag `truncated`). Esa asimetría es la causa
principal de que las mismas cifras no coincidan entre vistas.

## 2. Solapamientos y semánticas

| Indicador | Hoy se calcula en | Fuente canónica propuesta |
| --- | --- | --- |
| Facturado / ingresos | `armarResumenDia.total`, `calcularGanancia.ingresos`, `reports.totals.totalPyg`/`grossPyg` | `reports.totals.totalPyg` (orden) |
| Cobrado / pendiente | `cobradoDeVenta` + `armarResumenDia.cobrado`, `reports.collectedPyg`/`pendingPyg`, `/api/credits` | `reports.totals.collectedPyg`/`pendingPyg` |
| Período anterior | `armarResumenDia.totalAnt` (caché local) | `reports.previous.totals` |
| Ticket promedio | `armarResumenDia.ticket`, `asistente.ticket` | `ticketPromedio()` (helper compartido; luego `reports.totals`) |
| Variación % | `Resumen.variacion`, lambda en `Reportes` | `variacion()` (helper compartido) |
| Margen / ganancia | `calcularGanancia` (con gastos y ads), `realMargin` (#162, seguro), `reports.profitPyg`/`netProfitPyg` | `reports.totals.netProfitPyg`; gastos y ads como capa aparte |
| Medios de pago | `armarResumenDia.medios` (por venta), `reports groupBy=payments` (por pago/cuenta), `/api/cash/audit`, conciliación (#144) | `reports groupBy=payments` para montos por cuenta/medio |
| Ranking vendedores | `armarResumenDia.ranking`, `reports groupBy=seller`, `aggregateCommissions` | `reports groupBy=seller` / `type=commissions` |
| Top productos | `productosMasVendidos` (cantidad por línea), `productosGanadores` (1 por venta), `reports groupBy=product` (por línea) | `reports groupBy=product` (corrige el conteo de Ganadores en F3) |
| Stock bajo | Umbral local ≤ 3, `/api/stock-alerts`, `reports.inventory` | `reports.inventory` + `/api/stock-alerts` |
| Cuotas vencidas | `/api/payments?overdue` (conteo) y `/api/credits.totals` (monto) en la misma pantalla | `/api/credits.totals` |

Semánticas que no hay que mezclar (documentadas para no repetir el error):

- `reports.totals.commissionPyg` es **comisión de cobro** (fee del medio), no
  la comisión del vendedor (`type=commissions`).
- `totalPyg` es el total de la orden; `grossPyg`, el subtotal de líneas.
- `profitPyg` y `netProfitPyg` descuentan costo y fees de cobro, **no** gastos
  ni publicidad: la "ganancia" de Ganancias es otra capa.
- `groupBy=payments` cuenta pagos, no órdenes: no usar `orders` de ese grupo
  como cantidad de ventas.

## 3. Arquitectura objetivo

- **Un backend de métricas**: `/api/reports` (`totals`, `previous.totals`,
  `groups` por `groupBy`, `inventory`, `type=commissions`), con `from`, `to`,
  `tzOffset` y `branchId`. Ya existe y ya cubre casi todo.
- **Resumen = vista ejecutiva**: una llamada principal (`groupBy=day` o
  `payments`) para facturado, cobrado, pendiente, serie y medios; los
  pendientes accionables siguen viniendo de `/api/credits` y
  `/api/payments?overdue`.
- **Análisis = vista extendida**: las agrupaciones profundas
  (`product/category/seller/branch/customers/returns/payments`) más
  comisiones e inventario, sin recálculos propios.
- **Demo/offline**: la caché local se conserva detrás del modo demo/legacy;
  la migración solo aplica al modo API.

## 4. Fases

| Fase | Alcance | Criterio de cierre |
| --- | --- | --- |
| **F1 (esta entrega)** | Plan + helpers `variacion`/`ticketPromedio` + tests de red (`calculos.test.js`, `reconciliation.test.ts`) + metadatos de `/finanzas/cuotas` y `/finanzas/comisiones` + e2e de Análisis | Checks verdes; números locales sin cambios |
| F2 | Resumen en modo API contra `/api/reports` (ejecutivo); comparación en paralelo antes de retirar la caché del modo API | Diferencias 0 en QA con datos reales; demo/offline intactos |
| F3 | Ganancias, Ganadores y Asistente contra `/api/reports` (+ agregado de gastos/ads con filtro de fecha) | Un solo backend; `productosGanadores` deja de contar 1 por venta |
| F4 | Retirar cálculos duplicados y unificar `/api/finance.margin` (hoy lifetime) con reports | Sin consultas duplicadas; tests de equivalencia |
| F5 (opcional) | Un componente de vista con modo ejecutivo/extendido | Misma UX, un solo árbol de componentes |

Cada fase se entrega por separado, con la suite e2e en verde, sin cambios de
permisos ni de URLs.

## 5. Riesgos y mitigaciones

- **Tope de órdenes** (`MAX_REPORT_ORDERS=5000`, flag `truncated`): mostrar el
  aviso ya existente en Reportes cuando la vista ejecutiva lo use.
- **Pérdida de detalle local**: la migración es incremental y la caché local
  queda como fallback; ningún modo pierde datos.
- **Permisos**: Resumen hoy es visible para el dueño; `/api/reports` exige
  `reports:read`. En F2 se conserva la misma matriz de visibilidad (QA por rol
  con el e2e existente de permisos).
- **Semánticas de "venta"**: antes de F3, decidir y testear si el indicador es
  orden, pago o línea (la tabla de la sección 2 es el punto de partida).

## 6. Fuera de alcance de la fase 1

- No se tocan permisos, rutas ni componentes existentes más allá de los
  helpers y metadatos listados.
- `Precios` no pertenece a Resumen/Análisis (vive en Configuración) y no se
  modifica.
- No se unifican `reporteCaja` ni la auditoría de caja: tienen otra semántica
  (sesión de caja, no período comercial).
