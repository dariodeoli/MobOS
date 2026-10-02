// Abastecimiento demo (#324): necesidades, compras del Centro, lotes,
// recepciones y métricas con la misma forma que las APIs reales, en memoria de
// la pestaña. Una sola fuente: las necesidades se cubren con las mismas compras
// que despachan los lotes y reciben las llegadas, y todo cierra contra el
// catálogo, los proveedores y el equipo ficticios.
import { guardarDemo, leerDemo } from '../demoStorage.js'
import { EQUIPO_DEMO, serialDemo } from './iphones.js'
import { PROVEEDORES_DEMO, proveedorDemo } from './proveedores.js'

const KEY = 'mobos:demo-abastecimiento:v1'
const BRANCH = 'mobos-demo-central'
const BRANCH_2 = 'mobos-demo-villa-morra'

const PRODUCTOS = {
  'demo-iphone-15-pro-256-titanio': { name: 'iPhone 15 Pro 256GB Titanio', capacity: '256GB', color: 'Titanio' },
  'demo-airpods-pro-2-usbc': { name: 'AirPods Pro 2 USB-C', capacity: '', color: '' },
  'demo-funda-magsafe-transparente': { name: 'Funda MagSafe Transparente', capacity: '', color: 'Transparente' },
  'demo-vidrio-17-pro': { name: 'Protector de vidrio 17 Pro', capacity: '', color: '' },
  'demo-iphone-13-128-blanco': { name: 'iPhone 13 128GB Blanco', capacity: '128GB', color: 'Blanco' },
  'demo-cargador-usbc-20w': { name: 'Cargador USB-C 20W', capacity: '', color: 'Blanco' },
}
const producto = (id) => ({ id, ...(PRODUCTOS[id] || { name: id, capacity: '', color: '' }) })
const usuario = (id) => EQUIPO_DEMO.find((row) => row.id === id) || null
const hace = (horas) => new Date(Date.now() - horas * 3600000).toISOString()
const enDias = (dias) => new Date(Date.now() + dias * 86400000).toISOString()

