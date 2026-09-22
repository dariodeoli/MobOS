# #185 — Recorrido funcional en producción · módulo **Finanzas** (v1.0.141)

- **Issue:** #185 · **Módulo:** Finanzas · **Versión:** producción **v1.0.141**
  (`npm run release:smoke` OK)
- **Método:** Playwright headless contra `https://app.moboss.online/demo`
  (demo anónima, datos aislados en el navegador) · sonda re-ejecutable
  `scripts/qa-185-finanzas-demo.mjs`
- **Fecha:** 2026-09-22 · **Corrida:** definitiva
- **Resultado:** **16/16 pasos OK** · **25 capturas** · **0 errores de consola** ·
  **0 respuestas API ≥400** · **0 pedidos fallidos**

Mismos 16 pasos que las corridas anteriores (`../produccion/reporte.md` de
v1.0.137 y `../produccion-1.0.139/reporte.md`): cuentas de cobro (efectivo
multi-moneda, transferencia, tarjeta/procesadoras, Pix, USDT - Cripto, canje),
edición y móvil 390 px, conciliación, caja (turno, arqueo y auditoría), seguro de
ventas y Resumen/Ganancias. Capturas `01-…` a `25-…` en esta carpeta ·
resultados crudos en `resultados.json`.

Complementos de la misma tanda (v1.0.141) en `docs/qa/produccion-1.0.141/`:
§9 montos 5/5 · §17/§18/§19 8/8 con 11/11 cortes · caja 2/2 · Resumen/Análisis
6/6 · último usado 6/6.

Reproducir:

```bash
QA_BASE_URL=https://app.moboss.online QA_OUT=docs/qa/185/produccion-1.0.142 \
  node scripts/qa-185-finanzas-demo.mjs
```
