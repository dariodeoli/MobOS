# #240 → Portal — Tus beneficios en la cuenta (saldo a favor y puntos)

La cuenta del cliente mostraba todo el seguimiento (saldo, pedidos con pasos,
taller, informes, garantías, mensajes), pero **no sus beneficios**: el crédito
de tienda (devoluciones) y los puntos de fidelización solo se veían en la
vitrina. Ahora la cuenta los muestra con su significado.

## Entregado

| Archivo | Cambio |
|---|---|
| `backend/app/api/portal/[token]/route.ts` | La cuenta suma **`saldoFavorPyg`** (suma del crédito de tienda vigente) y **`puntosPyg`** (1 punto = 1 Gs.), en los dos niveles; el select del cliente trae `loyaltyPointsPyg` |
| `src/pages/CuentaPublica.jsx` | Sección **«Tus beneficios»** con «Saldo a favor» (verde) y «Puntos», cada uno con su explicación («Podés usarlo en tu próxima compra», «Acumulados en tus compras»). Solo aparece si hay algo |
| `src/lib/demoClientes.js` | Demo: Lucía con **Gs 250.000** a favor y **45.000 puntos**; el resto de los clientes sin beneficios (la sección no se muestra) |

## Decisiones (documentadas)

- **Misma fuente que la vitrina**: el saldo a favor sale del `StoreCredit`
  vigente (`remainingPyg > 0`) y los puntos del saldo del cliente; no se
  inventan ni se exponen movimientos internos.
- **Sin canje desde la cuenta**: el canje sigue en la ficha (lo autoriza el
  equipo); el portal informa cuánto tiene el cliente para que lo use en tienda.
- **Solo si hay algo**: sin beneficios no aparece la sección (la cuenta queda
  igual de limpia que antes).

## Verificación

| Evidencia | Qué cubre |
|---|---|
| `docs/QA-240-249-produccion/06-portal-beneficios-demo.png` | Corrida post-deploy del verificador: «Tus beneficios» con Gs 250.000 y 45.000 puntos en la cuenta demo |
| `src/lib/demoClientes.test.js` | Lucía con beneficios y Carlos sin ellos (la sección no aparece) |
| `backend/tests/customer-portal.mjs` | El contrato del portal incluye `saldoFavorPyg` y `puntosPyg` (números; 0 sin crédito) |

> El paso de producción queda listo en `scripts/qa-240-249-produccion.mjs`
> (5.º paso): en la corrida sobre **v1.0.156** figura como pendiente de deploy
> (el build no trae la sección; viaja en esta rama) y se completa solo cuando el
> release que la incluya impacte en producción.

## Checks

`npm run lint` 0 errores · builds FE/BE con `BUILD_ID` ✓ · `prisma:validate` ✓
(sin cambios de schema) · `npm test` ✓ · backend `test:unit` ✓ ·
`test:e2e:smoke` ✓ · mini arnés HTTP PASS.