const seed = () => ({
  needs: [
    { id: 'demo-need-1', productId: 'demo-iphone-15-pro-256-titanio', condition: 'NEW', quantity: 2, priority: 'URGENTE', status: 'ABIERTA', promisedAt: enDias(1), origins: ['SALE_NO_STOCK', 'BELOW_REORDER'], center: 'CDE', assignedToId: null, createdAt: hace(30), destinos: [
      { tipo: 'PEDIDO', etiqueta: 'Pedido AUR-0001 · María González', cantidad: 1, sucursalId: BRANCH, sucursal: 'Casa Central', pedidoId: 'demo-venta-hoy-full', pedidoNumero: 'AUR-0001', clienteId: 'demo-cliente-maria', cliente: 'María González' },
      { tipo: 'STOCK', etiqueta: 'Reposición de stock', cantidad: 1, sucursalId: BRANCH, sucursal: 'Casa Central' },
    ] },
    { id: 'demo-need-2', productId: 'demo-airpods-pro-2-usbc', condition: 'NEW', quantity: 8, priority: 'ALTA', status: 'ASIGNADA', promisedAt: enDias(4), origins: ['BELOW_REORDER'], center: 'USA', assignedToId: 'demo-user', createdAt: hace(72), destinos: [
      { tipo: 'STOCK', etiqueta: 'Reposición de stock', cantidad: 8, sucursalId: BRANCH, sucursal: 'Casa Central' },
    ] },
    { id: 'demo-need-3', productId: 'demo-funda-magsafe-transparente', condition: 'NEW', quantity: 20, priority: 'NORMAL', status: 'ABIERTA', promisedAt: enDias(7), origins: ['QUANTITY_OVER_STOCK'], center: null, assignedToId: null, createdAt: hace(20), destinos: [
      { tipo: 'STOCK', etiqueta: 'Reposición de stock', cantidad: 20, sucursalId: BRANCH, sucursal: 'Casa Central' },
    ] },
    { id: 'demo-need-4', productId: 'demo-vidrio-17-pro', condition: 'NEW', quantity: 12, priority: 'URGENTE', status: 'ABIERTA', promisedAt: enDias(-1), origins: ['BELOW_REORDER'], center: 'LOCAL', assignedToId: null, createdAt: hace(96), destinos: [
      { tipo: 'STOCK', etiqueta: 'Reposición de stock', cantidad: 12, sucursalId: BRANCH, sucursal: 'Casa Central' },
    ] },
    { id: 'demo-need-5', productId: 'demo-iphone-13-128-blanco', condition: 'REFURBISHED', quantity: 1, priority: 'NORMAL', status: 'ABIERTA', promisedAt: enDias(3), origins: ['RESERVATION_NO_STOCK'], center: 'LOCAL', assignedToId: null, createdAt: hace(12), destinos: [
      { tipo: 'RESERVA', etiqueta: 'Reserva de Carlos Ramírez', cantidad: 1, sucursalId: BRANCH, sucursal: 'Casa Central', clienteId: 'demo-cliente-carlos', cliente: 'Carlos Ramírez' },
    ] },
    { id: 'demo-need-6', productId: 'demo-cargador-usbc-20w', condition: 'NEW', quantity: 8, priority: 'BAJA', status: 'RECIBIDA', promisedAt: enDias(-4), origins: ['MANUAL'], center: 'CDE', assignedToId: 'demo-user', createdAt: hace(140), destinos: [
      { tipo: 'STOCK', etiqueta: 'Reposición de stock', cantidad: 8, sucursalId: BRANCH, sucursal: 'Casa Central' },
    ] },
    { id: 'demo-need-7', productId: 'demo-funda-magsafe-transparente', condition: 'NEW', quantity: 5, priority: 'BAJA', status: 'CANCELADA', promisedAt: null, origins: ['MANUAL'], center: null, assignedToId: null, createdAt: hace(160), cancelReason: 'Duplicada por otra necesidad.', destinos: [
      { tipo: 'STOCK', etiqueta: 'Reposición de stock', cantidad: 5, sucursalId: BRANCH, sucursal: 'Casa Central' },
    ] },
  ],
  purchases: [
    { id: 'demo-sp-1', code: 'CMP-AUR-0001', status: 'COMPRADA', supplierId: 'demo-prov-importadora', reference: 'IMPTEC-5560', notes: 'Compra del Centro para reposición.', currency: 'PYG', originalCost: null, exchangeRatePyg: 1, costPyg: 5600000, branchId: BRANCH, createdAt: hace(60), receivedAt: null, createdById: 'demo-user',
      lines: [{
        id: 'demo-spl-1', productId: 'demo-airpods-pro-2-usbc', condition: 'NEW', quantity: 8, unitCostPyg: 700000, needId: 'demo-need-2', coveredQuantity: 8, faltan: 5, libreQuantity: 0,
        serials: [serialDemo(101), serialDemo(102), serialDemo(103)].map((serial) => ({ serial })), priority: 'ALTA', source: 'BELOW_REORDER', promisedAt: enDias(4), orderNumber: null, needOrigin: 'BELOW_REORDER',
      }] },
    { id: 'demo-sp-2', code: 'CMP-AUR-0002', status: 'EN_TRANSITO', supplierId: 'demo-prov-mayorista', reference: 'MAYAPY-8842', notes: '', currency: 'PYG', originalCost: null, exchangeRatePyg: 1, costPyg: 11200000, branchId: BRANCH, createdAt: hace(36), receivedAt: null, createdById: 'demo-user',
      lines: [{
        id: 'demo-spl-2', productId: 'demo-iphone-15-pro-256-titanio', condition: 'NEW', quantity: 2, unitCostPyg: 5600000, needId: 'demo-need-1', coveredQuantity: 2, faltan: 0, libreQuantity: 0,
        serials: [{ serial: serialDemo(110) }, { serial: serialDemo(111) }], priority: 'URGENTE', source: 'SALE_NO_STOCK', promisedAt: enDias(1), orderNumber: 'AUR-0001', needOrigin: 'SALE_NO_STOCK',
      }] },
    { id: 'demo-sp-3', code: 'CMP-AUR-0003', status: 'RECIBIDA', supplierId: 'demo-prov-distribuidora', reference: 'DISESTE-2210', notes: '', currency: 'PYG', originalCost: null, exchangeRatePyg: 1, costPyg: 960000, branchId: BRANCH, createdAt: hace(140), receivedAt: hace(120), createdById: 'demo-user',
      lines: [{
        id: 'demo-spl-3', productId: 'demo-cargador-usbc-20w', condition: 'NEW', quantity: 8, unitCostPyg: 120000, needId: 'demo-need-6', coveredQuantity: 8, faltan: 0, libreQuantity: 0,
        serials: [], priority: 'BAJA', source: 'MANUAL', promisedAt: enDias(-4), orderNumber: null, needOrigin: 'MANUAL',
      }] },
  ],
  shipments: [
    { id: 'demo-env-1', code: 'LOTE-AUR-0001', status: 'PREPARANDO', origin: 'CDE', method: 'AEX', company: 'AEX', driver: '', guide: '', purchaseId: 'demo-sp-2', destinationBranchId: BRANCH_2, responsibleId: 'demo-user', etaAt: enDias(1), sentAt: null, arrivedAt: null, notes: 'Entrega en Villa Morra.', publicToken: 'demo-remito-1', createdAt: hace(20),
      items: [
        { id: 'demo-item-1', lineId: 'demo-spl-2', productId: 'demo-iphone-15-pro-256-titanio', serial: null, status: 'PENDIENTE' },
        { id: 'demo-item-2', lineId: 'demo-spl-2', productId: 'demo-iphone-15-pro-256-titanio', serial: null, status: 'PENDIENTE' },
      ] },
    { id: 'demo-env-2', code: 'LOTE-AUR-0002', status: 'EN_TRANSITO', origin: 'USA', method: 'AEX', company: 'AEX', driver: 'Marcos Aquino', guide: 'AEX-778812', purchaseId: 'demo-sp-1', destinationBranchId: BRANCH, responsibleId: 'demo-user-repartidor', etaAt: enDias(0), sentAt: hace(10), arrivedAt: null, notes: '', publicToken: 'demo-remito-2', createdAt: hace(48),
      items: [
        { id: 'demo-item-3', lineId: 'demo-spl-1', productId: 'demo-airpods-pro-2-usbc', serial: serialDemo(101), status: 'EN_TRANSITO' },
        { id: 'demo-item-4', lineId: 'demo-spl-1', productId: 'demo-airpods-pro-2-usbc', serial: serialDemo(102), status: 'EN_TRANSITO' },
        { id: 'demo-item-5', lineId: 'demo-spl-1', productId: 'demo-airpods-pro-2-usbc', serial: serialDemo(103), status: 'EN_TRANSITO' },
        ...Array.from({ length: 5 }, (_, i) => ({ id: `demo-item-${6 + i}`, lineId: 'demo-spl-1', productId: 'demo-airpods-pro-2-usbc', serial: null, status: 'PENDIENTE' })),
      ] },
    { id: 'demo-env-3', code: 'LOTE-AUR-0000', status: 'RECIBIDO', origin: 'CDE', method: 'LOCAL', company: 'Moto propia', driver: 'Marcos Aquino', guide: '', purchaseId: 'demo-sp-3', destinationBranchId: BRANCH, responsibleId: 'demo-user', etaAt: hace(130), sentAt: hace(135), arrivedAt: hace(120), notes: '', publicToken: 'demo-remito-3', createdAt: hace(140),
      items: Array.from({ length: 8 }, (_, i) => ({ id: `demo-item-r${i + 1}`, lineId: 'demo-spl-3', productId: 'demo-cargador-usbc-20w', serial: '', status: 'RECIBIDO' })) },
  ],
  receptions: [
    { id: 'demo-recepcion-1', code: 'REC-AUR-0002', shipmentId: 'demo-env-2', status: 'ABIERTA', locationId: 'demo-ubic-deposito-1', createdAt: hace(2), receivedById: null,
      items: [] },
  ],
})

