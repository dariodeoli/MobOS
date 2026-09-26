# Abastecimiento F2/F6 · parte FIN — costo/moneda de la compra y métricas base

- **Rama:** `slot/finanzas` · **Fecha:** 2026-09-26 · **Alcance del reparto:**
  INV (datos/necesidades, lead) · PLT (panel) · CMP (objetos) ·
  **FIN (prioridad/precio)** · plan #250 + `PLAN-ABASTECIMIENTO.md`.

## (a) F2 — costo y moneda al registrar la compra (con INV)

Contrato ya integrado y verificado por el arnés:

| Regla | Detalle |
| --- | --- |
| Moneda de la compra | **PYG, USD o BRL**; con moneda extranjera la cotización es obligatoria (`exchangeRatePyg`) y el total en Gs se calcula con la misma primitiva que las unidades (`backend/lib/costs.ts`). |
| Costo por línea | La línea acepta **`originalUnitCost`** (en la moneda de la compra) o `unitCostPyg` (Gs); si vienen los dos, manda el Gs. Se persiste el original y el convertido. |
| Total | Si la factura no trae total, es la **suma de las líneas** (Gs y, si todas traen origen, moneda original); un total explícito manda tal cual. |
| Cuenta a pagar | Con costo cargado, la compra genera su **`SupplierPayable`** (contado saldado; crédito con vencimiento) y aparece en Caja con la referencia `COM-…` (ver `abastecimiento-f1-finanzas.md`). |
| Recepción | La unidad nace con el costo de su línea o total ÷ unidades, con **moneda y cotización congeladas** → margen y seguro con costo real. |

**Pendiente de UI (INV/PLT):** el panel de compra rápida (F2) todavía no existe
en el frontend (`src/components/supply/` solo tiene `PorComprar.jsx`); cuando
se construya, el formulario debe ofrecer moneda/cotización y el costo por
línea en esa moneda. La API y sus tests ya están listos.

## (b) F6 — métricas base de FIN

Sobre `GET /api/supply/performance` (`backend/lib/supply-forecast.ts`, puro):

### Rendimiento por proveedor
- `compras`, `unidades`, `costPyg` (monto real en Gs).
- **`costoPromedioUnidadPyg`** (nuevo, FIN): costo real por unidad comprada al
  proveedor (`costPyg ÷ unidades`; `null` sin unidades) — con la moneda ya
  convertida, sirve para comparar proveedores por plata, no por lista.
- `plazoPromedioDias` (compra → recepción), `puntualidadPct` (lotes llegados
  dentro de la ETA), `faltantesPct` e `incidencias`.

### Tiempo CDE→Asunción (y otras rutas)
- Por ruta + método: `lotes`, `unidades`, **`diasPromedio`**, `diasMaximos`.
- **`enTiempoPct`** (nuevo, FIN): % de lotes que llegaron dentro de la ETA.
- **`atrasoPromedioDias`** (nuevo, FIN): promedio de los días de atraso real de
  los lotes que se atrasaron (`0` si todos llegaron en fecha; `null` sin ETA).

Ambos campos viajan tal cual en el JSON de la API (`proveedores[]`, `rutas[]`).

### Panel de métricas (FIN)

El panel de métricas vive en `/metricas` (vista propia «Métricas de
abastecimiento» en Inventario, junto a «Por comprar», «Preparar compra» y
«Recepción»), en `src/components/supply/MetricasAbastecimiento.jsx`, y es
**solo lectura**:

- **Resumen**: monto comprado, costo promedio por unidad, atrasos de ahora y
  días de la ruta CDE (promedio ponderado por lotes, con puntualidad).
- **Proveedores**: tabla ordenada por monto con costo real por unidad, plazo,
  puntualidad (badge por tramos) y faltantes/incidencias. Filtro de ventana
  (30/90/180 días, `?desde=`).
- **Tiempos**: días promedio/máximo, puntualidad y atraso promedio por ruta y
  método (CDE → Asunción incluida).
- **Atrasos**: lotes con ETA vencida (con compra y días) y promesas al cliente
  vencidas; son del momento, no de la ventana.

Objetos compartidos: `DataTable` (con `mobileCard`), `Stat`, `Subtabs`,
`Badge`, `FilaDato`, `CeldaMoneda`, `Select` y `Button` — sin piezas nuevas.

## Evidencia

- Unit `backend/tests/supply-forecast.test.ts` dentro de
  `npm --prefix backend run test:unit` → **114/114** (incluye costo por unidad
  y puntualidad/atraso de la ruta CDE → Asunción).
- Arnés de integración completo: `PASS: automatización de abastecimiento …`
  (proveedores y rutas medidas, con `costoPromedioUnidadPyg` y
  `enTiempoPct`/`atrasoPromedioDias` en rango) + cadena de compras/recepciones
  en verde.
- Unit del panel `src/lib/metricasAbastecimiento.test.js` (puntualidad por
  tramos, resumen de compras y promedio ponderado de CDE) dentro de
  `npm test` → **784/784**.
- e2e `e2e/qa-f6-metricas-abastecimiento.spec.js` (proyecto `admin`): siembra
  una compra recibida y un lote atrasado por API, y afirma el proveedor con su
  costo real, la ruta CDE medida, la alerta con días de atraso, sin scroll
  horizontal a 1280/1440 y capturas claro/oscuro desktop y mobile en
  `docs/qa/f6-metricas/`.
- Build del backend con `BUILD_ID`; `npm run build` del frontend en verde.

## Coordinación

- **INV**: las métricas nuevas son aditivas; el panel puede mostrarlas sin
  cambios de contrato. El panel de métricas ya consume
  `/api/supply/performance` y `/api/supply/alerts`; la UI de F2 (compra rápida)
  queda de su lado con el contrato de costo/moneda de arriba.
- **PLT**: `PorComprar` ya consume prioridad/costos estimados; el panel de
  métricas es una vista propia más del grupo Inventario (`/metricas`), como
  «Preparar compra» y «Recepción», sin tocar sus pantallas.
