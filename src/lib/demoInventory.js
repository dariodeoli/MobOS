// Inventario demo (#213): unidades serializadas con IMEIs ficticios, ubicaciones
// y proveedores ficticios. Contrato session-only (#201): las mutaciones viven en
// sessionStorage y el seed se regenera al entrar a la demo; nada toca la base.
//
// Los seriales son claramente de prueba (prefijo DEMO, nunca un IMEI real) y los
// costos vienen en USD (con cotización) o en Gs, como en la app real.
import { IPHONES_DEMO } from './demo/iphones.js'
import { guardarDemo, leerDemo } from './demoStorage.js'

const KEY = 'mobos:demo-inventory:v1'
export const DEMO_BRANCH = 'mobos-demo-central'
export const DEMO_BRANCH_2 = 'mobos-demo-villa-morra'

const SUCURSALES = [
  { id: DEMO_BRANCH, name: 'Casa Central', city: 'Asunción', isActive: true },
  { id: DEMO_BRANCH_2, name: 'Sucursal Villa Morra', city: 'Asunción', isActive: true },
  { id: 'mobos-demo-luque', name: 'Sucursal Luque', city: 'Luque', isActive: true },
]

const UBICACIONES = [
  { id: 'demo-ubic-deposito-1', branchId: DEMO_BRANCH, name: 'Depósito 1', code: 'D1', isActive: true },
  { id: 'demo-ubic-deposito-2', branchId: DEMO_BRANCH, name: 'Depósito 2', code: 'D2', isActive: true },
  { id: 'demo-ubic-piso', branchId: DEMO_BRANCH, name: 'Piso de venta', code: 'PV', isActive: true },
  { id: 'demo-ubic-vm-deposito', branchId: DEMO_BRANCH_2, name: 'Depósito Villa Morra', code: 'VM', isActive: true },
]

const PROVEEDORES = [
  { id: 'demo-prov-importadora', name: 'Importadora Tecnológica S.A. (demo)', contact: 'Compras · +595 981 000 111', isActive: true },
  { id: 'demo-prov-distribuidora', name: 'Distribuidora del Este (demo)', contact: 'Ventas · +595 982 000 222', isActive: true },
  { id: 'demo-prov-mayorista', name: 'Mayorista Apple PY (demo)', contact: 'Pedidos · +595 983 000 333', isActive: true },
]

const COTIZACION = 7300
const USUARIO = { id: 'demo-user', name: 'Dueño demo' }

// 24 unidades: 15 disponibles, 3 reservadas, 3 vendidas, 2 en revisión y 1 en
// tránsito; 14 nuevas y 10 seminuevas; repartidas entre depósitos y piso.
const ESTADOS = [
  'AVAILABLE', 'AVAILABLE', 'AVAILABLE', 'AVAILABLE', 'AVAILABLE', 'AVAILABLE', 'AVAILABLE', 'AVAILABLE',
  'AVAILABLE', 'AVAILABLE', 'AVAILABLE', 'AVAILABLE', 'AVAILABLE', 'AVAILABLE', 'AVAILABLE',
  'RESERVED', 'RESERVED', 'RESERVED',
  'SOLD', 'SOLD', 'SOLD',
  'DEFECTIVE', 'DEFECTIVE',
  'IN_TRANSIT',
]
const UBICACION_POR_INDICE = [
  'demo-ubic-deposito-1', 'demo-ubic-deposito-1', 'demo-ubic-deposito-1', 'demo-ubic-deposito-1', 'demo-ubic-deposito-1', 'demo-ubic-deposito-1',
  'demo-ubic-deposito-2', 'demo-ubic-deposito-2', 'demo-ubic-deposito-2', 'demo-ubic-deposito-2', 'demo-ubic-deposito-2',
  'demo-ubic-piso', 'demo-ubic-piso', 'demo-ubic-piso', 'demo-ubic-piso', 'demo-ubic-piso', 'demo-ubic-piso', 'demo-ubic-piso', 'demo-ubic-piso', 'demo-ubic-piso', 'demo-ubic-piso',
  'demo-ubic-vm-deposito', 'demo-ubic-vm-deposito', 'demo-ubic-vm-deposito',
]
const CLIENTES_RESERVA = ['Lucía Fernández', 'Carlos Ramírez', 'Distribuidora del Este S.A.']