function read() {
  try {
    const guardado = JSON.parse(leerDemo(KEY))
    if (guardado && Array.isArray(guardado.needs) && Array.isArray(guardado.purchases)) return guardado
  } catch { /* se regenera */ }
  const fresh = seed()
  guardarDemo(KEY, JSON.stringify(fresh))
  return fresh
}
const write = (state) => { guardarDemo(KEY, JSON.stringify(state)); return state }

const grupoDeNecesidad = (need, state) => {
  const compra = state.purchases.find((fila) => (fila.lines || []).some((linea) => linea.needId === need.id))
  const assignedTo = usuario(need.assignedToId)
  return {
    productoId: need.productId,
    producto: PRODUCTOS[need.productId]?.name || need.productId,
    condicion: need.condition,
    cantidad: need.quantity,
    prioridad: need.priority,
    estado: need.status,
    prometidaEl: need.promisedAt,
    origenes: need.origins,
    centro: need.center,
    assignedTo: assignedTo ? { id: assignedTo.id, name: assignedTo.nombre } : null,
    cancelReason: need.cancelReason || '',
    destinos: need.destinos,
    necesidades: [need.id],
    costoEstimadoPyg: (() => { const linea = compra?.lines?.find((fila) => fila.needId === need.id); return linea ? linea.unitCostPyg * need.quantity : null })(),
    margenEstimadoPyg: null,
  }
}

