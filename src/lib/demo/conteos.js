// Demo · conteos físicos auditables. Viven en memoria de la sesión (demoStorage):
// iniciar, escanear, sumar productos sin serie, aplicar (con ajuste de stock) y
// cancelar funcionan igual que con el servidor, pero se reinician al salir.
import { guardarDemo, leerDemo } from '../demoStorage.js'
import { leerEstadoDemo, guardarEstadoDemo } from '../demoInventory.js'

const KEY = 'mobos:demo-conteos:v1'

function leer() {
  try {
    const guardado = JSON.parse(leerDemo(KEY) || 'null')
    if (guardado && Array.isArray(guardado.items)) return guardado
  } catch { /* dato dañado: se arranca con el conteo de ejemplo */ }
  return { items: [conteoDeEjemplo()] }
}

// Un conteo ya aplicado de ayer, para que la pantalla no arranque vacía.
function conteoDeEjemplo() {
  const unidades = leerEstadoDemo().units.filter((u) => !u.removedAt && u.status === 'AVAILABLE' && u.branchId === 'mobos-demo-central').slice(0, 3)
  const ayer = new Date(Date.now() - 26 * 3600000).toISOString()
  return {
    id: 'demo-conteo-ejemplo', status: 'APPLIED', scope: 'PARTIAL', note: 'Conteo mensual de vidriera', branchId: 'mobos-demo-central', locationId: null,
    createdAt: ayer, appliedAt: ayer, faltantes: [],
    lines: unidades.map((u, i) => ({ id: `demo-linea-ejemplo-${i}`, serial: u.serial, expected: true, quantity: 1, productId: u.productId || null, product: u.product ? { name: u.product.name || u.product.nombre, sku: u.product.sku } : null })),
  }
}
const escribir = (estado) => { guardarDemo(KEY, JSON.stringify(estado)); return estado }

const sucursalDe = (estado, id) => estado.branches.find((b) => b.id === id) || { id, name: 'Sucursal' }
const esperadas = (estado, conteo) => estado.units.filter((u) => !u.removedAt && u.status === 'AVAILABLE'
  && (!conteo.branchId || u.branchId === conteo.branchId)
  && (!conteo.locationId || u.locationId === conteo.locationId))

function detalle(conteo) {
  const estado = leerEstadoDemo()
  const esperadasAhora = esperadas(estado, conteo)
  const seriales = new Set(conteo.lines.filter((l) => l.serial).map((l) => l.serial))
  const faltantes = conteo.status === 'APPLIED' ? (conteo.faltantes || []) : esperadasAhora.filter((u) => !seriales.has(u.serial))
  const contadas = conteo.lines.filter((l) => l.serial && l.expected).length
  const inesperadas = conteo.lines.filter((l) => l.serial && !l.expected).length
  return {
    ...conteo,
    branch: sucursalDe(estado, conteo.branchId),
    location: conteo.locationId ? (estado.locations.find((l) => l.id === conteo.locationId) || null) : null,
    lines: conteo.lines.map((l) => ({ ...l })),
    missing: faltantes.map((u) => ({ id: u.id, serial: u.serial, product: u.product || { name: u.productName || 'Producto' } })),
    quantityDifferences: [],
    snapshotMissingProducts: [],
    summary: { expected: contadas + faltantes.length, counted: contadas, missing: faltantes.length, unexpected: inesperadas, productsWithoutSerial: conteo.lines.filter((l) => !l.serial).length },
  }
}

export function listarConteosDemo() {
  const estado = leerEstadoDemo()
  return leer().items.map((c) => ({ id: c.id, status: c.status, scope: c.scope, note: c.note, createdAt: c.createdAt, appliedAt: c.appliedAt || null, branch: sucursalDe(estado, c.branchId), _count: { lines: c.lines.length } }))
}

export function crearConteoDemo({ note = '', branchId = '', scope = 'PARTIAL', locationId = '' } = {}) {
  const estado = leer()
  const conteo = { id: `demo-conteo-${Date.now().toString(36)}`, status: 'DRAFT', scope, note, branchId: branchId || 'mobos-demo-central', locationId: locationId || null, createdAt: new Date().toISOString(), appliedAt: null, lines: [] }
  estado.items.unshift(conteo)
  escribir(estado)
  return { id: conteo.id }
}

export function detalleConteoDemo(id) {
  const conteo = leer().items.find((c) => c.id === id)
  if (!conteo) throw new Error('El conteo demo no existe.')
  return detalle(conteo)
}

export function escanearConteoDemo({ id, serial, productId, quantity }) {
  const estado = leer()
  const conteo = estado.items.find((c) => c.id === id)
  if (!conteo || conteo.status !== 'DRAFT') throw new Error('El conteo ya no admite escaneos.')
  const unidades = leerEstadoDemo()
  let linea
  if (serial) {
    const unidad = unidades.units.find((u) => u.serial === String(serial).toUpperCase())
    const esperada = Boolean(unidad && !unidad.removedAt && unidad.status === 'AVAILABLE' && (!conteo.branchId || unidad.branchId === conteo.branchId))
    linea = { id: `demo-linea-${Date.now().toString(36)}-${conteo.lines.length}`, serial: String(serial).toUpperCase(), expected: esperada, quantity: 1, productId: unidad?.productId || null, product: unidad?.product ? { name: unidad.product.name || unidad.product.nombre, sku: unidad.product.sku } : null }
  } else {
    linea = { id: `demo-linea-${Date.now().toString(36)}-${conteo.lines.length}`, serial: '', expected: true, quantity: Number(quantity) || 1, productId, product: unidades.products.find((p) => p.id === productId) ? { name: unidades.products.find((p) => p.id === productId).nombre } : null }
  }
  conteo.lines.unshift(linea)
  escribir(estado)
  return linea
}

export function aplicarConteoDemo({ id, adjust = true }) {
  const estado = leer()
  const conteo = estado.items.find((c) => c.id === id)
  if (!conteo || conteo.status !== 'DRAFT') throw new Error('El conteo ya fue resuelto.')
  const base = detalle(conteo)
  if (adjust) {
    const unidades = leerEstadoDemo()
    const serialesFaltantes = new Set(base.missing.map((u) => u.serial))
    for (const u of unidades.units) if (serialesFaltantes.has(u.serial)) { u.status = 'DEFECTIVE'; u.notes = 'Faltante en conteo físico.' }
    guardarEstadoDemo(unidades)
  }
  conteo.faltantes = base.missing
  conteo.status = 'APPLIED'
  conteo.appliedAt = new Date().toISOString()
  escribir(estado)
  return { ok: true, missing: base.missing.length }
}

export function cancelarConteoDemo({ id }) {
  const estado = leer()
  const conteo = estado.items.find((c) => c.id === id)
  if (!conteo || conteo.status !== 'DRAFT') throw new Error('El conteo ya fue resuelto.')
  conteo.status = 'CANCELLED'
  escribir(estado)
  return { ok: true }
}
