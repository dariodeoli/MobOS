# Producción v1.0.141 — verificación definitiva del dominio Finanzas

Corridas del 2026-09-22 contra `https://app.moboss.online` (**v1.0.141**,
`release:smoke` OK) sobre la demo pública. Es la corrida de cierre del dominio:
todo lo que el dominio toca quedó verificado en la última versión publicada.

| Sonda | Resultado | Carpeta |
| --- | --- | --- |
| `scripts/qa-148-montos-produccion.mjs` (§9 montos) | **5/5** | `montos/` |
| `scripts/qa-148-17-18-19-produccion.mjs` (§17/§18/§19) | **8/8** · **11/11** cortes | `148-17-18-19/` |
| `scripts/qa-148-ventas-por-caja.mjs` (`QA_SOLO_DEMO=1`) | **2/2** | `ventas-por-caja/` |
| `scripts/qa-148-analytics-pos.mjs` (`QA_SOLO_DEMO=1`) | **1/1** | `analytics/` |
| `scripts/qa-185-finanzas-demo.mjs` (recorrido #185) | **16/16** · 25 capturas | `../185/produccion-1.0.141/` |
| `scripts/qa-171-resumen-analisis-produccion.mjs` (Resumen/Análisis) | **6/6** | `../171/` (capturas refrescadas) |
| `scripts/qa-209-finanzas-produccion.mjs` (último usado) | **6/6** | `../209/produccion/` (capturas refrescadas) |

**Resultado:** sin hallazgos nuevos; el dominio queda verificado de punta a punta
en v1.0.141. Índice del dominio: `../finanzas-cierre-dominio.md`.

Reproducir:

```bash
npm run release:smoke
node scripts/qa-version.mjs 1.0.141
QA_BASE_URL=https://app.moboss.online QA_OUT=docs/qa/produccion-1.0.142/montos \
  node scripts/qa-148-montos-produccion.mjs
QA_BASE_URL=https://app.moboss.online QA_OUT=docs/qa/185/produccion-1.0.142 \
  node scripts/qa-185-finanzas-demo.mjs
```