function hace(dias, hora = 10) {
  const fecha = new Date()
  fecha.setDate(fecha.getDate() - dias)
  fecha.setHours(hora, 30, 0, 0)
  return fecha.toISOString()
}

export function serialDemo(n) {
  return `DEMO${String(n).padStart(4, '0')}0000000000`.slice(0, 16)
}

function unidad(producto, indice) {
  const estado = ESTADOS[indice - 1]
  const condicion = indice % 5 === 0 ? 'USED' : indice % 7 === 0 ? 'REFURBISHED' : 'NEW'
  const enUsd = indice % 2 === 0
  const costoPyg = enUsd ? null : Math.round(Number(producto.precioCosto) * 0.94 / 1000) * 1000
  const base = {
    id: `demo-unit-${indice}`,
    serial: serialDemo(indice),
    status: estado,
    condition: condicion,
    batteryHealth: condicion === 'NEW' ? 100 : 80 + (indice % 16),
    productId: producto.id,
    product: { id: producto.id, name: producto.nombre, nombre: producto.nombre, capacity: producto.atributos?.capacidad || '', sku: producto.id.toUpperCase().slice(0, 16), pricePyg: producto.precioVenta },
    branchId: indice % 8 === 0 ? DEMO_BRANCH_2 : DEMO_BRANCH,
    locationId: UBICACION_POR_INDICE[indice - 1] || 'demo-ubic-deposito-1',
    supplierName: PROVEEDORES[indice % PROVEEDORES.length].name,
    supplier: PROVEEDORES[indice % PROVEEDORES.length],
    notes: indice % 6 === 0 ? 'Ingresó con caja abierta (demo).' : '',
    createdAt: hace(30 - indice),
    lastVerifiedBy: indice % 4 === 0 ? USUARIO : null,
    verifiedAt: indice % 4 === 0 ? hace(indice % 10, 15) : null,
    sale: estado === 'SOLD' ? { fulfillmentStatus: indice === 19 ? 'DELIVERED' : indice === 20 ? 'READY_FOR_PICKUP' : 'PROCESSING', orderNumber: `MOB-00${40 + indice}` } : null,
  }
  if (estado === 'RESERVED') {
    base.reservedUntil = hace(-2, 18)
    base.reservationCustomer = CLIENTES_RESERVA[indice % CLIENTES_RESERVA.length]
    base.reservationCustomerRef = { id: `demo-cliente-reserva-${indice}`, name: base.reservationCustomer }
  }
  if (estado === 'DEFECTIVE') base.notes = base.notes || 'En revisión: batería al ' + base.batteryHealth + '% (demo).'
  return enUsd
    ? { ...base, costCurrency: 'USD', originalCost: Math.round(producto.precioCosto / COTIZACION), exchangeRatePyg: COTIZACION, costPyg: Math.round((producto.precioCosto / COTIZACION) * COTIZACION) }
    : { ...base, costCurrency: 'PYG', originalCost: null, exchangeRatePyg: null, costPyg: costoPyg }
}

function seed() {
  const productos = IPHONES_DEMO.map(item => ({ ...item, categoria: 'Celulares', stock: 0 }))
  return {
    version: 1,
    products: productos,
    units: Array.from({ length: 24 }, (_, i) => unidad(productos[i % productos.length], i + 1)),
    locations: UBICACIONES.map(item => ({ ...item })),
    branches: SUCURSALES.map(item => ({ ...item })),
    suppliers: PROVEEDORES.map(item => ({ ...item })),
    reservations: [],
    transfers: [],
  }
}

function read() {
  try {
    const stored = JSON.parse(leerDemo(KEY))
    if (stored && Array.isArray(stored.units) && stored.units.length) return stored
  } catch { /* dato dañado: se usa el seed */ }
  const fresh = seed()
  write(fresh)
  return fresh
}

function write(state) {
  guardarDemo(KEY, JSON.stringify(state))
  return state
}

function activos(state) { return state.units.filter(unit => !unit.removedAt) }
function porSerial(state, serial) { return state.units.find(unit => unit.serial === String(serial || '').trim().toUpperCase()) }
function snapshot(state, unit) {
  return { ...unit, branch: state.branches.find(b => b.id === unit.branchId) || null, location: state.locations.find(l => l.id === unit.locationId) || null }
}