export function listDemoSupplyNeeds(params = {}) {
  const state = read()
  let needs = state.needs
  const { status, priority, origin, sinCentro, sinAsignar, condition, productId } = params
  const estado = (need) => {
    if (status === 'ASIGNADA') return need.status === 'ASIGNADA' || (need.assignedToId && need.status === 'ABIERTA')
    if (status === 'ABIERTA') return need.status === 'ABIERTA'
    return !status || need.status === status
  }
  needs = needs.filter((need) => estado(need)
    && (!priority || need.priority === priority)
    && (!origin || (need.origins || []).includes(origin))
    && (sinCentro !== '1' && sinCentro !== 1 || !need.center)
    && (sinAsignar !== '1' && sinAsignar !== 1 || !need.assignedToId)
    && (!condition || need.condition === condition)
    && (!productId || need.productId === productId))
  const grupos = needs.map((need) => grupoDeNecesidad(need, state))
  const porEstado = {}
  for (const need of state.needs) porEstado[need.status] = (porEstado[need.status] || 0) + 1
  const porPrioridad = {}
  const porOrigen = {}
  for (const need of state.needs) {
    porPrioridad[need.priority] = (porPrioridad[need.priority] || 0) + 1
    for (const origen of need.origins || []) porOrigen[origen] = (porOrigen[origen] || 0) + 1
  }
  const activas = state.needs.filter((need) => need.status === 'ABIERTA' || need.status === 'ASIGNADA')
  return {
    fecha: new Date().toISOString().slice(0, 10),
    totales: { necesidades: grupos.length, grupos: grupos.length, unidades: grupos.reduce((suma, grupo) => suma + grupo.cantidad, 0) },
    contadores: {
      porEstado, porPrioridad, porOrigen,
      vencidas: activas.filter((need) => need.promisedAt && new Date(need.promisedAt).getTime() < Date.now()).length,
      sinAsignar: activas.filter((need) => !need.assignedToId).length,
      sinCentro: activas.filter((need) => !need.center).length,
      pendientes: activas.length,
    },
    grupos,
  }
}

export function createDemoSupplyNeed(data = {}) {
  const state = read()
  const need = {
    id: `demo-need-${Date.now().toString(36)}`,
    productId: data.productId,
    condition: data.condition || 'NEW',
    quantity: Math.max(1, Number(data.quantity) || 1),
    priority: data.priority || 'NORMAL',
    status: 'ABIERTA',
    promisedAt: data.promisedAt || null,
    origins: [data.origin || 'MANUAL'],
    center: data.center || null,
    assignedToId: null,
    createdAt: new Date().toISOString(),
    destinos: [{ tipo: 'STOCK', etiqueta: 'Reposición de stock', cantidad: Math.max(1, Number(data.quantity) || 1), sucursalId: BRANCH, sucursal: 'Casa Central' }],
  }
  write({ ...state, needs: [need, ...state.needs] })
  return need
}

export function updateDemoSupplyNeeds(data = {}) {
  const state = read()
  const ids = Array.isArray(data.ids) ? data.ids : (data.id ? [data.id] : [])
  const needs = state.needs.map((need) => {
    if (!ids.includes(need.id)) return need
    if (data.action === 'cancel') return { ...need, status: 'CANCELADA', cancelReason: data.reason || '' }
    if (data.action === 'assign') return { ...need, assignedToId: data.assignedToId || need.assignedToId, center: (data.origin || need.center || '').toUpperCase() || null, status: 'ASIGNADA' }
    return { ...need, ...(data.priority ? { priority: data.priority } : {}), ...(data.promisedAt ? { promisedAt: data.promisedAt } : {}), ...(data.origin ? { center: data.origin } : {}) }
  })
  write({ ...state, needs })
  return listDemoSupplyNeeds()
}

// ── Compras del Centro ──────────────────────────────────────────────
const conDetalle = (compra) => ({
  ...compra,
  supplier: proveedorDemo(compra.supplierId) || { id: compra.supplierId, name: compra.supplierName },
  supplierName: proveedorDemo(compra.supplierId)?.name || compra.supplierName || '',
  branch: { id: compra.branchId, name: compra.branchId === BRANCH_2 ? 'Sucursal Villa Morra' : 'Casa Central' },
  createdBy: { name: usuario(compra.createdById)?.nombre || 'Equipo demo' },
  unidades: (compra.lines || []).reduce((suma, linea) => suma + Number(linea.quantity || 0), 0),
  lines: (compra.lines || []).map((linea) => ({ ...linea, product: producto(linea.productId), serials: linea.serials || [], faltan: Number(linea.faltan ?? Math.max(0, Number(linea.quantity) - (linea.serials || []).length)) })),
})

export function listDemoSupplyPurchases(params = {}) {
  const state = read()
  let compras = state.purchases
  if (params.status) compras = compras.filter((compra) => compra.status === params.status)
  if (params.pendientes === 1 || params.pendientes === '1') compras = compras.filter((compra) => (compra.lines || []).some((linea) => conDetalle(compra).lines.find((fila) => fila.id === linea.id).faltan > 0))
  const detalladas = compras.map(conDetalle)
  return {
    fecha: new Date().toISOString().slice(0, 10),
    totales: {
      compras: detalladas.length,
      unidades: detalladas.reduce((suma, compra) => suma + compra.unidades, 0),
      pendientes: detalladas.reduce((suma, compra) => suma + compra.lines.reduce((total, linea) => total + linea.faltan, 0), 0),
    },
    compras: detalladas,
  }
}

