// Historial por etapa de una orden de taller de la demo: se deriva del estado y
// de las fechas de la orden (recepción, entrega), así la ficha del cliente, el
// taller y el portal cuentan la misma historia. Puro y sin storage.
import { etiquetaServicio } from '../estadosServicio.js'
import { formatGs } from '../../utils/moneda.js'

const MIN = 60000
const HORA = 3600000
const TECNICO = { id: 'demo-user-tecnico', name: 'Jorge Villalba' }
const RECEPCION = { id: 'demo-user-cajera', name: 'María Benítez' }
const aMs = (valor) => { const t = new Date(valor).getTime(); return Number.isFinite(t) ? t : null }
const hash = (texto) => String(texto || '').split('').reduce((suma, c) => (suma * 31 + c.charCodeAt(0)) >>> 0, 7)

// Orden del pipeline; «Esperando repuesto» solo aparece en algunas órdenes.
const ETAPAS = ['RECIBIDO', 'DIAGNOSTICO', 'CON_TECNICO', 'ESPERANDO_REPUESTO', 'REPARADO', 'LISTO', 'ENTREGADO']

/** Etapas por las que pasó la orden hasta su estado actual. */
export function etapasDeOrden(row = {}) {
  if (row.status === 'CANCELADO') return ['RECIBIDO', 'DIAGNOSTICO', 'CANCELADO']
  const indice = Math.max(0, ETAPAS.indexOf(row.status))
  const conEspera = row.status === 'ESPERANDO_REPUESTO' || hash(row.id) % 3 === 0
  return ETAPAS.slice(0, indice + 1).filter((etapa) => etapa !== 'ESPERANDO_REPUESTO' || conEspera)
}

export function eventosTallerDemo(row = {}, ahora = new Date()) {
  const tope = ahora.getTime()
  const recibido = Math.min(tope, aMs(row.receivedAt || row.createdAt) ?? tope)
  const entregado = aMs(row.deliveredAt)
  const id = row.id || 'demo-os'
  const tecnico = row.technicianName ? { id: TECNICO.id, name: row.technicianName } : TECNICO
  const numero = row.serviceNumber || 'Orden'
  const equipo = row.device || 'Equipo'
  const eventos = []
  const poner = (clave, type, action, t, user, detail = '') => eventos.push({ id: `${id}-${clave}`, type, action, label: action, createdAt: new Date(Math.min(tope, t)).toISOString(), user, detail })

  poner('ingreso', 'service', 'Equipo recibido', recibido, RECEPCION, [equipo, row.serial ? `serie ${String(row.serial).slice(-6)}` : '', row.reportedIssue].filter(Boolean).join(' · '))
  poner('checklist', 'audit', 'Checklist de recepción firmado', recibido + 8 * MIN, RECEPCION, Object.keys(row.checklist || {}).length ? `${Object.keys(row.checklist).length} puntos revisados` : 'Estado físico y accesorios registrados con fotos')
  poner('aviso-ingreso', 'notice', 'Aviso de recepción por WhatsApp', recibido + 12 * MIN, RECEPCION, `${numero} · «Recibimos tu equipo, te avisamos el diagnóstico»`)

  const etapas = etapasDeOrden(row).slice(1)
  const fin = entregado ?? tope
  const tramo = Math.max(30 * MIN, (fin - recibido) / (etapas.length + 1))
  etapas.forEach((etapa, i) => {
    const t = etapa === 'ENTREGADO' && entregado ? entregado : recibido + Math.min(tramo * (i + 1), Math.max(20 * MIN, fin - recibido - HORA / 2))
    const detalles = {
      DIAGNOSTICO: row.diagnosis || 'Revisión inicial del equipo',
      CON_TECNICO: `Asignada a ${tecnico.name}`,
      ESPERANDO_REPUESTO: 'Repuesto pedido al proveedor',
      REPARADO: row.serviceName ? `${row.serviceName} terminado` : 'Reparación terminada',
      LISTO: 'Pruebas finales aprobadas',
      ENTREGADO: Number(row.pricePyg) > 0 ? `Cobrado ${formatGs(row.pricePyg)} · garantía de reparación 90 días` : 'Entregado al cliente',
      CANCELADO: 'El cliente decidió no reparar',
    }
    poner(`etapa-${etapa}`, 'service', `Etapa: ${etiquetaServicio(etapa)}`, t, etapa === 'ENTREGADO' || etapa === 'LISTO' ? RECEPCION : tecnico, detalles[etapa] || '')
    if (etapa === 'DIAGNOSTICO' && Number(row.pricePyg) > 0) poner('presupuesto', 'quote', 'Presupuesto aprobado por el cliente', t + 25 * MIN, RECEPCION, `${formatGs(row.pricePyg)} · aprobado por WhatsApp`)
    if (etapa === 'LISTO') poner('aviso-listo', 'notice', 'Aviso de equipo listo por WhatsApp', t + 5 * MIN, RECEPCION, 'Retiro de 9 a 19 h')
  })
  return eventos.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}
