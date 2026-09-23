# #240 → Portal — Avisos de la cuenta (seguimiento/avisos)

La cuenta del cliente ya mostraba todo el seguimiento (saldo, vencimientos,
pedidos con pasos, informes, taller y garantías), pero **nada decía qué
requiere atención ahora**: una cuota que vence en dos días, un equipo listo
para retirar o una garantía por vencer quedaban mezclados entre las secciones.

## Entregado

| Archivo | Cambio |
|---|---|
| `src/lib/portalAvisos.js` (nuevo) | Función pura **`avisosDeCuenta(cuenta)`**: deriva los avisos del payload que el portal ya recibe, con prioridad (vencido → listo para retirar → por vencer → en camino → garantía), tono, ícono, detalle y **atajo a la sección** (`#vencimientos`, `#pedidos`, `#servicio-tecnico`, `#garantias`). Máximo 5 |
| `src/pages/CuentaPublica.jsx` | Tarjeta **«Avisos»** debajo del saldo (solo aparece si hay algo): cada aviso es un enlace a la sección que lo explica; las secciones suman su `id` |
| `src/components/customerPortal/PortalUI.jsx` | `PortalSeccion` acepta `id` y props extra (aditivo; el resto de los portales no cambia) |
| `src/lib/demoClientes.js` | Demo: María suma una garantía por vencer (12 días) para mostrar el aviso; el resto de los avisos salen de los datos que ya tenían Lucía (cuota + envío), Carlos (retiro) y el taller de Lucía |

## Tipos de aviso y umbrales

| Tipo | Condición | Tono / atajo |
|---|---|---|
| Pago vencido | cuota con saldo y vencimiento anterior a hoy | rojo · `#vencimientos` |
| Listo para retirar | pedido `READY_FOR_PICKUP` o taller `LISTO` | verde · `#pedidos` / `#servicio-tecnico` |
| Pago por vencer | vence hoy o dentro de 7 días | ámbar · `#vencimientos` |
| Pedido en camino | entrega `IN_TRANSIT` | info · `#pedidos` |
| Garantía por vencer | 30 días o menos (0 = vencida) | ámbar/rojo · `#garantias` |

## Decisiones (documentadas)

- **Sin backend nuevo**: los avisos se derivan de lo que la cuenta ya recibe
  (por eso la cuenta real y la demo usan exactamente la misma lógica y no hay
  datos nuevos que proteger). Las garantías solo aparecen en el nivel completo,
  como el resto de esa sección.
- **Prioridad y tope**: primero lo urgente (pago vencido), después lo
  accionable (retiros), luego lo preventivo; máximo 5 para no convertir la
  cuenta en una lista larga.
- **Sin ruido**: si no hay nada pendiente, no se muestra la tarjeta.

## Verificación

```bash
# unit de la lógica de avisos (fixtures + payload demo)
node --test src/lib/portalAvisos.test.js

# e2e (cuenta real del harness + demo), con capturas
MOBOS_E2E_PGDATA=/tmp/mobos-e2e-pg-MOS-CRM MOBOS_E2E_PGPORT=5510 \
  MOBOS_E2E_API_PORT=3110 MOBOS_E2E_WEB_PORT=5210 \
  npx playwright test e2e/qa-240-portal-avisos.spec.js --project=admin
```

| Evidencia | Qué cubre |
|---|---|
| `docs/QA-240-portal-avisos/01-cuenta-avisos.png` | Cuenta real: «Tu pago vence en 5 días» y «iPhone 13 … está listo para retirar», con su atajo |
| `docs/QA-240-portal-avisos/02-demo-avisos-lucia.png` | Demo Lucía: taller listo + pago en 6 días + pedido en camino |
| `docs/QA-240-portal-avisos/03-demo-aviso-garantia.png` | Demo María: «Tu garantía vence en 12 días» |
| `docs/QA-240-portal-avisos/04-demo-aviso-retiro.png` | Demo Carlos: «MOB-#0004 está listo para retirar» |
| `e2e/qa-240-portal-avisos.spec.js` | 2/2: cuenta real (crédito con saldo a 5 días + taller listo) y demo (3 recorridos) |
| `src/lib/portalAvisos.test.js` | 6 ✓: sin pendientes, prioridad, umbrales (hoy/7/8 días), retiros, garantías y paridad con la demo |

## Checks de esta entrega

`npm run lint` 0 errores · `npm run build` y `backend run build` con
`BUILD_ID` ✓ · `prisma:validate` ✓ (sin cambios de schema) · `npm test`
**661 ✓** · backend `test:unit` **75 ✓** · `test:e2e:smoke` **7/7** ·
`e2e/qa-240-portal-avisos.spec.js` **2/2** · sin marcadores de conflicto.