export function createDemoSupplyPurchase(data = {}) {
  const state = read()
  const proveedor = PROVEEDORES_DEMO.find((fila) => fila.name === data.supplierName) || null
  const compra = {
    id: `demo-sp-${Date.now().toString(36)}`,
    code: `CMP-AUR-${String(state.purchases.length + 1).padStart(4, '0')}`,
    status: 'COMPRADA',
    supplierId: proveedor?.id || null,
    supplierName: data.supplierName || proveedor?.name || 'Proveedor demo',
    reference: data.reference || '',
    notes: data.notes || '',
    currency: data.currency || 'PYG',
    originalCost: data.originalCost ?? null,
    exchangeRatePyg: Number(data.exchangeRatePyg) || 1,
    costPyg: Number(data.costPyg) || null,
    branchId: data.branchId || BRANCH,
    createdAt: new Date().toISOString(),
    receivedAt: null,
    createdById: data.createdById || 'demo-user',
    lines: (data.lines || []).map((linea, indice) => ({
      id: `demo-spl-${Date.now().toString(36)}-${indice}`,
      productId: linea.productId,
      condition: linea.condition || 'NEW',
      quantity: Number(linea.quantity) || 1,
      unitCostPyg: Number(linea.unitCostPyg) || 0,
      needId: linea.needId || null,
      coveredQuantity: 0,
      faltan: Number(linea.quantity) || 1,
      libreQuantity: Number(linea.quantity) || 1,
      serials: (linea.serials || []).map((serial) => ({ serial })),
      priority: 'NORMAL',
      source: 'MANUAL',
      promisedAt: null,
      orderNumber: null,
      needOrigin: 'MANUAL',
    })),
  }
  write({ ...state, purchases: [compra, ...state.purchases] })
  return conDetalle(compra)
}

export function updateDemoSupplyPurchase(data = {}) {
  const state = read()
  const compra = state.purchases.find((fila) => fila.id === data.id)
  if (!compra) throw new Error('Compra no encontrada.')
  if (data.action === 'cancel') compra.status = 'CANCELADA'
  if (data.action === 'addLines') compra.lines = [...(compra.lines || []), ...(data.lines || []).map((linea, indice) => ({ id: `demo-spl-add-${Date.now().toString(36)}-${indice}`, productId: linea.productId, condition: linea.condition || 'NEW', quantity: Number(linea.quantity) || 1, unitCostPyg: Number(linea.unitCostPyg) || 0, needId: null, coveredQuantity: 0, faltan: Number(linea.quantity) || 1, libreQuantity: Number(linea.quantity) || 1, serials: [], priority: 'NORMAL', source: 'MANUAL' }))]
  if (data.action === 'scan' || data.action === 'serials') {
    const linea = compra.lines.find((fila) => fila.id === data.lineId)
    if (linea) {
      const nuevos = data.action === 'scan' ? [data.serial] : (data.serials || [])
      for (const serial of nuevos.map((valor) => String(valor || '').trim().toUpperCase()).filter(Boolean)) {
        if (!(linea.serials || []).some((fila) => fila.serial === serial)) linea.serials = [...(linea.serials || []), { serial }]
      }
      linea.faltan = Math.max(0, Number(linea.quantity) - (linea.serials || []).length)
    }
  }
  write(state)
  return conDetalle(compra)
}

export function demoSupplyPurchaseLabels(id) {
  const compra = read().purchases.find((fila) => fila.id === id)
  if (!compra) throw new Error('Compra no encontrada.')
  const detalle = conDetalle(compra)
  const etiquetas = []
  for (const linea of detalle.lines) {
    for (let indice = 0; indice < Number(linea.quantity); indice += 1) {
      etiquetas.push({
        id: `${linea.id}-${indice + 1}`,
        serial: linea.serials[indice]?.serial || '',
        producto: linea.product.name,
        capacidad: linea.product.capacity,
        color: linea.product.color,
        referencia: compra.reference || compra.code,
        condicion: linea.condition,
      })
    }
  }
  return {
    compra: { id: compra.id, code: compra.code, referencia: compra.reference || '', proveedor: detalle.supplierName, destino: detalle.branch.name },
    resumen: { unidades: etiquetas.length, conImei: etiquetas.filter((fila) => fila.serial).length, pendientes: etiquetas.filter((fila) => !fila.serial).length },
    etiquetas,
  }
}

