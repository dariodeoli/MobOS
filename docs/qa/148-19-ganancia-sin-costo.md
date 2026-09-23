# #148 §19 — Las ventas con costo pendiente no inventan ganancia

- **Issues:** #148 (§19) · **Coordinación:** costo pendiente (#122), reportes
  unificados (#171) · **Rama:** `slot/finanzas`
- **Fecha:** 2026-09-23 · **Resultado:** hallazgo real corregido; Ganancias,
  Reportes y la tarjeta «Margen real» usan el mismo criterio con las líneas
  sin costo.

## Qué se verificó

Márgenes con costo real, último borde: qué pasa cuando **no hay costo
conocido**. El motor de reportes es explícito —«nunca inventa costos: la
ganancia se calcula solo sobre las líneas con `unitCostPyg` conocido y el resto
queda informado en `linesWithoutCost`/`salesWithoutCostPyg`»— y la tarjeta
«Margen real» de Reportes usa esa cuenta. Faltaba comprobar que **todas** las
superficies del mismo número hicieran lo mismo.

## Hallazgo (antes)

El resultado de **Análisis → Ganancias** (hero, desglose y calendario) y la
tarjeta de Ganancias dentro de **Reportes** calculaban
`ingresos − costo − gastos − ads` con `ingresos = totalPyg`, que **incluye las
ventas sin costo conocido**: esas ventas entraban como ganancia pura.

Con 26 líneas sin costo en el período (5.060.000 de venta) la misma pantalla
mostraba dos «Resultado» distintos: la tarjeta «Margen real» del reporte
(motor backend, correcta) y el desglose de Ganancias (inflado), y el hero de la
página de Ganancias podía mostrar el cálculo local (sin costos congelados)
hasta que llegaba el reporte.

Evidencia unit (antes del fix):

```
✖ las ventas con costo pendiente no inventan ganancia
  actual: undefined, expected: 50000
```

## Fix

`src/utils/ganancias.js` (única capa de cálculo de Ganancias, la comparten la
página, el calendario compartido y Reportes):

- `gananciaDelPeriodo`, `gananciaDelDia` y `gananciaDeRango` descuentan
  `salesWithoutCostPyg` del reporte y exponen `sinCostoPyg`/`lineasSinCosto`.
- `lineasDeGanancia` agrega la línea **«Ventas con costo pendiente (N líneas)»**
  con signo negativo, para que el desglose cierre y se vea por qué bajó.
- `Ganancias.jsx`: badge con el monto y las líneas pendientes
  («no suman ganancia»), y el héroe declara `data-fuente` (`api`/`local`).

Sin API (demo/offline) no cambia nada: `sinCostoPyg` es 0 y no aparece la línea.

## Verificación

- Unit (`src/utils/ganancias.test.js`, **9/9**): período, día y rango usan la
  misma regla; rótulo singular/plural; sin ventas sin costo no aparece la línea;
  los casos previos siguen igual.
- e2e `analisis.spec.js` **3/3**: la paridad Reportes ↔ Ganancias compara los
  mismos números; se agregó la espera explícita a `data-fuente="api"` porque el
  conteo local puede coincidir con el del reporte y la lectura caía en el
  cálculo sin costos congelados (carrera que el fix dejó visible).
- e2e demo de finanzas **5/5** (el camino local no cambia) · smoke **7/7** ·
  finanzas/comisiones/caja/último usado/menciones **8/8**.

## Coordinación

- **#122 (costo pendiente):** el aviso de Resumen ya existía; ahora la ganancia
  no cuenta esas ventas como margen. Completar el costo de una unidad **no
  cambia la venta ya cerrada** (la línea congela su costo): queda como candidato
  de producto poder conciliar el costo pendiente de una venta pasada.
- **#171 (reportes):** Ganancias, el calendario y la tarjeta de Reportes quedan
  alineados con el motor del backend.
- **Inventario:** la lista «Unidades sin costo» sigue siendo el lugar para
  completar costos (afecta a las ventas futuras).

## Checks

`lint` 0 errores (1 warning preexistente) · `npm test` **642/642** · build FE ✓ ·
build BE con `BUILD_ID` ✓ · `prisma:validate` ✓ · `db:check` ✓ ·
`test:e2e:smoke` **7/7** · e2e de análisis **3/3**, demo finanzas **5/5** y
finanzas **8/8** · sin marcadores de conflicto.
