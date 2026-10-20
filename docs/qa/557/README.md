# QA #557 — conteos por cantidad y ubicación

## Implementado

- `InventoryCount` persiste `locationId`, alcance `FULL`/`PARTIAL` y resultado de aplicación para responder reintentos sin volver a ajustar.
- El alcance predeterminado es `PARTIAL`: seriales no leídos no se consideran faltantes por omisión. `FULL` trata como faltantes los seriales disponibles y como cantidad cero los productos sin serie no declarados.
- Los conteos guardan snapshot inicial de seriales disponibles y, en conteos de sucursal, de saldos sin serie. Seriales recibidos después no se consideran faltantes; unidades vendidas/trasladadas durante el conteo tampoco se marcan defectuosas. Para cantidades, si el producto o el catálogo cambia durante el conteo se bloquea la aplicación para no revertir ventas/recepciones. La aplicación exige permiso de gerencia y motivo, compara y ajusta en una transacción, registra antes/después/delta/actor y marca el documento como aplicado con un CAS de estado.
- Los conteos por ubicación filtran unidades serializadas por sucursal+ubicación. Escanear una unidad de otra ubicación queda como inesperada; no se crea stock automáticamente.
- La UI permite escoger alcance/sector, muestra diferencias por cantidad para conteos de sucursal y exige un motivo para aplicar.

## Fase 1: saldo explícito por ubicación

La migración `20270209120000_product_location_balance` agrega `ProductLocationBalance`
sin copiar automáticamente `Product.stock`. Una empresa puede asignar stock histórico
sin ubicación mediante una operación autorizada en una unidad posterior; la asignación
consume únicamente el remanente no asignado y no aumenta el stock de la sucursal.
Los conteos cuantitativos de una ubicación ya leen y ajustan esos saldos explícitos en
la misma transacción que el agregado de sucursal, con bloqueo de producto/ubicación.
Un producto sin saldo explícito sigue rechazando el conteo por sector con 409 para no
adivinar dónde estaba físicamente.

## Límite intencional antes de ampliar el modelo

El saldo histórico no serializado sigue en `Product.stock`, agregado por sucursal. Los
escritores existentes de ventas, recepciones y ajustes todavía no guardan `locationId`.
Por eso sólo se permiten conteos cuantitativos sobre filas `ProductLocationBalance`
explícitamente asignadas; el resto sigue rechazado y nunca altera el total global.
La siguiente unidad debe migrar cada escritor/lector a `changeProductLocationStock`
cuando exista una ubicación elegida y bloquear caminos ambiguos.

## Inventario transversal y compatibilidad

Los escritores que hoy pasan por el contador agregado son `backend/lib/stock.ts`
(`changeStock` para ventas, anulaciones, devoluciones, recepciones y transferencias),
`backend/app/api/stock/route.ts` (ajuste manual),
`backend/app/api/products/route.ts` (edición de stock), y el ajuste por sucursal de
`backend/app/api/inventory-counts/route.ts`. Las rutas de unidades serializadas también
llaman a `changeStock`, pero no pueden tener un saldo `ProductLocationBalance` porque
los equipos se mantienen en `InventoryUnit`.

Mientras esas operaciones todavía no reciben `locationId`, la compatibilidad queda
fail-closed: `assertLegacyStockMutationAllowed` rechaza cualquier mutación agregada
si el producto ya tiene un saldo explícito. Así no se puede cambiar `Product.stock`
dejando una suma de ubicaciones obsoleta. Los productos históricos sin filas de saldo
siguen funcionando con el contador de sucursal; no se crea una ubicación ficticia.
La migración siguiente debe agregar selección de ubicación a ventas, compras,
transferencias y ajustes, reemplazando esa guarda por el servicio transaccional.

Para completar el modelo hace falta migrar todos los escritores/lectores a una fuente de saldo por ubicación, ofrecer una operación de asignación autorizada y registrar los movimientos ocurridos durante el conteo para que una venta posterior al conteo físico no sea revertida al aplicar. Esta primera unidad deja preparado el contrato y el ajuste transaccional de saldos explícitos; no declara resuelto el flujo completo de ventas, compras, transferencias y ajustes por ubicación.

## Pruebas

`backend/tests/inventory-counts.test.ts` verifica motivo obligatorio, ajuste cuantitativo de sucursal, auditoría, reintento idempotente, bloqueo ante movimientos concurrentes, aprobación sin ajuste, aislamiento de ubicación y rechazo seguro de cantidades por sector.
