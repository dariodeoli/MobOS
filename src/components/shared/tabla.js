// Objetos de tabla y listados (docs/TABLAS.md, docs/PLANTILLA-OBJETOS.md §3).
// Las clases de las celdas se escriben una sola vez acá: si una pantalla vuelve
// a copiarlas a mano, el test de objetos falla.
//
// - ROTULO_DATO: etiqueta corta de un dato (KPI, campo de ficha, columna).
// - CELDA_ENCABEZADO: encabezado de una grilla de tabla, en una línea.
// - ROTULO_SECCION: título de sección dentro de un panel o listado (h3/h4).
// - CELDA_DATO: dato secundario de una grilla o listado (truncado).
// - CELDA_NUMERO: número o cantidad alineado a la derecha con dígitos
//   tabulares. Para dinero va el objeto `ui/CeldaMoneda` (que renderiza
//   `Money`), no esta clase.

export const ROTULO_DATO = 'text-[10px] font-bold uppercase tracking-wider text-mute'

export const CELDA_ENCABEZADO = `truncate ${ROTULO_DATO}`

export const ROTULO_SECCION = 'text-xs font-bold uppercase tracking-wider text-mute'

export const CELDA_DATO = 'truncate text-xs text-mute'

export const CELDA_NUMERO = 'text-right tabular-nums'
