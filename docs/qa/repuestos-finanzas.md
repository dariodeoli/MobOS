# Repuestos a crédito · impacto en finanzas (#250 · #83)

- **Branches:** `slot/finanzas` · **Coordinación:** INV (stock de repuestos del
  taller: tenencia y pago) · **Fecha:** 2026-09-25 · **Resultado:** mínimo viable
  de finanzas implementado con tests y evidencia.

## El pedido y el MVP definido con INV

> «Repuestos a crédito · impacto en finanzas: cuenta a pagar al proveedor
> (contado vs crédito y vencimientos) y consignación/depósito sin impacto hasta
> el consumo; definí con INV el mínimo viable sobre el stock de repuestos
> (tenencia y pago).»

**Reparto del mínimo viable** (stock = INV, plata = FIN):

| Parte | Quién | Qué incluye |
| --- | --- | --- |
| **Tenencia** | INV (#250, stock de repuestos del taller) | El repuesto en sí, su **dueño explícito** (propio o del proveedor), el depósito donde vive y su disponibilidad para el taller, sin mezclarse con el stock vendible. |
| **Pago** | FIN (esta entrega) | La **cuenta a pagar al proveedor**: compra **de contado** (pagada al recibir), **a crédito** (con vencimiento) y **en consignación/depósito** (del proveedor, que **no impacta hasta el consumo**). |

**Contrato entre los dos** (lo que INV usa cuando construya el stock):

1. Al registrar la compra del repuesto, INV llama a la acción
   `supplierPayable` con proveedor, concepto, condición, monto y vencimiento.
2. Cuando el taller **consume** un repuesto en consignación, se llama a
   `supplierConsumption`: solo esa parte se vuelve pagable.
3. Cuando se le paga al proveedor, se llama a `supplierPayment`: baja el saldo y,
   si se indica la cuenta, deja el movimiento de caja.

El mínimo implementado **no toca los modelos de stock de INV** (ni productos ni
unidades): es la cuenta a pagar por sí misma, con el proveedor como snapshot.
Cuando INV sume el stock del taller, el alta de la compra puede disparar la
misma API (o INV emite el consumo y FIN lo registra).

## Lógica pura (`backend/lib/supplier-payables.ts`)

- **Contado**: `payableDeCompra = 0` (se paga al recibir; nace pagada).
- **Crédito**: `payableDeCompra = total`; el pendiente es total − pagado.
- **Consignación**: `payableDeCompra = min(total, consumido)`; el resto queda
  como `enDepositoDeCompra` (tenencia del proveedor, **sin impacto**).
- **Vencimientos**: `estadoDeVencimiento` clasifica `VENCIDA` / `POR_VENCER`
  (≤ 7 días) / `AL_DIA` / `SIN_VENCIMIENTO`.
- `resumenProveedores` agrega el total a pagar, las vencidas, las por vencer y
  la tenencia en depósito.

## API y pantalla

- `GET /api/finance` suma el bloque **`supplierPayables`**: filas con condición,
  vencimiento, pendiente y depósito, y los totales calculados **en SQL sobre
  todo el historial** (no dependen del tope de la lista; el reloj de Postgres
  decide qué está vencido).
- `POST /api/finance` con `supplierPayable`, `supplierPayment` y
  `supplierConsumption` (roles ADMIN/GERENTE/CAJERA, auditoría
  `SUPPLIER_PAYABLE_CREATED|PAID|CONSUMED`). El pago con cuenta crea el
  movimiento de caja (`SUPPLIER_ADVANCE`, salida) en la misma transacción.
- **Caja** (`/finanzas/caja`): tarjeta **«Repuestos y proveedores»** con los
  cuatro números (por pagar, vencidas, por vencer, en depósito), la lista con
  condición/vencimiento y las acciones «Registrar compra», «Pagar» y
  «Consumir». El KPI **«Por pagar»** de la pantalla ahora incluye estos saldos.

## Evidencia

| Qué | Dónde |
| --- | --- |
| Antes: la Caja sin la cuenta a pagar de repuestos | `repuestos-caja-antes.png` |
| Después: la tarjeta con el KPI y la compra a crédito **vencida** | `repuestos-caja-despues.png`, `repuestos-credito-vencido-despues.png` |
| Después: pago parcial (saldo 1.000.000) | `repuestos-credito-pagado-despues.png` |
| Después: consignación sin impacto (+800.000 en depósito, por pagar igual) | `repuestos-consignacion-despues.png` |
| Después: contado (no queda pendiente) | `repuestos-contado-despues.png` |

- Unit (lógica pura): `backend/tests/supplier-payables.test.ts` (en `test:unit`).
- Arnés HTTP: `backend/tests/supplier-payables-http.mjs` — contado sin impacto,
  crédito 1.000.000 vencido, consignación 800.000 con 300.000 consumidos, pago
  parcial, KPI contra agregación SQL independiente y limpieza.
- e2e: `e2e/repuestos-proveedores.spec.js` (3 casos, Caja, capturas
  antes/después).

## Coordinación

- **INV (#250, stock del taller)**: la parte de tenencia (dueño explícito,
  depósito, disponibilidad del taller) queda de su lado; esta entrega le deja el
  contrato de pago listo y no toca sus modelos. Si prefiere, el consumo puede
  emitirse desde el taller y registrarse con la misma acción.
- **PLT**: `GET /api/auth/me` sigue devolviendo el tenant sin `insurancePct`,
  `loyaltyPct` ni `collectionLateFeeBpPerDay` (reporte de rondas anteriores).
