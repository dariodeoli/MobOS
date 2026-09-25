# #240 — El pedido en detalle en la cuenta del cliente

La cuenta del cliente mostraba cada pedido con su total, su estado de pago y el
seguimiento de la entrega, pero no **qué se compró ni qué se pagó de ese
pedido**: el detalle de líneas y pagos solo estaba en la página pública del
comprobante, a un clic y con su propio token.

## Entregado

| Archivo | Cambio |
|---|---|
| `backend/app/api/portal/[token]/route.ts` | Cada pedido suma **`items`** (líneas: descripción, cantidad e importe) y **`pagos`** (los confirmados de ESE pedido, con medio legible y fecha). Viaja en los dos niveles; nunca expone costos ni datos internos |
| `src/pages/CuentaPublica.jsx` | El detalle de pedido plegable: **«Ver detalle»** abre «Qué compraste» y «Tus pagos de este pedido»; cerrado por defecto para no alargar la lista |
| `src/lib/demoClientes.js` | La cuenta demo lleva líneas y pagos por pedido, espejando el contrato |

## Decisiones (documentadas)

- **Plegado por defecto:** la lista de pedidos mantiene su densidad; el detalle
  se abre a demanda (botón con `aria-expanded`).
- **Solo pagos confirmados:** igual que el resto del portal; los pendientes ya
  viven en «Vencimientos».
- **Precios del cliente, no costos:** las líneas usan el importe de venta; los
  costos y márgenes siguen prohibidos en el portal.
- **Sin token nuevo:** el detalle viaja con el mismo enlace de la cuenta.

## Verificación

```bash
# e2e (cuenta real + demo), con capturas
MOBOS_E2E_PGDATA=/tmp/mobos-e2e-pg-MOS-CRM MOBOS_E2E_PGPORT=5510 \
  MOBOS_E2E_API_PORT=3110 MOBOS_E2E_WEB_PORT=5210 \
  MOBOS_CAPTURAS=docs/QA-240-portal-pedido-detalle \
  npx playwright test e2e/qa-240-portal-pedido-detalle.spec.js --project=admin

# integración HTTP: líneas y pagos por pedido en rápido y completo
MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh
```

| Evidencia | Qué cubre |
|---|---|
| `docs/QA-240-portal-pedido-detalle/01-cuenta-detalle-pedido.png` | Cuenta real: el pedido con «Ver detalle» abierto, su línea y su pago |
| `docs/QA-240-portal-pedido-detalle/02-demo-detalle-pedido.png` | Demo: el detalle se arma con los datos de la pestaña |
| `e2e/qa-240-portal-pedido-detalle.spec.js` | 2/2: cuenta real (líneas + pagos) y demo |
| `backend/tests/customer-portal.mjs` | `items` y `pagos` por pedido en rápido y completo, con medio y fecha |
| `src/lib/demoClientes.test.js` | Demo: líneas y pago confirmado del pedido |

## Checks de esta entrega

`npm run lint` 0 errores (2 warnings preexistentes, ajenos) · `npm run build` y
`backend run build` con `BUILD_ID` ✓ · `prisma:validate` ✓ (sin cambios de
schema) · `npm test` **752 ✓** · backend `test:unit` **75 ✓** · integración HTTP
completa en verde · `e2e/qa-240-portal-pedido-detalle.spec.js` **2/2** ·
`test:e2e:smoke` **19/19** · sin marcadores de conflicto.
