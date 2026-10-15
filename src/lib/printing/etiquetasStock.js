// Etiquetas de una selección de filas de Stock (U4a): una sola función pura
// decide QUÉ etiquetas salen, y de ahí cuelgan el trabajo ESC/POS y la vista
// previa PDF, así que no pueden desviarse.
//
// - Fila serializada (`serial` o `unit`) → una etiqueta de unidad (ticketEtiquetasUnidad).
// - Fila de accesorio/no serializada `{ sku, name, pricePyg, copies }` → `copies`
//   etiquetas SKU + precio (ticketEtiquetasProducto). `qty` es el stock, no las copias.
// - Nunca viaja el costo: se arman objetos nuevos con solo los campos de la etiqueta.
import { gs } from '../../utils/calculos.js'
import { escapeHtml } from '../../utils/printHtml.js'
import { contextoEtiquetaUnidad, datosEtiquetaUnidad } from './etiquetaUnidad.js'
import { baseDeApp } from './qr.js'
import { ticketEtiquetasProducto, ticketEtiquetasUnidad } from './tickets.js'

export const MAX_COPIAS_ETIQUETA = 99
export const ERROR_SELECCION_VACIA = 'Seleccioná al menos una fila con unidad o producto para imprimir etiquetas.'

export class EtiquetasStockError extends Error {
  constructor(mensaje) {
    super(mensaje)
    this.name = 'EtiquetasStockError'
  }
}

const copiasDe = (valor) => Math.max(1, Math.min(MAX_COPIAS_ETIQUETA, Math.floor(Number(valor)) || 1))

function itemDeFila(fila, base) {
  if (!fila || typeof fila !== 'object') return null
  const unidad = fila.unit && typeof fila.unit === 'object' ? fila.unit : fila
  const serial = String(unidad.serial ?? '').trim()
  if (serial) {
    // Copia explícita: sin precio ni costo, solo lo que la etiqueta de unidad usa.
    const unit = {
      serial,
      condition: unidad.condition,
      batteryHealth: unidad.batteryHealth,
      batteryCycles: unidad.batteryCycles,
      supplier: unidad.supplier?.code ? { code: unidad.supplier.code } : undefined,
      supplierCode: unidad.supplierCode,
      location: unidad.location,
      product: { ...(unidad.product || {}), name: unidad.product?.name ?? fila.name, model: unidad.product?.model ?? fila.model },
    }
    for (const campo of ['costPyg', 'cost', 'costo']) delete unit.product[campo]
    return { tipo: 'unidad', unit, datos: datosEtiquetaUnidad(unit, { base }) }
  }
  const sku = String(fila.sku ?? fila.product?.sku ?? '').trim()
  const nombre = String(fila.name ?? fila.nombre ?? fila.product?.name ?? '').trim()
  if (!sku && !nombre) return null
  const precio = Number(fila.pricePyg ?? fila.product?.pricePyg ?? 0) || 0
  const copias = copiasDe(fila.copies)
  return {
    tipo: 'producto',
    product: { name: nombre || 'Producto', sku, pricePyg: precio },
    cantidad: copias,
    datos: { nombre: nombre || 'Producto', sku, precio, precioTexto: precio > 0 ? gs(precio) : '—', copias },
  }
}

/**
 * Normaliza la selección. Lanza `EtiquetasStockError` si no queda ninguna
 * etiqueta imprimible. `omitidas` = filas que no se pudieron interpretar.
 */
export function itemsEtiquetasStock(filas = [], { base = baseDeApp() } = {}) {
  const items = []
  let omitidas = 0
  for (const fila of Array.isArray(filas) ? filas : []) {
    const item = itemDeFila(fila, base)
    if (item) items.push(item)
    else omitidas += 1
  }
  if (!items.length) throw new EtiquetasStockError(ERROR_SELECCION_VACIA)
  const unidades = items.filter((item) => item.tipo === 'unidad')
  const productos = items.filter((item) => item.tipo === 'producto')
  const total = unidades.length + productos.reduce((suma, item) => suma + item.cantidad, 0)
  return { items, unidades, productos, total, omitidas }
}

