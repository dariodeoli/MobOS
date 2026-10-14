// Planilla de Unidades (#400): helpers puros de la vista «Planilla» de Stock.
// Sin React ni red, para probarlos con node:test. Las filas son las de
// GET /api/stock/items (ver backend/lib/stock-items.ts).

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const DIA = 86400000

/** Valores de la preferencia de vista (se guarda por usuario). */
export const VISTAS_UNIDADES = Object.freeze(['tarjetas', 'planilla'])
export const vistaUnidadesValida = (valor) => VISTAS_UNIDADES.includes(valor)

/** Familia de color de la fila: nuevo (verde) o semi nuevo (amarillo; usado y reacondicionado). */
export const familiaCondicion = (item) => (item?.condition === 'NEW' ? 'new' : 'used')
export const etiquetaCondicion = (item) => (familiaCondicion(item) === 'new' ? 'Nuevo' : 'Semi nuevo')

/** Color propio de la ubicación (#rrggbb) que da la variante de tono dentro de la familia. */
export const colorUbicacion = (item) => (/^#[0-9a-fA-F]{6}$/.test(String(item?.locationColor || '')) ? item.locationColor : '')

const dos = (n) => String(n).padStart(2, '0')

/** «14/10» (o «14/10/25» si no es de este año). Usa la fecha local, como el resto de la app. */
export function fechaCorta(valor, ahora = new Date()) {
  if (!valor) return ''
  const fecha = new Date(valor)
  if (Number.isNaN(fecha.getTime())) return ''
  const base = `${dos(fecha.getDate())}/${dos(fecha.getMonth() + 1)}`
  return fecha.getFullYear() === ahora.getFullYear() ? base : `${base}/${dos(fecha.getFullYear() % 100)}`
}

/** «ene 2027» a partir de un mes guardado el día 1 en UTC. */
export function mesAnio(valor) {
  const fecha = new Date(valor)
  if (Number.isNaN(fecha.getTime())) return ''
  return `${MESES[fecha.getUTCMonth()]} ${fecha.getUTCFullYear()}`
}

/**
 * Garantía de la unidad. `warrantyUntil` es el primer día del mes en que vence y
 * cubre todo ese mes (UTC). Vencida → «expirada»; con menos de 30 días → aviso.
 * @returns {{ texto: string, tono: 'ok'|'warn'|'bad'|'', detalle: string }}
 */
export function garantiaPlanilla(valor, ahora = new Date()) {
  if (!valor) return { texto: '', tono: '', detalle: 'Sin garantía cargada' }
  const inicio = new Date(valor)
  if (Number.isNaN(inicio.getTime())) return { texto: '', tono: '', detalle: 'Sin garantía cargada' }
  const fin = Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth() + 1, 1)
  const dias = Math.ceil((fin - ahora.getTime()) / DIA)
  const mes = mesAnio(inicio)
  if (dias <= 0) return { texto: 'expirada', tono: 'bad', detalle: `Garantía expirada (${mes})` }
  if (dias < 30) return { texto: mes, tono: 'warn', detalle: `La garantía vence en ${dias} ${dias === 1 ? 'día' : 'días'} (${mes})` }
  return { texto: mes, tono: 'ok', detalle: `Garantía hasta ${mes}` }
}

/** Texto de la reserva: «Atajando · Edgar · vence 18/10». */
export function textoReserva(item, ahora = new Date()) {
  const partes = ['Atajando']
  if (item?.reservationCustomer) partes.push(String(item.reservationCustomer).trim())
  const vence = fechaCorta(item?.reservedUntil, ahora)
  if (vence) partes.push(`vence ${vence}`)
  return partes.join(' · ')
}

/**
 * Chip de estado, aparte del color de condición. Disponible no lleva chip (es el
 * caso común y se lee por el color); reservado, préstamo, vendido, en tránsito y
 * defectuoso sí. Préstamo = la unidad está en una ubicación con ícono PRESTAMO.
 * @returns {{ clave: string, etiqueta: string, tono: string, titulo: string } | null}
 */
export function estadoPlanilla(item, ahora = new Date()) {
  if (!item || item.kind === 'product') return null
  if (item.status === 'reservado') {
    const texto = textoReserva(item, ahora)
    return { clave: 'reservado', etiqueta: texto, tono: 'pass', titulo: texto }
  }
  if (item.status === 'vendido') return { clave: 'vendido', etiqueta: 'Vendido', tono: 'bad', titulo: 'Vendido' }
  if (item.status === 'en_transito') return { clave: 'transito', etiqueta: 'En tránsito', tono: 'info', titulo: 'En tránsito entre sucursales' }
  if (item.status === 'defectuoso') return { clave: 'defectuoso', etiqueta: 'Defectuoso', tono: 'warn', titulo: 'Defectuoso o en revisión' }
  if (String(item.locationIcon || '').toUpperCase() === 'PRESTAMO') {
    const donde = item.locationName ? ` (${item.locationName})` : ''
    return { clave: 'prestamo', etiqueta: 'Préstamo', tono: 'info', titulo: `En préstamo${donde}` }
  }
  return null
}

