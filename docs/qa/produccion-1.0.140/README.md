# Producción v1.0.140 — QA post-deploy de Finanzas

Corridas del 2026-09-22 contra `https://app.moboss.online` (**v1.0.140**,
`release:smoke` OK) sobre la demo pública. Cierra los pendientes que la línea
base de `../produccion-1.0.139/` había dejado abiertos.

| Sonda | Resultado | Carpeta |
| --- | --- | --- |
| `scripts/qa-148-montos-produccion.mjs` (§9) | **5/5** | `montos/` |
| `scripts/qa-148-17-18-19-produccion.mjs` (§17/§18/§19) | **8/8** · **11/11** cortes | `148-17-18-19/` |
| `scripts/qa-148-ventas-por-caja.mjs` (`QA_SOLO_DEMO=1`) | **2/2** | `ventas-por-caja/` |
| `scripts/qa-148-analytics-pos.mjs` (`QA_SOLO_DEMO=1`) | **1/1** | `analytics/` |
| `scripts/qa-185-finanzas-demo.mjs` (#185) | **16/16** · 25 capturas | `../185/produccion-1.0.140/` |

Lo que cambió respecto de la línea base .139:

- **Montos**: un monto por encima del tope real ya no pasa en silencio — el campo
  lo conserva y lo marca (`title` con el máximo) y el guardado lo explica en
  Gastos y Caja.
- **Analytics**: aparecen los cortes que faltaban (Efectivo, Reembolsos, Cobros
  netos por tipo/cuenta/sucursal y Ventas por caja).
- **Saldo a favor** (equivalente a gift cards): se ve en «Cobros netos por tipo»
  con una venta demo (`../148-18-gift-cards/demo-analytics.jpg`) y queda
  explicado en Configuración → Documentación (`../148-18-gift-cards/documentacion-gift-cards.jpg`).

Reproducir:

```bash
npm run release:smoke
QA_BASE_URL=https://app.moboss.online QA_OUT=docs/qa/produccion-1.0.140/montos \
  node scripts/qa-148-montos-produccion.mjs
QA_BASE_URL=https://app.moboss.online QA_OUT=docs/qa/produccion-1.0.140/148-17-18-19 \
  node scripts/qa-148-17-18-19-produccion.mjs
```