// ── Lotes (shipments) ───────────────────────────────────────────────
const envioConDetalle = (envio, state) => {
  const compra = state.purchases.find((fila) => fila.id === envio.purchaseId)
  const items = (envio.items || []).map((item) => ({ ...item, product: producto(item.productId) }))
  return {
    ...envio,
    purchase: compra ? { id: compra.id, code: compra.code, supplierName: proveedorDemo(compra.supplierId)?.name || compra.supplierName } : null,
    destinationBranch: { id: envio.destinationBranchId, name: envio.destinationBranchId === BRANCH_2 ? 'Sucursal Villa Morra' : 'Casa Central' },
    responsible: (() => { const persona = usuario(envio.responsibleId); return persona ? { id: persona.id, name: persona.nombre } : null })(),
    items,
    unidades: items.length,
    conImei: items.filter((item) => item.serial).length,
    pendientes: items.filter((item) => !item.serial).length,
  }
}

export function listDemoSupplyShipments(params = {}) {
  const state = read()
  let envios = state.shipments
  if (params.pendientes === 1 || params.pendientes === '1') envios = envios.filter((envio) => envioConDetalle(envio, state).pendientes > 0)
  const detallados = envios.map((envio) => envioConDetalle(envio, state))
  return {
    fecha: new Date().toISOString().slice(0, 10),
    totales: { envios: detallados.length, unidades: detallados.reduce((suma, envio) => suma + envio.unidades, 0) },
    envios: detallados,
  }
}

export function updateDemoSupplyShipment(data = {}) {
  const state = read()
  const envio = state.shipments.find((fila) => fila.id === data.id)
  if (!envio) throw new Error('Lote no encontrado.')
  if (data.action === 'scan' || data.action === 'serials') {
    const nuevos = data.action === 'scan' ? [data.serial] : (data.serials || [])
    for (const serial of nuevos.map((valor) => String(valor || '').trim().toUpperCase()).filter(Boolean)) {
      const item = (envio.items || []).find((fila) => fila.lineId === data.lineId && !fila.serial)
      if (item) { item.serial = serial; item.status = 'EN_TRANSITO' }
    }
  }
  if (data.action === 'prepare') envio.status = 'PREPARANDO'
  if (data.action === 'dispatch' || data.action === 'transit') { envio.status = 'EN_TRANSITO'; envio.sentAt = new Date().toISOString() }
  if (data.action === 'cancel') envio.status = 'CANCELADO'
  write(state)
  return envioConDetalle(envio, state)
}

export function demoSupplyShipmentManifest(id) {
  const state = read()
  const envio = state.shipments.find((fila) => fila.id === id)
  if (!envio) throw new Error('Lote no encontrado.')
  const detalle = envioConDetalle(envio, state)
  return {
    ...detalle,
    compra: detalle.purchase?.code || '',
    origen: detalle.origin,
    destino: detalle.destinationBranch?.name || '',
    transportista: detalle.company || '',
    guia: detalle.guide || '',
    fecha: detalle.sentAt || detalle.createdAt,
  }
}

// ── Recepciones ─────────────────────────────────────────────────────
const llegadaDe = (envio, state) => {
  const recepcion = state.receptions.find((fila) => fila.shipmentId === envio.id)
  const detalle = envioConDetalle(envio, state)
  const recibidas = recepcion ? (recepcion.items || []).filter((item) => item.resultado === 'RECIBIDO').length : 0
  return {
    id: envio.id,
    code: envio.code,
    compra: detalle.purchase?.code || '',
    origen: envio.origin,
    metodo: envio.method,
    empresa: envio.company,
    eta: envio.etaAt,
    salida: envio.sentAt,
    estado: envio.status,
    destino: detalle.destinationBranch?.name || '',
    destinoBranchId: envio.destinationBranchId,
    unidades: detalle.unidades,
    conImei: detalle.conImei,
    pendientes: Math.max(0, detalle.unidades - recibidas),
    porRecibir: Math.max(0, detalle.unidades - recibidas),
    recepcionAbiertaId: recepcion ? recepcion.id : null,
    ubicacionSugerida: { id: 'demo-ubic-deposito-1', name: 'Depósito 1', code: 'D1' },
  }
}

export function listDemoSupplyReceptions(params = {}) {
  const state = read()
  let envios = state.shipments.filter((envio) => envio.status === 'EN_TRANSITO' || envio.status === 'RECIBIDO')
  if (params.pendientes === 1 || params.pendientes === '1') envios = envios.filter((envio) => envio.status !== 'RECIBIDO')
  const llegadas = envios.map((envio) => llegadaDe(envio, state))
  return {
    fecha: new Date().toISOString().slice(0, 10),
    totales: { llegadas: llegadas.length, unidades: llegadas.reduce((suma, fila) => suma + fila.unidades, 0) },
    llegadas,
  }
}

