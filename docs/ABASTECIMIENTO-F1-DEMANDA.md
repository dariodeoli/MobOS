# Abastecimiento F1 — Vínculo venta → necesidad y cliente con permiso (#254)

Parte del dominio **clientes** en F1 (#254, dentro de la épica #250): cuando la
venta queda pendiente de stock/unidades, la necesidad de compra nace **vinculada
al pedido, a su línea y a su cliente**, sin crear stock (eso pasa recién en la
recepción) y sin duplicarse si el evento se repite.

## Qué se entregó

| Archivo | Cambio |
|---|---|
| `backend/lib/supply-demand.ts` (nuevo) | Reglas puras del vínculo: `necesidadesDeVenta` (fuente y cantidad por línea pendiente), `necesidadDeReservaFaltante` (solo la diferencia), `puedeVerCliente` (permiso) y `crearNecesidadesDeVenta` (inserción + auditoría dentro de la transacción, tolerante a la deduplicación) |
| `backend/app/api/orders/route.ts` | En el checkout, después de crear el pedido: si alguna línea quedó `stockPending`/`serialsPending`, se crean las necesidades con el pedido, la línea, el cliente y la sucursal. Reintentos no duplican (`dedupeKey` + índice único) |
| `backend/app/api/supply/needs/route.ts` | El nombre del cliente de la venta pasa a regirse por **permiso** (`customers:manage`) en vez de una lista fija de roles; el resto ve el id |
| `backend/lib/supply.ts` | Los destinos consolidados suman **`clienteOculto`**: hay cliente vinculado pero sin permiso para ver su nombre, así la tarjeta puede explicarlo |
| `backend/tests/supply-demand.test.ts` (nuevo) | Unit: fuentes y cantidades, clave de deduplicación, faltante de reserva, permiso del cliente y `clienteOculto` |
| `backend/tests/supply-demand.mjs` (nuevo) | Integración HTTP: venta sobre pedido → necesidad vinculada (pedido, cliente, auditoría), reserva de unidad existente → **sin** necesidad, permisos 401/403 |

## Fuentes de demanda de esta pasada

- **`SALE_NO_STOCK`** — producto sin unidades serializadas vendido «sobre pedido»
  (`stockPending`): cantidad = lo pendiente.
- **`QUANTITY_OVER_STOCK`** — faltan unidades/IMEI de un producto serializado
  (`serialsPending`): el cliente reserva y el IMEI se completa al entregar.
- **`RESERVATION_NO_STOCK`** — la función ya calcula la **diferencia faltante**
  de una reserva, pero hoy la reserva del sistema solo toma unidades existentes
  (y una unidad existente **no** genera compra, como pide el plan). Queda lista
  para cuando exista el flujo de reserva parcial.

## Decisiones (documentadas)

- **Dentro de la transacción del checkout**: el vínculo es atómico con la venta;
  solo la deduplicación es tolerada (P2002), cualquier otro error se propaga
  para no perder demanda en silencio.
- **Clave por línea** (`SALE_NO_STOCK:<orderItemId>`): reintentar la misma venta
  no duplica la necesidad; las manuales (sin clave) conviven.
- **Cliente con permiso**: `customers:manage` (o `*`) ve el nombre; el resto ve
  `clienteId` y `clienteOculto` — la tarjeta puede decir «cliente sin permiso»
  sin filtrar datos. Hoy el panel de compras ya exige `stock:manage`, así que en
  la práctica el cambio mantiene el comportamiento y lo vuelve explícito para
  roles futuros.
- **Sin migración**: el modelo ya tenía `orderId`/`orderItemId`/`customerId`/
  `dedupeKey`; esta entrega no toca el schema (los `origin` de INV son
  ortogonales).

## Verificación

```bash
npm --prefix backend run test:unit                  # unit del dominio (99 ✓)
MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh
# PASS: vínculo venta → necesidad con cliente y reserva sin compra · 11 chequeos
```

| Evidencia | Qué cubre |
|---|---|
| `backend/tests/supply-demand.test.ts` | Fuentes, cantidades, dedupe, reserva, permiso y `clienteOculto` |
| `backend/tests/supply-demand.mjs` | Ventas sobre pedido vinculadas con auditoría; reserva sin compra; 401/403 |
| `backend/tests/supply-needs.mjs` | La consolidación y el panel siguen en verde con `clienteOculto` |