/** IMEI corto para la lista móvil: «…123456». El completo va en el tooltip y en la ficha. */
export function imeiCorto(serial, cantidad = 6) {
  const texto = String(serial || '').replace(/\s+/g, '')
  if (!texto) return '—'
  return texto.length <= cantidad ? texto : `…${texto.slice(-cantidad)}`
}

/** Sigla de la ubicación: código si lo tiene; si no, las primeras letras del nombre. */
export function siglaUbicacion(item) {
  const codigo = String(item?.locationCode || '').trim()
  if (codigo) return codigo.toUpperCase()
  const nombre = String(item?.locationName || '').trim()
  if (!nombre) return ''
  const palabras = nombre.split(/\s+/).filter(Boolean)
  const sigla = palabras.length > 1 ? palabras.map((palabra) => palabra[0]).join('') : nombre.slice(0, 3)
  return sigla.toUpperCase().slice(0, 4)
}

/** Modelo en una línea para la planilla: nombre + variante (capacidad/color) si aporta algo. */
export function modeloPlanilla(item) {
  const nombre = String(item?.name || '').trim()
  const variante = String(item?.model || '').trim()
  if (!nombre) return variante || 'Producto'
  if (!variante || variante.toLowerCase().includes(nombre.toLowerCase())) return variante.length > nombre.length ? variante : nombre
  return `${nombre} ${variante}`
}

/** «94% · 212 ciclos» (parcial si falta alguno). */
export function textoBateria(item, { corto = false } = {}) {
  const partes = []
  if (Number(item?.batteryHealth) > 0) partes.push(`${Math.round(Number(item.batteryHealth))}%`)
  if (item?.batteryCycles !== null && item?.batteryCycles !== undefined && Number.isFinite(Number(item.batteryCycles))) partes.push(corto ? `${Number(item.batteryCycles)}c` : `${Number(item.batteryCycles)} ciclos`)
  return partes.join(' · ')
}

/** «VPC» o primer nombre: quien verificó (el código manda sobre el nombre). */
export function quienVerifico(item) {
  const quien = String(item?.verifiedBy || '').trim()
  if (!quien) return ''
  return quien.length <= 5 ? quien.toUpperCase() : quien.split(/\s+/)[0]
}

const claveCondicion = (item) => (familiaCondicion(item) === 'new' ? 0 : 1)
const tiempo = (valor) => {
  const t = new Date(valor || 0).getTime()
  return Number.isFinite(t) ? t : 0
}

/**
 * Agrupa por modelo (planilla de Dario: un separador por modelo). Cada grupo trae
 * cuántas unidades están disponibles y cuántas hay en total. Dentro del grupo:
 * nuevos primero y, después, lo más reciente. Los accesorios (sin IMEI) van al final
 * en su propio grupo.
 */
export function agruparPorModelo(items = []) {
  const grupos = new Map()
  for (const item of Array.isArray(items) ? items : []) {
    const esProducto = item?.kind === 'product'
    const nombre = esProducto ? 'Accesorios y otros (sin IMEI)' : modeloPlanilla(item)
    const clave = esProducto ? '__productos__' : nombre.toLowerCase()
    if (!grupos.has(clave)) grupos.set(clave, { clave, nombre, esProducto, items: [], disponibles: 0 })
    const grupo = grupos.get(clave)
    grupo.items.push(item)
    if (item.status === 'disponible') grupo.disponibles += 1
  }
  const lista = [...grupos.values()]
  for (const grupo of lista) {
    grupo.items.sort((a, b) => claveCondicion(a) - claveCondicion(b) || tiempo(b.createdAt) - tiempo(a.createdAt) || String(a.id).localeCompare(String(b.id)))
    grupo.total = grupo.items.length
  }
  return lista.sort((a, b) => Number(a.esProducto) - Number(b.esProducto) || a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base', numeric: true }))
}

/** Texto del encabezado de grupo: «7 disponibles de 9». */
export function textoGrupo(grupo) {
  const { disponibles, total } = grupo
  const unidad = disponibles === 1 ? 'disponible' : 'disponibles'
  return disponibles === total ? `${disponibles} ${unidad}` : `${disponibles} ${unidad} de ${total}`
}
