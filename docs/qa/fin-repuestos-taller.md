# Repuestos del taller en Finanzas (FIN #250)

- **Rama:** `slot/finanzas` · **Fecha:** 2026-09-27 · **Alcance:** FIN sobre el
  contrato de INV (`docs/ABASTECIMIENTO-REPUESTOS-TALLER.md`): la deuda de los
  repuestos del taller entra en «por pagar» y se paga desde Caja.

## El gap

Los repuestos del taller a crédito (y la consignación consumida) generaban deuda
en `WorkshopPart`, pero **Finanzas no la veía**: el KPI «Por pagar» de Caja
sumaba compras de `PurchaseOrder` + `SupplierPayable` del Centro de
Abastecimiento, y el bloque «Repuestos y proveedores» no incluía el taller. El
número quedaba corto y el pago se hacía fuera del flujo de Finanzas (sin egreso
en la cuenta).

## Qué hace

- `GET /api/finance` suma el bloque **`workshopParts`**: filas con deuda real
  (`deudaRepuesto`: crédito = total, consignación = usado × unitario), con
  proveedor, vencimiento (`estadoDeVencimiento`) y totales
  (`totalPyg`/`vencidasPyg`/`partes`) calculados con los helpers compartidos
  (`backend/lib/workshop-parts.ts`), respetando la sucursal del scope.
- **Caja · KPI «Por pagar»** incluye ese total (el texto aclara «incluye
  repuestos a crédito, consumo y taller»).
- **Caja · bloque «Repuestos del taller»**: filas con deuda, badges de
  condición (Crédito/Consignación), **Vencida/Por vencer**, código, proveedor y
  vencimiento; botón **Pagar**.
- **`POST /api/finance { action: 'workshopPartPayment', id, accountId? }`**:
  valida que el repuesto tenga deuda pendiente, marca `paidAt`, deja el
  movimiento `PAGO` del taller (deuda pagada) y, con `accountId`, registra el
  **egreso** (`CashMovement` OUT, tipo `SUPPLIER_ADVANCE`) en la cuenta elegida.
  Pago total (misma semántica que el `pay` del taller); repetir da **400**
  (sin deuda pendiente, como el resto de las acciones de Finanzas).
  Audita `WORKSHOP_PART_PAID` con `desde: 'FINANZAS'` y `FINANCE_MOVEMENT_CREATED`.
- Alcance: no toca stock vendible ni la tenencia; la consignación **no consumida
  sigue sin impactar** (solo se paga lo usado), como define el contrato de INV.

## Evidencia

- Arnés `backend/tests/supply-workshop-parts.mjs` (extendido a **42 chequeos**): el
  crédito del proveedor (240.000, vencido) y la consignación consumida (180.000)
  aparecen en `workshopParts` con su vencimiento; el pago desde Finanzas con
  cuenta baja el «por pagar», deja el egreso en los movimientos y la auditoría
  desde FINANZAS; repetir da 400 (sin deuda) y un id inexistente 400.
  `MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh` → **PASS** (23
  suites).
- e2e `e2e/qa-fin-repuestos-taller.spec.js` (proyecto `admin`): siembra un
  repuesto a crédito y vencido por API, verifica el bloque en Caja y el KPI de
  «por pagar» por diferencia, paga con cuenta desde el modal y comprueba que la
  fila sale, el KPI baja, el repuesto queda pago y el egreso quedó registrado.
  Capturas en `docs/qa/fin-repuestos-taller/`.
- Unit existentes del math compartido: `backend/tests/workshop-parts.test.ts`.

## Conciliación (sonda de verificación)

`node scripts/qa-fin-taller-conciliacion.mjs` (con `QA_STORAGE_STATE`) verifica
extremo a extremo que la deuda es la misma en todos lados:

1. **Workshop vs Finanzas** (sin filtro): `resumen.porPagarPyg`/`vencidasPyg` de
   `/api/workshop/parts?porPagar=1` == `workshopParts.totalPyg`/`vencidasPyg` de
   `/api/finance`, con la misma deuda y vencimiento por repuesto (y sin filas de
   más).
2. **Por sucursal**: lo mismo comparando con `?branchId=` en ambos endpoints.
3. **KPI de Caja**: el valor de `caja-por-pagar` equivale a
   `payables + supplierPayables + workshopParts` de la sucursal seleccionada.
4. **Pago (solo `QA_MODO=dev`)**: crea un crédito de 350.000, paga desde
   Finanzas y verifica que baja en ambos endpoints, que queda el egreso en la
   cuenta, la auditoría `WORKSHOP_PART_PAID` con `desde: FINANZAS` y el 400 al
   repetir.

- **Corrida local (6/6)** con la sesión admin del e2e:
  `QA_MODO=dev QA_BASE_URL=http://localhost:5215 QA_API_URL=http://localhost:3115
  QA_STORAGE_STATE=e2e/.auth/admin.json node scripts/qa-fin-taller-conciliacion.mjs`
  → `docs/qa/fin-repuestos-taller/conciliacion-dev/` (`resultados.json` +
  `caja-deuda-taller.png` con el bloque y la deuda nueva + `caja-tras-pagar.png`
  con el KPI después del pago).
- **Producción**: se corre sin `QA_MODO` (solo lectura, no crea datos) cuando el
  deploy traiga el bloque; mientras no esté desplegado, la sonda lo dice al no
  encontrar `workshopParts`.

## Coordinación

- **INV**: se reutilizan `deudaRepuesto`/`resumenRepuestos` (una sola fórmula);
  el `pay` del taller sigue disponible para su panel. Finanzas agrega el egreso
  en la cuenta, que es lo que el contrato pedía.
- **FIN**: la deuda entra al KPI sin duplicar: la consignación no consumida no
  suma (solo la usada), y el pago desde Caja cierra la deuda del taller con su
  movimiento de caja.