export function demoSupplyReceptionDetail(params = {}) {
  const state = read()
  const envio = state.shipments.find((fila) => fila.id === params.shipmentId || fila.code === params.code || fila.publicToken === params.token)
  if (!envio) throw new Error('Lote no encontrado.')
  const recepcion = state.receptions.find((fila) => fila.shipmentId === envio.id) || null
  const detalle = envioConDetalle(envio, state)
  const esperados = detalle.items.filter((item) => item.status !== 'RECIBIDO')
  const recibidos = (recepcion?.items || [])
  const resumen = { RECIBIDO: recibidos.filter((item) => item.resultado === 'RECIBIDO').length, FALTANTE: 0, SOBRANTE: 0, DANADO: 0, INCORRECTO: 0 }
  return {
    recepcion: recepcion ? {
      id: recepcion.id,
      status: recepcion.status,
      locationId: recepcion.locationId,
      shipment: { code: envio.code, purchase: { code: detalle.purchase?.code || '', currency: 'PYG', originalCost: null, exchangeRatePyg: 1, costPyg: state.purchases.find((fila) => fila.id === envio.purchaseId)?.costPyg || null, lines: [] }, destinationBranch: detalle.destinationBranch, items: detalle.items },
      location: { id: recepcion.locationId, name: 'Depósito 1', code: 'D1' },
      receivedBy: recepcion.receivedById ? { id: recepcion.receivedById, name: usuario(recepcion.receivedById)?.nombre || '' } : null,
      items: recibidos,
    } : null,
    esperados: esperados.map((item) => ({ ...item, lineId: item.lineId, shipmentItemId: item.id })),
    resumen,
  }
}

export function createDemoSupplyReception(data = {}) {
  const state = read()
  const envio = state.shipments.find((fila) => fila.id === data.shipmentId || fila.code === data.code || fila.publicToken === data.token)
  if (!envio) throw new Error('Lote no encontrado.')
  const existente = state.receptions.find((fila) => fila.shipmentId === envio.id)
  if (existente) return { ...demoSupplyReceptionDetail({ shipmentId: envio.id }), retomada: true }
  const recepcion = { id: `demo-recepcion-${Date.now().toString(36)}`, code: `REC-AUR-${String(state.receptions.length + 1).padStart(4, '0')}`, shipmentId: envio.id, status: 'ABIERTA', locationId: data.locationId || 'demo-ubic-deposito-1', createdAt: new Date().toISOString(), receivedById: null, items: [] }
  write({ ...state, receptions: [recepcion, ...state.receptions] })
  return { ...demoSupplyReceptionDetail({ shipmentId: envio.id }), retomada: false }
}

export function updateDemoSupplyReception(data = {}) {
  const state = read()
  const recepcion = state.receptions.find((fila) => fila.id === data.id)
  if (!recepcion) throw new Error('Recepción no encontrada.')
  if (data.action === 'scan' || data.action === 'item') {
    const envio = state.shipments.find((fila) => fila.id === recepcion.shipmentId)
    const esperado = (envio?.items || []).find((item) => item.status !== 'RECIBIDO' && String(item.serial || '').toUpperCase() === String(data.serial || '').toUpperCase())
    const resultado = data.resultado || 'RECIBIDO'
    recepcion.items = [...(recepcion.items || []), { id: `demo-recepcion-item-${Date.now().toString(36)}`, shipmentItemId: esperado?.id || data.shipmentItemId || null, serial: data.serial || '', productId: esperado?.productId || data.productId || null, resultado, nota: data.nota || '' }]
    if (esperado) esperado.status = resultado === 'RECIBIDO' ? 'RECIBIDO' : esperado.status
  }
  if (data.action === 'cancel') recepcion.status = 'CANCELADA'
  if (data.action === 'confirm') {
    recepcion.status = 'CONFIRMADA'
    recepcion.receivedById = data.receivedById || 'demo-user'
    const envio = state.shipments.find((fila) => fila.id === recepcion.shipmentId)
    if (envio) { envio.status = 'RECIBIDO'; envio.arrivedAt = new Date().toISOString() }
    const need = state.needs.find((fila) => fila.status === 'ASIGNADA' || fila.status === 'ABIERTA')
    if (need) need.status = 'RECIBIDA'
  }
  write(state)
  return { ...demoSupplyReceptionDetail({ shipmentId: recepcion.shipmentId }), ok: true }
}

