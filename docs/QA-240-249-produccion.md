# Verificación en producción — v1.0.153 (#240 certificado embebible · #249 clientes)

`node scripts/qa-240-249-produccion.mjs` contra `app.moboss.online` (23/9/2026,
versión desplegada **v1.0.153**): **3/3 pasos OK**.

| Paso | Resultado | Captura |
|---|---|---|
| #249 · clientes a 390: acciones, chips y lote ≥44 px | **ojito 44×44 · WhatsApp 44×44**; elegir plantilla, chip «Todos» y el área de la casilla de lote también ≥44 | `01-clientes-390.png`, `02-clientes-acciones-390.png` |
| #249 · clientes a 768 | ojito **44×44**; WhatsApp y chip «Con deuda» ≥44 | `03-clientes-768.png` |
| #240 · certificado embebible con `?embed=1` | el informe abre con tienda, serial enmascarado y aviso (la superficie que embebe INV) | `04-certificado-embebible-390.png` |

Resultado crudo: `docs/QA-240-249-produccion/resultados.json` (sellado con la
versión y cada medida).

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

## Reproducir

```bash
node scripts/qa-240-249-produccion.mjs
# harness local (mismo script):
MOBOS_QA_URL=http://localhost:5210 MOBOS_QA_OUT=/tmp/qa240249 node scripts/qa-240-249-produccion.mjs
```
