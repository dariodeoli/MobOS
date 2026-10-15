// Personalización de la planilla de Unidades (#466). Puro, sin React ni red.
// La empresa guarda un default (Tenant.settings.stockDisplay.planilla) y cada
// usuario puede pisar campo a campo el suyo (se recuerda en su navegador). Un
// campo ausente en el del usuario significa «como la empresa».

export const OPCIONES_PLANILLA = Object.freeze({
  proveedor: Object.freeze([['sigla', 'Sigla'], ['nombre', 'Nombre completo']]),
  ubicacion: Object.freeze([['abrev', 'Abreviatura'], ['nombre', 'Nombre completo'], ['icono', 'Solo ícono']]),
  imei: Object.freeze([['completo', 'Completo'], ['ultimos4', 'Últimos 4 dígitos']]),
  estado: Object.freeze([['abrev', 'Ícono y 3 letras'], ['completo', 'Texto completo']]),
})

/** Columnas de la grilla, con su ancho fijo. `modelo` y las acciones no se ocultan ni se mueven. */
export const COLUMNAS_PLANILLA = Object.freeze({
  condicion: Object.freeze({ titulo: 'Cond.', ayuda: 'Condición: nuevo o semi nuevo', etiqueta: 'Condición', ancho: '2.5rem' }),
  ingreso: Object.freeze({ titulo: 'Ingr.', ayuda: 'Fecha de ingreso', etiqueta: 'Ingreso', ancho: '3rem' }),
  imei: Object.freeze({ titulo: 'IMEI', ayuda: 'IMEI o serial de la unidad', etiqueta: 'IMEI', ancho: '6.5rem', anchoCorto: '3.5rem' }),
  ubicacion: Object.freeze({ titulo: 'Ubic.', ayuda: 'Sucursal · depósito', etiqueta: 'Sucursal y depósito', ancho: '6.75rem', anchoNombre: '14rem', anchoIcono: '2.5rem' }),
  proveedor: Object.freeze({ titulo: 'Prov.', ayuda: 'Proveedor', etiqueta: 'Proveedor', ancho: '3.25rem', anchoNombre: '9rem' }),
  costo: Object.freeze({ titulo: 'Costo', ayuda: 'Costo de la unidad', etiqueta: 'Costo', ancho: '5.5rem', derecha: true }),
  estado: Object.freeze({ titulo: 'Estado', ayuda: 'Estado de la unidad; vendido con su nota', etiqueta: 'Estado', ancho: '11.75rem', anchoCompleto: '15rem' }),
  verificado: Object.freeze({ titulo: 'Verif.', ayuda: 'Quién y cuándo verificó la unidad', etiqueta: 'Verificado', ancho: '7rem' }),
  garantia: Object.freeze({ titulo: 'Garantía', ayuda: 'Fin de la garantía', etiqueta: 'Garantía', ancho: '4.25rem' }),
  nota: Object.freeze({ titulo: 'Nota', ayuda: 'Nota interna: tocá para editarla', etiqueta: 'Nota', ancho: 'minmax(5rem,1fr)' }),
})

export const ORDEN_COLUMNAS = Object.freeze(Object.keys(COLUMNAS_PLANILLA))
/** Orden de fábrica: lo que se mira primero (estado, ubicación) cerca del modelo. */
export const COLUMNAS_DEFECTO = Object.freeze(['condicion', 'ingreso', 'imei', 'ubicacion', 'proveedor', 'costo', 'estado', 'verificado', 'garantia', 'nota'])

export const DEFECTO_PLANILLA = Object.freeze({
  proveedor: 'sigla', ubicacion: 'abrev', imei: 'completo', estado: 'abrev', columnas: COLUMNAS_DEFECTO, costo: true,
})

/** Solo lo conocido y válido; lo ausente queda ausente (no se rellena con el de fábrica). */
export function normalizarPlanilla(crudo) {
  const base = crudo && typeof crudo === 'object' && !Array.isArray(crudo) ? crudo : {}
  const salida = {}
  for (const [clave, opciones] of Object.entries(OPCIONES_PLANILLA)) {
    if (opciones.some(([valor]) => valor === base[clave])) salida[clave] = base[clave]
  }
  if (Array.isArray(base.columnas)) salida.columnas = [...new Set(base.columnas.filter((id) => ORDEN_COLUMNAS.includes(id)))]
  if (typeof base.costo === 'boolean') salida.costo = base.costo
  return salida
}

