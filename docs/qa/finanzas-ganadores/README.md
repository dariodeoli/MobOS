# Finanzas · Ganadores por margen real del período (#148 · #171)

- **Rama:** `slot/finanzas` · **Fecha:** 2026-09-25 · **Resultado:** el ranking
  de Análisis → **Ganadores** usa la ganancia real del período (la misma cuenta
  que Reportes y Ganancias) y muestra el margen por producto.

## El hallazgo

Los reportes ya mostraban costo y ganancia por producto (`groupBy=product` de
`/api/reports`), pero **Ganadores** —la pantalla de los «productos que más
venden»— ordenaba por venta y **no mostraba margen**. En una tienda con mix de
celulares y accesorios, el producto que más factura no siempre es el que más
deja (un cable con 53% de margen puede ganarle a un equipo con 30%).

## Qué cambió

- `topProductos(groups, limite, criterio)`: agrega **`ganancia`** (del costo
  congelado de cada venta), **`margenPct`** y **`sinCosto`**; con
  `criterio='ganancia'` ordena por ganancia y desempata por venta. El default
  `'venta'` mantiene el orden del backend (curva ABC) que usa el Resumen.
- `productosGanadores(...)`: el camino local/demo calcula la ganancia con la
  **foto de costo de la venta** (`precioCosto`) cuando existe. Sin foto de
  costo la ganancia queda en `null` (no se inventa margen) y el orden sigue
  siendo por cantidad, que es lo que ya usaba el Asistente.
- `Ganadores.jsx`: cada fila muestra **Ganancia** (verde si suma, rojo si
  resta) y el **margen %** junto a unidades y venta; el encabezado aclara el
  criterio: «Ordenado por ganancia del período» o, si la tienda no cargó
  costos, «Sin costos cargados: ordenado por venta».

## Evidencia

- **Unit** `src/lib/metricasNucleo.test.js`: orden por ganancia (Funda 150.000
  pasa a iPhone 100.000), margen 50% y venta sin costo informada aparte; el
  criterio `'venta'` conserva el orden del backend.
- **Unit** `src/utils/calculos.test.js`: con foto de costo → iPhone 220.000
  (44%) y Funda 50.000 (10%); sin costo → `ganancia: null` y `sinCosto: 1`.
- **e2e** `e2e/analisis.spec.js`: compara la primera fila contra el reporte
  real (mayor `profitPyg`) y exige «Ganancia» y «margen» visibles.
- **Captura**: `ganadores-mes.png` (período Mes, ordenado por ganancia).

## Verificación

- Suite enfocada (181 tests): `181 passed` — incluye `analisis`,
  `ia-configuracion`, `documentacion`, `ocultos-plataforma`, `shell-roles`,
  `admin`, `config-*`, `demo-anonimo`, `demo-finanzas*`, `seguridad-cuenta`,
  `permissions` y equipo.
- `npm test` (733) y `npm --prefix backend run test:unit` (75) en verde;
  `lint` 0 errores; builds FE/BE con `BUILD_ID` y `prisma:validate` OK.

## Coordinación

- **#171 (reportes unificados):** se reusa el mismo `groupBy=product` y la
  misma fórmula de margen; no hay una segunda cuenta de ganancia.
- **#83 (comisiones):** sin cambios; la comisión sigue saliendo del margen por
  venta.
- **Asistente:** `productosGanadores` mantiene su orden y contrato por defecto;
  el asistente no cambia de números.
