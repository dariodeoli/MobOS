# Cotizaciones — envío por WhatsApp/correo y cronología del cliente (#261)

Parte del dominio **clientes** en #261 (junto con POS, que aporta el share sheet
con PDF y los botones en Cotizaciones). Acá viven la **plantilla profesional del
mensaje**, el **correo al email registrado** y el **registro en la cronología
del cliente**.

## Qué se entregó

| Archivo | Cambio |
|---|---|
| `backend/lib/quote-message.ts` (nuevo) | `mensajeCotizacion()`: saludo, detalle de ítems (hasta 8 + «y N más»), total, validez y enlace público. Una sola verdad para WhatsApp y el texto del correo |
| `backend/lib/email.ts` | `quoteEmail()`: correo con la identidad de la marca, tabla de detalle, total, validez, botón **Ver y responder la cotización** y el enlace visible de respaldo (regla de tokens) |
| `backend/app/api/quotes/[id]/message/route.ts` (nuevo) | `GET` (vista previa sin efectos) y `POST { canal: 'WHATSAPP' \| 'EMAIL' }`; audita, registra en la cronología y deja la cotización en **SENT** si estaba en borrador |
| `backend/lib/email-outbox.ts` · `backend/lib/audit.ts` | Kind `quote` (+ acción de fallo) y etiquetas de auditoría (`QUOTE_MESSAGE_SENT`, `CUSTOMER_QUOTE_SHARED`) |
| `backend/app/api/customers/[id]/timeline/route.ts` | El evento **«Cotización enviada»** con su canal: `por WhatsApp · COT-#0042` / `por correo a … · COT-#0042` |
| `backend/lib/emails-prueba.ts` | La cotización entra en la vista previa de correos (11 en total) |
| `src/lib/api/index.js` | `resources.quotes.mensaje(id)` y `resources.quotes.enviarMensaje(id, canal)` para que la UI de POS los consuma |
| `e2e/bin/start-backend.sh` | El arnés configura la clave ficticia del outbox (mismo par que la integración): los correos se pueden verificar sin relay real |

## Contrato para POS (share sheet + PDF)

```http
GET  /api/quotes/:id/message              # vista previa (no audita ni cambia estado)
POST /api/quotes/:id/message              # { canal: 'WHATSAPP' | 'EMAIL' }
```

Respuesta de WhatsApp: `{ ok, canal, status, quoteNumber, to, link, message, whatsappUrl }`
Respuesta de correo: `{ ok, canal, status, quoteNumber, to, link, queued: true }`

- **Estados:** compartir una cotización en `DRAFT` la deja en `SENT` (con auditoría
  `QUOTE_UPDATED`).
- **Cronología:** cada envío agrega «Cotización enviada» con canal y número.
- **Sin contacto:** 409 con mensaje claro (`El cliente no tiene correo cargado.
  Agregalo en su ficha…`) para que la UI ofrezca completarlo.
- **PDF:** se reutiliza el comprobante A4 de la cotización (`printQuoteReceipt`);
  el texto para el share sheet sale de `message` (o del `GET` de vista previa).

## Verificación

```bash
npm --prefix backend run test:unit                    # 114 ✓ (incluye quote-message)
MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh
# PASS: cotización enviada por WhatsApp/correo con cronología · 17 chequeos
MOBOS_E2E_PGDATA=/tmp/mobos-e2e-pg-MOS-CRM … npx playwright test e2e/qa-261-cotizacion-envio.spec.js --project=admin
```

| Evidencia | Qué cubre |
|---|---|
| `docs/QA-261-cotizacion-envio/01-cronologia-cotizacion-enviada.png` | La ficha del cliente con «Cotización enviada» por WhatsApp y por correo |
| `docs/QA-261-cotizacion-envio/02-email-cotizacion.png` | La plantilla del correo (marca, detalle, total, validez, botón y enlace de respaldo) |
| `backend/tests/quote-message.test.ts` | La plantilla: ítems, topes, total, validez y enlace |
| `backend/tests/quotes-message.mjs` | Endpoints, estado SENT, auditoría y cronología; 401/400/404/409 |
| `e2e/qa-261-cotizacion-envio.spec.js` | Flujo completo API + cronología en la ficha (con capturas) |

## Hallazgos

- El arnés e2e no tenía configurada la clave del outbox: los correos fallaban con
  `EMAIL_OUTBOX_ENCRYPTION_NOT_CONFIGURED`. Se configuró en `e2e/bin/start-backend.sh`
  (solo arnés); producción no se toca.
- El primer envío mostraba **dos** eventos en la cronología (el audit crudo del
  Quote y el del Customer); se dejó un solo evento por envío (el audit de la
  cotización queda para su historial/CSV).
- Pendiente de POS: share sheet con PDF, botones en Cotizaciones y el flujo de
  «agregar correo».

> Nota: el pedido anterior de la misma ola (#260, buscador/alta rápida en
> Cotizaciones) no se arrancó; esta entrega tomó el pedido #261.
