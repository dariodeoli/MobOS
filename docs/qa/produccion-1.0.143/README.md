# Producción v1.0.143 — verificación post-deploy del dominio Finanzas

Corridas del 2026-09-22 contra `https://app.moboss.online` (**v1.0.143**,
`release:smoke` OK) sobre la demo pública. Esta versión ya incluye los costos
reales al margen (unidad por IMEI y trade-in) integrados por el equipo.

| Sonda | Resultado | Carpeta |
| --- | --- | --- |
| §9 montos (`qa-148-montos-produccion.mjs`) | **5/5** | `montos/` |
| §17/§18/§19 (`qa-148-17-18-19-produccion.mjs`) | **8/8** · **11/11** cortes | `148-17-18-19/` |
| §18 ventas por caja (`QA_SOLO_DEMO=1`) | **2/2** | `ventas-por-caja/` |
| §18 analytics (`QA_SOLO_DEMO=1`) | **1/1** | `analytics/` |
| Recorrido de Finanzas #185 | **16/16** · 25 capturas · 0 errores | `../185/produccion-1.0.143/` |
| Resumen/Análisis (#171) | **6/6** | `../171/` (capturas refrescadas) |
| último usado (#209) | **6/6** | `../209/produccion/` (capturas refrescadas) |
| Tokens v2 en Finanzas (`qa-finanzas-tokens-v2.mjs`) | **8/8** · sin roturas | `../tokens-v2-finanzas/1.0.143/` |

Sin hallazgos nuevos. Reproducir:

```bash
bash scripts/qa-finanzas-post-deploy.sh 1.0.143
QA_VERSION=1.0.143 QA_BASE_URL=https://app.moboss.online node scripts/qa-finanzas-tokens-v2.mjs
```
