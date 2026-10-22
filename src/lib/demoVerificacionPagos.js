// Verificación de pagos de la demo: cobros PIX y transferencia pendientes con un
// comprobante ficticio, uno rechazado y un día con una discrepancia, para que
// «Autorizaciones › Pagos» y «Finanzas › Verificación» se vean completos sin
// tocar el API. Todo vive en memoria: recargar vuelve al estado inicial.
import { hoyParaguay } from './verificacionPagos.js'

const MIN = 60000
const hace = (minutos) => new Date(Date.now() - minutos * MIN).toISOString()

function comprobanteFicticio(titulo, monto) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="480" viewBox="0 0 360 480"><rect width="360" height="480" fill="#f4f6f8"/><rect x="24" y="24" width="312" height="432" rx="14" fill="#ffffff" stroke="#c9d1d9"/><text x="180" y="78" font-family="Arial" font-size="18" font-weight="700" text-anchor="middle" fill="#1f2933">${titulo}</text><text x="180" y="108" font-family="Arial" font-size="12" text-anchor="middle" fill="#52606d">Comprobante de ejemplo (demo)</text><line x1="48" y1="132" x2="312" y2="132" stroke="#d9dee3"/><text x="48" y="170" font-family="Arial" font-size="12" fill="#52606d">Monto</text><text x="312" y="170" font-family="Arial" font-size="16" font-weight="700" text-anchor="end" fill="#1f2933">Gs ${monto}</text><text x="48" y="206" font-family="Arial" font-size="12" fill="#52606d">Estado</text><text x="312" y="206" font-family="Arial" font-size="14" text-anchor="end" fill="#127c3a">Realizado</text><rect x="120" y="260" width="120" height="120" fill="#e4e7eb"/><text x="180" y="326" font-family="Arial" font-size="11" text-anchor="middle" fill="#7b8794">QR ficticio</text></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

const CUENTAS = {
  pix: { name: 'PIX Itaú', bank: 'Itaú', holder: 'Mobile Center S.A.', processor: null, alias: null, pixKey: 'pix@mobilecenter.com.py' },
  transfer: { name: 'Transferencia Continental', bank: 'Continental', holder: 'Mobile Center S.A.', processor: null, alias: '0981 000 111', pixKey: null },
  usdt: { name: 'USDT Binance', bank: null, holder: 'Mobile Center S.A.', processor: null, alias: null, pixKey: null },
}

