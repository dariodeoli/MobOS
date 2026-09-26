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

## Evidencia

- Unit `backend/tests/supply-forecast.test.ts` dentro de
  `npm --prefix backend run test:unit` → **114/114** (incluye costo por unidad
  y puntualidad/atraso de la ruta CDE → Asunción).
- Arnés de integración completo: `PASS: automatización de abastecimiento …`
  (proveedores y rutas medidas, con `costoPromedioUnidadPyg` y
  `enTiempoPct`/`atrasoPromedioDias` en rango) + cadena de compras/recepciones
  en verde.
- Build del backend con `BUILD_ID`.

## Coordinación

- **INV**: las métricas nuevas son aditivas; el panel puede mostrarlas sin
  cambios de contrato. La UI de F2 (compra rápida) queda de su lado con el
  contrato de costo/moneda de arriba.
- **PLT**: `PorComprar` ya consume prioridad/costos estimados; el panel de
  rendimiento puede usar `proveedores[]`/`rutas[]` directo.
