# #240 ítem 3 — Seguimiento del informe compartido (visto/no visto)

La tienda comparte el informe de un equipo (WhatsApp, correo o el portal) y el
CRM le dice si el cliente lo abrió. Implementado en la rama `slot/clientes`.

## Qué hace

| Pieza | Dónde vive | Comportamiento |
|---|---|---|
| Envío desde la ficha | `backend/app/api/customers/[id]/device-report/route.ts` | Además del evento de cronología, crea/actualiza la fila de seguimiento del equipo (empresa + serial, serial normalizado a mayúsculas) con canal y fecha |
| Apertura del link público | `backend/app/api/public/units/[serial]/route.ts` | La primera apertura marca **visto** y agrega el evento a la cronología; las siguientes actualizan última apertura y contador |
| Vista previa de la app | ficha → “Ver informe” | El enlace viaja con `?preview=1` y **no** cuenta como apertura del cliente; el enlace que se copia queda limpio |
| Apertura desde el portal | `/cuenta/<token>` → “Ver informe” | Si el equipo nunca se compartió, la apertura crea la fila con canal vacío (origen “portal del cliente”) |
| Estado en la ficha | `src/components/customers/CustomerProfile.jsx` | Chip **Visto** (verde) o **Sin ver** por equipo, con fecha, aperturas y canal en el tooltip |
| Cronología | `backend/app/api/customers/[id]/timeline/route.ts` | “Informe del equipo visto por el cliente · abierto desde el enlace de WhatsApp/correo/portal · serial …” (una sola vez por envío) |
| Datos que expone el perfil | `backend/app/api/customers/[id]/route.ts` | `deviceReportShares: [{ serial, channel, sharedAt, firstViewedAt, lastViewedAt, viewCount }]` |
| Etiquetas de auditoría | `backend/lib/audit.ts` + `backend/lib/device-report.ts` | `CUSTOMER_DEVICE_REPORT_SHARED/VIEWED` con etiqueta humana y `Canal` legible en el CSV |

Demo: mismo comportamiento en el navegador (`src/lib/demoClientes.js` +
`src/lib/demoInforme.js`): Lucía arranca con su informe **visto** y Ana con uno
**sin ver**; compartir deja la fila **sin ver** y abrir el informe (portal o
enlace) la pasa a **visto**. Como el resto de la demo, las filas viven en
memoria de la pestaña: al recargar se vuelve a los ejemplos del seed.

## Cómo se verifica

```bash
# e2e de cuenta real + demo (3 specs, incluye capturas)
MOBOS_E2E_PGDATA=/tmp/mobos-e2e-pg-MOS-CRM MOBOS_E2E_PGPORT=5510 \
  MOBOS_E2E_API_PORT=3110 MOBOS_E2E_WEB_PORT=5210 \
  npx playwright test e2e/qa-240-informe.spec.js --project=admin

# test de integración HTTP (envío → visto → portal; requiere build del backend)
node backend/tests/device-report-tracking.mjs <BASE_URL> <ADMIN_TOKEN> <SELLER_TOKEN> <DATABASE_URL> <PG_BIN>

# verificador reusable de la demo (harness local o producción)
MOBOS_QA_URL=http://localhost:5210 MOBOS_QA_API_HOST=localhost:3110 \
  MOBOS_QA_OUT=/tmp/qa240p node scripts/qa-240-informe-portal-demo.mjs
```

## Corridas y evidencia

| Evidencia | Qué cubre |
|---|---|
| `docs/QA-240-informe-dispositivo/07-seguimiento-sin-ver.png` | Ficha: compartido y todavía **sin ver** |
| `docs/QA-240-informe-dispositivo/08-informe-abierto-por-el-cliente.png` | El cliente abre el link público (pestaña aparte) |
| `docs/QA-240-informe-dispositivo/09-seguimiento-visto.png` | Ficha: chip **Visto** después de la apertura |
| `docs/QA-240-informe-dispositivo/10-cronologia-informe-visto.png` | Cronología: “Informe del equipo visto por el cliente · abierto desde el enlace de WhatsApp · serial …” |
| `docs/QA-240-informe-dispositivo/06-demo-cronologia-informe.png` | Demo: envío por correo + apertura en la cronología |
| `docs/QA-240-informe-dispositivo/07-demo-seguimiento-sin-ver.png` | Demo: equipo compartido **sin ver** (Ana) |
| `docs/QA-240-informe-visto/` + `resultados.json` | Corrida del verificador contra el harness local: **6/6** pasos (incluye el paso nuevo “el seguimiento del informe muestra visto/no visto y su apertura”), 7 capturas, 0 llamadas al API real de clientes |
| `backend/tests/device-report-tracking.mjs` | Integración HTTP: envío → preview no cuenta → dos aperturas (contador 2, un solo evento) → apertura desde portal sin envío previo → equipo sin venta no deja rastro → aislamiento entre clientes |
| `backend/tests/device-report.test.ts` | Serial normalizado/enmascarado y detalle de la apertura |
| `src/lib/demoClientes.test.js` · `src/lib/demoInforme.test.js` | Demo: seeds visto/sin ver, transición compartir → abrir, origen congelado de la apertura |

## Decisiones y límites (documentados)

- **Una fila por equipo** (empresa + serial): el visto de un envío anterior sigue
  valiendo; la cronología conserva cada envío por separado (auditoría).
- **El serial viaja normalizado a mayúsculas** en la fila; la búsqueda del
  informe público no distingue caja ni espacios.
- **Es una señal best-effort**: el enlace es público. La vista previa de la app
  no cuenta (`?preview=1`), pero si alguien del equipo abre el portal o el
  enlace sin ese parámetro, queda como apertura.
- **No hay PII nueva**: la fila guarda serial + fechas + contador; el evento de
  cronología enmascara el serial (mismo criterio que el informe público).
- **Demo**: las filas son de la pestaña (igual que el resto de la demo); los
  ejemplos del seed hacen visible el visto/no visto sin depender de una
  navegación completa.