/**
 * Trabajos ESC/POS de la selección: `[{ tipo, etiquetas, ticket }]`, uno para
 * las unidades y otro para los accesorios (mixto = 2 trabajos).
 */
export function etiquetasDeFilasStock(filas = [], { ancho = 80, base = baseDeApp() } = {}) {
  const seleccion = itemsEtiquetasStock(filas, { base })
  const trabajos = []
  if (seleccion.unidades.length) {
    trabajos.push({
      tipo: 'unidad',
      etiquetas: seleccion.unidades.length,
      ticket: ticketEtiquetasUnidad(seleccion.unidades.map((item) => item.unit), { ancho, base }),
    })
  }
  if (seleccion.productos.length) {
    trabajos.push({
      tipo: 'producto',
      etiquetas: seleccion.productos.reduce((suma, item) => suma + item.cantidad, 0),
      ticket: ticketEtiquetasProducto(seleccion.productos.map((item) => ({ product: item.product, cantidad: item.cantidad })), { ancho }),
    })
  }
  return { trabajos, total: seleccion.total, omitidas: seleccion.omitidas, items: seleccion.items }
}

const etiquetaHtml = (cuerpo) => `<section class="etiqueta">${cuerpo}</section>`

/** HTML de la vista previa: una tarjeta por etiqueta impresa, desde los mismos items. */
export function htmlVistaPreviaEtiquetas(items = []) {
  const tarjetas = []
  for (const item of items) {
    if (item.tipo === 'unidad') {
      const d = item.datos
      const contexto = contextoEtiquetaUnidad(d)
      tarjetas.push(etiquetaHtml(
        `<p class="tipo">Etiqueta de unidad</p><h2>${escapeHtml(d.modelo)}</h2>` +
        (contexto ? `<p>${escapeHtml(contexto)}</p>` : '') +
        `<p class="grande">${escapeHtml(d.identificador)}</p>` +
        (d.serial ? `<p>IMEI / serial: ${escapeHtml(d.serial)}</p>` : '') +
        (d.enlace ? `<p>QR: ${escapeHtml(d.enlace)}</p>` : '') +
        (d.codigo ? `<p>Código: ${escapeHtml(d.codigo)}</p>` : ''),
      ))
    } else {
      const d = item.datos
      for (let i = 0; i < d.copias; i += 1) {
        tarjetas.push(etiquetaHtml(
          `<p class="tipo">Etiqueta de producto</p><h2>${escapeHtml(d.nombre)}</h2>` +
          `<p class="grande">${escapeHtml(d.precioTexto)}</p>` +
          (d.sku ? `<p>SKU: ${escapeHtml(d.sku)}</p>` : '') +
          (d.copias > 1 ? `<p>Etiqueta ${i + 1} de ${d.copias}</p>` : ''),
        ))
      }
    }
  }
  const estilo = 'body{font-family:Arial,sans-serif;margin:0}.etiqueta{border:1px dashed #333;padding:10px;margin:0 0 10px;break-inside:avoid}.tipo{font-size:11px;text-transform:uppercase;margin:0}h2{font-size:16px;margin:4px 0}p{margin:2px 0;font-size:13px;word-break:break-all}.grande{font-size:24px;font-weight:700}'
  return `<!doctype html><html><head><meta charset="utf-8"><style>${estilo}</style></head><body>${tarjetas.join('')}</body></html>`
}

/** Vista previa en PDF (A4): mismos items que el trabajo ESC/POS. Sin render disponible devuelve `null`. */
export async function vistaPreviaEtiquetasPdf(filas = [], { base = baseDeApp(), generarPdf = null } = {}) {
  const seleccion = itemsEtiquetasStock(filas, { base })
  const html = htmlVistaPreviaEtiquetas(seleccion.items)
  const generar = generarPdf || (await import('./pdfDocumento.js')).documentoAPdf
  const pdf = await generar(html, { formato: 'a4' })
  return { pdf, html, total: seleccion.total }
}
