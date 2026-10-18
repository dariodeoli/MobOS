# QA #557 — conteos por cantidad y ubicación

## Implementado

- `InventoryCount` persiste `locationId`, alcance `FULL`/`PARTIAL` y resultado de aplicación para responder reintentos sin volver a ajustar.
- El alcance predeterminado es `PARTIAL`: seriales no leídos no se consideran faltantes por omisión. `FULL` trata como faltantes los seriales disponibles y como cantidad cero los productos sin serie no declarados.
- Los conteos guardan snapshot inicial de seriales disponibles y, en conteos de sucursal, de saldos sin serie. Seriales recibidos después no se consideran faltantes; unidades vendidas/trasladadas durante el conteo tampoco se marcan defectuosas. Para cantidades, si el producto o el catálogo cambia durante el conteo se bloquea la aplicación para no revertir ventas/recepciones. La aplicación exige permiso de gerencia y motivo, compara y ajusta en una transacción, registra antes/después/delta/actor y marca el documento como aplicado con un CAS de estado.
- Los conteos por ubicación filtran unidades serializadas por sucursal+ubicación. Escanear una unidad de otra ubicación queda como inesperada; no se crea stock automáticamente.
- La UI permite escoger alcance/sector, muestra diferencias por cantidad para conteos de sucursal y exige un motivo para aplicar.

## Límite intencional antes de ampliar el modelo

El saldo no serializado sigue en `Product.stock`, agregado por sucursal. Los escritores existentes de ventas, recepciones y ajustes tampoco guardan `locationId`. Por eso, API rechaza líneas de cantidad en un conteo por ubicación y evita aplicar ese diferencial al stock global. No se agregó una tabla de saldos sectoriales aislada: quedaría obsoleta inmediatamente al vender/recibir/ajustar.

Para completar cantidades por sector hace falta migrar todos los escritores/lectores a una fuente de saldo por ubicación, backfill por ubicación explícita (sin inventar ubicación física), y reconciliación del total agregado. También hace falta registrar los movimientos ocurridos durante el conteo para que una venta posterior al conteo físico no sea revertida al aplicar. Hasta completar ese modelo, conteos por ubicación son de unidades serializadas.

## Pruebas

`backend/tests/inventory-counts.test.ts` verifica motivo obligatorio, ajuste cuantitativo de sucursal, auditoría, reintento idempotente, bloqueo ante movimientos concurrentes, aprobación sin ajuste, aislamiento de ubicación y rechazo seguro de cantidades por sector.
