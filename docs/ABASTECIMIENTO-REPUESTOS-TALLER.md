# #250 · Repuestos del taller con tenencia y pago

Los repuestos que usa el taller (service) viven **aparte del stock vendible**:
tienen **dueño explícito** (la tienda o el proveedor) y **forma de pago**
(contado, a crédito o consignación). No crean `InventoryUnit` ni suman
`Product.stock`: el mismo equipo puede estar en el mostrador para vender y un
repuesto del proveedor en el Depósito 2 sin mezclarse.

## Modelo (migración aditiva `20261202000000_workshop_parts`)

| Tabla | Para qué |
|---|---|
| `WorkshopPart` | el repuesto: `code` (`REP-#0001`), nombre/SKU, `productId` opcional (catálogo), **`ownership`** (`PROPIO` · `PROVEEDOR`), **`paymentMode`** (`CONTADO` · `CREDITO` · `CONSIGNACION`), `supplierId` (dueño cuando es del proveedor), cantidades (`quantity`/`usedQuantity`), costos, `dueAt`/`paidAt` (cuenta por pagar), `locationId` (p. ej. Depósito 2), `branchId`, `status` (`DISPONIBLE` · `AGOTADO` · `DEVUELTO` · `BAJA`), `serviceOrderId` y notas |
| `WorkshopPartMovement` | trazabilidad: `ALTA` · `USO` · `DEVOLUCION` · `PAGO` · `BAJA` · `AJUSTE`, con cantidad, monto, orden de servicio y usuario |

Coherencias que valida la API (y la lib): lo **del proveedor** exige proveedor;
la **consignación** es del proveedor; lo **contado** no lleva vencimiento y nace
`paidAt`; el estado lo deriva la cantidad (la UI no lo elige).

## API (`/api/workshop/parts`)

| Método | Qué hace |
|---|---|
| `GET` | listado con `?disponibles=1` (lo que el taller puede usar), `?porPagar=1` (lo que mira FIN), `?serviceOrderId=`, `?ownership=`, `?paymentMode=`, `?branchId=` + **resumen** (disponibles, propios, del proveedor, por pagar, vencidas); `?id=` devuelve el repuesto con sus movimientos |
| `POST` | alta con tenencia y pago (`stock:manage`/`purchases:manage`) |
| `PATCH` | `use` (el taller consume; `service:manage`), `return` (solo lo del proveedor, vuelve al proveedor), `pay` (cierra la deuda), `baja` (con motivo) |

El **uso** descuenta cantidad y suma deuda solo en la consignación (se paga lo
usado); el **crédito** debe desde el alta; el **contado** nunca genera deuda.
Auditoría: `WORKSHOP_PART_CREATED` · `USED` · `RETURNED` · `PAID` · `DISCARDED`.

## Impacto en FIN (compra a crédito) — contrato

- `GET /api/workshop/parts?porPagar=1` devuelve los repuestos con deuda
  (`deudaPyg` por repuesto, `resumen.porPagarPyg` y `resumen.vencidasPyg`) con
  proveedor, vencimiento y origen (`ownership`/`paymentMode`): es **deuda con el
  proveedor sin venta asociada** (repuestos del taller), para sumar a “cuentas
  por pagar”.
- `PATCH { action: 'pay' }` marca el pago (idempotente: repetirlo da 409) y
  deja el movimiento `PAGO` con el monto y la nota: FIN puede llamarlo desde su
  flujo de pagos o pedir que el pago se registre ahí y luego marcarlo acá.
- Lo que FIN debería registrar como egreso es `deudaPyg` del repuesto pagado; el
  asiento queda auditado en `WORKSHOP_PART_PAID`.

## Tests

- Unit `backend/tests/workshop-parts.test.ts`: validaciones de tenencia/pago,
  estado por cantidad, deuda (crédito/consignación/contado), resumen (por pagar,
  vencidas) y código `REP-#0001`.
- Arnés HTTP `backend/tests/supply-workshop-parts.mjs` (**35 chequeos**): las
  cuatro combinaciones de alta, validaciones, uso del taller, devolución,
  baja con motivo, cuenta por pagar + pago (y 409 al repetir), movimientos y
  auditoría, **stock vendible intacto** (Product.stock e InventoryUnit) y
  permisos 401/403.
