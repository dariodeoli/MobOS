# Ejemplo del manifiesto del lote (#250 · Fase 4 §11)

Muestra imprimible del **manifiesto** que viaja con el envío y de las
**etiquetas por unidad del lote** (`N de M`): código `ENV-CDE-ASU-0021`,
recorrido CDE → Casa Central, bus (Expreso del Este, guía A003526979),
responsable, compra `COM-CDE-0048`, los IMEI conocidos y las unidades pendientes.
Los documentos los genera el mismo código que usará el panel
(`src/lib/printing/manifiesto.js`, `tickets.js` y `OrderReceipt.jsx`).

## Archivos

| Archivo | Qué es |
| --- | --- |
| `manifiesto-a4.pdf` / `.jpg` | La hoja A4: datos del envío, tabla por producto con IMEI y «N sin IMEI», totales, panel y firmas (despachó / transportista). |
| `manifiesto-80mm.pdf` / `.jpg` | El mismo manifiesto en rollo de 80 mm (el HTML de «Descargar PDF»). |
| `manifiesto-80mm-escpos.pdf` / `.jpg` | Lo que recibe la térmica (ESC/POS, código grande y todos los IMEI). |
| `manifiesto-a4-con-enlace.pdf` / `.jpg` | Muestra del contrato **con enlace público**: el QR de recepción en lugar del código en barras. |
| `etiquetas-lote-80mm.pdf` / `.jpg` | Las **6 etiquetas del lote** (`1 de 6` … `6 de 6`), con IMEI o PENDIENTE y el `Lote ENV-…`. |
| `etiquetas-lote-80mm-escpos.pdf` / `.jpg` | Las etiquetas en ESC/POS (un corte por unidad). |
| `qr-envio.png` | El QR de la variante con enlace (verificado con Vision → `/envio/ENV-CDE-ASU-0021`). |
| `datos-ejemplo.json` | El envío, el resumen y las etiquetas usadas. |

El contrato completo (payload de INV, builders, pedido de la ruta pública y
adopción del panel) está en [docs/MANIFIESTO.md](../MANIFIESTO.md).

## Regenerar

```bash
npx vite --port 5280 --strictPort --host 127.0.0.1 &
QA_BASE_URL=http://127.0.0.1:5280 node scripts/ejemplo-manifiesto.mjs
```