// ── API para resources.inventoryUnits / stockLocations / inventoryBranches ──
export function listDemoUnits(q = '', view = 'active') {
  const state = read()
  const buscar = String(q || '').trim().toLowerCase()
  const filas = view === 'removed'
    ? state.units.filter(unit => unit.removedAt)
    : activos(state).map(unit => snapshot(state, unit))
  if (!buscar) return filas
  return filas.filter(unit => [unit.serial, unit.product?.nombre, unit.product?.name, unit.reservationCustomer, unit.supplierName, unit.notes].some(valor => String(valor || '').toLowerCase().includes(buscar)))
}

export function createDemoUnit(data = {}) {
  const state = read()
  const seriales = data.serials?.length ? data.serials : [data.serial]
  const product = state.products.find(item => item.id === data.productId)
  const creadas = []
  for (const serial of seriales.map(item => String(item || '').trim().toUpperCase()).filter(Boolean)) {
    if (porSerial(state, serial)) throw new Error(`El serial ${serial} ya existe en la demo.`)
    const unit = {
      id: `demo-unit-new-${Date.now().toString(36)}-${creadas.length}`,
      serial,
      status: 'AVAILABLE',
      condition: data.condition || 'NEW',
      batteryHealth: data.batteryHealth === '' || data.batteryHealth === undefined ? null : Number(data.batteryHealth),
      productId: data.productId,
      product: product ? { id: product.id, name: product.nombre, nombre: product.nombre, capacity: product.atributos?.capacidad || '', sku: product.sku || '', pricePyg: product.precioVenta } : null,
      branchId: data.branchId || DEMO_BRANCH,
      locationId: data.locationId || null,
      supplierName: data.supplierName || '',
      supplier: state.suppliers.find(item => item.name === data.supplierName) || null,
      notes: data.notes || '',
      createdAt: new Date().toISOString(),
      lastVerifiedBy: null,
      verifiedAt: null,
      sale: null,
      costPyg: data.costPyg === undefined ? null : data.costPyg,
      originalCost: data.originalCost === undefined ? null : data.originalCost,
      costCurrency: data.costCurrency || 'PYG',
      exchangeRatePyg: data.exchangeRatePyg === undefined ? null : data.exchangeRatePyg,
    }
    state.units.unshift(unit)
    creadas.push(snapshot(state, unit))
  }
  write(state)
  return creadas[0]
}

export function updateDemoUnit(data = {}) {
  const state = read()
  const unit = state.units.find(item => item.id === data.id)
  if (!unit) throw new Error('La unidad demo no existe.')
  if (data.action === 'remove') { unit.removedAt = new Date().toISOString(); unit.removedReason = data.reason || '' }
  else if (data.action === 'restore') { unit.removedAt = null; unit.removedReason = '' }
  else if (data.action === 'move') { unit.locationId = data.locationId || null }
  else if (data.action === 'adjust') { unit.status = data.status || unit.status; if (data.status === 'DEFECTIVE') unit.notes = data.reason || unit.notes }
  else if (data.action === 'details') {
    unit.costCurrency = data.costCurrency || 'PYG'
    unit.costPyg = data.costPyg === undefined ? unit.costPyg : data.costPyg
    unit.originalCost = data.originalCost === undefined ? unit.originalCost : data.originalCost
    unit.exchangeRatePyg = data.exchangeRatePyg === undefined ? unit.exchangeRatePyg : data.exchangeRatePyg
  }
  write(state)
  return snapshot(state, unit)
}

export function verifyDemoUnit(data = {}) {
  const state = read()
  const unit = porSerial(state, data.serial)
  if (!unit) throw new Error('La unidad demo no existe.')
  unit.status = unit.status === 'IN_TRANSIT' ? 'AVAILABLE' : unit.status
  if (data.locationId) unit.locationId = data.locationId
  unit.lastVerifiedBy = USUARIO
  unit.verifiedAt = new Date().toISOString()
  write(state)
  return snapshot(state, unit)
}

export function listDemoReservations() {
  const state = read()
  return activos(state).filter(unit => unit.status === 'RESERVED').map(unit => snapshot(state, unit))
}

