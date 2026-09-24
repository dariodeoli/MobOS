# #240 → Portal — Tus pagos (historial en la cuenta)

La cuenta del cliente mostraba saldo, vencimientos y pedidos, pero no **lo que ya
pagó**: sin un historial, el cliente no podía responder «¿cuánto llevo pagado y
cuándo?» sin abrir comprobante por comprobante.

## Entregado

| Archivo | Cambio |
|---|---|
| `backend/app/api/portal/[token]/route.ts` | La cuenta suma **`pagos`** (últimos 8 pagos confirmados: monto, medio legible, fecha y pedido) y **`totalPagadoPyg`** (toda la historia confirmada). Va en los dos niveles |
| `backend/lib/payments.ts` (nuevo) | Etiquetas de medios de pago compartidas (`Efectivo`, `Transferencia`, `Tarjeta / POS`, `Crédito`, `Canje`, `Pix`, `Saldo a favor`, `USDT - Cripto`); el **pedido público** deja su mapa local y usa el mismo |
| `src/pages/CuentaPublica.jsx` | Sección **«Tus pagos»**: total pagado destacado y el historial (pedido, medio y fecha, monto en verde) |
| `src/lib/demoClientes.js` | Demo: el historial se deriva de los pedidos demo (`collectedPyg`) con métodos repartidos para que la lista sea creíble |

## Decisiones (documentadas)

- **Solo pagos confirmados** (`status: CONFIRMED`): los pendientes/rechazados no
  entran al historial (los pendientes con vencimiento ya viven en la cuenta como
  cuotas/vencimientos).
- **Pedidos no archivados**: si la tienda archiva un pedido, sale del portal.
- **El medio se muestra legible** con la misma tabla que el pedido público (una
  sola fuente en `backend/lib/payments.ts`, sin «CASH/TRANSFER» crudos).
- **Demo**: los pagos se derivan de los pedidos de la demo; el método se reparte
  entre los tres medios para que la lista se vea como la real.

## Verificación

| Evidencia | Qué cubre |
|---|---|
| `docs/QA-240-249-produccion/08-portal-pagos-demo.png` | Corrida post-deploy del verificador: «Tus pagos» con el total y los pedidos del historial |
| `src/lib/demoClientes.test.js` | Demo: historial con montos/pedidos/medios y total ≥ suma listada |
| `backend/tests/customer-portal.mjs` | El pago confirmado del pedido viaja en `pagos` (monto, medio legible, fecha) y `totalPagadoPyg` lo suma |

> El paso de producción se suma a `scripts/qa-240-249-produccion.mjs` (7.º):
> en la corrida sobre **v1.0.159** figura como pendiente de deploy (viaja en
> esta rama) y se completa cuando el release que la incluya impacte en
> producción.

## Checks

`npm run lint` 0 errores · builds FE/BE con `BUILD_ID` ✓ · `prisma:validate` ✓
(sin cambios de schema) · `npm test` ✓ · backend `test:unit` ✓ ·
`test:e2e:smoke` ✓ · mini arnés HTTP PASS.