function semilla() {
  const pago = (id, numero, cliente, vendedor, metodo, cuenta, monto, minutos, extra = {}) => ({
    id, orderId: `demo-ord-${id}`, orderNumber: numero, customerName: cliente, sellerName: vendedor, collectedByName: vendedor,
    method: metodo, status: 'CONFIRMED', pendingReason: null, amountPyg: monto, reference: null, account: cuenta,
    createdAt: hace(minutos), proofs: [], resolution: null, verified: false, propio: false, ...extra,
  })
  const conComprobante = (id, titulo, monto) => [{ id: `${id}-c1`, fileName: `${titulo.toLowerCase().replace(/\s+/g, '-')}.svg`, mimeType: 'image/svg+xml', sizeBytes: 3400, createdAt: hace(10), demoUrl: comprobanteFicticio(titulo, monto) }]
  return {
    pagos: [
      pago('dv-1', '04231', 'Lucía Fernández', 'Diego López', 'PIX', CUENTAS.pix, 1850000, 18, { status: 'PENDING', pendingReason: 'VERIFICACION', reference: 'E2E-PIX-8841', proofs: conComprobante('dv-1', 'Pix recibido', '1.850.000') }),
      pago('dv-2', '04232', 'Carlos Benítez', 'Lucía Fernández', 'TRANSFER', CUENTAS.transfer, 3200000, 55, { status: 'PENDING', pendingReason: 'VERIFICACION', reference: 'TR-552190', proofs: conComprobante('dv-2', 'Transferencia', '3.200.000') }),
      pago('dv-3', '04233', 'Distribuidora Luque S.A.', 'Diego López', 'TRANSFER', CUENTAS.transfer, 545000, 130, { status: 'PENDING', pendingReason: 'VERIFICACION', reference: 'TR-552377' }),
      pago('dv-4', '04226', 'María González', 'Lucía Fernández', 'PIX', CUENTAS.pix, 780000, 210, { status: 'REJECTED', pendingReason: 'VERIFICACION', reference: 'E2E-PIX-8790', proofs: conComprobante('dv-4', 'Pix recibido', '780.000'), resolution: { state: 'REJECTED', note: 'El monto del comprobante no coincide con el banco.', at: hace(150), byName: 'Administrador' } }),
      pago('dv-5', '04234', 'Ana Duarte', 'Administrador', 'CRYPTO', CUENTAS.usdt, 1200000, 40, { status: 'PENDING', pendingReason: 'VERIFICACION', reference: 'USDT-TX-77', propio: true, proofs: conComprobante('dv-5', 'USDT recibido', '1.200.000') }),
      pago('dv-6', '04220', 'Pedro Giménez', 'Diego López', 'TRANSFER', CUENTAS.transfer, 2400000, 300, { pendingReason: 'VERIFICACION', reference: 'TR-551900', proofs: conComprobante('dv-6', 'Transferencia', '2.400.000'), resolution: { state: 'VERIFIED', note: null, at: hace(280), byName: 'Administrador' } }),
      pago('dv-7', '04221', 'Sofía Ayala', 'Diego López', 'CASH', null, 650000, 280),
      pago('dv-8', '04222', 'Marcos Román', 'Lucía Fernández', 'CASH', null, 1250000, 240),
      pago('dv-9', '04223', 'Julia Cabral', 'Lucía Fernández', 'CASH', null, 320000, 200),
      pago('dv-10', '04224', 'Hugo Páez', 'Diego López', 'CARD', { name: 'POS Bancard', processor: 'Bancard', bank: null, holder: null }, 980000, 170),
      pago('dv-11', '04225', 'Rocío Vera', 'Diego López', 'CARD', { name: 'POS Bancard', processor: 'Bancard', bank: null, holder: null }, 1500000, 120),
    ],
    discrepancias: [
      { id: 'dd-1', scope: 'CATEGORY', paymentId: null, method: 'CARD', accountId: null, currency: 'PYG', expectedPyg: 2480000, receivedPyg: 2400000, differencePyg: -80000, reason: 'La procesadora retuvo la comisión del lote.', createdByName: 'Administrador', createdAt: hace(60), resolved: false, resolvedAt: null, resolvedByName: null, resolvedNote: null },
    ],
  }
}

let estado = semilla()
export const reiniciarDemoVerificacion = () => { estado = semilla() }

const aItem = (pago) => ({
  id: pago.id, orderId: pago.orderId, orderNumber: pago.orderNumber, branchId: 'demo-sucursal', customerName: pago.customerName,
  sellerId: 'demo-vendedor', sellerName: pago.sellerName, collectedById: 'demo-cobro', collectedByName: pago.collectedByName,
  method: pago.method, status: pago.status, pendingReason: pago.pendingReason, amountPyg: pago.amountPyg, currency: 'PYG', originalAmount: null,
  reference: pago.reference, accountId: pago.account ? `demo-cta-${pago.method}` : null, account: pago.account || { name: 'Efectivo' },
  createdAt: pago.createdAt, ageMinutes: Math.max(0, Math.floor((Date.now() - new Date(pago.createdAt).getTime()) / MIN)),
  proofs: pago.proofs, proofCount: pago.proofs.length, resolution: pago.resolution,
  canResolve: pago.status === 'PENDING' && !pago.propio,
})

const enVerificacion = (pago) => pago.pendingReason === 'VERIFICACION'

export function demoPagosPorVerificar(state = 'pending') {
  const base = estado.pagos.filter(enVerificacion)
  const por = (status) => base.filter(pago => pago.status === status)
  const suma = (lista) => lista.reduce((total, pago) => total + pago.amountPyg, 0)
  const elegidos = state === 'all' ? base : por(state === 'approved' ? 'CONFIRMED' : state === 'rejected' ? 'REJECTED' : 'PENDING')
  return {
    state,
    items: [...elegidos].sort((a, b) => (state === 'pending' ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt))).map(aItem),
    counts: {
      pending: { count: por('PENDING').length, amountPyg: suma(por('PENDING')) },
      approved: { count: por('CONFIRMED').length, amountPyg: suma(por('CONFIRMED')) },
      rejected: { count: por('REJECTED').length, amountPyg: suma(por('REJECTED')) },
    },
    policy: { requireProof: true, blockDelivery: true },
  }
}
export const demoCantidadPagosPendientes = () => estado.pagos.filter(pago => enVerificacion(pago) && pago.status === 'PENDING').length