export function reserveDemoUnits(data = {}) {
  const state = read()
  for (const serial of data.serials || []) {
    const unit = porSerial(state, serial)
    if (!unit) continue
    unit.status = 'RESERVED'
    unit.reservationCustomer = data.customerName || 'Sin cliente'
    unit.reservationCustomerRef = data.customerId ? { id: data.customerId, name: data.customerName } : null
    unit.reservedUntil = new Date(Date.now() + (Number(data.hours) || 2) * 60 * 60 * 1000).toISOString()
  }
  write(state)
  return listDemoReservations()
}

export function releaseDemoReservations(serials = []) {
  const state = read()
  for (const serial of serials) {
    const unit = porSerial(state, serial)
    if (!unit) continue
    unit.status = 'AVAILABLE'
    unit.reservationCustomer = ''
    unit.reservationCustomerRef = null
    unit.reservedUntil = null
  }
  write(state)
  return listDemoReservations()
}

export function listDemoLocations(branchId = '') {
  const state = read()
  return state.locations.filter(item => !branchId || item.branchId === branchId).map(item => ({ ...item, branch: state.branches.find(b => b.id === item.branchId) || null, _count: { inventoryUnits: activos(state).filter(u => u.locationId === item.id).length } }))
}

export function saveDemoLocation(data = {}) {
  const state = read()
  const existente = state.locations.find(item => item.id === data.id)
  if (existente) { Object.assign(existente, { name: data.name ?? existente.name, code: data.code ?? existente.code, isActive: data.isActive ?? existente.isActive }) }
  else state.locations.push({ id: `demo-ubic-${Date.now().toString(36)}`, branchId: data.branchId || DEMO_BRANCH, name: data.name || 'Ubicación demo', code: data.code || '', isActive: true })
  write(state)
  return listDemoLocations()
}

export function listDemoBranches() {
  const state = read()
  return state.branches.map(item => ({ ...item, _count: { inventoryUnits: activos(state).filter(u => u.branchId === item.id).length } }))
}

export function listDemoTransfers() {
  const state = read()
  return state.transfers.map(item => ({
    ...item,
    sourceBranch: state.branches.find(b => b.id === item.sourceBranchId) || null,
    destinationBranch: state.branches.find(b => b.id === item.destinationBranchId) || null,
    lines: (item.lines || []).map(line => ({ ...line, sourceProduct: state.products.find(p => p.id === line.productId) || { id: line.productId, nombre: line.productName || 'Producto demo' } })),
  }))
}

export function createDemoTransfer(data = {}) {
  const state = read()
  const lineas = data.lines || []
  const ids = new Set(lineas.flatMap(line => line.serials || []))
  for (const unit of state.units) if (ids.has(unit.serial)) { unit.status = 'IN_TRANSIT'; unit.branchId = data.sourceBranchId || unit.branchId; unit.locationId = null }
  const transfer = {
    id: `demo-transfer-${Date.now().toString(36)}`,
    sourceBranchId: data.sourceBranchId, destinationBranchId: data.destinationBranchId,
    destinationLocationId: data.destinationLocationId || null,
    notes: data.notes || '', aexGuide: '', createdAt: new Date().toISOString(), receivedAt: null,
    publicToken: `demo-remito-${Date.now().toString(36)}`,
    lines: lineas,
  }
  state.transfers.unshift(transfer)
  write(state)
  return transfer
}

export function listDemoSuppliers(q = '') {
  const state = read()
  const buscar = String(q || '').trim().toLowerCase()
  return state.suppliers.filter(item => !buscar || item.name.toLowerCase().includes(buscar))
}

export function saveDemoSupplier(data = {}) {
  const state = read()
  const existente = state.suppliers.find(item => item.id === data.id)
  if (existente) Object.assign(existente, { name: data.name ?? existente.name, contact: data.contact ?? existente.contact })
  else state.suppliers.push({ id: `demo-prov-${Date.now().toString(36)}`, name: data.name || 'Proveedor demo', contact: data.contact || '', isActive: true })
  write(state)
  return listDemoSuppliers()
}

// Estado inicial del módulo (lo usan los tests para validar el contenido).
export function demoInventorySeed() {
  return read()
}
