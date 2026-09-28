# Cierre #279 · A4 — Vender en tránsito

Una unidad que **viaja** (traslado interno o compra en camino) ya existe como
unidad física en la sucursal destino con estado `IN_TRANSIT`. Ahora se puede
**apartar para una venta antes de que llegue**: queda bloqueada para el resto,
al recibirla el **IMEI se vincula solo** al pedido que la esperaba y el vendedor
recibe el **aviso** en la bandeja interna.

## Qué se implementó (dominio INV)

| Pieza | Detalle |
|---|---|
| **Modelo** | `TransitAssignment` (`backend/prisma/schema.prisma`) + migración aditiva e idempotente `20261230000000_transit_assignments`. Estados `ASIGNADA → VINCULADA · LIBERADA`; **índice único parcial** (`WHERE status <> 'LIBERADA'`) = una sola asignación **viva** por unidad: el candado contra la doble asignación. |
| **API** | `GET/POST/PATCH /api/transit-assignments`: apartar (`POST { serial \| unitId, orderId?, orderItemId?, customerId?, customerName?, notes? }`), liberar (`release`) y forzar el vínculo (`link`, gerencia). Solo unidades `IN_TRANSIT`; un vendedor solo ve/opera las de su sucursal; el segundo intento responde **409 «Ese equipo ya está apartado para otra venta (vendedor)»**. Todo auditado (`TRANSIT_UNIT_ASSIGNED/RELEASED/LINKED`). |
| **Vínculo al recibir** | `POST /api/inventory-units/verify` (la recepción que ya usan el panel y el remito): si la unidad llegó con asignación viva, la unidad queda **reservada a ese cliente** (no se le ofrece a otro vendedor), la línea del pedido recibe su **IMEI** (JSON de la línea + índice `OrderItemSerial`, con `serialsPending` al día) y la asignación pasa a `VINCULADA` (`backend/lib/transit.ts`). |
| **Notificación** | `GET /api/notifications`: el vendedor que la apartó ve **«Llegó el equipo que apartaste»** (producto · IMEI · pedido/cliente, `href` al pedido) mientras el vínculo está dentro de la ventana. |
| **Panel (INV)** | En **Unidades → En tránsito** la fila muestra el chip **«Apart.»** (tooltip con cliente/vendedor) y el menú de la fila suma **«Apartar para una venta»** / **«Liberar apartado»**; el modal busca el cliente en la ficha (o aparta sin cliente, a nombre del vendedor). |
| **Pedido** | La API acepta `orderId`/`orderItemId` (la venta futura); sin pedido también se aparta (reserva a futuro). |

## Bug de paso, arreglado

El **menú de acciones de la fila** (`MenuAcciones` en `Inventario.jsx`) cerraba
con cualquier `mousedown` global: el menú se desmontaba antes del `click` y
**ninguna de sus acciones respondía** (Vender, Reservar, Verificar, etiquetas,
revisión, ubicación, baja). Ahora solo cierra si el clic fue afuera.

## Fuera de INV (reportado, no tocado)

- **POS (A4 vendedor)**: el plan pide que el **vendedor** vea las unidades en
  tránsito al vender y cree la asignación desde la venta (variante en tránsito →
  asignación futura → al recibir se escanea el IMEI y se vincula al pedido). Eso
  vive en `FormularioVenta`/`SerialUnitPicker` (POS): la API ya lo soporta
  (`POST /api/transit-assignments` con `orderId`/`orderItemId`) y el panel de INV
  ya permite hacerlo; falta la superficie en el POS.
- **PLT**: la compra en camino (F4/F5) hoy crea las unidades recién en la
  recepción: para apartar una compra **antes** de recibirla hace falta que el
  lote materialice las unidades (o un equivalente) en el flujo de abastecimiento.

## Capturas

`docs/qa/279-vender-transito/`:

- `{antes,despues}-transito-fila-{light,dark}.png` — la fila en «En tránsito»
  (antes: sin apartado; después: con el chip).
- `apartar-modal-light.png` — el modal de apartado con el cliente.
- `tras-apartar-fila-light.png` — la fila marcada «Apart.» y el aviso del panel.
- `unidad-recibida-reservada-light.png` — la unidad recibida y reservada.
- `aviso-vinculo-{light,dark}.png` — la campana con «Llegó el equipo que apartaste».

## Tests

- Unit `backend/tests/transit.test.ts` (**5**): estados, reserva que deja la
  asignación, vínculo al recibir (línea + índice + `serialsPending`) y el caso
  sin asignación/pedido. Regla de objetos: el panel usa el chip y las acciones.
- Arnés `backend/tests/transit-assignments.mjs` (**29 chequeos**, en
  `integration-http.sh`): apartar + **409 al segundo intento**, no se aparta lo
  que ya está en stock, recepción → reservada + pedido con su IMEI + aviso,
  liberar y volver a apartar (con historial).
- e2e `e2e/qa-279-transito.spec.js` (**1/1**, panel): el flujo completo con la
  UI (chip, modal, 409, recepción, aviso).

## Verificaciones

- `npm run lint` 0 errores · `npm run build` ✓ · `npm --prefix backend run build` ✓ con `BUILD_ID` · `prisma:validate` ✓ · **`db:check` ✓** («la base coincide con schema.prisma»).
- `npm test` **864/864** · backend `test:unit` **138/138** · shards OK (195/194/194).
- Arnés HTTP completo **PASS** (incluye el bloque A4) · `rg "<<<<<<<"` → 0.
- e2e afectados: `qa-279-transito`, `inventario-unidades`, `qa-285`, `qa-286`,
  `qa-287`, `notificaciones`, `traslados-etiquetas-lote`,
  `inventario-tabla-encabezado`, `qa-249-inventario-touch`, `qa-257-inventario-pos`,
  `vendidos-comprobante-rapido` → **40 en verde**.
