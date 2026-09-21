# QA #171 — Unificación Resumen/Análisis (fase 2 de #145)

- **Fecha:** 2026-09-21 · **Rama:** `slot/finanzas`
- **Alcance:** verificar con datos reales los indicadores de la vista ejecutiva y
  extendida (indicadores del período, curva ABC, stock/rotación, pagos por
  cuenta/procesadora y diferencias de conciliación) y el adaptador que consumen
  Resumen y Análisis.
- **Método:** tres frentes — servidor vs SQL de control, coherencia UI entre
  pantallas con el mismo rango, y el build desplegado en producción (demo
  público). Sin consultas pagas.

## 1) Servidor vs SQL de control — 55/55

`scripts/qa-171-metricas-servidor.mjs` compara cada número de `/api/reports`
(`groupBy=day|product|payments` con `paymentsBy=processor|account`) y del
resumen liviano de conciliación contra un cálculo independiente en SQL sobre la
misma ventana (mes en curso, hora Paraguay). Cubre:

- Totales: pedidos, facturado, bruto, descuentos, delivery, unidades, cobrado,
  pendiente, costo, ganancia, comisión de cobro, pedidos pagados/pendientes y
  líneas sin costo.
- Curva ABC por producto: monto por producto, rango válido del % acumulado
  (con empates el orden interno es del servidor) y coherencia de la clase.
- Stock: unidades, valor a costo, productos sin costo, faltantes, unidades
  vendidas, días de stock y rotación.
- Pagos por procesadora y por cuenta: operaciones, monto y reembolsado por corte.
- Conciliación: operaciones, confirmado, pendiente, reembolsado, verificado,
  por conciliar, diferencia de lotes y lotes del período.
- Adaptador `metricasNucleo.normalizarMetricas`: facturado, cobrado, pendiente,
  pedidos, ticket, serie, top con ABC, stock y conciliación.

Para que la comisión de cobro no quedara en cero se creó una cuenta tarjeta con
3% de fee y una venta de 1.000.000 pagada con ella (fee 30.000), verificada en
ambos lados.

## 2) Coherencia UI con el mismo rango — 14/14

`scripts/qa-171-resumen-analisis-ui.mjs` (Playwright con sesión real) navega
Resumen, Reportes, Ganancias, Ganadores y Conciliación con el mismo rango y
comprueba que lo mostrado sea lo del servidor y coincida entre pantallas:

- Resumen: facturado/cobrado/pendiente, ventas, ticket, top con clase ABC,
  stock valorizado/días de stock/rotación, cobros por procesadora y por cuenta,
  y el resumen de conciliación.
- Reportes: los mismos totales, el mismo top y el mismo stock; el badge de
  comisiones de cobro cuando hay fee.
- Ganancias vs Reportes: **mismo resultado** para el mismo período
  (`ganancia-resultado` == `reporte-resultado`).
- Ganadores: cantidades por línea del servidor.
- Finanzas → Conciliación: repite el resumen de la portada.
- La portada avisa cuando el reporte viene truncado (se fuerza `truncated` en la
  respuesta para verificarlo).

## 3) Producción (demo público, build desplegado) — 6/6

`scripts/qa-171-resumen-analisis-produccion.mjs`:

- El bundle publicado incluye los textos de las vistas unificadas
  (`Stock valorizado`, `Curva ABC por venta`, `Cuentas con mayor ingreso`,
  `Diferencia de lotes`, `Curva ABC y antigüedad`), rastreando los chunks por
  ruta.
- `/api/reports` y `/api/finance/reconciliation` exigen sesión en producción
  (401/403) y no filtran métricas.
- El demo entra por `/demo` y navega Resumen, Reportes y Ganancias sin errores
  propios y **sin llamar a los endpoints reales** de métricas.

El modo demo conserva la caché local (decisión del plan): las tarjetas de
indicadores del servidor solo aparecen con sesión real, por eso la verificación
de sus números es la de los puntos 1 y 2.

## Hallazgo ajeno (no se toca en #171)

`components/app/AppShell.jsx:358` usa `className={collapsed && 'lg:hidden'}`:
con `collapsed` falso React registra en consola «Received `false` for a
non-boolean attribute `className`» en todas las pantallas. Fix sugerido:
`className={collapsed ? 'lg:hidden' : undefined}` (o envolver en `cn`). Es del
dominio del shell (MOS-DSN/MOS-PLT), se reporta.

## Ajuste de #171

- **La portada ejecutiva ahora avisa si el reporte viene truncado** (> 5.000
  pedidos en el período), como pedía el plan en riesgos: badge naranja junto al
  selector de rango (`Resumen.jsx`) + test de propagación en
  `metricasNucleo.test.js`.

## Checks

`lint` 0 errores · `npm test` 395/395 · build FE ✓ · build BE con `BUILD_ID` ✓ ·
`test:unit` 71/71 · `test:e2e:smoke` 7/7 · sondas 55/55 + 14/14 + 6/6.
