# #185 — Recorrido funcional en producción · módulo **Finanzas** (v1.0.139)

- **Issue:** #185 (épica POS y finanzas, por módulos) · **Módulo:** Finanzas
- **Versión verificada:** producción **v1.0.139**
- **Método:** Playwright **headless** contra `https://app.moboss.online/demo`
  (demo anónima, datos aislados en el navegador; no se tocó ninguna tienda real)
- **Fecha:** 2026-09-22 · **Sonda:** `scripts/qa-185-finanzas-demo.mjs` (re-ejecutable)
- **Resultado:** **16/16 pasos OK** · **25 capturas** · **0 errores de consola** ·
  **0 respuestas API ≥400** · **0 pedidos fallidos**

## Pasos

- ✅ **entrada a la demo** — demo abierta como dueño · menú Finanzas visible
- ✅ **bancos: estado inicial** — 9 cuentas demo (Caja Gs/USD, Itaú, Continental…)
- ✅ **efectivo: campos contextuales y nombre automático (Gs/USD/otra)**
- ✅ **efectivo: guardar la cuenta**
- ✅ **transferencia: banco, titular, documento, cuenta y nombre automático**
- ✅ **transferencia: guardar**
- ✅ **tarjeta: procesadoras, comisión y acreditación** (Bancard 3%, acredita 2 días)
- ✅ **Pix: moneda fija BRL y llave**
- ✅ **USDT - Cripto: moneda fija USD y referencia**
- ✅ **canje: referencia/valor y guardado** (15 cuentas al final)
- ✅ **bancos: tabla completa y edición de una cuenta**
- ✅ **bancos en móvil (390 px) sin desborde**
- ✅ **conciliación en la demo** (21 pagos listados · 1 lote)
- ✅ **caja: turno, arqueo y auditoría en la demo** (turno abierto, auditoría con datos)
- ✅ **seguro de ventas en Configuración (demo)** (toggle + % + fórmula)
- ✅ **resumen y ganancias en la demo** (resultado mostrado Gs 3.255.000)

## Evidencia

- Capturas `01-…` a `25-…` en esta carpeta · resultados crudos en `resultados.json`.
- Repaso por sección de la épica (`#148 §17/§18/§19`) en `docs/qa/148-17-18-19.md`.
- Informe previo (v1.0.137): `docs/qa/185/produccion/reporte.md`.

## Alcance del issue

#185 cubre varios módulos; este informe cierra **Finanzas** en producción.
Impresión y POS/ventas tienen su propia evidencia en los comentarios del issue
(`docs/qa/185-impresion/`, `docs/qa/185-comprobantes-pdf/`, `docs/qa/187b/`).

Reproducir:

```bash
QA_BASE_URL=https://app.moboss.online QA_OUT=docs/qa/185/produccion-1.0.140 \
  node scripts/qa-185-finanzas-demo.mjs
```
