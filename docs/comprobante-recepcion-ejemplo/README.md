# Ejemplo del comprobante de recepción (#250 · Fase 5 §11)

Muestra imprimible de cómo sale el **comprobante de recepción** de un envío del
Centro de Abastecimiento: lo que el manifiesto decía que llegaba contra lo que
entró al depósito, con faltantes, sobrantes y dañados, el depósito destino y
quién/cuándo recibió. Los PDFs los genera el mismo código que usará el panel
(`src/lib/printing/comprobanteRecepcion.js`, `tickets.js` y `OrderReceipt.jsx`),
así que lo que se ve acá es lo que sale por la impresora o por «Descargar PDF».

## Archivos

| Archivo | Qué es |
| --- | --- |
| `comprobante-a4.pdf` / `.jpg` | Comprobante A4 (1 página): envío, conciliación esperado vs recibido, totales, incidencias, panel en barras y firmas. |
| `comprobante-80mm.pdf` / `.jpg` | El mismo comprobante en rollo de 80 mm (el HTML que usa «Descargar PDF»). |
| `comprobante-80mm-escpos.pdf` / `.jpg` | Lo que recibe la impresora térmica (ESC/POS, 42 columnas) en la impresión directa. |
| `comprobante-a4-con-enlace.pdf` / `.jpg` | Muestra del contrato **con enlace público**: el QR al panel en lugar del código en barras. |
| `qr-panel.png` | El QR de la variante con enlace, para escanear desde la pantalla. |
| `datos-ejemplo.json` | Los datos normalizados que alimentan los documentos (envío, líneas, resumen e incidencias). |

## La recepción del ejemplo

- **Compra `COM-CDE-0048`** · envío **`ENV-CDE-ASU-0021`** (CDE → Casa Central,
  bus, proveedor Mayorista Apple PY): 5 unidades esperadas en 3 líneas.
- Recepción **con incidencias**: 3 recibidas, 1 dañada (pantalla rayada), 1
  faltante (quedó en CDE) y 1 sobrante (no figuraba en el manifiesto), en
  **D1 · Depósito 1**, por Lucía Benítez.
- Los IMEI del ejemplo son ficticios (pasan Luhn); en producción salen del
  escaneo real.

## El QR (regla vigente)

El comprobante imprime el QR **solo si el llamador entrega un `enlace`
absoluto**; sin ruta pública cerrada, el papel imprime el código del envío en
barras y el texto «Escaneá para abrir el panel de la compra.» (misma regla que
el manifiesto y el informe, `docs/IMPRESION.md` §12). La variante
`comprobante-a4-con-enlace` muestra el contrato cuando la ruta (`/envio/<token>`,
la que ya emite `manifiestoEnvio`) esté disponible; la salida principal de hoy
es la de barras. QR verificado con Vision:

```
swift -sdk /Library/Developer/CommandLineTools/SDKs/MacOSX15.4.sdk \
  scripts/decode-qr.swift docs/comprobante-recepcion-ejemplo/qr-panel.png
→ https://app.moboss.online/envio/ENV-CDE-ASU-0021
```

## Regenerar

```bash
npx vite --port 5274 --strictPort --host 127.0.0.1 &
QA_BASE_URL=http://127.0.0.1:5274 node scripts/ejemplo-comprobante-recepcion.mjs
```

El contrato completo (entrada de la API, datos normalizados, builders y
adopción del panel) está en [docs/COMPROBANTE-RECEPCION.md](../COMPROBANTE-RECEPCION.md).

**Par F4:** el otro papel de la fase es el
[manifiesto del lote](../manifiesto-ejemplo/README.md); la verificación conjunta
está en [docs/QA-250-F4-impresos.md](../QA-250-F4-impresos.md).
