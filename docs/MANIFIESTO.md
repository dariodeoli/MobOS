# Manifiesto del envío (#250 §11) — contrato

El papel que **viaja con el lote**: código grande (`ENV-…`), recorrido,
método/empresa/conductor/guía, responsable, los productos con sus IMEI conocidos
y las unidades pendientes, y el QR de recepción. De la misma data salen las
**etiquetas por unidad del lote** (`N de M`), con el código del envío.

## 1. De dónde salen los datos

`GET /api/supply/shipments/[id]/manifest` (INV, F4) devuelve `manifiestoEnvio`
(`backend/lib/supply.ts`) + `proveedor`:

```
{ code, origen, destino, metodo, metodoLabel, empresa, conductor, guia,
  responsable, estado, salida, eta, llegada, compra, unidades, conImei,
  pendientes, lineas: [{ producto, capacidad, condicion, cantidad, imeis[],
  pendientes }], enlace, notas, proveedor }
```

- `enlace` ya viene armado como `<base>/envio/<publicToken>`; **la página pública
  está pendiente** (ver §4), así que el QR solo se imprime cuando quien llama
  pasa un `enlace` explícito (regla dura del §12 de `docs/IMPRESION.md`: nunca
  un QR muerto). Sin enlace, el papel imprime `ENV-…` en **barras** + «Escaneá
  para abrir el manifiesto del lote.».
- `lineas[].imeis` (conocidos) y `pendientes` (a completar en recepción).

### Pedido a INV (coordinación)

1. **Cerrar la ruta pública** `/envio/<token>` (página sin sesión con el
   manifiesto/estado del lote) o acordar la candidata `/m/<token>`; con eso el
   QR deja de ser contrato y el panel pasa el `enlace` real.
2. Opcional: `lineas[].pedido` (número de pedido vinculado) para imprimirlo en
   la etiqueta del lote; hoy la etiqueta imprime compra, destino y lote.

## 2. Datos normalizados

```js
import { datosManifiesto, etiquetasDeLote } from '@/lib/printing/manifiesto'

const datos = datosManifiesto(manifiesto, { emisor, enlace, ahora })
// code, estado (etiqueta), origen/destino/recorrido, metodo, empresa, conductor,
// guia, responsable, compra, proveedor, salida/eta (ISO + texto), notas,
// lineas ({ producto, capacidad, condicion, cantidad, imeis, pendientes }),
// resumen ({ lineas, unidades, conImei, pendientes }), enlace/enlacePublico.

const etiquetas = etiquetasDeLote(manifiesto)
// Mismo shape que consume `datosEtiquetaLote`: { n, total, producto, capacidad,
// condicion, imei|null, pendiente, compra, destino, lote } → «PRODUCTO n de M»
// con el código ENV-… en la etiqueta.
```

## 3. Cómo se imprime

| Documento | Builder | Salida |
| --- | --- | --- |
| **Manifiesto** (ESC/POS) | `ticketManifiesto(datos, { ancho })` en `tickets.js` | 80/58 mm: código grande, transporte, IMEI/pendientes, QR o barras y firmas (despachó / transportista) |
| **Manifiesto** (PDF) | `buildManifiestoHtml(datos, { format })` / `printManifiesto` en `OrderReceipt.jsx` | A4 (tabla con IMEI por línea) y rollo |
| **Etiquetas del lote** (`N de M`) | `etiquetasDeLote` + `ticketEtiquetasLote` / `buildEtiquetasLoteHtml` | Rollo 58/80 mm, una por unidad, con `Lote ENV-…` |
| Compartir imagen | `CompartirImagen` (objeto compartido, `docs/IMPRESION.md` §14) | PNG |

- Las firmas del manifiesto son **Despachó / responsable** y **Recibió el
  transportista**; en el rollo la flecha del recorrido va como `->` (CP850).
- El rollo largo (lotes grandes) es esperable: el manifiesto lista los IMEI para
  el control en la ruta.

## 4. Adopción del panel (pendiente de UI)

El panel de abastecimiento (CMP/INV) debe, en el envío:

1. Pedir el manifiesto (`/api/supply/shipments/[id]/manifest`).
2. Ofrecer «Imprimir manifiesto» con `ticketManifiesto` (impresora del tipo
   `manifiesto`) y «Imprimir etiquetas del lote» con `etiquetasDeLote` +
   `ticketEtiquetasLote`; «Descargar PDF»/«Compartir imagen» con
   `buildManifiestoHtml` + `CompartirImagen`.
3. Pasar `enlace` cuando la ruta pública esté cerrada.

## 5. Evidencia y tests

- Unit `src/lib/printing/manifiesto.test.js` (5): normalización, resumen,
  etiquetas `N de M` con el código del lote, ticket (IMEI, pendientes, firmas,
  barras/QR) y manifiesto vacío.
- Ejemplo imprimible: `docs/manifiesto-ejemplo/` (A4, rollo 80, ESC/POS,
  etiquetas del lote y variante con QR decodificado → `/envio/<token>`) y
  `scripts/ejemplo-manifiesto.mjs`.
- Reglas de impresión: `docs/IMPRESION.md` §12.
