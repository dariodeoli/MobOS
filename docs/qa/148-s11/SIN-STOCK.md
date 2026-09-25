# Épica #148 — §11: venta sin stock / sin IMEI: causa raíz y estado

## El reporte

Con un producto **agotado** (o sin IMEI elegido) el POS no dejaba crear la orden **aunque la
línea estuviera marcada «vender sin IMEI (sobre pedido)»**: el guardado cortaba con el genérico
«Stock insuficiente: …». En producción, agregar el iPhone de la demo (serializado, sin IMEI
elegido) y guardar mostraba *«Stock insuficiente: iPhone 15 Pro Max 256GB Titanio Natural.»* en
lugar de la guía de IMEI.

## Causa raíz (tres capas)

1. **POS · chequeo de stock**: `guardar()` sumaba cantidades por producto y comparaba contra el
   contador **sin mirar `sobrePedido`** → tiraba «Stock insuficiente: X» aun marcada. El mismo
   chequeo rompía el «vender igualmente» al retomar un borrador (`recuperarSuspendida` marca
   `sobrePedido` antes de guardar).
2. **Backend · sin flujo marcado para productos sin serial**: la venta «sobre pedido» solo
   existía para serializados (`serialsPending`); una línea de producto sin serial no tenía flag
   ni traza, así que se descontaba stock igual y, si no alcanzaba, `changeStock` devolvía el
   genérico *«Stock insuficiente o producto fuera de la sucursal.»*.
3. **POS · detección de unidades**: `detectarUnidades` consultaba por SKU, pero
   `/api/inventory-units` normaliza el `q` con `serialKey` (**saca guiones**): un SKU como
   `E2E-IPHONE15` no encontraba sus unidades → la línea **no pedía IMEI** ni mostraba guía (el
   chequeo de stock genérico era lo único que aparecía). La búsqueda por SKU en Inventario tenía
   el mismo agujero.

## Qué cambió

- **POS** (`FormularioVenta.jsx`): el chequeo de stock ignora las líneas marcadas «sobre pedido»
  y las serializadas (su disponibilidad la gobierna el selector de unidades, no el contador); la
  línea marcada viaja con `backorder: true`; los avisos dicen qué hacer:
  `Sin stock de X: marcalo como «sobre pedido» para crear el pedido igual.` y
  `Seleccioná el IMEI/serial exacto de cada equipo antes de vender (…), o marcalo como «sobre pedido».`
- **Backend** (`/api/orders`): la línea marcada se guarda con **`stockPending`** (columna nueva,
  migración aditiva) y **no descuenta stock**; `serialsPending` sigue igual para serializados; el
  tramo pendiente tampoco descuenta (`decrementBy = quantity - serialsPending - stockPending`). El
  error de stock del backend ahora nombra el producto y la salida: *«Sin stock de X en esta
  sucursal: marcala como «sobre pedido» para vender sin unidad.»*
- **Unidades** (`/api/inventory-units`): el `q` también matchea el **SKU crudo** (además del
  normalizado). Arregla la detección del POS y la búsqueda por SKU en Inventario.
- **Guía inline** (`PasoCobro.jsx`, `data-testid="guia-venta"`): lista las líneas que bloquean
  con su acción — **Elegir unidad (N)** cuando hay unidades disponibles, **Vender sin IMEI** /
  **Sobre pedido** cuando no — y aclara que «Crear pedido» la registra sin unidad y se completa
  al entregar.
- **Pedidos**: el detalle (`PedidoDetalle`) y la lista del día (`ListaVentasDia`) muestran
  **«N sobre pedido»** para las líneas con `stockPending`.
- **Kardex** (`backend/lib/kardex.ts`): las unidades pendientes sin serial no cuentan como salida
  (ni reponen al anular), igual que los IMEI pendientes.

## Reglas (para no volver a romperlo)

- **Serializado**: manda el selector de unidades. Con unidades disponibles **no se vende sin
  IMEI** (el backend lo rechaza con el mismo texto de la guía); sin unidades, la línea se marca
  «sobre pedido» (`serialsPending`).
- **Sin serial y sin stock**: la venta sigue; la línea queda «sobre pedido» (`stockPending`) y no
  descuenta stock.
- **Con stock**: todo igual que antes (la línea no se marca y el contador se descuenta).
- El **contador no decide** sobre líneas serializadas (el estado «Agotado» sale del selector).

## Evidencia

- e2e `e2e/pos-148-s11-sin-stock.spec.js` (3 casos): la línea marcada crea el pedido con
  `stockPending = 1` y el stock intacto; sin marcar, el aviso es claro (no el genérico) y no se
  crea nada; con unidad disponible la guía manda a elegirla y **no** ofrece «Vender sin IMEI».
- Guards POS en verde (52 tests: `pos-qa-173`, `pos-241-carrito-estados`, `qa-249-pos-touch`,
  `pos-checkout`, `pos-241-v2`, `demo-anonimo`) + smoke 19/19; `npm test` 699 y backend 75;
  builds FE/BE con `BUILD_ID`; `npm run db:check` sin diferencias.
- Capturas (sonda `scripts/qa-148-s11-sin-stock.mjs`, 4 vistas × 8):
  - **Después**: `docs/qa/148-s11/sin-stock/rama-148-s11/` — `a1` aviso claro de stock,
    `a2` guía con «Sobre pedido», `a3` fila marcada, `a4` pedido creado; `b1` aviso de IMEI,
    `b2` guía con «Elegir unidad (2)», `b3` selector de unidad, `b4` venta creada.
  - **Antes**: `docs/qa/148-s11/sin-stock/produccion-antes/` — el genérico «Stock insuficiente:
    …» sin guía y sin venta.

## Higiene de datos

- Migración `backend/prisma/migrations/20261202000000_order_item_stock_pending` (aditiva,
  `ADD COLUMN IF NOT EXISTS`), `npm run db:check` ✓ (la base e2e con la migración aplicada
  coincide con `schema.prisma`).

## Pendiente (para el orquestador)

- **Entrega de una línea «sobre pedido» sin serial**: hoy el pedido se registra sin descontar
  stock y no hay acción «entregar» que lo descuente al llegar la mercadería (los serializados la
  tienen vía «adjuntar IMEI»). Propuesta: issue nuevo (dominio Pedidos/POS) con la acción
  «Entregar línea sobre pedido» (descuento + auditoría + kardex).
- **Demo**: el checkbox «Vender sin IMEI (sobre pedido)» del modal queda habilitado en la demo
  aunque haya unidades listadas (`unidadesDeImei` se fuerza a 0 en demo); el backend real no lo
  permite. Es una diferencia de la demo, no del flujo real.