/** Preferencia efectiva: fábrica < empresa < usuario, campo a campo. */
export function planillaEfectiva(empresa, usuario) {
  const e = normalizarPlanilla(empresa)
  const u = normalizarPlanilla(usuario)
  return { ...DEFECTO_PLANILLA, ...e, ...u }
}

/** Columnas a dibujar: las elegidas en su orden; `costo` solo si el rol lo ve y la preferencia lo deja. */
export function columnasVisibles(prefs, { verCosto = false } = {}) {
  const elegidas = prefs?.columnas || COLUMNAS_DEFECTO
  return elegidas.filter((id) => COLUMNAS_PLANILLA[id] && (id !== 'costo' || (verCosto && prefs?.costo !== false)))
}

/** Ancho de una columna según el modo elegido (todas con ancho fijo: encabezado y celdas comparten la grilla). */
export function anchoColumna(id, prefs) {
  const col = COLUMNAS_PLANILLA[id]
  if (!col) return 'auto'
  if (id === 'imei' && prefs?.imei === 'ultimos4') return col.anchoCorto
  if (id === 'ubicacion') return prefs?.ubicacion === 'nombre' ? col.anchoNombre : prefs?.ubicacion === 'icono' ? col.anchoIcono : col.ancho
  if (id === 'proveedor' && prefs?.proveedor === 'nombre') return col.anchoNombre
  if (id === 'estado' && prefs?.estado === 'completo') return col.anchoCompleto
  return col.ancho
}

/** Plantilla de la grilla: [casilla] [modelo] [columnas…] [acciones]. */
export function plantillaColumnas(prefs, columnas) {
  return ['1.5rem', 'minmax(11rem,2.4fr)', ...columnas.map((id) => anchoColumna(id, prefs)), '1.75rem'].join(' ')
}

// Qué columnas se sueltan primero cuando el ancho no alcanza (las primeras caen antes).
const SOLTAR_PRIMERO = ['garantia', 'ingreso', 'condicion', 'nota', 'proveedor', 'verificado']
const PX_REM = 16
const GAP_PX = 6
// Casilla + modelo (mínimo) + acciones.
const FIJO_REM = 1.5 + 11 + 1.75
const RELLENO_PX = 18

const remMinimo = (ancho) => {
  const coincide = /([\d.]+)rem/.exec(String(ancho))
  return coincide ? Number(coincide[1]) : 4
}

/**
 * Columnas que entran en `anchoPx` (el ancho de la planilla): se mantienen las elegidas y su orden,
 * soltando primero las menos importantes. La nota se achica hasta 4 rem antes de soltarse.
 */
export function columnasQueEntran(prefs, opciones, anchoPx) {
  let columnas = columnasVisibles(prefs, opciones)
  const necesario = (lista) => (FIJO_REM + lista.reduce((suma, id) => suma + (id === 'nota' ? 4 : remMinimo(anchoColumna(id, prefs))), 0)) * PX_REM + (lista.length + 2) * GAP_PX + RELLENO_PX
  for (const id of SOLTAR_PRIMERO) {
    if (necesario(columnas) <= anchoPx) break
    columnas = columnas.filter((columna) => columna !== id)
  }
  return columnas
}

const PREFIJOS =/^(sucursal|suc\.?|sede|local|tienda)\s+/i

/** «Sucursal Villamorra» → «VIL». Vacío si no hay nombre. */
export function siglaSucursal(nombre) {
  const limpio = String(nombre || '').trim().replace(PREFIJOS, '')
  if (!limpio) return ''
  const palabras = limpio.split(/\s+/).filter(Boolean)
  const sigla = palabras.length > 1 ? palabras.map((p) => p[0]).join('') : limpio.slice(0, 3)
  return sigla.toUpperCase().slice(0, 3)
}

/** Las 4 últimas cifras de un IMEI/serial (o el texto entero si es más corto). */
export function imeiUltimos4(serial) {
  const texto = String(serial || '').replace(/\s+/g, '')
  return texto.length <= 4 ? texto : texto.slice(-4)
}

/** «hoy 15:30» o «14/10 15:30» para la columna Verif. (la fecha completa va en el tooltip). */
export function fechaHoraCorta(valor, ahora = new Date()) {
  if (!valor) return ''
  const fecha = new Date(valor)
  if (Number.isNaN(fecha.getTime())) return ''
  const dos = (n) => String(n).padStart(2, '0')
  const hora = `${dos(fecha.getHours())}:${dos(fecha.getMinutes())}`
  return fecha.toDateString() === ahora.toDateString() ? `hoy ${hora}` : `${dos(fecha.getDate())}/${dos(fecha.getMonth() + 1)} ${hora}`
}
