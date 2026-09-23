# #240 §3 — Seguimiento del informe sobre el **certificado embebible** (con INV)

INV embebe el certificado del equipo (`/u/<serial>` con `FichaCertificado` +
`CodigoQr`). Para que el **visto/no visto** siga funcionando sobre esa
superficie, la apertura desde el embebible viaja con `?embed=1` y queda
registrada con su propio origen.

## Entregado (lado CRM)

| Archivo | Cambio |
|---|---|
| `backend/app/api/public/units/[serial]/route.ts` | `?embed=1` registra la apertura con **origen EMBED** (la vista previa `?preview=1` sigue sin contar; el canal del envío no cambia) |
| `backend/lib/device-report.ts` | `ORIGEN_APERTURA.EMBED = 'certificado embebido'` → cronología: **«abierto desde el certificado embebido · serial …»** |
| `src/pages/InformePublico.jsx` | La página reenvía `embed=1` al API (y en demo marca el mismo origen) |
| `src/lib/demoClientes.js` / `demoInforme.js` | Demo: `viewChannel: EMBED` y el texto del evento, con el origen de la primera apertura congelado |

## Contrato para el certificado embebible (INV)

1. **Misma fuente de datos**: el embebible debe resolver el informe con
   `GET /api/public/units/<serial>` (la página ya lo hace con `?embed=1`).
   Si INV monta su propio HTML, que haga ese `fetch` **una vez por render**.
2. **No usar `?preview=1`** en el embebible: ese parámetro es solo para la
   vista previa del equipo desde la app y **no** cuenta como apertura.
3. **Sin caché**: una respuesta servida desde CDN/service worker no dispara el
   registro. Si el embebible cachea, el visto/no visto se pierde (el API
   responde `Cache-Control: no-store`).
4. **Qué ve la tienda**: la ficha muestra el chip **Visto/Sin ver** (como hoy) y
   la cronología distingue el origen (`certificado embebido` vs `enlace de
   WhatsApp/correo` o `portal del cliente`).
5. **Nivel**: el embebible no expone más datos que el informe público actual
   (serial enmascarado, sin PII, sin precios); el registro solo agrega una fila
   de seguimiento por equipo.

Cualquier cambio de contrato se coordina en `#240` (comentario de CRM a INV).

## Evidencia

| Evidencia | Qué cubre |
|---|---|
| `docs/QA-240-informe-embebible/01-certificado-embebible.png` | El informe abierto con `?embed=1` (la superficie que embebe INV) |
| `docs/QA-240-informe-embebible/02-cronologia-certificado-embebido.png` | Cronología del cliente: **«Informe del equipo visto por el cliente · abierto desde el certificado embebido · serial 3567…910»** tras la primera apertura embebible |
| `e2e/qa-240-informe-embebible.spec.js` | Cuenta real: alta + venta + envío → primera apertura con `?embed=1` → chip Visto y cronología con el origen (1/1) |
| `backend/tests/device-report-tracking.mjs` | Bloque nuevo: apertura embebible → fila visto + evento con `certificado embebido` (mini arnés PASS) |
| `backend/tests/device-report.test.ts` · `src/lib/demoInforme.test.js` · `src/lib/demoClientes.test.js` | Etiqueta EMBED, origen congelado de la primera apertura y paridad demo |

## Checks de esta entrega

`npm run lint` 0 errores · builds FE/BE con `BUILD_ID` ✓ · `npm test` ✓ ·
backend `test:unit` ✓ · `test:e2e:smoke` ✓ · `e2e/qa-240-informe-embebible.spec.js`
**1/1** · `device-report-tracking.mjs` **PASS** en el mini arnés · sin
marcadores de conflicto.