export function demoResolverPago(id, accion, motivo, quien = 'Administrador') {
  const pago = estado.pagos.find(item => item.id === id)
  if (!pago) throw new Error('Pago no encontrado.')
  if (pago.propio) throw new Error('No podés aprobar tu propio cobro: lo verifica otra persona.')
  if (pago.status !== 'PENDING') throw new Error('Este pago ya fue resuelto.')
  if (accion === 'reject') {
    if (!String(motivo || '').trim()) throw new Error('Indicá el motivo del rechazo.')
    pago.status = 'REJECTED'
    pago.resolution = { state: 'REJECTED', note: String(motivo).trim(), at: new Date().toISOString(), byName: quien }
  } else {
    pago.status = 'CONFIRMED'
    pago.resolution = { state: 'VERIFIED', note: null, at: new Date().toISOString(), byName: quien }
    pago.verified = true
  }
}

// ── Día ─────────────────────────────────────────────────────────────────────
const claveGrupo = (pago) => JSON.stringify([pago.method, pago.account?.name || '', 'PYG'])
const estadoLinea = (pago) => {
  if (pago.status === 'REJECTED') return 'REJECTED'
  if (pago.status === 'PENDING') return 'PENDING'
  return pago.verified || pago.resolution?.state === 'VERIFIED' ? 'VERIFIED' : 'TO_VERIFY'
}

export function demoVistaDia(day) {
  const hoy = day === hoyParaguay()
  const pagos = hoy ? estado.pagos.filter(pago => pago.method !== 'CREDIT') : []
  const grupos = new Map()
  for (const pago of pagos) {
    const clave = claveGrupo(pago)
    let grupo = grupos.get(clave)
    if (!grupo) {
      grupo = { key: clave, method: pago.method, accountId: pago.account ? `demo-cta-${pago.method}` : null, currency: 'PYG', label: pago.account?.name || 'Efectivo', methodLabel: pago.method,
        count: 0, confirmedPyg: 0, verifiedPyg: 0, toVerifyPyg: 0, pendingPyg: 0, rejectedPyg: 0, verifiedCount: 0, toVerifyCount: 0, pendingCount: 0, rejectedCount: 0, openDiscrepancies: 0, payments: [] }
      grupos.set(clave, grupo)
    }
    const linea = estadoLinea(pago)
    grupo.count++
    if (linea === 'VERIFIED') { grupo.confirmedPyg += pago.amountPyg; grupo.verifiedPyg += pago.amountPyg; grupo.verifiedCount++ }
    else if (linea === 'TO_VERIFY') { grupo.confirmedPyg += pago.amountPyg; grupo.toVerifyPyg += pago.amountPyg; grupo.toVerifyCount++ }
    else if (linea === 'PENDING') { grupo.pendingPyg += pago.amountPyg; grupo.pendingCount++ }
    else { grupo.rejectedPyg += pago.amountPyg; grupo.rejectedCount++ }
    grupo.payments.push({
      id: pago.id, orderId: pago.orderId, orderNumber: pago.orderNumber, amountPyg: pago.amountPyg, customerName: pago.customerName,
      collectedByName: pago.collectedByName, collectedById: 'demo-cobro', at: pago.createdAt, reference: pago.reference, status: pago.status, state: linea,
      verifiedByName: pago.resolution?.state === 'VERIFIED' ? pago.resolution.byName : null, verifiedAt: pago.resolution?.state === 'VERIFIED' ? pago.resolution.at : null,
      resolvedVia: null, note: pago.resolution?.note || null, canVerify: linea !== 'VERIFIED' && linea !== 'REJECTED' && !pago.propio,
    })
  }
  const discrepancias = hoy ? estado.discrepancias : []
  for (const fila of discrepancias) {
    if (fila.resolved) continue
    const grupo = [...grupos.values()].find(item => item.method === fila.method)
    if (grupo) grupo.openDiscrepancies++
  }
  const lista = [...grupos.values()].sort((a, b) => b.confirmedPyg + b.pendingPyg - (a.confirmedPyg + a.pendingPyg))
  const suma = (campo) => lista.reduce((total, grupo) => total + grupo[campo], 0)
  const sinResolver = lista.reduce((total, grupo) => total + grupo.toVerifyCount + grupo.pendingCount, 0)
  const abiertas = discrepancias.filter(fila => !fila.resolved).length
  return {
    day, branchId: 'demo-sucursal', state: abiertas ? 'DISCREPANCIES' : sinResolver ? 'OPEN' : 'VERIFIED', unresolved: sinResolver, openDiscrepancies: abiertas,
    totals: { count: pagos.length, confirmedPyg: suma('confirmedPyg'), verifiedPyg: suma('verifiedPyg'), toVerifyPyg: suma('toVerifyPyg'), pendingPyg: suma('pendingPyg'), rejectedPyg: suma('rejectedPyg') },
    groups: lista, discrepancies: discrepancias,
  }
}

