# #185 — Recorrido funcional de **Finanzas** en producción · v1.0.175

- **Issue:** #185 (recorrido funcional por módulos) · **Módulo:** Finanzas
- **Versión:** producción **v1.0.175** · **Fecha:** 2026-09-26
- **Método:** `QA_BASE_URL=https://app.moboss.online QA_OUT=docs/qa/185/produccion-1.0.175 node scripts/qa-185-finanzas-demo.mjs`
  (demo pública, sin credenciales; no toca tiendas reales)
- **Resultado:** **16/16 pasos OK** · 25 capturas · **0 errores de consola** ·
  **0 respuestas API ≥ 400** · **0 pedidos fallidos**.

## Pasos verificados (todos en verde)

| # | Paso |
| --- | --- |
| 1 | Entrada a la demo como Dueño |
| 2 | Bancos: estado inicial |
| 3 | Efectivo: campos contextuales y nombre automático (Gs/USD/otra) |
| 4 | Efectivo: guardar la cuenta |
| 5 | Transferencia: banco, titular, documento, cuenta y nombre automático |
| 6 | Transferencia: guardar |
| 7 | Tarjeta: procesadoras, comisión y acreditación |
| 8 | Pix: moneda fija BRL y llave |
| 9 | USDT - Cripto: moneda fija USD y referencia |
| 10 | Canje: referencia/valor y guardado |
| 11 | Bancos: tabla completa y edición de una cuenta |
| 12 | Bancos en móvil (390 px) sin desborde |
| 13 | Conciliación en la demo |
| 14 | Caja: turno, arqueo y auditoría en la demo |
| 15 | Seguro de ventas en Configuración (demo) |
| 16 | Resumen y Ganancias en la demo |

## Novedades respecto de las corridas anteriores

- El paso de **seguro** entra por **Configuración → Comercial** (grupo #253) y
  sigue viendo `#seguro-toggle`, el `%` y el guardado en demo.
- La **caja** verifica además que la diferencia no anticipe un número sin arqueo
  (`—`), el fix de la ronda del 26/09 ya desplegado.
- La guía de la demo se cierra con el patrón robusto de `e2e/helpers/demo.js`
  (la carrera del `count` instantáneo quedó corregida en la sonda).

Evidencia: capturas `01-…` a `25-…` y `resultados.json` en esta carpeta.
