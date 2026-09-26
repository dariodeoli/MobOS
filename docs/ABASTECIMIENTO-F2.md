# Centro de Abastecimiento · Fase 2 (compra rápida + stock adicional) — spec técnica

Continuación de [ABASTECIMIENTO-F1.md](ABASTECIMIENTO-F1.md) (#250 §6): registra
**lo comprado** — cantidades, proveedor, costo/moneda, referencia/factura e
**IMEI ahora o pendientes** — cubre las necesidades del panel y suma la
**compra adicional** (reposición libre, sin cliente). Sigue **sin UI**: la API
queda lista para el panel de la próxima ronda.

## 1. Regla dura

**Nada pasa a stock disponible antes de la recepción** (F5). Ni la compra ni la
carga de IMEI ni el despacho (F4) tocan `Product.stock` ni crean
`InventoryUnit`. El test del arnés lo verifica comprando, cargando IMEI y
cancelando: el stock queda igual.

## 2. Modelo (migración aditiva `20261128000000_supply_purchases`)

| Tabla | Para qué |
|---|---|
| `SupplyPurchase` | cabecera: `code` compartido (`COM-CDE-0048`), proveedor (ficha + snapshot), `currency`/`originalCost`/`exchangeRatePyg`/`costPyg`, `reference` (factura/orden del proveedor), `notes`, `status`, autor y fechas |
| `SupplyPurchaseLine` | una por producto + condición: cantidad, `unitCostPyg?` y `needId?` (null = **compra adicional / reposición libre**) |
| `SupplyPurchaseSerial` | IMEI/serial de cada línea, único por empresa (se pueden completar después) |
| `SupplyNeed.purchaseId` | con qué compra se resolvió (el panel muestra el código) |

Estados de la compra: F2 usa **COMPRADA** y **CANCELADA**; F4 suma
`PREPARANDO`/`EN_TRANSITO` y F5 `RECIBIDA`.

## 3. API (`stock:manage`)

| Método | Ruta | Qué hace |
|---|---|---|
| `GET` | `/api/supply/purchases` | lista con líneas, IMEI y necesidades; filtros `status`, `supplierId`, `branchId`, `limit` |
| `POST` | `/api/supply/purchases` | crea la compra: proveedor (ficha o nombre), costo/moneda, referencia, líneas con `needId?`, `quantity`, `condition?`, `unitCostPyg?`, `serials?` (lista o texto pegado) y `code?`/`origin?` opcionales |
| `PATCH` | `/api/supply/purchases` | `cancel` (motivo; devuelve las necesidades a «Por comprar») o `serials` (completa IMEI de una línea) |

- El **código** se genera correlativo por empresa (`codigoCompra` → `COM-<centro>-0001`)
  o se acepta el que mande el cliente.
- Las **necesidades cubiertas** pasan a `COMPRADA` con `purchaseId`; el panel
  «Por comprar» deja de mostrarlas y aparecen con `?status=COMPRADA`.
- **Costo**: usa las reglas compartidas (`normalizarCosto`): PYG entero, USD con
  2 decimales y cotización obligatoria; `costPyg` se calcula en el servidor. Es
  **opcional** (una compra puede registrarse sin monto y completarse al recibir
  la factura).
- **IMEI**: acepta lista o texto pegado; valida **Luhn** en los IMEI de 15
  dígitos, descarta repetidos dentro de la compra y rechaza (409) los que ya
  están en otra compra o en el inventario; nunca más seriales que unidades. Si
  no vienen, la línea queda **pendiente** y se completa con `PATCH serials`.
- **Foto de la factura**: se adjunta con la API de adjuntos existente
  (`entity=SUPPLY_PURCHASE`, `entityId=<compra>`) — se sumó la entidad a la
  allow-list con los roles de compras y el chequeo por sucursal.
- **Auditoría**: `SUPPLY_PURCHASE_CREATED` · `SUPPLY_PURCHASE_CANCELLED` ·
  `SUPPLY_PURCHASE_SERIALS_ADDED` (área **Abastecimiento**).

## 4. Compra adicional

Las líneas sin `needId` son la **reposición libre** del «+ Agregar compra
adicional»: no tienen cliente ni pedido, pueden ir con IMEI o pendientes y
quedan valuadas por el costo de la compra (o `unitCostPyg` por línea).

## 4-bis. Compra parcial (cierre F2)

Una línea con `needId` puede comprar **menos, igual o más** que la necesidad:

- `SupplyPurchaseLine.coveredQuantity` guarda cuánto de la necesidad cubre la
  línea (migración aditiva `20261206000000_supply_purchase_line_covered`).
- La necesidad descuenta siempre lo cubierto: **parcial** deja el resto en
  «Por comprar» (sigue abierta y vinculada a la compra, con auditoría
  `SUPPLY_NEED_PARTIAL_PURCHASED`); **completa** queda en 0 y `COMPRADA`.
- Comprar de más deja el excedente como **reposición libre** (la línea conserva
  las unidades compradas y el `extra` viaja en la auditoría de la compra).
- **Cancelar** la compra devuelve exactamente lo cubierto: la necesidad vuelve al
  panel con su cantidad original (y `ABIERTA` si estaba `COMPRADA`); la cuenta a
  pagar de FIN se resuelve igual que antes.
- Una misma necesidad no puede repetirse en dos líneas de la misma compra.
- La consolidación ya no infla a 1 una necesidad cubierta (cantidad 0).

## 4-ter. «+ Agregar compra adicional» (`PATCH action:'addLines'`)

Agrega líneas a una compra **activa** (COMPRADA) sin crear otra compra:

- Líneas sin `needId` → **reposición libre**; con `needId` → cobertura
  parcial/completa como en el alta (misma auditoría y descuento de la demanda).
- Valida: compra activa; **sin cuenta a pagar** y **sin lotes preparados**
  (esas líneas van en una compra nueva, para no mover plata ni manifiestos ya
  emitidos); productos/necesidades existentes y sin repetir una necesidad en la
  compra; IMEI válidos/únicos (global y contra el inventario).
- Audita `SUPPLY_PURCHASE_LINES_ADDED` con líneas, unidades, libres y seriales.
- No mueve stock (regla dura) y el GET expone **`libreQuantity`** por línea
  (excedente de una línea con necesidad, o toda la cantidad si es libre).

## 5. Tests

- Unit `backend/tests/supply.test.ts`: `codigoCompra`, `normalizarSeriales`
  (Luhn, repetidos, texto pegado) y `normalizarCompra` (proveedor, moneda/costo,
  líneas, IMEI pendientes, límites).
- Arnés HTTP `backend/tests/supply-purchases.mjs` (**59 chequeos**): compra en
  USD con referencia + línea que cubre una necesidad con IMEI + compra adicional
  sin IMEI; necesidad cubierta/visible por estado; **stock intacto**; duplicados
  (otra compra / inventario); completar IMEI pendiente; 400/401/403/404/409;
  cancelación que devuelve la necesidad al panel; y **compra parcial**: 5
  pedidas → compra 2 (quedan 3 en «Por comprar») → completa con otra compra →
  excedente libre → duplicar la necesidad en la misma compra (400) → cancelar
  devuelve lo cubierto; y **líneas adicionales**: compra sin costo → addLines con
  reposición libre + necesidad pendiente, validaciones (repetida/cuenta
  a pagar/cancelada) y `libreQuantity` del excedente.
- `MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh` → **PASS**;
  `npm run db:check` verde con la migración aplicada.

## 6. Pendiente / decisiones para la revisión de Dario

- **Puente con Compras**: la compra del Centro vive en su propio registro
  (necesita IMEI por línea, condición y estados de lote que `PurchaseOrder` no
  tiene). Cuando Dario confirme, se puede volcar a Compras para contabilidad y
  pago a proveedor (o hacer que Compras consuma estas tablas).
- F3 (escaneo de IMEI y etiquetas), F4 (lotes/envíos) y F5 (recepción) siguen
  sin empezar; el `PATCH serials` ya deja el gancho para completarlos.
- La foto de la factura se adjunta después de crear la compra (la UI lo hará en
  un paso); si se prefiere en el mismo POST, se agrega `multipart` en F3.
