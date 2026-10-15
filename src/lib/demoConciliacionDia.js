import { evaluarConciliacionDia, diaParaguay, claveGrupoDia, MEDIOS_DIA } from './conciliacionDia.js'
import { metodoDePago } from '../utils/mediosPago.js'
import { leerDemo, guardarDemo } from './demoStorage.js'
import { SUCURSALES_DEMO } from './demo/empresa.js'
const KEY = 'mobos:demo-conciliacion-dia:v1'
const history = () => { try { return JSON.parse(leerDemo(KEY) || '{}') } catch { return {} } }
const keyOf = (day, branchId) => JSON.stringify([day, branchId])
function paymentsOf({ ventas, cuentas, day, branchId }) {
  const result = []
  for (const venta of ventas) {
    if ((venta.branchId || venta.sucursalId || SUCURSALES_DEMO[0].id) !== branchId) continue
    const pagos = venta.pagos || []
    for (const pago of pagos) {
      if (pago.reversalOfId || pagos.some(row => row.reversalOfId === pago.id) || diaParaguay(pago.fecha || venta.creadoEn || venta.fecha) !== day) continue
      const account = cuentas.find(row => row.id === pago.accountId || row.name === pago.cuenta)
      result.push({ id: pago.id, method: metodoDePago(pago), status: pago.status || 'CONFIRMED', accountId: account?.id || null, currency: pago.currency || account?.currency || 'PYG', label: account?.name || pago.cuenta || 'Efectivo', amountPyg: Number(pago.amountPyg ?? pago.monto ?? 0) })
    }
  }
  return result
}
export function construirDemoConciliacionDia(input) {
  const revisions = history()[keyOf(input.day, input.branchId)] || []
  const latest = revisions[0]
  const payments = paymentsOf(input)
  return { day: input.day, branchId: input.branchId, ...evaluarConciliacionDia(payments, latest?.declarations || null), declarations: latest?.declarations || null, version: latest?.version || 0, note: latest?.note || '', declaredAt: latest?.createdAt || null, declaredBy: latest?.createdBy || '', changedSinceDeclaration: Boolean(latest && JSON.stringify(latest.paymentSnapshot) !== JSON.stringify(payments)), history: revisions }
}
export function declararDemoConciliacionDia(input) {
  const keys = new Set()
  for (const row of input.declarations) {
    const key = claveGrupoDia(row)
    if (keys.has(key) || !MEDIOS_DIA.includes(row.method) || !Number.isSafeInteger(row.receivedPyg) || row.receivedPyg < 0 || row.receivedPyg > 10000000000) throw new Error('Declaración inválida.')
    keys.add(key)
  }
  const all = history(), key = keyOf(input.day, input.branchId), revisions = all[key] || []
  const prior = revisions.find(row => row.requestId === input.requestId)
  const requestHash = JSON.stringify([input.declarations, input.note])
  if (prior) {
    if (prior.requestHash !== requestHash) throw new Error('La solicitud ya se usó con otros datos.')
    return construirDemoConciliacionDia(input)
  }
  if ((revisions[0]?.version || 0) !== input.expectedVersion) throw new Error('Otra persona actualizó este día. Actualizá y revisá la declaración.')
  const payments = paymentsOf(input), snapshot = evaluarConciliacionDia(payments, input.declarations)
  if (snapshot.missing) throw new Error('Declará cada importe recibido, incluido cero.')
  if (snapshot.differences && !input.note.trim()) throw new Error('Indicá el motivo de las diferencias.')
  const revision = { version: revisions.length + 1, declarations: input.declarations, note: input.note, createdAt: new Date().toISOString(), createdBy: 'Responsable demo', snapshot, paymentSnapshot: payments, requestId: input.requestId, requestHash }
  guardarDemo(KEY, JSON.stringify({ ...all, [key]: [revision, ...revisions] }))
  return construirDemoConciliacionDia(input)
}
