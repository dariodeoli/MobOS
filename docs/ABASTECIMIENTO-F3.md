# Centro de Abastecimiento · Fase 3 (IMEI y preparación) — spec técnica

Sobre [F1](ABASTECIMIENTO-F1.md) y [F2](ABASTECIMIENTO-F2.md) (#250 §7 y §11):
completa los IMEI de una compra con **escaneo de a uno** (mobile) o **pegado
múltiple**, con el **cuadre del lote**, el **IMEI diferido** y las **etiquetas de
la preparación**. Sigue **sin UI** (la API y el contrato de etiquetas quedan
listos) y sin tocar stock.

## 1. Cuadre del lote (una sola regla)

`cuadrarSeriales()` (`backend/lib/supply.ts`) es el paso obligatorio de las dos
formas de carga:

| Regla | Detalle |
|---|---|
| Normalización | trim, mayúsculas, 64 caracteres máximo; acepta lista o texto pegado (comas, espacios, saltos) |
| **Luhn** | en los IMEI de 15 dígitos; un dígito cambiado se rechaza |
| Seriales de producto | ≥4 alfanuméricos con guiones (los que no son IMEI viajan tal cual) |
| **Repetidos en el lote** | se rechaza el serial repetido dentro del mismo pedido de carga |
| **Ya cargado en la línea** | se rechaza (no duplica) |
| **Cantidad vs comprada** | nunca más IMEI que las unidades de la línea |
| **Duplicado global** | 409 si el serial ya está en otra compra o en el inventario |

## 2. API (sobre `/api/supply/purchases`)

| Acción | Contrato |
|---|---|
| `PATCH { action: 'scan', lineId?, productId?, serial }` | escaneo de a uno: agrega el IMEI a la línea (por `lineId` o por `productId`, eligiendo la línea con lugar) y devuelve `{ agregados, aviso? }` |
| `PATCH { action: 'serials', lineId, serials }` | pegado múltiple (mismo cuadre) |
| `GET ?pendientes=1` | compras con IMEI por completar; cada línea trae `faltan` y los totales `pendientes` |
| `GET /api/supply/purchases/:id/labels` | etiquetas de la preparación (abajo) |

- **Aviso de modelo (no bloquea)**: si el IMEI escaneado ya fue consultado en el
  panel del proveedor (`imeiCheckQuery.normalized` → `modelo`), se compara con el
  modelo del producto de la línea (`compararModelo`, tolerante a mayúsculas y
  texto extra) y la respuesta trae `aviso` cuando no coincide.
- **IMEI diferido**: la compra puede nacer sin seriales y completarse antes de
  despachar; el filtro `pendientes` y `faltan` alimentan la pantalla de
  preparación.
- **Auditoría**: cada carga (escaneo o pegado) deja
  `SUPPLY_PURCHASE_SERIALS_ADDED` con `via: 'scan' | 'bulk'`, la línea y cuántos
  seriales entraron.

## 2-bis. IMEI diferido por lote (lotes de F4)

Los momentos del plan §7 son **compra · antes de despachar · recepción**. La
compra ya completa sus IMEI (`PATCH /api/supply/purchases`); ahora el lote
también:

| Acción | Contrato |
|---|---|
| `PATCH /api/supply/shipments { id, action: 'serials', serials, itemId? }` | completa unidades **pendientes** del lote (pegado múltiple) |
| `PATCH /api/supply/shipments { id, action: 'scan', serial, itemId? \| lineId? \| productId? }` | escaneo de a uno; elige las pendientes por línea o producto |

- **Mismo cuadre**: Luhn, repetidos en el pedido, duplicado en otro lote o en el
  inventario, y cantidad ≤ pendientes.
- **Consistencia con la compra**: si el IMEI ya está en la línea del lote se
  reutiliza; si es nuevo se agrega a esa línea cuando todavía tiene lugar; si
  pertenece a otra línea de la compra se rechaza.
- **Auditoría**: `SUPPLY_SHIPMENT_SERIALS_ADDED` (via, items, cuántos entraron a
  la compra). El despacho informa en su auditoría cuántos IMEI siguen
  pendientes; la recepción (F5) sigue pudiendo completarlos.
- No mueve stock; el manifiesto pasa a `pendientes: 0` cuando el lote se completa.
- **Panel**: la pestaña **Preparar lote** (`/preparar-lote`, `supply/PrepararLote.jsx`)
  lista los lotes con `GET /api/supply/shipments?pendientes=1` (cada item viaja con
  su producto), agrupa las pendientes por línea y carga escaneando de a uno,
  con cámara o pegando varios, con la validación previa de `lib/escanerSeriales.js`.

## 3. Etiquetas de la preparación (contrato para PRN, §11)

`GET /api/supply/purchases/:id/labels` devuelve:

```json
{
  "compra": { "code": "COM-CDE-0048", "referencia": "FAC-001-002", "proveedor": "…", "destino": "Casa Central" },
  "resumen": { "unidades": 12, "conImei": 9, "pendientes": 3 },
  "etiquetas": [{
    "n": 3, "total": 12,
    "producto": "iPhone 15 Pro Max", "capacidad": "256GB", "condicion": "NEW",
    "imei": "…", "pendiente": false,
    "compra": "COM-CDE-0048", "referencia": "FAC-001-002",
    "pedido": "MOB-0048", "destino": "Casa Central", "lote": null
  }]
}
```

- Una etiqueta **por unidad** con `PRODUCTO n DE N`, modelo/variante, IMEI o
  «pendiente», la compra, el pedido vinculado y el destino.
- **PRN**: el layout del papel (etiqueta térmica / 80 mm) ya está implementado
  (`datosEtiquetaLote` + `ticketEtiquetasLote` + `buildEtiquetasLoteHtml`;
  contrato y adopción en [ETIQUETAS-LOTE.md](ETIQUETAS-LOTE.md)); este payload
  es el contrato (mismo criterio que el informe de dispositivo).

## 4. Tests

- Unit `backend/tests/supply.test.ts`: `cuadrarSeriales` (Luhn, repetidos, ya
  cargados, cantidad), `compararModelo`, `etiquetasPreparacion` (n de N, IMEI o
  pendiente, pedido/destino) y `resumenPreparacion`.
- Arnés HTTP `backend/tests/supply-shipments.mjs` (**41 chequeos**): lotes,
  manifiesto y **IMEI diferido del lote** (asignar al despachar con Luhn,
  duplicados, inventario y consistencia con la compra).
- Arnés HTTP `backend/tests/supply-preparation.mjs` (**28 chequeos**): compra con
  IMEI diferido, filtro `pendientes`, etiquetas 3 de 3, escaneo por línea y por
  producto, pegado múltiple, cuadre completo (400/404/409), aviso de modelo con
  la conciliación, auditoría del escaneo, permisos y **stock intacto**.
- `MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh` → **PASS** (F1 22 +
  F2 25 + F3 28 chequeos).
