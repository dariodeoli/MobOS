// Formato único de fecha y hora del front (docs/PLANTILLA-OBJETOS.md §7).
// Las pantallas no arman `toLocaleString` a mano: eligen el helper según el
// contexto. Todos devuelven el texto de vacío (por defecto '—') cuando el valor
// falta o no es una fecha válida, para que nunca aparezca "Invalid Date".
//
// La hora va SIEMPRE en 24 h (`hour12: false`), como pide la regla de formato
// del repo; el locale es-PY de CLDR rinde 12 h con "p. m." si no se fuerza.

const ES_PY = 'es-PY'
const OPCIONES_HORA = { hour12: false }

// Fecha válida o null. Acepta Date o cualquier valor que `new Date` entienda.
export function fechaValida(value) {
  if (!value) return null
  const fecha = value instanceof Date ? value : new Date(value)
  return Number.isNaN(fecha.getTime()) ? null : fecha
}

// Fecha y hora cortas: "17/9/26, 15:30" (es-PY, 24 h). El formato de fila y
// de detalle más usado de la app.
export function fechaHora(value, vacio = '—') {
  const fecha = fechaValida(value)
  return fecha ? fecha.toLocaleString(ES_PY, { dateStyle: 'short', timeStyle: 'short', ...OPCIONES_HORA }) : vacio
}

// Solo la fecha: "17/9/2026" (es-PY). Para listados y fichas sin hora.
export function fechaDia(value, vacio = '—') {
  const fecha = fechaValida(value)
  return fecha ? fecha.toLocaleDateString(ES_PY) : vacio
}

// Fecha compacta con mes corto y hora: "17 sep, 15:30". Para filas angostas
// (rendiciones, repartos) donde la fecha completa no entra.
export function fechaHoraCorta(value, vacio = '—') {
  const fecha = fechaValida(value)
  return fecha
    ? fecha.toLocaleString(ES_PY, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', ...OPCIONES_HORA })
    : vacio
}

// Día y mes cortos con hora: "17 sep · 15:30". La fecha de las listas densas
// (conciliación, auditoría) donde el año no aporta.
export function fechaCorta(value, vacio = '—') {
  const fecha = fechaValida(value)
  if (!fecha) return vacio
  const dia = fecha.toLocaleDateString(ES_PY, { day: '2-digit', month: 'short' })
  const hora = fecha.toLocaleTimeString(ES_PY, { hour: '2-digit', minute: '2-digit', ...OPCIONES_HORA })
  return `${dia} · ${hora}`
}
