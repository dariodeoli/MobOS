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

## 5. Tests

- Unit `backend/tests/supply.test.ts`: `codigoCompra`, `normalizarSeriales`
  (Luhn, repetidos, texto pegado) y `normalizarCompra` (proveedor, moneda/costo,
  líneas, IMEI pendientes, límites).
- Arnés HTTP `backend/tests/supply-purchases.mjs` (**25 chequeos**): compra en
  USD con referencia + línea que cubre una necesidad con IMEI + compra adicional
  sin IMEI; necesidad cubierta/visible por estado; **stock intacto**; duplicados
  (otra compra / inventario); completar IMEI pendiente; 400/401/403/404/409; y
  cancelación que devuelve la necesidad al panel.
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
