# Ejemplo de etiquetas del lote (#250 · Fase 3 §11)

Muestra imprimible de las etiquetas de preparación de una compra del Centro de
Abastecimiento: `PRODUCTO n DE N`, modelo/variante, IMEI (o «pendiente»),
compra, pedido, destino y lote, con el código de barras para escanear en la
preparación. Los documentos los genera el mismo código que usará el panel
(`src/lib/printing/etiquetaLote.js`, `tickets.js` y `OrderReceipt.jsx`).

## Archivos

| Archivo | Qué es |
| --- | --- |
| `etiquetas-lote-80mm.pdf` / `.jpg` | Las 5 etiquetas en rollo de 80 mm (el HTML de «Descargar PDF»), una por página. |
| `etiquetas-lote-80mm-escpos.pdf` / `.jpg` | Lo que recibe la impresora térmica (ESC/POS, un corte por unidad). |
| `etiquetas-lote-80mm.png` | La misma tira como **imagen para compartir** (el camino de `CompartirImagen`). |
| `etiqueta-individual-80mm.pdf` / `.jpg` | **Una sola etiqueta** (reimpresión de la unidad 1, con IMEI): el panel la busca por serial con `etiquetaPorSerial`. |
| `etiqueta-individual-pendiente-80mm.pdf` / `.jpg` | La reimpresión de una unidad **sin IMEI**, buscada por su número con `etiquetaPorNumero`. |
| `etiqueta-individual-80mm-escpos.pdf` / `.jpg` | La individual en ESC/POS (un solo corte). |
| `datos-ejemplo.json` | La compra y las etiquetas que alimentan los documentos. |

## La compra del ejemplo

- **Compra `COM-CDE-0048`** (proveedor Mayorista Apple PY, referencia
  «Factura 001-002»), 5 unidades: 2 × iPhone 15 Pro Max 256 GB seminuevo (con
  IMEI), 1 × iPhone 15 128 GB nuevo (con IMEI), 1 × iPhone 15 128 GB nuevo y
  1 × AirPods Pro 2 **pendientes de IMEI**.
- El destino es **Casa Central** y el lote el envío **`ENV-CDE-ASU-0021`**. La
  primera línea cubre el pedido **`PV-000123`**.
- Las etiquetas sin IMEI se marcan **PENDIENTE** y su código de barras cae al
  lote (para no imprimir un código vacío).

## Regenerar

```bash
npx vite --port 5275 --strictPort --host 127.0.0.1 &
QA_BASE_URL=http://127.0.0.1:5275 node scripts/ejemplo-etiquetas-lote.mjs
```

El contrato completo (payload de la API, datos normalizados, builders y
adopción del panel) está en [docs/ETIQUETAS-LOTE.md](../ETIQUETAS-LOTE.md).
