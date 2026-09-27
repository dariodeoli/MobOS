# QA · Cotización por WhatsApp con PDF (#261)

Envío de la cotización por WhatsApp (texto profesional + PDF adjunto) y descarga
del A4 de marca, con el correo de PLT intacto.

## Antes / después

| Antes | Después |
| --- | --- |
| En Cotizaciones: enlace/QR, copiar enlace, regenerar, imprimir y proforma por diálogo. | Se suman **Enviar por WhatsApp** (mensaje + **PDF adjunto** por el share sheet; respaldo: descarga el PDF y abre `wa.me` con el texto), **Compartir PDF/PDF** y la cotización queda **SENT** al enviarla. |
| El cliente solo podía aceptar/rechazar desde el enlace. | La **página pública** suma *PDF de la cotización* (A4 de marca con el QR/enlace) para bajar o compartir. |

## Evidencia

| Archivo | Qué muestra |
| --- | --- |
| `docs/qa/261-cotizacion-whatsapp/01-acciones-cotizacion.jpg` | El modal «Enlace de …» con las acciones nuevas (Enviar por WhatsApp · Compartir PDF · PDF) junto a las de siempre. |
| `docs/qa/261-cotizacion-whatsapp/02-whatsapp-fallback.jpg` | El respaldo sin Web Share: *PDF descargado: WhatsApp se abrió con el mensaje; adjuntá el PDF* (y el `wa.me/595981…` con el texto y el enlace). |
| `docs/qa/261-cotizacion-whatsapp/03-publica-pdf.jpg` | La página pública del cliente con *PDF de la cotización*. |

- e2e `e2e/public-quote-transfer.spec.js` (**4/4**): «la cotización se descarga
  como PDF para compartir» (firma `%PDF-`, tamaño y `/Type /Page`) y «se envía
  por WhatsApp con el PDF y queda enviada» (descarga + `wa.me` con el mensaje +
  **SENT**).
- Unit `src/lib/mensajeCotizacion.test.js` (3) y `src/lib/printing/pdfDocumento.test.js` (5).
- Ensayo `docs/cotizacion-pdf-ejemplo/` (PDF A4 de 1 página de 236 KB + QR
  verificado con Vision → `/cotizacion/COT-DEMO-0007`).

## Coordinación

- **PLT**: su correo (endpoint `POST /api/quotes/[id]/email`, template,
  idempotencia y cronología) queda intacto; el PDF es el mismo objeto de la
  ronda anterior.
- **POS**: la pantalla de Cotizaciones es suya; la acción se sumó al modal
  existente sin tocar el resto.
- **INV**: las **etiquetas del lote** ya se imprimen desde el panel de
  preparación y el **manifiesto** se reimprime desde la recepción (`F4`), con
  los builders de PRN.

## Pendiente

- **Adjunto en el correo**: el relay del repo viaja con `{ subject, html, text }`
  (sin adjuntos) — el criterio «detalle + enlace» se cumple; si se quisiera
  adjuntar el PDF, hay que coordinar con PLT.
- **Etiquetas `N de M` del lote** desde una pantalla de lotes: depende de esa
  sección del panel (hoy salen desde la compra, que es lo que existe).
