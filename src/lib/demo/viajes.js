// Viajes, tarifas y cierres semanales del reparto en la demo: reemplazo en
// memoria de `/api/delivery/*` con la misma forma de respuesta. Todo es relativo
// a «hoy» (Paraguay) y las ventas con delivery salen de los pedidos ficticios.
import { listVentas } from '@/lib/storage'
import { EQUIPO_DEMO } from '@/lib/demo/iphones.js'
import { diaDemo, instanteDemo } from '@/lib/demo/reloj.js'

const SUCURSAL = { id: 'mobos-demo-central', name: 'Casa Central' }
const REPARTIDOR = (() => { const persona = EQUIPO_DEMO.find((item) => item.id === 'demo-user-repartidor') || { id: 'demo-user-repartidor', nombre: 'Marcos Aquino' }; return { id: persona.id, name: persona.nombre, branchId: SUCURSAL.id } })()
const DUENO = { id: 'demo-user', name: 'Hernán Acosta' }

const sumarDias = (clave, dias) => new Date(Date.parse(`${clave}T00:00:00Z`) + dias * 86400000).toISOString().slice(0, 10)
const lunesDe = (clave) => sumarDias(clave, -((new Date(`${clave}T00:00:00Z`).getUTCDay() + 6) % 7))

let estado = null
let secuencia = 0

function pedidosDelivery() {
  return listVentas()
    .filter((venta) => String(venta.deliveryType || '').toUpperCase() === 'DELIVERY' && !venta.anulada)
    .slice(0, 40)
    .map((venta) => ({ id: venta.id, orderNumber: venta.orderNumber || venta.numero, branchId: SUCURSAL.id, status: 'COMPLETED', customer: { name: venta.cliente }, totalPyg: Number(venta.totalPyg ?? venta.precio ?? 0) }))
}

function honorario(tarifas, distanciaKm, fecha) {
  const tarifa = tarifas.find((item) => item.isActive && item.validFrom <= fecha && item.validUntil >= fecha)
  const tramo = tarifa?.tiers.find((fila) => distanciaKm > 0 && distanciaKm <= fila.upToKm)
  return tramo ? tramo.feePyg : 0
}

function nuevoViaje({ ruta, hace, km, viajes = 1, orden = null, estadoViaje = 'COMPLETED', cierre = null }) {
  const fecha = diaDemo(hace)
  secuencia += 1
  return {
    id: `demo-viaje-${secuencia}`, route: ruta, status: estadoViaje, orderId: orden?.id || null, order: orden ? { id: orden.id, orderNumber: orden.orderNumber } : null,
    driver: { id: REPARTIDOR.id, name: REPARTIDOR.name }, branch: SUCURSAL, branchId: SUCURSAL.id, driverId: REPARTIDOR.id,
    performedOn: fecha, distanceMeters: Math.round(km * 1000), tripsCount: viajes,
    totalFeePyg: honorario(estado.tariffs, km, fecha) * viajes, weeklyCloseId: cierre, resolutionNote: null, resolvedBy: null,
    createdAt: instanteDemo(hace, 18, 0),
  }
}

