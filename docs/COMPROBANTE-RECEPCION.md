# Comprobante de recepción (#250 Fase 5 §11) — contrato

El papel que firma el depósito cuando llega un lote: **lo que el manifiesto
decía que llegaba contra lo que entró**, con faltantes, sobrantes y dañados
(serial + nota), el depósito destino y quién/cuándo recibió. Hermano del
manifiesto y de la etiqueta de preparación del abastecimiento.

## 1. De dónde salen los datos

La fuente es `GET /api/supply/receptions?id=<id>` (INV, F5): devuelve

```
{ recepcion: { status, createdAt, receivedAt, notes,
    location: { code, name } | null,
    receivedBy: { id, name } | null,
    shipment: { code, origin, method, status, destinationBranch: { name },
      purchase: { code, supplierName?, lines: [{ id, productId, condition, quantity }] },
      items: [{ id, serial, productId, lineId }] },
    items: [{ id, shipmentItemId, serial, productId, resultado, nota }] },
  esperados: [...], resumen: { RECIBIDO, FALTANTE, SOBRANTE, DANADO, INCORRECTO } }
```

- `resultado` es uno de `RECIBIDO · FALTANTE · SOBRANTE · DANADO · INCORRECTO`;
  solo `RECIBIDO` entró al stock al confirmar (regla dura de F5).
- La API **no manda el nombre del producto**: el panel lo resuelve con los
  productos de la compra (o del catálogo) y los pasa al builder. Sin nombre, la
  línea cae al `productId` — nunca se inventa un nombre.

## 2. Datos normalizados

```js
import { datosComprobanteRecepcion } from '@/lib/printing/comprobanteRecepcion'

const datos = datosComprobanteRecepcion(recepcion, {
  productos,   // lista | objeto por id | Map: { id, name, capacity, color }
  emisor,      // empresa que emite (nombre visible)
  proveedor,   // si la respuesta no lo trae (la API de recepción no lo incluye)
  enlace,      // URL absoluta del panel; solo con esto se imprime el QR
  ahora,       // fecha de emisión (tests)
})
```

Devuelve: `compra`, `envio`, `proveedor`, `origen`, `destino`, `metodo`,
`deposito` (`D1 · Depósito 1`), `usuario`, `estado`
(`{ recepcion, etiqueta, lote, etiquetaLote }`), `recibidoEl`, `fecha`,
`fechaEmision`, `notas`, `lineas` (producto, variante, condición, esperado,
recibido, faltante, sobrante, danado, incorrecto, recibidos, incidencias),
`incidencias` (serial, resultado, etiqueta, nota, producto), `resumen`
(esperadas, recibidas, faltantes, sobrantes, danados, incorrectos), `enlace` y
`enlacePublico`.

## 3. Cómo se imprime

| Camino | Función | Salida |
| --- | --- | --- |
| Térmica directa (agente) | `ticketComprobanteRecepcion(datos, { ancho })` en `tickets.js` | ESC/POS 58/80 mm |
| Diálogo / PDF | `buildComprobanteRecepcionHtml(datos, { format })` y `printComprobanteRecepcion` en `OrderReceipt.jsx` | A4, 80 mm y 58 mm |

- El tipo de documento para la impresora recordada es
  **`comprobante-recepcion`** (`src/lib/printing/preferencias.js`).
- En A4 el envío y el panel van lado a lado y el comprobante entra en **una
  hoja**; en el rollo las firmas van una por bloque con campos cortos.
- Aviso impreso: «Documento de control interno. No es comprobante fiscal.»

### QR (regla vigente)

El QR al panel de la compra **solo se imprime cuando el llamador entrega un
`enlace` absoluto** (contrato de `qr.js`: nunca un QR muerto). Sin ruta pública
cerrada — hoy el manifiesto ya emite `/envio/<token>` pero la página no
existe — el papel imprime el **código del envío en barras** (CODE128, los
guiones no son EAN) y el texto «Escaneá para abrir el panel de la compra.».
Cuando la ruta se cierre, el panel solo tiene que pasar `enlace` y el QR sale
sin tocar los builders.

## 4. Adopción del panel (pendiente de UI)

El panel de abastecimiento (CMP) debe:

1. Cargar la recepción (`?id=`) y los productos de la compra; pasarlos a
   `datosComprobanteRecepcion`.
2. Ofrecer «Imprimir comprobante» con `ticketComprobanteRecepcion` por la
   impresora del tipo `comprobante-recepcion` y «Descargar PDF» con
   `buildComprobanteRecepcionHtml`.
3. Pasar `enlace` cuando la ruta pública del panel/manifiesto esté disponible.

## 5. Evidencia y tests

- Unit `src/lib/printing/comprobanteRecepcion.test.js`: conciliación por línea
  (esperado/recibido/faltante/sobrante/dañado), incidencias con nota, resumen,
  fallback sin productos y sin líneas, recepción vacía, ticket de 80/58 mm,
  barras sin enlace y QR con enlace.
- Ejemplo imprimible (A4, 80 mm y ESC/POS, con y sin enlace + QR verificado):
  `docs/comprobante-recepcion-ejemplo/` y
  `scripts/ejemplo-comprobante-recepcion.mjs`.
- Reglas de impresión: `docs/IMPRESION.md` §12 y §13 (tokens v2).
