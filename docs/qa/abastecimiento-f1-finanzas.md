# Abastecimiento F1 (#254) · parte FIN — prioridad y costos de una necesidad

- **Rama:** `slot/finanzas` · **Fecha:** 2026-09-26 · **Alcance del reparto:**
  INV (datos/necesidades, lead) · PLT (panel/móvil) · CMP (objetos) ·
  **FIN (prioridad/precio)** · plan: #250 + `PLAN-ABASTECIMIENTO.md`.

## Prioridad de compra (venta · margen · fecha)

Reglas puras en `backend/lib/supply-priority.ts`:

- **Base por origen**: venta sin stock y pedido comprometido → `ALTA`; reserva
  sin unidad, cantidad sobre stock y manual → `NORMAL`; reposición bajo punto
  de reorden → `BAJA`.
- **Venta confirmada** (cobrada, no reserva): +1 escalón.
- **Margen esperado** ≥ `MARGEN_ALTO_PYG` (1.000.000 Gs): +1 escalón; margen
  negativo: −1 (no se apura plata sin retorno).
- **Fecha prometida**: vencida → `URGENTE` (piso); ≤ 2 días → +2; ≤ 7 días → +1;
  sin fecha o lejana → sin ajuste.
- Todo se acota entre `BAJA` y `URGENTE`.

Funciones:

- `prioridadDeNecesidad({ origen, ventaConfirmada, margenPyg, prometidaEl })`:
  prioridad con la que **nace** la necesidad (la usan las automáticas de INV y
  la carga manual sin prioridad).
- `prioridadPorFecha(guardada, { prometidaEl })`: prioridad **efectiva** al
  leer el panel. Lo único que cambia con el tiempo es la fecha: una `BAJA`
  explícita sin fecha se respeta; vencida o a días, escala. Así el panel no
  muestra prioridades viejas.

## Costos de la necesidad (lo que hay que poner para comprarla)

- `costoEstimadoDeNecesidad({ costoUnitarioPyg, cantidad })` → costo del
  producto × cantidad (`null` si el producto no tiene costo).
- `margenEstimadoDeNecesidad({ precioUnitarioPyg, costoUnitarioPyg, cantidad })`
  → (precio de la venta − costo estimado) × cantidad (`null` si falta alguno).
- `GET /api/supply/needs` calcula ambos por necesidad y **suma por grupo**
  (`costoEstimadoPyg`, `margenEstimadoPyg`): el panel puede mostrar cuánto
  costaría comprar el grupo y cuánto margen protege, y la prioridad del grupo
  usa la efectiva.

## Proveedor y costo real: cuenta a pagar de la compra

- La compra registra su **condición de pago** (`paymentCondition`: `CONTADO` o
  `CREDITO`, por defecto contado) y su **vencimiento** (`dueAt`, obligatorio
  para crédito).
- **Con costo cargado**, la compra genera su **cuenta a pagar al proveedor**
  (`SupplierPayable` vinculada por `supplyPurchaseId`, migración aditiva
  `20261206000000_supply_purchase_payable`): **contado nace pagada** (no
  engorda el «por pagar»: Finanzas muestra pendientes y tenencia); **crédito
  queda pendiente con vencimiento** y aparece en Caja (`/api/finance` →
  `supplierPayables`, KPI «Por pagar») con la referencia `COM-…`.
- Sin costo todavía (factura pendiente) no hay cuenta hasta que el monto
  exista; el flujo de carga de factura llega con F5/recepción.
- **Cancelar** una compra elimina su cuenta: el contado nace saldado por
  definición (se paga al recibir) y no arrastra deuda; una compra a crédito sin
  pagos también se limpia (auditado). Si la cuenta ya tiene **pagos o consumo
  reales** (crédito/consignación), la cancelación se frena con un 409 y se
  resuelve primero en Finanzas: no se borra plata registrada en silencio.
- El vínculo queda expuesto en `/api/finance`
  (`supplierPayables.rows[].supplyPurchaseId`) para que el panel pueda abrir la
  compra desde la cuenta.

