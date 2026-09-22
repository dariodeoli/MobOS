# QA #169 — Lote 6-C: Finanzas y Reportes (densidad y alineación)

- **Issue:** #169 · **Rama:** `slot/finanzas` · **Fecha:** 2026-09-21
- **Alcance:** migrar Finanzas y Reportes al lenguaje de tablas/filas compactas y
  a la biblioteca de objetos (`docs/TABLAS.md`, `docs/PLANTILLA-OBJETOS.md`),
  aprovechar el ancho sin scroll horizontal, estados vacíos coherentes y acciones
  a la vista. Sin cambios de negocio ni de permisos.

## Qué se midió y qué se ajustó

`scripts/qa-169-densidad-finanzas.mjs` recorre las vistas con **datos reales**
(sesión de dueño) a **1280** y **1440** y mide `scrollWidth`/`clientWidth` de cada
contenedor con scroll. Resultado final: **0 desbordes** en las 8 vistas.

| Vista | Contenedor medido | 1280 | 1440 |
| --- | --- | --- | --- |
| Conciliación | `conciliacion-grupos`, `conciliacion-tabla` | 0 / 0 | 0 / 0 |
| Caja (auditoría de efectivo) | `auditoria-efectivo-tabla` | 0 | 0 |
| Créditos | `creditos-tabla` | 0 | 0 |
| Reportes (curva ABC) | `reportes-abc-tabla` | 0 | 0 |
| Gastos, Cobranzas, Comisiones, Resumen | contenedores propios | 0 | 0 |

Ajustes:

- **Conciliación**: la grilla de pagos pedía 54 px de scroll a 1280
  (`min-w-[64rem]`); pasa a `min-w-[60rem]` conservando las columnas medidas
  sobre el dato real (`docs/TABLAS.md` §2). A 1440 ya entraba.
- **Testids de tabla** (regla §1: el wrapper lleva `data-testid`): se agregaron
  `conciliacion-grupos`, `conciliacion-tabla`, `auditoria-efectivo-tabla` y
  `reportes-abc-tabla` (Créditos ya tenía `creditos-tabla`).
- **Alineación con la biblioteca**: la auditoría de duplicación
  (`node scripts/auditoria-duplicacion.mjs`) da **0 pendientes** en clases de
  tabla copiadas, avisos inline, formato de fecha duplicado, portapapeles,
  descargas o vista lista/cuadrícula: las pantallas ya consumen `tabla.js`,
  `utils/fecha`, `Aviso` y los objetos compartidos. Las filas siguen §1–§3
  (una línea, `px-3.5 py-2`, badge `w-fit`, montos `tabular-nums`).
- **e2e**: las specs de caja y conciliación ahora afirman que no hay scroll
  horizontal (`finanzas-caja.spec.js`, `finanzas-conciliacion.spec.js`).

## Capturas

`docs/qa/169/1280-<vista>.jpg` y `docs/qa/169/1440-<vista>.jpg` (conciliación,
caja, gastos, créditos, cobranzas, comisiones, reportes, resumen) · medidas en
`medidas.json`.

## Checks

`lint` 0 errores · `npm test` 472/472 · build FE ✓ · build BE con `BUILD_ID` ✓ ·
`test:unit` 71/71 · e2e de finanzas/análisis 8/8 · `test:e2e:smoke` 7/7.
QA por rol: las capturas y las specs corren con la sesión de **dueño**; sin
cambios de permisos.

## Reproducir

```bash
# entorno local (base e2e aislada) y luego:
QA_API_URL=http://localhost:3115 QA_BASE_URL=http://localhost:5215 \
  node scripts/qa-169-densidad-finanzas.mjs
```