function iniciar() {
  if (estado) return
  const hoy = diaDemo(0)
  estado = { trips: [], tariffs: [], closes: [], adjustments: [], payments: [] }
  estado.tariffs = [
    { id: 'demo-tarifa-1', name: 'Tarifa vigente', isActive: true, validFrom: sumarDias(hoy, -45), validUntil: sumarDias(hoy, 120), tiers: [{ upToKm: 5, feePyg: 12000 }, { upToKm: 12, feePyg: 18000 }, { upToKm: 28, feePyg: 30000 }] },
    { id: 'demo-tarifa-0', name: 'Tarifa anterior', isActive: false, validFrom: sumarDias(hoy, -200), validUntil: sumarDias(hoy, -46), tiers: [{ upToKm: 6, feePyg: 10000 }, { upToKm: 28, feePyg: 25000 }] },
  ]
  const ordenes = pedidosDelivery()
  const lunesPasado = sumarDias(lunesDe(hoy), -7)
  const haceDeLunes = (offset) => Math.round((Date.parse(`${hoy}T00:00:00Z`) - Date.parse(`${sumarDias(lunesPasado, offset)}T00:00:00Z`)) / 86400000)
  estado.closes.push({ id: 'demo-cierre-1', weekStart: lunesPasado })
  const rutas = [['Centro → San Lorenzo', 11], ['Villa Morra → Luque', 14], ['Centro → Lambaré', 7], ['Sajonia → Fernando de la Mora', 9], ['Centro → Ñemby', 13], ['Mburucuyá → Capiatá', 18]]
  rutas.forEach(([ruta, km], indice) => {
    const orden = ordenes[indice] || null
    estado.trips.push(nuevoViaje({ ruta, hace: haceDeLunes(indice), km, viajes: indice % 3 === 0 ? 2 : 1, orden, cierre: 'demo-cierre-1' }))
    if (orden) estado.payments.push({ id: `demo-cobro-${indice + 1}`, weekStart: lunesPasado, driverId: REPARTIDOR.id, amountPyg: Math.min(orden.totalPyg, 3500000), status: 'CONFIRMED', deliverySettlementId: `REN-${100 + indice}` })
  })
  estado.adjustments.push({ id: 'demo-ajuste-1', closeId: 'demo-cierre-1', deltaPyg: 50000, reason: 'Bono por reparto con lluvia', createdBy: DUENO, createdAt: instanteDemo(Math.max(0, haceDeLunes(7) - 1), 9, 30) })
  // Semana en curso: tres viajes, uno sin venta para resolver.
  estado.trips.unshift(nuevoViaje({ ruta: 'Centro → Asunción (Recoleta)', hace: 0, km: 4, orden: ordenes[6] || null }))
  estado.trips.unshift(nuevoViaje({ ruta: 'Villa Morra → Mariano Roque Alonso', hace: 1, km: 15, orden: ordenes[7] || null }))
  estado.trips.unshift(nuevoViaje({ ruta: 'Centro → Limpio (sin venta)', hace: 2, km: 21 }))
  if (ordenes[6]) estado.payments.push({ id: 'demo-cobro-9', weekStart: lunesDe(hoy), driverId: REPARTIDOR.id, amountPyg: Math.min(ordenes[6].totalPyg, 2000000), status: 'PENDING', deliverySettlementId: null })
}

function semana({ weekStart, driverId }) {
  const hasta = sumarDias(weekStart, 6)
  const viajes = estado.trips.filter((fila) => fila.driverId === driverId && fila.performedOn >= weekStart && fila.performedOn <= hasta && fila.status !== 'CANCELLED')
  const cobros = estado.payments.filter((fila) => fila.driverId === driverId && fila.weekStart === weekStart)
  const feesPyg = viajes.reduce((suma, fila) => suma + fila.totalFeePyg, 0)
  const collectedPyg = cobros.reduce((suma, fila) => suma + fila.amountPyg, 0)
  const renderedPyg = cobros.filter((fila) => fila.status === 'CONFIRMED').reduce((suma, fila) => suma + fila.amountPyg, 0)
  const pendingPyg = collectedPyg - renderedPyg
  const firmado = feesPyg - pendingPyg
  return { viajes, cobros, amounts: { feesPyg, collectedPyg, renderedPyg, pendingPyg, payablePyg: Math.max(0, firmado), receivablePyg: Math.max(0, -firmado) }, firmado, sinVenta: viajes.filter((fila) => !fila.orderId && fila.status === 'COMPLETED').length }
}

function detalleSemana(consulta) {
  const datos = semana(consulta)
  const cierre = estado.closes.find((fila) => fila.weekStart === consulta.weekStart)
  const ajustes = cierre ? estado.adjustments.filter((fila) => fila.closeId === cierre.id) : []
  const ajusteTotal = ajustes.reduce((suma, fila) => suma + fila.deltaPyg, 0)
  return {
    amounts: datos.amounts, unresolvedCount: datos.sinVenta, trips: datos.viajes, payments: datos.cobros,
    close: cierre ? {
      id: cierre.id, balanceAtClosePyg: datos.firmado, createdBy: DUENO, createdAt: instanteDemo(Math.max(0, Math.round((Date.parse(`${diaDemo(0)}T00:00:00Z`) - Date.parse(`${consulta.weekStart}T00:00:00Z`)) / 86400000) - 7), 9, 0),
      current: { ...datos.amounts, payablePyg: Math.max(0, datos.firmado + ajusteTotal), receivablePyg: Math.max(0, -(datos.firmado + ajusteTotal)) },
      adjustments: ajustes, collections: datos.cobros, missingPaymentIds: [],
    } : null,
  }
}

