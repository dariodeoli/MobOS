# Centro de Abastecimiento · Fase 6 (automatización) — spec técnica

Cierre de la épica #250 por API: **reposición sugerida**, **stock de seguridad**,
**rendimiento por proveedor**, **tiempos reales de tránsito (CDE→ASU)**,
**alertas de atraso** y **AEX ampliado** para los lotes entrantes. Sobre
[F1](ABASTECIMIENTO-F1.md)–[F5](ABASTECIMIENTO-F5.md).

## 1. Modelo (migración aditiva `20261201000000_supply_policies`)

| Tabla | Para qué |
|---|---|
| `SupplyPolicy` | política de reposición por **producto + sucursal**: `safetyStock` (colchón mínimo) y `leadTimeDays` (días de compra a llegada). Única por producto/sucursal y auditada. |

El resto de la fase se calcula con datos que ya existen (stock, ventas,
necesidades, compras, lotes y recepciones); no agrega tablas.

## 2. Lógica pura (`backend/lib/supply-forecast.ts`)

- `reposicionSugerida({ stock, safetyStock, leadTimeDays, consumoDiario, enCamino, abiertas })`:
  punto de pedido = colchón + consumo diario × plazo; la sugerencia descuenta lo
  que viene en camino y lo ya pedido. Urgencia `ALTA` (stock ≤ colchón), `MEDIA`
  (≤ punto de pedido) o `BAJA`, con motivo en lenguaje de mostrador.
- `rendimientoProveedor(compras)`: compras, unidades, monto, **plazo promedio**
  (compra → recepción), **puntualidad** (llegó dentro de la ETA), tasa de
  faltantes e incidencias. Sin datos no inventa métricas (`null`).
- `tiemposDeTransito(lotes)`: días reales de salida → llegada por **ruta y
  método** (incluye CDE→ASU), con promedio, máximo, lotes y unidades.
- `enviosAtrasados(envios, ahora)` y `necesidadesAtrasadas(necesidades, ahora)`:
  ETA vencida y fecha prometida al cliente pasada, con días de atraso.

## 3. API (`stock:manage`)

| Método | Ruta | Qué hace |
|---|---|---|
| `GET`/`PUT` | `/api/supply/policies` | lee y guarda el stock de seguridad y el plazo (valida enteros 0-9999 / 0-365; audita `SUPPLY_POLICY_UPDATED`) |
| `GET` | `/api/supply/replenishment` | **reposición sugerida** por producto/sucursal: stock, en camino, abiertas, consumo de 30 días, punto de pedido, sugerencia, urgencia y motivo (`?todas=1` incluye las cubiertas) |
| `POST` | `/api/supply/replenishment` | convierte la sugerencia en necesidad `BELOW_REORDER` con **dedupe**: repetirla devuelve la misma fila (`repetida: true`) |
| `GET` | `/api/supply/performance` | **rendimiento por proveedor** y **rutas** con tiempos reales (ventana de 180 días, `?desde=`) |
| `GET` | `/api/supply/alerts` | **atrasos**: lotes en camino con ETA vencida (días, compra, unidades) y necesidades con promesa vencida (`?branchId=`) |
| `PATCH` | `/api/supply/shipments` `aex-quote` | cotiza el lote por origen/destino real (`pesoKg`); sin credenciales responde `unconfigured` + web de AEX |
| `PATCH` | `/api/supply/shipments` `aex-guide` | guarda la **guía AEX** del lote (empresa y método AEX; audita `SUPPLY_SHIPMENT_AEX_GUIDE`) |
| `GET` | `/api/supply/shipments/[id]/tracking` | seguimiento por guía: eventos recibidos por webhook y, si no hay, consulta la API; sin credenciales abre la web |

## 4. Tests

- Unit `backend/tests/supply-forecast.test.ts`: sugerencia (colchón, en camino,
  abiertas, urgencias), rendimiento (plazo, puntualidad, faltantes %), rutas
  (CDE→ASU, promedio/máximo, sin llegada no promedia) y alertas (días de atraso).
- Arnés HTTP `backend/tests/supply-automation.mjs` (**33 chequeos**): política con
  validaciones y auditoría, sugerencia → necesidad sin duplicar, métricas de
  proveedores y rutas, alertas de lote atrasado + promesa vencida, AEX
  (cotización honesta, guía y seguimiento) y permisos 401/403.
- `MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh` → **PASS**
  (F1 22 + F2 25 + F3 28 + F4 31 + F5 40 + F6 33 chequeos); `db:check` verde.

## 5. Estado de la épica #250

Con F1–F6 el backend cubre el ciclo completo del Centro de Abastecimiento y su
automatización: **necesidad → compra → lote → recepción → stock → reposición
sugerida**, con métricas de proveedores, rutas y alertas de atraso. Sigue
pendiente el **panel** (CMP tiene pedida la tanda de objetos: `CampoSeriales`,
`MedidorStock`, `ContadorLote`, `ChipPrioridad`) y los **layouts de impresión**
de PRN (manifiesto, etiqueta de preparación y comprobante de recepción).
