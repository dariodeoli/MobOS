# Verificación F1 — Vínculo venta/reserva → necesidad y permisos del cliente (#254)

Verificación independiente del cierre de F1 (épica #250) sobre el **motor de
demanda de INV** (`dee58859` + `4cd35aba`) y la pieza de **cliente con permiso**
del dominio clientes. Método: unitarios del backend + arnés HTTP completo
(`MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh`).

## Criterio → evidencia → resultado

| Criterio de F1 | Dónde se verifica | Resultado |
|---|---|---|
| Venta sin stock / «sobre pedido» → necesidad **vinculada** (pedido, línea, cliente, sucursal) | `supply-needs.mjs` §6 (motor de INV) · `supply-f1-verify.mjs` §1 | ✅ destino `PEDIDO` con `pedidoNumero`, `clienteId`, cantidad = lo pendiente |
| Promesa de entrega → `ORDER_COMMITTED` y prioridad por la fecha | `supply-needs.mjs` §6 · `supply-f1-verify.mjs` §1 | ✅ promesa a 36 h → prioridad `ALTA` |
| Cantidad vendida > stock (venta offline) → `QUANTITY_OVER_STOCK` por la **diferencia** | `supply-f1-verify.mjs` §2 | ✅ stock 2 y venta de 5 → necesidad de **3** |
| Reserva sin unidad → `RESERVATION_NO_STOCK` **solo la diferencia** | `supply-needs.mjs` §6 · `supply-f1-verify.mjs` §3 | ✅ 1 unidad existente + pedido de 3 → necesidad de **2** |
| Reserva de una unidad existente → **no** genera compra | `supply-f1-verify.mjs` §4 | ✅ reserva simple 201 sin necesidad; pedir faltante cubierto → 400 explicativo |
| Bajo punto de reposición → `BELOW_REORDER` (una por producto/sucursal/semana) | `supply-needs.mjs` §6 · `supply-automation.mjs` (F6) | ✅ grupo con origen `BELOW_REORDER` |
| Dedupe: repetir el evento no duplica | `supply-needs.mjs` §6 (reintento idempotente) | ✅ mismas necesidades tras el reintento |
| La demanda **no crea stock** (solo la recepción) | `supply-f1-verify.mjs` §§1–2 | ✅ el stock sigue en 0 tras la necesidad |
| Auditoría de la demanda automática | `supply-f1-verify.mjs` §1 | ✅ `SUPPLY_NEED_AUTO` con la necesidad |
| **Permiso del cliente**: nombre solo con `customers:manage`/`*` | `supply-customer.mjs` (7 chequeos) · `supply-customer.test.ts` | ✅ el dueño ve el nombre; comprador recortado ve `clienteId` + `clienteOculto` |
| El vínculo con el cliente no se pierde al ocultar el dato | `supply-customer.test.ts` · `supply-customer.mjs` | ✅ `clienteId` viaja siempre y `clienteOculto` lo explica |

## Corrida (26/09/2026)

```bash
npm --prefix backend run test:unit                   # 107 ✓
MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh
# PASS: necesidades manuales + motor automático + consolidación … · 43 chequeos
# PASS: cliente con permiso en la tarjeta de necesidad · 7 chequeos
# PASS: vínculo venta/reserva → necesidad sin crear stock · 17 chequeos
# PASS: aislamiento, niveles de token, … abastecimiento … y logout
```

- **Backend unit 107 ✓** (incluye `supply-demand` del motor y `supply-customer` del permiso).
- **Arnés HTTP completo en verde**; `supply-needs` (INV, 43 chequeos) intacto.
- `npm run lint` 0 errores · build backend con `BUILD_ID` ✓.

## Hallazgos

- **Contrato útil documentado:** pedir faltante por reserva cuando los seriales ya cubren la cantidad responde **400** con «…no hay faltante que comprar» — evita necesidades fantasma desde el panel. Queda cubierto en `supply-f1-verify.mjs`.
- **Sin hallazgos de producto** en el vínculo ni en los permisos; la UI del panel (tarjeta/«Por comprar») es de PLT y consume el contrato documentado (`clienteId` siempre; `cliente` con permiso; `clienteOculto`).
- Pendiente de fases siguientes: la recepción es la única que crea stock (F5) y la compra cubre la necesidad (F2), ya verificado por INV.
