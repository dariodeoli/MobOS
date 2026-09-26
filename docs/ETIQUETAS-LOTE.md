# Etiquetas del lote (#250 Fase 3 §11) — contrato

Una etiqueta **por unidad comprada** para la preparación del envío: `PRODUCTO
n DE N`, modelo y variante, el **IMEI** (o «pendiente» si todavía no se cargó),
la compra, el pedido vinculado, el destino y el lote. Es la pieza que acompaña
al papel de preparación; el manifiesto y la lista de compra son aparte.

## 1. De dónde salen los datos

`GET /api/supply/purchases/[id]/labels` (INV, F3) devuelve:

```
{ compra: { id, code, referencia, proveedor, destino },
  resumen: { unidades, conImei, pendientes },
  etiquetas: [{ n, total, producto, capacidad, condicion, imei, pendiente,
                compra, referencia, pedido, destino, lote }] }
```

- `etiquetasPreparacion` (backend) ya asigna una etiqueta por unidad y reparte
  los seriales cargados; `imei: null` + `pendiente: true` cuando falta cargarlo.
- `pedido` llega cuando la línea cubre una venta/reserva; `lote` cuando la
  compra ya tiene un envío asignado.

## 2. Datos normalizados

```js
import { datosEtiquetaLote, contextoEtiquetaLote } from '@/lib/printing/etiquetaLote'

const datos = datosEtiquetaLote(etiqueta, { compra })
// { numero, total, posicion: '3 de 12', producto, capacidad, condicion
//   ('Seminuevo'), imei, pendiente, compra, referencia, pedido, destino, lote,
//   codigo, codigoRotulo }
```

- **Código de barras:** el `imei` cuando ya está cargado; si no, el `lote`
  (`ENV-…`) y, en su defecto, la `compra` (`COM-…`). `codigoRotulo` dice cuál es
  (`IMEI` · `LOTE` · `COMPRA`) para que el operador sepa qué escanea.
- Etiqueta incompleta (sin producto/compra): no rompe; sale `Producto`, `1 de 1`
  y sin barras.

## 3. Cómo se imprime

| Camino | Función | Salida |
| --- | --- | --- |
| Térmica directa (agente) | `ticketEtiquetasLote(etiquetas, { ancho, compra })` en `tickets.js` | ESC/POS 58/80 mm, un corte por unidad |
| Diálogo / PDF / imagen | `buildEtiquetasLoteHtml(etiquetas, { ancho, compra })` en `OrderReceipt.jsx` | Rollo 58/80 mm (una página por etiqueta) |
| Compartir como imagen | `CompartirImagen` (objeto compartido, `docs/IMPRESION.md` §14) | PNG para WhatsApp/descarga/portapapeles |

- La etiqueta pendiente se marca en amarillo («PENDIENTE · Se carga antes de
  despachar») y su código cae al lote/compra.
- Aviso del pie: «Escaneá el código en la preparación y el despacho.» o, si
  falta el IMEI, «Unidad sin IMEI: completalo antes de despachar.»

### Etiquetas del lote (`N de M`, desde el manifiesto)

Cuando la impresión sale del **envío** (no de la compra), las etiquetas se
derivan del manifiesto: `etiquetasDeLote(manifiesto)` (en `manifiesto.js`)
devuelve el mismo shape por unidad con `lote: ENV-…` y `n de M` calculado sobre
las unidades **del lote** (los IMEI conocidos primero y las pendientes después).
Se imprimen con los mismos builders (`ticketEtiquetasLote` /
`buildEtiquetasLoteHtml`) y muestran «Lote: ENV-…». Ejemplo:
`docs/manifiesto-ejemplo/etiquetas-lote-80mm.pdf`.

## 4. Adopción del panel (pendiente de UI)

El panel de abastecimiento (CMP) debe, en la pestaña de preparación de una
compra:

1. Pedir las etiquetas (`/api/supply/purchases/[id]/labels`).
2. Ofrecer «Imprimir etiquetas» con `ticketEtiquetasLote` (impresora del tipo
   `etiquetas-lote`) y «Descargar PDF»/«Compartir imagen» con
   `buildEtiquetasLoteHtml` + `CompartirImagen`.
3. Respetar el resumen (`unidades · conImei · pendientes`) antes de despachar.

## 5. Evidencia y tests

- Unit `src/lib/printing/etiquetaLote.test.js` (4): normalización, fallback del
  código y del destino, etiqueta incompleta y ticket ESC/POS (dos unidades, dos
  cortes, 58 mm).
- Ejemplo imprimible (HTML 80 mm, ESC/POS y PNG compartible):
  `docs/etiquetas-lote-ejemplo/` y `scripts/ejemplo-etiquetas-lote.mjs`.
- Reglas de impresión: `docs/IMPRESION.md` §12 (estado) y §13 (tokens v2).
