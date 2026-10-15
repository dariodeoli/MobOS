// Lista de precios por modelo (#448): los datos del papel que la tienda comparte
// por WhatsApp. Puro (sin React ni red) para probarlo con node:test; el HTML sale
// de `buildListaPreciosHtml` (OrderReceipt.jsx), con el mismo encabezado y pie
// que el comprobante premium (#407).

const sinAcentos = (texto) => String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/** Tope de unidades para decir «Últimas unidades». */
export const ULTIMAS_UNIDADES = 2

/** Enlace de WhatsApp de la tienda (Paraguay por defecto): solo dígitos, sin el 0 de marcado local. */
export function enlaceWhatsApp(telefono, codigoPais = '595') {
  let digitos = String(telefono || '').replace(/\D/g, '')
  if (!digitos) return ''
  if (digitos.startsWith(codigoPais)) digitos = digitos.slice(codigoPais.length)
  digitos = digitos.replace(/^0+/, '')
  if (!digitos) return ''
  return `https://wa.me/${codigoPais}${digitos}`
}

/** «+595 983 123 456» a partir de cualquier forma de cargar el teléfono; '' si no hay. */
export function telefonoLegible(telefono, codigoPais = '595') {
  let digitos = String(telefono || '').replace(/\D/g, '')
  if (!digitos) return ''
  if (digitos.startsWith(codigoPais)) digitos = digitos.slice(codigoPais.length)
  digitos = digitos.replace(/^0+/, '')
  if (!digitos) return ''
  const local = digitos.length === 9 ? `${digitos.slice(0, 3)} ${digitos.slice(3, 6)} ${digitos.slice(6)}` : digitos
  return `+${codigoPais} ${local}`
}

/**
 * Unidades disponibles de una fila de la lista según el catálogo: suma el stock de
 * los productos que coinciden en modelo, capacidad, color y condición. `null` si
 * ningún producto coincide (no se inventa un faltante).
 */
export function stockDeCelular(celular, productos = []) {
  const modelo = sinAcentos(celular?.modelo)
  if (!modelo) return null
  const capacidad = sinAcentos(celular?.capacidad).replace(/\s+/g, '')
  const color = sinAcentos(celular?.color)
  const nueva = celular?.estado === 'Nuevo'
  let total = 0
  let coincide = false
  for (const producto of productos) {
    const nombre = sinAcentos(producto?.nombre || producto?.name)
    const compacto = nombre.replace(/\s+/g, '')
    // «iPhone 15 128GB» no cuenta «iPhone 15 Pro 128GB»: modelo y capacidad van pegados.
    const clave = `${modelo.replace(/\s+/g, '')}${capacidad}`
    if (!compacto.includes(clave)) continue
    if (color && !nombre.includes(color) && sinAcentos(producto?.color) !== color) continue
    const condicion = String(producto?.condition || producto?.atributos?.estado || '').toUpperCase()
    if (condicion) {
      const esNueva = condicion === 'NEW' || condicion === 'NUEVO'
      if (esNueva !== nueva) continue
    }
    const stock = Number(producto?.stock ?? producto?.cantidad)
    if (!Number.isFinite(stock)) continue
    coincide = true
    total += Math.max(0, stock)
  }
  return coincide ? total : null
}

/** 'sin-stock' | 'ultimas' | '' según las unidades (null = sin dato, sin marca). */
export const avisoDeStock = (unidades) => {
  if (unidades === null || unidades === undefined) return ''
  if (unidades <= 0) return 'sin-stock'
  return unidades <= ULTIMAS_UNIDADES ? 'ultimas' : ''
}

export const ETIQUETA_AVISO = Object.freeze({ 'sin-stock': 'Sin stock', ultimas: 'Últimas unidades' })

const numeroCapacidad = (texto) => {
  const match = String(texto || '').match(/(\d+(?:[.,]\d+)?)\s*(tb|gb)?/i)
  if (!match) return 0
  const valor = Number(match[1].replace(',', '.'))
  return /tb/i.test(match[2] || '') ? valor * 1024 : valor
}

/** «Precios al 15/10/2026» (hora de Paraguay). */
export function fechaVigencia(fecha = new Date()) {
  try {
    return new Intl.DateTimeFormat('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Asuncion' }).format(fecha)
  } catch {
    return fecha.toLocaleDateString('es-PY')
  }
}

const dolares = (precioGs, cotizacion) => (cotizacion > 0 && precioGs > 0 ? Math.round(precioGs / cotizacion) : 0)

/**
 * Arma el contenido del papel: bloques por condición, modelos con sus filas
 * (capacidad · color · precio), avisos de stock y los datos de la tienda.
 * @param {object} p
 * @param {object[]} p.celulares filas de `listCelulares()` (activas y con precio)
 * @param {object[]} [p.productos] catálogo, para «últimas unidades / sin stock»
 * @param {{nombre?: string, direccion?: string, telefono?: string}} [p.tienda]
 * @param {string} [p.garantia] resumen de la política de garantía (#443)
 * @param {number} [p.cotizacion] Gs por US$ (0 = sin dólares)
 * @param {boolean} [p.mostrarStock] marcar últimas unidades y sin stock
 * @param {(modelo: string) => number} [p.rankModelo] orden de modelos (menor = más nuevo)
 */
export function datosListaPrecios({ celulares = [], productos = [], tienda = {}, garantia = '', cotizacion = 0, mostrarStock = true, rankModelo, fecha = new Date() } = {}) {
  const rank = typeof rankModelo === 'function' ? rankModelo : () => 0
  const activos = celulares.filter((c) => c && c.activo !== false && Number(c.precio) > 0)
  const bloque = (titulo, estado) => {
    const deEstado = activos.filter((c) => c.estado === estado)
    const porModelo = new Map()
    for (const c of [...deEstado].sort((a, b) => rank(a.modelo) - rank(b.modelo) || String(b.modelo).localeCompare(String(a.modelo)) || numeroCapacidad(a.capacidad) - numeroCapacidad(b.capacidad))) {
      if (!porModelo.has(c.modelo)) porModelo.set(c.modelo, [])
      const unidades = mostrarStock ? stockDeCelular(c, productos) : null
      porModelo.get(c.modelo).push({
        capacidad: c.capacidad || '',
        color: c.color || '',
        precioGs: Number(c.precio),
        precioUsd: dolares(Number(c.precio), cotizacion),
        aviso: avisoDeStock(unidades),
      })
    }
    return { titulo, estado, modelos: [...porModelo.entries()].map(([modelo, filas]) => ({ modelo, filas })) }
  }
  const bloques = [bloque('Nuevos', 'Nuevo'), bloque('Semi nuevos', 'Seminuevo')].filter((b) => b.modelos.length)
  const telefono = String(tienda.telefono || '').trim()
  return {
    titulo: 'Lista de precios',
    fecha: fechaVigencia(fecha),
    vigencia: `Precios al ${fechaVigencia(fecha)}, sujetos a stock y a cambios sin aviso.`,
    tienda: {
      nombre: String(tienda.nombre || '').trim(),
      direccion: String(tienda.direccion || '').trim(),
      telefono: telefonoLegible(telefono),
      whatsapp: enlaceWhatsApp(telefono),
    },
    garantia: String(garantia || '').trim(),
    cotizacion: cotizacion > 0 ? cotizacion : 0,
    bloques,
    filas: bloques.reduce((suma, b) => suma + b.modelos.reduce((interna, m) => interna + m.filas.length, 0), 0),
  }
}
