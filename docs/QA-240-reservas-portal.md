# #240 → Portal — Tus reservas (equipo guardado y su vencimiento)

La cuenta del cliente mostraba pedidos, taller, garantías, mensajes y
beneficios, pero **no las reservas**: si la tienda le guardaba un equipo
(`RESERVED` con `reservedUntil`), el cliente no tenía dónde verlo — y la
reserva se libera sola si no la retira.

## Entregado

| Archivo | Cambio |
|---|---|
| `backend/app/api/portal/[token]/route.ts` | La cuenta suma **`reservas`**: equipos con `reservationCustomerId` del cliente y estado `RESERVED` (modelo, capacidad, serial, sucursal y vencimiento). Va en los dos niveles |
| `src/pages/CuentaPublica.jsx` | Sección **«Tus reservas»** con el aviso de que se liberan solas y el chip **«Hasta &lt;fecha&gt;»** (ámbar cuando vence en 2 días o menos, «Vence hoy» si ya venció) |
| `src/lib/portalAvisos.js` | Aviso accionable **«Tu reserva de &lt;equipo&gt; vence en N días»** (tono ámbar, rojo si vence hoy), con atajo `#reservas` y prioridad sobre los avisos informativos |
| `src/lib/demoClientes.js` | Demo: Carlos con un iPhone 13 reservado hasta dentro de 2 días (se ve la sección y el aviso) |

## Decisiones (documentadas)

- **Solo la reserva a nombre de la ficha** (`reservationCustomerId`): las
  reservas de mostrador (a nombre libre o sin cliente) no aparecen en el portal
  de nadie.
- **El vencimiento manda**: el chip y el aviso escalan de tono a medida que se
  acerca (≤2 días ámbar, vencida roja) y el texto recuerda que se libera sola.
- **Sin acciones desde la cuenta**: extender la reserva o retirarla se coordina
  con la tienda; el portal informa.
- **Demo**: la reserva es un seed; en la demo no hay liberación automática (el
  estado vive en el navegador), pero el aviso y el chip se calculan igual.

## Verificación

| Evidencia | Qué cubre |
|---|---|
| `docs/QA-240-249-produccion/07-portal-reservas-demo.png` | Corrida post-deploy del verificador: «Tus reservas» con el iPhone 13 y su vencimiento |
| `src/lib/demoClientes.test.js` | Carlos con una reserva vigente; Lucía sin reservas |
| `src/lib/portalAvisos.test.js` | Aviso de reserva: por vencer (ámbar), vence hoy (rojo), lejos (sin aviso) y prioridad sobre «en camino» |
| `backend/tests/customer-portal.mjs` | Se reserva una unidad por API para el cliente y el portal la lista con `reservedUntil` y el equipo |

> El paso de producción se suma a `scripts/qa-240-249-produccion.mjs` (6.º):
> en la corrida sobre **v1.0.158** figura como pendiente de deploy (viaja en
> esta rama) y se completa cuando el release que la incluya impacte en
> producción.

## Checks

`npm run lint` 0 errores · builds FE/BE con `BUILD_ID` ✓ · `prisma:validate` ✓
(sin cambios de schema) · `npm test` ✓ · backend `test:unit` ✓ ·
`test:e2e:smoke` ✓ · mini arnés HTTP PASS.
