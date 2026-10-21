// Verificación de stock en la demo: mismo contrato que /api/stock-verifications,
// con estado session-only sobre las unidades del inventario demo.
import { guardarEstadoDemo, leerEstadoDemo } from './demoInventory.js'
import { guardarDemo, leerDemo } from './demoStorage.js'
import { clasificarEscaneo, ESTADOS_ESPERADOS, resumirVerificacion } from './verificacionStock.js'

const KEY = 'mobos:demo-verificaciones:v1'
// Verificaciones de ejemplo (historial), relativas a hoy: dos terminadas y una cancelada.
const haceDias = (dias, hora = 17) => { const fecha = new Date(); fecha.setDate(fecha.getDate() - dias); fecha.setHours(hora, 10, 0, 0); return fecha.toISOString() }
const quien = (id, name) => ({ id, name })
const SEMILLA = () => [
  { id: 'demo-verif-seed-1', status: 'FINISHED', branchId: 'mobos-demo-central', locationId: 'demo-ubic-deposito-1', note: 'Conteo de cierre de semana', startedAt: haceDias(7, 16), startedBy: quien('demo-user-cajera', 'María Benítez'), finishedAt: haceDias(7, 17), finishedBy: quien('demo-user-cajera', 'María Benítez'), scans: [], missingSerials: [], summary: { expected: 12, verified: 12, missing: 0, unexpected: 0, percent: 100 } },
  { id: 'demo-verif-seed-2', status: 'FINISHED', branchId: 'mobos-demo-central', locationId: 'demo-ubic-piso', note: 'Piso de venta antes del fin de semana', startedAt: haceDias(2, 9), startedBy: quien('demo-user', 'Hernán Acosta'), finishedAt: haceDias(2, 10), finishedBy: quien('demo-user', 'Hernán Acosta'), scans: [], missingSerials: [], summary: { expected: 9, verified: 8, missing: 1, unexpected: 1, percent: 89 } },
  { id: 'demo-verif-seed-3', status: 'CANCELLED', branchId: 'mobos-demo-villa-morra', locationId: null, note: null, startedAt: haceDias(4, 11), startedBy: quien('demo-user-gerente', 'Ana Giménez'), finishedAt: haceDias(4, 11), finishedBy: quien('demo-user-gerente', 'Ana Giménez'), scans: [], missingSerials: [], summary: { expected: 0, verified: 0, missing: 0, unexpected: 0, percent: 0 } },
]
const leer = () => { try { const crudo = leerDemo(KEY); return crudo ? (JSON.parse(crudo) || []) : SEMILLA() } catch { return SEMILLA() } }
const guardar = (lista) => guardarDemo(KEY, JSON.stringify(lista))
const persona = (usuario) => ({ id: usuario?.id || 'demo-user', name: usuario?.name || usuario?.nombre || 'Dueño demo' })

function esperadas(estado, sesion) {
  return estado.units.filter((u) => !u.removedAt && ESTADOS_ESPERADOS.includes(u.status) && u.branchId === sesion.branchId && (!sesion.locationId || u.locationId === sesion.locationId))
}

function detalle(estado, sesion) {
  const branch = estado.branches.find((b) => b.id === sesion.branchId)
  const location = sesion.locationId ? estado.locations.find((l) => l.id === sesion.locationId) : null
  const nombrada = (u) => ({ serial: u.serial, productName: u.product?.name || null, locationName: estado.locations.find((l) => l.id === u.locationId)?.name || null })
  let resumen
  let pendientes
  if (sesion.status === 'OPEN') {
    const unidades = esperadas(estado, sesion)
    resumen = resumirVerificacion(unidades.map((u) => u.serial), sesion.scans)
    pendientes = resumen.pending.map((serie) => nombrada(unidades.find((u) => u.serial === serie)))
  } else {
    resumen = sesion.summary
    pendientes = (sesion.missingSerials || []).map((serie) => nombrada(estado.units.find((u) => u.serial === serie) || { serial: serie }))
  }
  return {
    id: sesion.id, status: sesion.status, note: sesion.note || null,
    branch: branch ? { id: branch.id, name: branch.name } : null,
    location: location ? { id: location.id, name: location.name } : null,
    startedAt: sesion.startedAt, startedBy: sesion.startedBy, finishedAt: sesion.finishedAt || null, finishedBy: sesion.finishedBy || null,
    summary: { expected: resumen.expected, verified: resumen.verified, missing: resumen.missing, unexpected: resumen.unexpected, percent: resumen.percent },
    pending: pendientes,
    verified: sesion.scans.filter((s) => s.outcome === 'VERIFIED'),
    unexpected: sesion.scans.filter((s) => s.outcome === 'UNEXPECTED'),
  }
}

