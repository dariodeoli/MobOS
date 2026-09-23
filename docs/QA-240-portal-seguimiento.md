# #240 — Seguimiento de la entrega en la cuenta del cliente

La cuenta del cliente mostraba el estado del pedido con un chip («En camino»,
«Listo para retirar»), pero no **el paso a paso del envío/retiro ni sus fechas**.
En el nivel rápido, además, no había ningún enlace al comprobante: el cliente
sabía que su pedido estaba en camino, pero no cuándo salió ni qué falta.

## Auditoría: qué había y qué faltaba

- **Ya existía:** la página pública del pedido (`/pedido/<token>`) con la línea
  de progreso por método (delivery, retiro, retiro en otra sucursal, traslado),
  sus etiquetas y las fechas de cada paso (`seguimientoDeEntrega` en
  `backend/lib/orders.ts`, auditadas en `ORDER_FULFILLMENT_UPDATED`).
- **Brecha:** la cuenta del cliente no llevaba esos pasos; el chip usaba el mapa
  del front (más corto) y el detalle solo estaba a un clic del comprobante
  (nivel completo), o directamente no estaba (nivel rápido).

## Entregado

| Archivo | Cambio |
|---|---|
| `backend/app/api/portal/[token]/route.ts` | Cada pedido de la cuenta viaja con **`tracking`** (método, encabezado, estado y **pasos con fecha**), armado con el mismo `seguimientoDeEntrega` de la página pública y las auditorías de entrega del pedido. Va en **los dos niveles** |
| `src/components/customerPortal/PasosEntrega.jsx` (nuevo) | Línea de progreso compacta para la tarjeta del portal (barras + etiquetas + fecha del paso cumplido) |
| `src/pages/CuentaPublica.jsx` | La tarjeta del pedido muestra **«Seguimiento de envío/retiro»** mientras el pedido está en curso; el chip de entrega usa `tracking.estadoLabel` (mismo texto que los pasos) |
| `src/lib/demoClientes.js` | Los pedidos demo tienen método y estado de entrega: Lucía **en camino** (delivery, 4 pasos) y Carlos **listo para retirar** (retiro, 3 pasos); la demo espeja las etiquetas del backend y la venta del mostrador sale entregada |

## Decisiones (documentadas)

- **El seguimiento va en los dos niveles**: es el estado de la entrega (como el
  chip que ya viajaba), no un comprobante ni datos internos; no expone tokens ni
  montos nuevos.
- **Una sola verdad por paso**: las etiquetas de los pasos y del chip son las
  del backend (`ETIQUETAS_FLUJO`), así el portal y la página pública dicen lo
  mismo («En camino al cliente», «En preparación»).
- **Solo mientras está en curso**: los pedidos entregados o cancelados no
  repiten la línea de progreso (el chip alcanza).
- **La demo espeja el backend** (etiquetas incluidas) y espacia las fechas por
  paso para que el recorrido sea legible sin datos reales.

## Verificación

```bash
# e2e (cuenta real del harness + demo), con capturas
MOBOS_E2E_PGDATA=/tmp/mobos-e2e-pg-MOS-CRM MOBOS_E2E_PGPORT=5510 \
  MOBOS_E2E_API_PORT=3110 MOBOS_E2E_WEB_PORT=5210 \
  npx playwright test e2e/qa-240-portal-seguimiento.spec.js --project=admin

# integración HTTP: el portal trae los pasos en rápido y completo (en el arnés)
node backend/tests/customer-portal.mjs <BASE_URL> <ADMIN_TOKEN> <SELLER_TOKEN> <CAJERA> <DATABASE_URL> <PG_BIN>
```

| Evidencia | Qué cubre |
|---|---|
| `docs/QA-240-portal-seguimiento/01-cuenta-pasos-envio.png` | Cuenta real: pedido en tránsito con **Seguimiento de envío** (5 pasos, fecha del paso actual) y chip «En camino al cliente» |
| `docs/QA-240-portal-seguimiento/02-demo-envio.png` | Demo: Lucía con su envío en camino y las fechas por paso |
| `docs/QA-240-portal-seguimiento/03-demo-retiro.png` | Demo: Carlos con **Seguimiento de retiro** («Listo para retirar») |
| `e2e/qa-240-portal-seguimiento.spec.js` | 2/2: cuenta real (orden + en tránsito → pasos) y demo (envío y retiro) |
| `backend/tests/customer-portal.mjs` | `tracking.pasos` con un solo paso actual, su etiqueta y el primero cumplido, en rápido y completo |
| `src/lib/demoClientes.test.js` | Demo: pasos del envío y del retiro, y la venta del mostrador sin pasos pendientes |

## Checks de esta entrega

`npm run lint` 0 errores · `npm run build` y `backend run build` con
`BUILD_ID` ✓ · `prisma:validate` ✓ (sin cambios de schema) · `npm test`
**655 ✓** · backend `test:unit` **75 ✓** · `test:e2e:smoke` **7/7** ·
`e2e/qa-240-portal-seguimiento.spec.js` **2/2** · integración HTTP completa en
verde · sin marcadores de conflicto.
