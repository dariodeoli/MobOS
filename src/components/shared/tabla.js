// Objetos de tabla y listados (docs/TABLAS.md, docs/PLANTILLA-OBJETOS.md §3).
// La celda de encabezado y el rótulo de sección se escriben una sola vez acá:
// si una pantalla vuelve a copiar la clase a mano, el test de objetos falla.
//
// - ROTULO_DATO: etiqueta corta de un dato (KPI, campo de ficha, columna).
// - CELDA_ENCABEZADO: encabezado de una grilla de tabla, en una línea.
// - ROTULO_SECCION: título de sección dentro de un panel o listado (h3/h4).

export const ROTULO_DATO = 'text-[10px] font-bold uppercase tracking-wider text-mute'

export const CELDA_ENCABEZADO = `truncate ${ROTULO_DATO}`

export const ROTULO_SECCION = 'text-xs font-bold uppercase tracking-wider text-mute'