export function demoVerificarDia({ day, action, method, accountId, paymentId, quien = 'Administrador' }) {
  const vista = demoVistaDia(day)
  const resultado = { scope: action === 'verify-all' ? 'ALL' : action === 'verify-category' ? 'CATEGORY' : 'ONE', attempted: 0, verified: 0, alreadyVerified: 0, skipped: [] }
  for (const grupo of vista.groups) {
    if (action === 'verify-category' && (grupo.method !== method || (accountId && grupo.accountId !== accountId))) continue
    for (const linea of grupo.payments) {
      if (action === 'verify-one' && linea.id !== paymentId) continue
      if (linea.state === 'VERIFIED') { if (action === 'verify-one') resultado.alreadyVerified++; continue }
      if (linea.state === 'REJECTED') continue
      resultado.attempted++
      const pago = estado.pagos.find(item => item.id === linea.id)
      if (pago.propio) { resultado.skipped.push({ paymentId: pago.id, orderNumber: pago.orderNumber, code: 'OWN', reason: 'No podés verificar tu propio cobro.' }); continue }
      if (pago.status === 'PENDING' && enVerificacion(pago) && !pago.proofs.length) { resultado.skipped.push({ paymentId: pago.id, orderNumber: pago.orderNumber, code: 'PROOF', reason: 'Falta el comprobante del cobro.' }); continue }
      pago.status = 'CONFIRMED'
      pago.verified = true
      pago.resolution = { state: 'VERIFIED', note: null, at: new Date().toISOString(), byName: quien }
      resultado.verified++
    }
  }
  return { result: resultado, day: demoVistaDia(day) }
}

export function demoRegistrarDiscrepancia({ day, scope, paymentId, method, receivedPyg, reason, quien = 'Administrador' }) {
  const vista = demoVistaDia(day)
  let esperado = 0
  let metodo = method
  if (scope === 'LINE') {
    const linea = vista.groups.flatMap(grupo => grupo.payments).find(item => item.id === paymentId)
    if (!linea) throw new Error('El pago no es de este día y sucursal.')
    esperado = linea.amountPyg
    metodo = estado.pagos.find(item => item.id === paymentId)?.method
  } else {
    esperado = vista.groups.filter(grupo => grupo.method === method).reduce((total, grupo) => total + grupo.verifiedPyg + grupo.toVerifyPyg, 0)
  }
  if (Number(receivedPyg) === esperado) throw new Error('Lo recibido coincide con lo esperado: no hay diferencia que registrar.')
  estado.discrepancias.push({
    id: `dd-${Date.now()}`, scope, paymentId: paymentId || null, method: metodo, accountId: null, currency: 'PYG', expectedPyg: esperado, receivedPyg: Number(receivedPyg),
    differencePyg: Number(receivedPyg) - esperado, reason: String(reason).trim(), createdByName: quien, createdAt: new Date().toISOString(), resolved: false, resolvedAt: null, resolvedByName: null, resolvedNote: null,
  })
}

export function demoResolverDiscrepancia(id, nota, quien = 'Administrador') {
  const fila = estado.discrepancias.find(item => item.id === id)
  if (!fila || fila.resolved) return
  fila.resolved = true
  fila.resolvedAt = new Date().toISOString()
  fila.resolvedByName = quien
  fila.resolvedNote = nota || null
}
