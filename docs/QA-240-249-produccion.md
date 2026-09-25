# Verificación en producción — portal del cliente y Clientes (#240 · #249)

## Corrida vigente — v1.0.169 (portal completo)

`node scripts/qa-240-249-produccion.mjs` contra `app.moboss.online`
(25/9/2026, versión desplegada **v1.0.169**): **11/11 pasos OK** y 1 paso nuevo
**pendiente de deploy** (el seguimiento en la vitrina viaja en la próxima
integración). Evidencia: `docs/QA-240-portal-produccion/` (11 capturas +
`resultados.json` sellado con la versión).

| Paso | Resultado | Captura |
|---|---|---|
| #249 · clientes a 390 y 768: acciones, chips y lote ≥44 px | ojito 44×44 · WhatsApp 44×44 · resto ≥44 | `01`–`03` |
| #240 · certificado embebible con `?embed=1` | informe de la tienda con aviso y serial enmascarado | `04` |
| #240 · mensajes de la tienda en la cuenta demo | «Mensajes de la tienda» con chip **Nuevo** | `05` |
| #240 · beneficios (saldo a favor y puntos) | **Gs 250.000** a favor · **45.000 puntos** | `06` |
| #240 · reservas vigentes | iPhone 13 con su vencimiento | `07` |
| #240 · historial de pagos | «Tus pagos» con total pagado, pedidos y medios | `08` |
| #240 · seguimiento de la entrega en la cuenta | pasos del envío con el actual, su etiqueta y fecha | `09` |
| #240 · cotizaciones con su aviso | COT-#0018 vigente («Vence en 2 días») + aviso accionable | `10` |
| #240 · taller y garantía | OS-0005 en diagnóstico + garantía activa | `11` |
| #240 · seguimiento en la vitrina (nuevo) | **pendiente de deploy** (viaja en `slot/clientes`) | — |

## Corrida anterior — v1.0.159

`node scripts/qa-240-249-produccion.mjs` contra `app.moboss.online`
(24/9/2026, versión desplegada **v1.0.159**): **6/6 pasos OK** + 1 paso nuevo
pendiente de deploy.

| Paso | Resultado | Captura |
|---|---|---|
| #249 · clientes a 390: acciones, chips y lote ≥44 px | **ojito 44×44 · WhatsApp 44×44**; elegir plantilla, chip «Todos» y el área de la casilla de lote también ≥44 | `01-clientes-390.png`, `02-clientes-acciones-390.png` |
| #249 · clientes a 768 | ojito **44×44**; WhatsApp y chip «Con deuda» ≥44 | `03-clientes-768.png` |
| #240 · certificado embebible con `?embed=1` | el informe abre con tienda, serial enmascarado y aviso (la superficie que embebe INV) | `04-certificado-embebible-390.png` |
| #240 · mensajes de la tienda en el portal demo | sección «Mensajes de la tienda» con el mensaje sembrado y el chip **Nuevo** | `05-portal-mensajes-demo.png` |
| #240 · beneficios (saldo a favor y puntos) | «Tus beneficios» con **Gs 250.000** a favor y **45.000 puntos** | `06-portal-beneficios-demo.png` |
| #240 · reservas vigentes | sección «Tus reservas» con el iPhone 13 y su vencimiento (desplegado en v1.0.159) | `07-portal-reservas-demo.png` |
| #240 · historial de pagos (nuevo) | **pendiente de deploy**: la sección «Tus pagos» viaja en `slot/clientes`; se completa cuando el release que la incluya impacte en producción | — |

Resultado crudo: `docs/QA-240-249-produccion/resultados.json` (sellado con la
versión y cada medida).

> Corridas anteriores: **v1.0.158, 5/5**; **v1.0.156, 4/5**; **v1.0.154, 4/4**;
> **v1.0.153, 3/3**.

## Alcance de lo verificado

- **44 px (#249)**: medida real de las cajas en el demo público (los mismos
  componentes de la cuenta real) a 390 y 768; cualquier control por debajo de 44
  hace fallar el script.
- **Certificado embebible (#240)**: la página `/u/<serial>` acepta `?embed=1` y
  sigue resolviendo el informe del demo. El **origen EMBED** del visto/no visto
  queda registrado en el backend (código desplegado: `ORIGEN_APERTURA.EMBED` y el
  pasaje de `embed=1` en el API/página) y se ejercita punta a punta en el arnés
  (`e2e/qa-240-informe-embebible.spec.js` **1/1** y
  `device-report-tracking.mjs` **PASS**): en la cuenta real la cronología dice
  «abierto desde el certificado embebido». En el **demo** el visto vive en
  memoria de la pestaña (limitación conocida), por eso la verificación de
  producción del origen se apoya en el código desplegado + arnés.
- **Mensajes, beneficios y reservas (#240)**: verificados en la cuenta demo
  (mensajes con «Nuevo»; Gs 250.000 y 45.000 puntos; reserva con vencimiento) y
  con contrato en `customer-portal.mjs`.
- **Pagos (#240)**: contrato en `customer-portal.mjs` (el pago confirmado viaja
  con monto, medio y fecha + total) y demo en el unit; el paso de producción se
  activa post-deploy.

## Reproducir

```bash
node scripts/qa-240-249-produccion.mjs
# harness local (mismo script):
MOBOS_QA_URL=http://localhost:5210 MOBOS_QA_OUT=/tmp/qa240249 node scripts/qa-240-249-produccion.mjs
```

