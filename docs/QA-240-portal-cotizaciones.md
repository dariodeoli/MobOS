# #240 — Cotizaciones en la cuenta del cliente

La tienda comparte cotizaciones con token público (`/cotizacion/<token>`, con
aceptar/rechazar sin sesión), pero la **cuenta del cliente** (`/cuenta/<token>`)
no las mostraba: el cliente recibía la propuesta y, si perdía el enlace, no
tenía dónde volver a verla ni cuándo vencía.

## Auditoría: qué había y qué faltaba

- **Ya existía:** la página pública de la cotización con su detalle, la
  resolución del cliente (`QUOTE_ACCEPTED` / `QUOTE_REJECTED`) y el token
  público por cotización (`Quote.publicToken`, con regeneración desde la ficha).
- **Brecha:** las cotizaciones no viajaban a la cuenta del cliente. No había
  sección, aviso de vencimiento ni enlace de vuelta a la propuesta.
- **Riesgo a cuidar:** el **borrador** (`DRAFT`) es interno de la tienda y no
  debe exponerse nunca; y una cotización abierta con la validez cumplida debe
  verse **vencida** aunque la base todavía diga `SENT`.

## Entregado

| Archivo | Cambio |
|---|---|
| `backend/app/api/portal/[token]/route.ts` | La cuenta suma **`cotizaciones`**: las últimas 5 compartidas (nunca `DRAFT`, siempre con token público), con número, monto, estado, fecha, validez y enlace. Viaja en **los dos niveles** |
| `src/lib/cotizaciones.js` (nuevo) | Una sola verdad de estados, tonos, **vencimiento derivado** (`estadoCotizacion`), días restantes y enlace público (`cotizacionUrlFor`) |
| `src/pages/CuentaPublica.jsx` | Sección **«Tus cotizaciones»** antes de «Últimos pedidos»: número, monto, validez («Vence en X días» / «Venció el …»), chip de estado y **Ver cotización** → `/cotizacion/<token>` |
| `src/lib/portalAvisos.js` | Aviso accionable **«Tu cotización … vence en X días»** para las vigentes que vencen dentro de 3 días, con atajo a `#cotizaciones`. Las vencidas no avisan (ya no son accionables) |
| `src/pages/CotizacionPublica.jsx` | Usa la librería compartida y suma **modo demo** (`?demo=1`) para que el enlace de la cuenta demo abra sin API; en demo no ofrece aceptar/rechazar (no hay API real) |
| `src/lib/demoCotizacion.js` (nuevo) | Payload demo de la cotización pública (mismo contrato que `/api/quotes/public/:token`) |
| `src/lib/demoClientes.js` | Lucía con una cotización **vigente por vencer** (COT-#0018) y Carlos con una **convertida** (COT-#0011); el payload de la cuenta las lleva |

## Decisiones (documentadas)

- **En los dos niveles:** una cotización es un documento comercial del cliente
  (igual que pedidos, pagos y reservas), no un dato interno; no expone costos,
  márgenes ni notas internas.
- **Borrador fuera:** solo viajan las no-`DRAFT` y con token público; el
  borrador interno se queda en la tienda.
- **Vencimiento derivado:** el portal no escribe al leer; una cotización abierta
  con la validez cumplida se muestra `EXPIRED` con la misma función compartida
  que usa la página pública.
- **Sin lógica duplicada:** etiquetas, tonos, vencimiento y enlace viven en
  `src/lib/cotizaciones.js`; la página pública y la cuenta consumen lo mismo.
- **Aviso acotado:** solo las vigentes por vencer (≤ 3 días); el resto es ruido.

## Verificación

```bash
# unit: librería de cotizaciones, avisos y demo
node --test src/lib/cotizaciones.test.js src/lib/portalAvisos.test.js src/lib/demoClientes.test.js

# e2e (cuenta real del harness + demo), con capturas
MOBOS_E2E_PGDATA=/tmp/mobos-e2e-pg-MOS-CRM MOBOS_E2E_PGPORT=5510 \
  MOBOS_E2E_API_PORT=3110 MOBOS_E2E_WEB_PORT=5210 \
  MOBOS_CAPTURAS=docs/QA-240-portal-cotizaciones \
  npx playwright test e2e/qa-240-portal-cotizaciones.spec.js --project=admin

# integración HTTP: la cotización compartida llega en rápido y completo; el
# borrador y la de otro cliente no (arnés completo: customer-portal.mjs)
MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh
```

| Evidencia | Qué cubre |
|---|---|
| `docs/QA-240-portal-cotizaciones/01-cuenta-cotizacion.png` | Cuenta real: aviso «Tu cotización COT-#0001 vence en 2 días» y sección con validez, monto y **Ver cotización** |
| `docs/QA-240-portal-cotizaciones/02-demo-cuenta-cotizacion.png` | Demo: Lucía con su cotización vigente por vencer |
| `docs/QA-240-portal-cotizaciones/03-demo-cotizacion-publica.png` | Demo: la página pública abre desde el enlace de la cuenta (`?demo=1`) |
| `e2e/qa-240-portal-cotizaciones.spec.js` | 2/2: cuenta real (alta → envío → aviso y enlace) y demo (cuenta + página pública) |
| `backend/tests/customer-portal.mjs` | `cotizaciones` en rápido y completo con su token público; sin `DRAFT` ni cotizaciones ajenas |
| `src/lib/cotizaciones.test.js` · `portalAvisos.test.js` · `demoClientes.test.js` | 11 casos nuevos: etiquetas/tonos, vencimiento derivado, umbrales y prioridad del aviso, y paridad de la demo |

## Checks de esta entrega

`npm run lint` 0 errores (2 warnings preexistentes, ajenos) · `npm run build` y
`backend run build` con `BUILD_ID` ✓ · `prisma:validate` ✓ (sin cambios de
schema) · `npm test` **714 ✓** · backend `test:unit` **75 ✓** · integración HTTP
completa en verde (incluye `customer-portal.mjs`) ·
`e2e/qa-240-portal-cotizaciones.spec.js` **2/2** · sin marcadores de conflicto.
