# Producción v1.0.139 — línea base antes de .140

Corridas del 2026-09-22 contra `https://app.moboss.online` (**v1.0.139**),
previas al deploy de **.140**, que integra #148 §9 (montos) y §18 (analytics al
día). Sirven de comparación antes/después y de constancia de lo ya verificado.

## #148 §9 montos y monedas — `montos/`

**3/5**: los dos fallos son exactamente la brecha que cierra .140 (el campo no
marcaba ni bloqueaba por encima del tope real; capturas `gastos-tope.jpg` y
`caja-tope.jpg` del estado previo). El resto: el campo no trunca, un monto
dentro del tope no se marca y la demo no escribe en el servidor.

Reproducir post-.140:

```bash
QA_BASE_URL=https://app.moboss.online QA_OUT=docs/qa/produccion-1.0.140/montos \
  node scripts/qa-148-montos-produccion.mjs
```

## #148 §18 ventas por caja — `ventas-por-caja/`

**2/2**: el panel «Ventas por caja» con sesiones Abierta/Cerrada (ya en .139).

```bash
QA_SOLO_DEMO=1 QA_BASE_URL=https://app.moboss.online \
  QA_OUT=docs/qa/produccion-1.0.140/ventas-por-caja node scripts/qa-148-ventas-por-caja.mjs
```

## #148 §18 analytics del POS

Ver `docs/qa/148-17-18-19.md`: en .139 el tablero muestra el núcleo (ventas de
hoy vs ayer, pedidos, ticket promedio, ventas netas, top productos) y .140
agrega Efectivo, Reembolsos, Cobros netos por tipo/cuenta/sucursal y Ventas por
caja.

## #185 recorrido de Finanzas

`docs/qa/185/produccion-1.0.139/`: **16/16 pasos · 25 capturas** con la misma
sonda del recorrido (`scripts/qa-185-finanzas-demo.mjs`).
