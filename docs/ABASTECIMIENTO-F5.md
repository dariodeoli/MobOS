# Centro de Abastecimiento · Fase 5 (recepción) — spec técnica

Cierre del flujo de #250: **llegadas pendientes** (por el QR del manifiesto o
desde el panel), **escaneo contra lo esperado**, faltantes/sobrantes/dañados/
incorrectos con nota y foto, **depósito destino** y **alta en stock solo al
confirmar**. Sobre [F1](ABASTECIMIENTO-F1.md)–[F4](ABASTECIMIENTO-F4.md).

## 1. Modelo (migración aditiva `20261130000000_supply_receptions`)

| Tabla | Para qué |
|---|---|
| `SupplyReception` | la recepción de un lote: envío, depósito (`locationId`), estado (`BORRADOR` · `CONFIRMADA` · `CANCELADA`), quién y cuándo recibió |
| `SupplyReceptionItem` | una fila por unidad: la unidad esperada del manifiesto (`shipmentItemId`, null en sobrantes), `serial`, `resultado` (`RECIBIDO` · `FALTANTE` · `SOBRANTE` · `DANADO` · `INCORRECTO`) y `nota` |

Las fotos de las incidencias usan la API de adjuntos
(`entity=SUPPLY_RECEPTION`, `entityId=<item>`).

## 2. API (`stock:manage`)

| Método | Ruta | Qué hace |
|---|---|---|
| `GET` | `/api/supply/receptions?pendientes=1` | **Llegadas pendientes**: lotes en `DESPACHADO`/`EN_TRANSITO`/`CON_INCIDENCIA`/`RECEPCION_PARCIAL` con lo esperado (IMEI conocidos/pendientes), la ETA y el **depósito sugerido** (el último usado en la sucursal) |
| `GET` | `/api/supply/receptions?id=` (o listado) | detalle con los esperados y el resumen por resultado |
| `POST` | `/api/supply/receptions` | abre (o **retoma**) la recepción de un lote por `shipmentId`, `code` o **`token` del QR del manifiesto**; valida que el lote esté en camino y el depósito sea de la sucursal destino |
| `PATCH` | `/api/supply/receptions` | `scan` (IMEI contra lo esperado: completa IMEI diferido o marca **sobrante**), `item` (dañado/incorrecto/faltante **con nota**), `confirm` y `cancel` |

- **Escaneo**: el IMEI que coincide con el manifiesto entra como `RECIBIDO`; un
  IMEI nuevo **completa una unidad con IMEI diferido**; lo que no estaba es
  `SOBRANTE`. Un IMEI ya escaneado se rechaza; los códigos se validan (Luhn).
- **Al confirmar**: por cada unidad `RECIBIDO` se crea el `InventoryUnit`
  (sucursal destino + **depósito elegido**, condición y **costo** de la compra:
  unitario de la línea o parte proporcional), se suma el stock del producto y se
  audita `INVENTORY_UNIT_RECEIVED`. Lo esperado sin escanear queda `FALTANTE`
  (no entra al stock) y las incidencias quedan fuera del stock vendible.
- **Estado del lote**: `RECIBIDO` (todo ok) · `RECEPCION_PARCIAL` (faltantes) ·
  `CON_INCIDENCIA` (sobrantes/dañados/incorrectos).
- **Auditoría**: `SUPPLY_RECEPTION_STARTED/SCANNED/INCIDENT/CONFIRMED/CANCELLED`.

## 3. Tests

- Unit `backend/tests/supply.test.ts`: `compararEscaneo` (conocidos, IMEI
  diferido, sobrantes), `estadoLoteRecepcion`, `costoPorUnidad` (PYG/USD/unitario
  de línea) y `resumenRecepcion`.
- Arnés HTTP `backend/tests/supply-receptions.mjs` (**40 chequeos**):
  llegada pendiente con depósito sugerido, apertura por **token del QR** y
  retomada sin duplicar, escaneo sin crear stock, IMEI diferido completado,
  sobrante con nota (y sin nota → 400), confirmación (stock por unidad, costo,
  depósito, historial del serial), faltante → `RECEPCION_PARCIAL`, recepción
  cerrada → 409 y permisos/auditoría.
- `MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh` → **PASS**
  (F1 22 + F2 25 + F3 28 + F4 31 + F5 40 chequeos); `db:check` verde.

## 4. Estado de la épica #250 (F1→F5)

Flujo completo por API: **venta/reserva sin stock → necesidad → compra → lote →
recepción → stock disponible**, sin UI todavía y con la regla dura respetada: el
stock nace **solo** en la recepción confirmada.

Pendiente de producto: el **panel** (CMP ya tiene pedida la tanda de objetos) y
los **layouts de impresión** que faltan de PRN (manifiesto y etiqueta de
preparación; el **comprobante de recepción ya está implementado** —
[COMPROBANTE-RECEPCION.md](COMPROBANTE-RECEPCION.md)) y F6
(automatización/reposición sugerida).
