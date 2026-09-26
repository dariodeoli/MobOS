# QA · Impresos F4 del abastecimiento (#250 §11)

El par de papel de la fase 4: el **manifiesto** que viaja con el lote y el
**comprobante de recepción** que firma el depósito al recibirlo. Contratos:
[MANIFIESTO.md](MANIFIESTO.md) y
[COMPROBANTE-RECEPCION.md](COMPROBANTE-RECEPCION.md).

## Cobertura contra el plan §11

| Punto del plan | Manifiesto | Comprobante de recepción |
| --- | --- | --- |
| Código | `ENV-CDE-ASU-0021` grande en el encabezado (A4 y rollo) | `COM-…` + `ENV-…` en el encabezado |
| Origen / destino | `CDE → Casa Central` (rollo en `->` por CP850) | Recorrido + depósito destino |
| Método | Bus/transportadora/AEX/importación, empresa, conductor y guía | — |
| Productos y unidades | Por línea, con capacidad/condición y **todos los IMEI** + pendientes | Esperado vs recibido por línea, con faltantes/sobrantes/dañados |
| Responsable | Responsable del despacho + firma del transportista | Usuario que recibió + fecha/hora |
| IMEIs | Conocidos listados y «N sin IMEI» | Incidencias con serial y nota |
| QR | QR de recepción con `enlace`; si no, `ENV-…` en barras + leyenda | QR al panel con `enlace`; si no, `COM-…` en barras + leyenda |

## Evidencia (PDFs)

- **Manifiesto** — `docs/manifiesto-ejemplo/`: `manifiesto-a4.pdf`,
  `manifiesto-80mm.pdf`, `manifiesto-80mm-escpos.pdf`,
  `manifiesto-80mm.png` (imagen para compartir),
  `manifiesto-a4-con-enlace.pdf`, las **etiquetas del lote** (`1 de 6` …) y
  `qr-envio.png` → decodificado con Vision:
  `https://app.moboss.online/envio/ENV-CDE-ASU-0021`.
- **Comprobante de recepción** — `docs/comprobante-recepcion-ejemplo/`:
  `comprobante-a4.pdf`, `comprobante-80mm.pdf`, `comprobante-80mm-escpos.pdf`,
  `comprobante-a4-con-enlace.pdf` y `qr-panel.png` (mismo enlace verificado).

Ambos ensayos se generan con los builders que viajan en la app
(`manifiesto.js`, `comprobanteRecepcion.js`, `tickets.js`, `OrderReceipt.jsx`) y
se regeneran con:

```bash
npx vite --port 5280 --strictPort --host 127.0.0.1 &
QA_BASE_URL=http://127.0.0.1:5280 node scripts/ejemplo-manifiesto.mjs
# (comprobante: puerto 5274 + scripts/ejemplo-comprobante-recepcion.mjs)
```

## Tests

- `src/lib/printing/manifiesto.test.js` (5): normalización, resumen, etiquetas
  `N de M`, ticket (código, IMEI, pendientes, firmas, barras/QR) y vacío.
- `src/lib/printing/comprobanteRecepcion.test.js` (7): conciliación por línea,
  incidencias con nota, resumen, fallback sin productos/líneas, vacío y ticket
  80/58 (barras/QR).

## Pendiente (fuera de PRN)

1. **Ruta pública `/envio/<token>`**: el backend ya emite el enlace; cuando la
   página exista, el panel pasa `enlace` y el QR sale en ambos papeles (hoy va
   el código en barras + leyenda, regla dura del §12).
2. **Adopción del panel**: imprimir el manifiesto al despachar el lote
   (`ticketManifiesto` / `buildManifiestoHtml` + etiquetas del lote) y el
   comprobante al confirmar la recepción (`ticketComprobanteRecepcion` /
   `buildComprobanteRecepcionHtml`).
