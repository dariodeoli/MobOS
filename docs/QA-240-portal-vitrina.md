# #240 — Seguimiento de la entrega en la vitrina del cliente

La cuenta completa (`/cuenta/<token>`) sigue el envío/retiro paso a paso desde
el lote anterior, pero la **vitrina** (`/portal/<token>`, la vista liviana que
se abre desde la ficha del cliente y comparte el mismo token) mostraba solo el
chip del estado de entrega: el cliente veía «En camino al cliente» sin el paso
a paso ni las fechas.

## Auditoría: qué había y qué faltaba

- **Ya existía:** la API de la vitrina (`/api/public/portal/:token`) con
  pedidos, saldo a favor, puntos y garantías; y el armado del seguimiento
  (`seguimientoDeEntrega` de `backend/lib/orders.ts`) usado por la cuenta y la
  página pública del pedido.
- **Brecha:** los pedidos de la vitrina no traían `tracking` y la página no
  dibujaba los pasos, así que la vista liviana quedaba a mitad de camino.

## Entregado

| Archivo | Cambio |
|---|---|
| `backend/app/api/public/portal/[token]/route.ts` | Los pedidos de la vitrina suman **`tracking`** (método, encabezado, estado y pasos con fecha), con el mismo armado que la cuenta: auditorías `ORDER_FULFILLMENT_UPDATED` + la última modificación del pedido como respaldo del paso actual |
| `src/pages/PortalCliente.jsx` | Bajo los chips del pedido, la línea **«Seguimiento de envío/retiro»** con `PasosEntrega` mientras el pedido está en curso (misma condición que la cuenta: no cancelado y sin entregar/retirado) |
| `src/lib/demoClientes.js` | La vitrina demo lleva el seguimiento de sus pedidos (`trackingDemo`), espejando el contrato del backend |

## Decisiones (documentadas)

- **Una sola verdad:** la vitrina usa `seguimientoDeEntrega` (mismo lib que la
  cuenta y la página pública) y el mismo componente `PasosEntrega`; sin lógica
  nueva ni copias de las etiquetas.
- **Solo mientras está en curso:** los pedidos entregados/retirados/cancelados
  no repiten la línea (el chip alcanza), igual que en la cuenta.
- **Sin datos nuevos:** el seguimiento ya viajaba en la cuenta; la vitrina no
  expone montos, tokens ni datos internos adicionales.

## Verificación

```bash
# e2e (cuenta real del harness + demo), con capturas
MOBOS_E2E_PGDATA=/tmp/mobos-e2e-pg-MOS-CRM MOBOS_E2E_PGPORT=5510 \
  MOBOS_E2E_API_PORT=3110 MOBOS_E2E_WEB_PORT=5210 \
  MOBOS_CAPTURAS=docs/QA-240-portal-vitrina \
  npx playwright test e2e/qa-240-portal-vitrina.spec.js --project=admin

# integración HTTP: el pedido de la vitrina trae sus pasos y no filtra ajenos
MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh
```

| Evidencia | Qué cubre |
|---|---|
| `docs/QA-240-portal-vitrina/01-vitrina-pasos-envio.png` | Cuenta real: la vitrina con «Seguimiento de envío», el paso actual con fecha y los anteriores cumplidos |
| `docs/QA-240-portal-vitrina/02-demo-vitrina-envio.png` | Demo: Lucía con su envío en camino |
| `docs/QA-240-portal-vitrina/03-demo-vitrina-retiro.png` | Demo: Carlos con su retiro listo |
| `e2e/qa-240-portal-vitrina.spec.js` | 2/2: cuenta real (pedido en tránsito → pasos) y demo (envío y retiro) |
| `backend/tests/customer-portal.mjs` | La vitrina trae `tracking.pasos` con un solo paso actual y su etiqueta, y no muestra pedidos de otro cliente |
| `src/lib/demoClientes.test.js` | Demo: envío y retiro de la vitrina con sus pasos y etiquetas |

> En producción, la corrida v1.0.169 dejó este paso como **pendiente de
> deploy** (viaja en la próxima integración): `docs/QA-240-portal-produccion/`.

## Checks de esta entrega

`npm run lint` 0 errores (2 warnings preexistentes, ajenos) · `npm run build` y
`backend run build` con `BUILD_ID` ✓ · `prisma:validate` ✓ (sin cambios de
schema) · `npm test` ✓ · backend `test:unit` ✓ · integración HTTP completa en
verde · `e2e/qa-240-portal-vitrina.spec.js` **2/2** · sin marcadores de
conflicto.