export const apiViajesDemo = {
  async get(ruta) {
    iniciar()
    const [camino, consulta = ''] = ruta.split('?')
    const parametros = new URLSearchParams(consulta)
    if (camino === '/api/delivery/trips') {
      const sinVenta = parametros.get('unresolved') === 'true'
      return { owner: true, rows: estado.trips.filter((fila) => !sinVenta || (!fila.orderId && fila.status === 'COMPLETED')).map((fila) => ({ ...fila })) }
    }
    if (camino === '/api/delivery/tariffs') return { rows: estado.tariffs.map((fila) => ({ ...fila })) }
    if (camino === '/api/delivery/team') return [{ ...REPARTIDOR }]
    if (camino === '/api/delivery/orders') return pedidosDelivery()
    if (camino === '/api/delivery/weekly') return detalleSemana({ weekStart: parametros.get('weekStart'), driverId: parametros.get('driverId') })
    return null
  },
  async post(ruta, cuerpo = {}) {
    iniciar()
    if (ruta === '/api/delivery/trips') {
      const orden = pedidosDelivery().find((fila) => fila.id === cuerpo.orderId) || null
      const fecha = cuerpo.performedOn
      const km = Number(cuerpo.distanceKm)
      const fee = honorario(estado.tariffs, km, fecha)
      if (!fee) throw new Error('No hay tarifa para esta fecha y distancia.')
      secuencia += 1
      const viaje = {
        id: `demo-viaje-${secuencia}`, route: cuerpo.route, status: 'COMPLETED', orderId: orden?.id || null, order: orden ? { id: orden.id, orderNumber: orden.orderNumber } : null,
        driver: { id: cuerpo.driverId, name: REPARTIDOR.name }, branch: SUCURSAL, branchId: cuerpo.branchId, driverId: cuerpo.driverId,
        performedOn: fecha, distanceMeters: Math.round(km * 1000), tripsCount: Number(cuerpo.tripsCount) || 1,
        totalFeePyg: fee * (Number(cuerpo.tripsCount) || 1), weeklyCloseId: null, resolutionNote: null, resolvedBy: null, createdAt: new Date().toISOString(),
      }
      estado.trips.unshift(viaje)
      return viaje
    }
    if (ruta === '/api/delivery/tariffs') {
      const tarifa = { id: `demo-tarifa-${Date.now().toString(36)}`, name: cuerpo.name, isActive: true, validFrom: cuerpo.validFrom, validUntil: cuerpo.validUntil || sumarDias(cuerpo.validFrom, 365), tiers: (cuerpo.tiers || []).map((fila) => ({ upToKm: Number(fila.upToKm), feePyg: Number(fila.feePyg) })) }
      estado.tariffs.unshift(tarifa)
      return tarifa
    }
    if (ruta === '/api/delivery/weekly') {
      if (!estado.closes.some((fila) => fila.weekStart === cuerpo.weekStart)) estado.closes.push({ id: `demo-cierre-${Date.now().toString(36)}`, weekStart: cuerpo.weekStart })
      return detalleSemana({ weekStart: cuerpo.weekStart, driverId: cuerpo.driverId })
    }
    const ajuste = ruta.match(/^\/api\/delivery\/weekly\/([^/]+)\/adjustments$/)
    if (ajuste) {
      const fila = { id: `demo-ajuste-${Date.now().toString(36)}`, closeId: ajuste[1], deltaPyg: Number(cuerpo.deltaPyg), reason: cuerpo.reason, createdBy: DUENO, createdAt: new Date().toISOString() }
      estado.adjustments.push(fila)
      return fila
    }
    return null
  },
  async patch(ruta, cuerpo = {}) {
    iniciar()
    const viaje = ruta.match(/^\/api\/delivery\/trips\/(.+)$/)
    if (viaje) {
      const fila = estado.trips.find((item) => item.id === viaje[1])
      if (!fila) throw new Error('Viaje no encontrado.')
      if (cuerpo.action === 'link') {
        const orden = pedidosDelivery().find((item) => item.id === cuerpo.orderId)
        Object.assign(fila, { orderId: orden?.id || null, order: orden ? { id: orden.id, orderNumber: orden.orderNumber } : null })
      } else Object.assign(fila, { status: 'CANCELLED' })
      Object.assign(fila, { resolutionNote: cuerpo.reason, resolvedBy: DUENO })
      return { ...fila }
    }
    const tarifa = ruta.match(/^\/api\/delivery\/tariffs\/(.+)$/)
    if (tarifa) {
      const fila = estado.tariffs.find((item) => item.id === tarifa[1])
      if (fila) fila.isActive = false
      return fila ? { ...fila } : null
    }
    return null
  },
}