// ── Métricas y alertas ──────────────────────────────────────────────
export function demoSupplyPerformance(params = {}) {
  const ventanaDias = Number(params.dias || params.ventanaDias || 30)
  return {
    fecha: new Date().toISOString().slice(0, 10),
    ventanaDias,
    desde: new Date(Date.now() - ventanaDias * 86400000).toISOString(),
    totales: { compras: 3, proveedores: 3, rutas: 3, envios: 3 },
    proveedores: [
      { supplierId: 'demo-prov-importadora', proveedor: 'Importadora Tecnológica S.A.', compras: 1, unidades: 8, costPyg: 5600000, costoPromedioUnidadPyg: 700000, plazoPromedioDias: 6, puntualidadPct: 92, faltantesPct: 0, incidencias: 0 },
      { supplierId: 'demo-prov-distribuidora', proveedor: 'Distribuidora del Este', compras: 1, unidades: 8, costPyg: 960000, costoPromedioUnidadPyg: 120000, plazoPromedioDias: 4, puntualidadPct: 85, faltantesPct: 0, incidencias: 1 },
      { supplierId: 'demo-prov-mayorista', proveedor: 'Mayorista Apple PY', compras: 1, unidades: 2, costPyg: 11200000, costoPromedioUnidadPyg: 5600000, plazoPromedioDias: 9, puntualidadPct: 78, faltantesPct: 5, incidencias: 2 },
    ],
    rutas: [
      { ruta: 'CDE → Asunción', origen: 'CDE', destino: 'Asunción', metodo: 'AEX', lotes: 1, unidades: 1, diasPromedio: 3, diasMaximos: 4, enTiempoPct: 88, atrasoPromedioDias: 0.4 },
      { ruta: 'USA → Asunción', origen: 'USA', destino: 'Asunción', metodo: 'AEX', lotes: 1, unidades: 8, diasPromedio: 12, diasMaximos: 15, enTiempoPct: 72, atrasoPromedioDias: 1.8 },
      { ruta: 'CDE → Villa Morra', origen: 'CDE', destino: 'Asunción', metodo: 'LOCAL', lotes: 1, unidades: 2, diasPromedio: 1, diasMaximos: 2, enTiempoPct: 95, atrasoPromedioDias: 0.1 },
    ],
  }
}

export function demoSupplyAlerts() {
  const state = read()
  const envio = state.shipments.find((fila) => fila.status === 'EN_TRANSITO')
  const atrasados = envio ? [{
    id: `demo-alerta-${envio.id}`,
    code: envio.code,
    origen: envio.origin,
    destino: envio.destinationBranchId === BRANCH_2 ? 'Sucursal Villa Morra' : 'Casa Central',
    metodo: envio.method,
    estado: envio.status,
    eta: envio.etaAt,
    diasAtraso: 2,
    compra: state.purchases.find((fila) => fila.id === envio.purchaseId)?.code || '',
    unidades: (envio.items || []).length,
  }] : []
  const vencidas = state.needs.filter((need) => (need.status === 'ABIERTA' || need.status === 'ASIGNADA') && need.promisedAt && new Date(need.promisedAt).getTime() < Date.now())
  return {
    fecha: new Date().toISOString().slice(0, 10),
    totales: { atrasados: atrasados.length, necesidadesVencidas: vencidas.length, unidadesAtrasadas: atrasados.reduce((suma, fila) => suma + fila.unidades, 0) },
    atrasados,
    necesidadesVencidas: vencidas.map((need) => ({
      id: need.id,
      productId: need.productId,
      producto: PRODUCTOS[need.productId]?.name || need.productId,
      branchId: need.destinos?.[0]?.sucursalId || BRANCH,
      sucursal: need.destinos?.[0]?.sucursal || 'Casa Central',
      quantity: need.quantity,
      prioridad: need.priority,
      prometidaEn: need.promisedAt,
      diasVencidos: Math.max(1, Math.ceil((Date.now() - new Date(need.promisedAt).getTime()) / 86400000)),
      orderId: need.destinos?.find((destino) => destino.pedidoId)?.pedidoId || null,
      source: (need.origins || [])[0] || 'MANUAL',
    })),
  }
}

/** Historial de abastecimiento de un serial (ficha de la unidad). */
export function demoSupplySerial(serial) {
  const buscado = String(serial || '').trim().toUpperCase()
  const state = read()
  const linea = state.purchases.flatMap((compra) => (compra.lines || []).map((fila) => ({ compra, linea: fila }))).find(({ linea: fila }) => (fila.serials || []).some((item) => String(item.serial).toUpperCase() === buscado))
  return {
    serial: buscado,
    enStock: false,
    unidad: null,
    compra: linea ? { code: linea.compra.code, proveedor: proveedorDemo(linea.compra.supplierId)?.name || '', referencia: linea.compra.reference || '', estado: linea.compra.status, fecha: linea.compra.createdAt } : null,
    producto: linea ? { nombre: producto(linea.linea.productId).name, capacidad: producto(linea.linea.productId).capacity } : null,
    necesidad: null,
    lotes: [],
  }
}
