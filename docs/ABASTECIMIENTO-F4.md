# Centro de Abastecimiento · Fase 4 (lotes y tránsito) — spec técnica

Sobre [F1](ABASTECIMIENTO-F1.md)–[F3](ABASTECIMIENTO-F3.md) (#250 §2, §7, §8 y
§11): una compra puede viajar en **varios lotes** con métodos distintos, cada uno
con su **manifiesto y QR**, la **máquina de estados** hasta el tránsito, el
**historial por unidad** y la regla de que una **compra externa es un envío
entrante, nunca un traslado interno**. Sin UI y **sin tocar stock**: la recepción
es la Fase 5.

## 1. Modelo (migración aditiva `20261129000000_supply_shipments`)

| Tabla | Para qué |
|---|---|
| `SupplyShipment` | lote: `code` compartido (`ENV-CDE-ASU-0021`), compra, origen, destino (sucursal), método, empresa/conductor/guía, responsable, ETA, salida, llegada, `status`, notas y **`publicToken`** (QR del manifiesto) |
| `SupplyShipmentItem` | una fila por **unidad** del lote: línea de compra, producto, `serial` (o `null` = IMEI pendiente) y estado de la unidad (F5 lo usa para faltantes/daños) |

Un serial no puede viajar en dos lotes (`@@unique(tenantId, serial)`); los
pendientes conviven (NULL). Los adjuntos del lote usan la API existente
(`entity=SUPPLY_SHIPMENT`).

## 2. Estados y transiciones

`BORRADOR → PREPARANDO → DESPACHADO → EN_TRANSITO` (+ `CON_INCIDENCIA`,
`CANCELADO`); `RECEPCION_PARCIAL` y `RECIBIDO` **los resuelve la recepción (F5)**
y la API los rechaza con un mensaje claro. Toda transición se valida
(`transicionEnvioValida`) y deja auditoría.

## 3. API (`stock:manage`)

| Método | Ruta | Qué hace |
|---|---|---|
| `GET` | `/api/supply/shipments` | lotes con compra, destino y unidades (`conImei`/`pendientes`); filtros `status`, `purchaseId`, `method` |
| `POST` | `/api/supply/shipments` | crea el lote: `purchaseId`, `origin`, `destinationBranchId?`, `method` (BUS/TRANSPORTADORA/AEX/IMPORTACION), `company/driver/guide?`, `responsibleId?`, `etaAt?`, `notes?` y `lines?` (por línea o todo lo que falta) |
| `PATCH` | `/api/supply/shipments` | `prepare` · `dispatch` (exige guía o empresa, guarda `sentAt`) · `transit` · `incidencia` (motivo) · `cancel` (motivo) · `status` (transición validada) |
| `GET` | `/api/supply/shipments/:id/manifest` | manifiesto (§11): código, origen/destino, método, empresa/conductor/guía, responsable, compra, unidades, IMEI conocidos/pendientes por producto y **enlace del QR** |
| `GET` | `/api/public/supply/shipments/:token` | manifiesto público (QR, sin sesión, con rate limit): sin costos, sin proveedor, sin cliente |
| `GET` | `/api/supply/serials/:serial` | **historial por unidad**: en stock o en la cadena (necesidad → compra → lote → estado) |

- **Compras externas = envío entrante**: no se crea ningún `StockTransfer` (el
  arnés lo verifica comparando traslados antes/después).
- **Auditoría**: `SUPPLY_SHIPMENT_CREATED` · `…_DISPATCHED` · `…_INCIDENT` ·
  `…_CANCELLED` · `…_UPDATED` (área Abastecimiento).

## 4. Tests

- Unit `backend/tests/supply.test.ts`: `codigoEnvio`, máquina de estados,
  `expandirItemsEnvio` (IMEI conocido primero, pendientes después, sin repetir lo
  que ya viaja) y `manifiestoEnvio` (n de N por producto, enlace del QR).
- Arnés HTTP `backend/tests/supply-shipments.mjs` (**31 chequeos**): dos lotes
  para una compra (bus e importación), sin traslados internos, transiciones
  (incluye despacho sin guía → 400 y recepción forzada → 409), manifiesto con QR
  público (y sin proveedor), historial del serial, incidencia/cancelación y
  stock intacto.
- `MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh` → **PASS**
  (F1 22 + F2 25 + F3 28 + F4 31 chequeos); `db:check` verde.

## 5. Para la próxima ronda

- **F5 (recepción)**: escaneo vs manifiesto, parciales, incidencias por unidad,
  elección de depósito y alta en stock (recién ahí nace el `InventoryUnit`).
- **PRN**: el manifiesto y la etiqueta de preparación ya tienen contrato; falta
  el layout térmico/A4 (mismo trato que el informe de dispositivo).
- Los estados `RECEPCION_PARCIAL`/`RECIBIDO` quedan definidos y bloqueados hasta
  F5.
