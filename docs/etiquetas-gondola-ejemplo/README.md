# Etiquetas de góndola (#97) — ejemplos

PDFs de las etiquetas de producto que salen del modal «Etiquetas de góndola»
(Inventario y Productos), generados con los mismos builders que la app
(`buildProductLabelsHtml` y `ticketEtiquetasProducto`).

## Archivos

| Archivo | Qué es |
| --- | --- |
| `etiquetas-gondola-80mm.pdf` / `.jpg` | El HTML de «Descargar PDF» en rollo de 80 mm: nombre, precio grande, SKU y código de barras (un **EAN-13** nativo y CODE128 en los otros), con una etiqueta repetida («Etiqueta 2 de 2»). |
| `etiquetas-gondola-58mm.pdf` / `.jpg` | El mismo juego en rollo de 58 mm. |
| `etiquetas-gondola-80mm-escpos.pdf` / `.jpg` | Lo que recibe la térmica (ESC/POS, un corte por etiqueta). |
| `datos-ejemplo.json` | Los productos y precios usados. |

## Verificación

- Local: e2e `etiquetas-gondola.spec.js` (SKU y precio correctos en el HTML del
  respaldo) y `preferencias.test.js` (los tipos de etiqueta se nombran solos en
  Dispositivos · Formatos).
- **Producción v1.0.178**: el QA `scripts/qa-240-prod-impresion.mjs` elige un
  producto en la demo desplegada y arma el PDF real
  (`docs/qa/240-impresion-prod/etiquetas-gondola-80mm.pdf`).

## Regenerar

```bash
npx vite --port 5278 --strictPort --host 127.0.0.1 &
QA_BASE_URL=http://127.0.0.1:5278 node scripts/ejemplo-etiquetas-gondola.mjs
```

Reglas: `docs/IMPRESION.md` §7.