const buscar = (lista, id) => {
  const sesion = lista.find((item) => item.id === id)
  if (!sesion) throw new Error('Verificación no encontrada.')
  return sesion
}

export function listVerificacionesDemo() {
  const estado = leerEstadoDemo()
  return leer().slice().reverse().map((sesion) => {
    const d = detalle(estado, sesion)
    return { id: d.id, status: d.status, note: d.note, startedAt: d.startedAt, finishedAt: d.finishedAt, branch: d.branch, location: d.location, startedBy: d.startedBy, finishedBy: d.finishedBy, summary: { expected: d.summary.expected, verified: d.summary.verified, missing: d.summary.missing, unexpected: d.summary.unexpected } }
  })
}

export function crearVerificacionDemo(data = {}) {
  const estado = leerEstadoDemo()
  const lista = leer()
  const branchId = data.branchId || estado.branches[0]?.id
  const locationId = data.locationId || null
  const abierta = lista.find((s) => s.status === 'OPEN' && s.branchId === branchId && (s.locationId || null) === locationId)
  if (abierta) return { id: abierta.id, reused: true }
  const sesion = { id: `demo-verif-${Date.now().toString(36)}`, status: 'OPEN', branchId, locationId, note: data.note || null, startedAt: new Date().toISOString(), startedBy: persona(data.demoUser), scans: [] }
  guardar([...lista, sesion])
  return { id: sesion.id, reused: false }
}

export const detalleVerificacionDemo = (id) => detalle(leerEstadoDemo(), buscar(leer(), id))

export function escanearVerificacionDemo(id, serial, usuario) {
  const estado = leerEstadoDemo()
  const lista = leer()
  const sesion = buscar(lista, id)
  if (sesion.status !== 'OPEN') throw new Error('La verificación ya terminó.')
  const clave = String(serial || '').trim().toUpperCase()
  if (!clave) throw new Error('Indicá el IMEI/serial.')
  const previa = sesion.scans.find((s) => s.serial === clave)
  if (previa) return { duplicate: true, outcome: previa.outcome, reason: previa.reason, serial: clave, productName: previa.productName }
  const unidad = estado.units.find((u) => u.serial === clave)
  const veredicto = clasificarEscaneo(unidad, sesion)
  const quien = persona(usuario)
  const productName = unidad?.product?.name || null
  sesion.scans.unshift({ id: `${sesion.id}-${clave}`, serial: clave, outcome: veredicto.outcome, reason: veredicto.reason || null, productName, scannedBy: quien, createdAt: new Date().toISOString() })
  if (veredicto.outcome === 'VERIFIED') {
    unidad.verificacionPrevia = { by: unidad.lastVerifiedBy || null, at: unidad.lastVerifiedAt || null, enTransito: false }
    unidad.lastVerifiedBy = { ...quien, hasAvatar: true }
    unidad.lastVerifiedAt = new Date().toISOString()
    unidad.verifiedAt = unidad.lastVerifiedAt
    guardarEstadoDemo(estado)
  }
  guardar(lista)
  return { duplicate: false, outcome: veredicto.outcome, reason: veredicto.reason || null, serial: clave, productName }
}

export function terminarVerificacionDemo(id) {
  const estado = leerEstadoDemo()
  const lista = leer()
  const sesion = buscar(lista, id)
  const resumen = resumirVerificacion(esperadas(estado, sesion).map((u) => u.serial), sesion.scans)
  Object.assign(sesion, { status: 'FINISHED', finishedAt: new Date().toISOString(), finishedBy: sesion.startedBy, summary: { expected: resumen.expected, verified: resumen.verified, missing: resumen.missing, unexpected: resumen.unexpected, percent: resumen.percent }, missingSerials: resumen.pending })
  guardar(lista)
  return { id, status: 'FINISHED', summary: sesion.summary }
}

export function cancelarVerificacionDemo(id) {
  const lista = leer()
  const sesion = buscar(lista, id)
  Object.assign(sesion, { status: 'CANCELLED', finishedAt: new Date().toISOString(), finishedBy: sesion.startedBy, summary: { expected: 0, verified: 0, missing: 0, unexpected: 0, percent: 0 } })
  guardar(lista)
  return { id, status: 'CANCELLED' }
}
