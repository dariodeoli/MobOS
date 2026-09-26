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

## Costo + moneda al registrar la compra (contrato verificado)

- `POST /api/supply/purchases` acepta **PYG o USD**; con USD exige cotización
  y calcula `costPyg = round(originalCost × exchangeRatePyg)`
  (`backend/lib/costs.ts`).
- La **línea** puede fijar `unitCostPyg` (Gs) y manda; si no, al recibir el
  costo unitario se deriva del **total de la compra ÷ todas las unidades**
  (`costoPorUnidad`), con la moneda y la cotización **congeladas en la unidad**
  → así entra al costo real, al margen y al seguro.
- Ya cubierto por el arnés: `supply-purchases.mjs` (USD 350,5 × 7.500; falta de
  cotización → 400; multi-línea con costo por línea) y `supply-receptions.mjs`
  (la unidad hereda el costo de la compra).

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

- Unit `backend/tests/supply-priority.test.ts` (6 tests) dentro de
  `npm --prefix backend run test:unit` → **105/105**.
- Arnés de integración completo (`MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh`,
  backend con `BUILD_ID`): **PASS** en toda la cadena del abastecimiento, con
  la sonda de F1 sumando prioridad automática por fecha y costos del grupo:
  - `PASS: necesidades manuales + consolidación (4 grupos) + asignación/cancelación auditadas · 26 chequeos`
  - `PASS: compra COM-CDE-0001 (USD → Gs) con IMEI y compra adicional … · 25 chequeos`
  - `PASS: recepción por QR … · 40 chequeos`
- Build del backend con `BUILD_ID` en verde.