## Verificación del flujo costos/moneda (compra → recepción → unidad)

Arnés `supply-receptions.mjs` (caso 6-bis): compra en **USD** con
`originalUnitCost` 900 y cotización 7.500 → la línea y el total se convierten
(6.750.000 Gs) → lote → recepción → la unidad nace con
`costPyg = 6.750.000`, `costCurrency = USD`, `exchangeRatePyg = 7.500` y
`originalCost = 900` **congelados**. Ese costo es el que usa el margen con
costo real (cubierto por `unit-cost-margin.mjs`).

## Costo + moneda al registrar la compra

- `POST /api/supply/purchases` acepta **PYG, USD y BRL**; con moneda extranjera
  exige cotización y calcula `costPyg = round(originalCost × exchangeRatePyg)`
  (`backend/lib/costs.ts`, mismo objeto que las unidades).
- **Costo por línea en la moneda de la compra** (`originalUnitCost`, nuevo,
  migración aditiva `20261205000000_supply_line_original_cost`): la línea puede
  cargar «USD 900 c/u» y se guarda el original **y** su `unitCostPyg`
  convertido. Si viene también el Gs explícito, el Gs manda.
- **Total derivado**: si la factura no trae total pero las líneas sí, el total
  de la compra es la suma (en Gs y, si todas traen origen, en la moneda
  original). Un total explícito manda tal cual: la línea es el detalle.
- Al recibir, la unidad toma el costo de su **línea** o, si no lo tiene, el
  total ÷ todas las unidades (`costoPorUnidad`), con moneda y cotización
  **congeladas en la unidad** → así entra al costo real, al margen y al seguro.
- Validaciones: moneda fuera de PYG/USD/BRL → 400; USD/BRL por línea sin
  cotización → 400; decimales por moneda (PYG sin decimales, USD/BRL 2) y
  cotización hasta 4 → 400 con el motivo.
- Cubierto por el arnés: `supply-purchases.mjs` (total USD, línea con
  `originalUnitCost` + Gs explícito, suma derivada, falta de cotización → 400)
  y `supply-receptions.mjs` (la unidad hereda el costo de la compra).

## Contrato para INV (coordinación #254)

1. Al crear una automática (venta sin stock, reserva, cantidad sobre stock,
   bajo reorden, pedido comprometido), guardar
   `priority: prioridadDeNecesidad({ origen, ventaConfirmada, margenPyg, prometidaEl })`.
2. `ventaConfirmada` = venta cobrada/confirmada (no reserva); `margenPyg` =
   `margenEstimadoDeNecesidad` con el precio de la línea vendida y el costo del
   producto.
3. El panel lee `prioridad` (ya efectiva por fecha) y los grupos traen
   `costoEstimadoPyg`/`margenEstimadoPyg`; no hace falta recalcular nada en el
   cliente.

## Evidencia

- Unit `backend/tests/supply-priority.test.ts` (6 tests) y los `assert` de
  compra (moneda por línea, total derivado, condición/vencimiento) dentro de
  `npm --prefix backend run test:unit` → **105/105**.
- Arnés de integración completo (`MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh`,
  backend con `BUILD_ID`): **PASS** en toda la cadena del abastecimiento:
  - `PASS: necesidades manuales + consolidación (4 grupos) + asignación/cancelación auditadas · 26 chequeos`
  - `PASS: compra COM-CDE-0001 (USD → Gs) con IMEI y compra adicional … · 34 chequeos` (incluye costo por línea en USD, total derivado, cuenta a pagar del contado/crédito y cancelación)
  - `PASS: recepción por QR … · 50 chequeos` (incluye la unidad comprada en USD con moneda y cotización congeladas)
  - `PASS: repuestos del taller … · 35 chequeos` y `PASS: repuestos a crédito … · 14 chequeos` (KPI contra deltas y SQL)
- Build del backend con `BUILD_ID` en verde.
