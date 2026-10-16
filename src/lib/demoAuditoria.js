import { metodoDeMedio } from './demoConciliacion.js'
import { leerDemo, guardarDemo } from './demoStorage.js'
import { getDemoTenant } from './demoTenant.js'
import { esperadoCaja, esEfectivoDemo } from './demoCash.js'
import { diaDemo } from './demo/reloj.js'

// Auditoría de caja ficticia de la demo (#194): arma el mismo contrato que
// `/api/cash/audit` y `/api/cash/audit-operations` con las ventas demo y la
// caja local, y guarda las marcas de verificación en este navegador.

const KEY = 'mobos:demo-cash-audit:v1'

export function claveDeMarca(operationKind, operationId) {
  return `${operationKind}:${operationId}`
}

export function leerMarcasDemo() {
  try {
    const guardado = JSON.parse(leerDemo(KEY))
    return guardado && typeof guardado === 'object' && !Array.isArray(guardado) ? guardado : {}
  } catch {
    return {}
  }
}

export function guardarMarcaDemo(operationKind, operationId, marca) {
  const marcas = leerMarcasDemo()
  marcas[claveDeMarca(operationKind, operationId)] = marca
  try { guardarDemo(KEY, JSON.stringify(marcas)) } catch { /* almacenamiento no disponible */ }
  return marca
}

const enRango = (valor, desde, hasta) => {
  if (!valor) return false
  const texto = String(valor)
  const esCalendario = /^\d{4}-\d{2}-\d{2}$/.test(texto)
  const fecha = new Date(esCalendario ? `${texto}T12:00:00Z` : valor)
  if (Number.isNaN(fecha.getTime())) return false
  if (esCalendario && fecha.toISOString().slice(0, 10) !== texto) return false
  const clave = esCalendario ? texto : diaDemo(0, fecha)
  return Boolean(clave) && (!desde || clave >= desde) && (!hasta || clave <= hasta)
}

/** Entradas por medio de pago del día: `{ methods, totals }`. */
export function construirDemoAuditoriaMedios({ ventas = [], fecha = '' } = {}) {
  const porMetodo = new Map()
  for (const venta of ventas) {
    if (fecha && venta?.fecha !== fecha) continue
    for (const pago of Array.isArray(venta?.pagos) ? venta.pagos : []) {
      const method = metodoDeMedio(pago.medioPago)
      const fila = porMetodo.get(method) || { method, count: 0, amountPyg: 0, pendingAmountPyg: 0, refundedAmountPyg: 0 }
      fila.count += 1
      fila.amountPyg += Number(pago.monto) || 0
      porMetodo.set(method, fila)
    }
  }
  const methods = [...porMetodo.values()].sort((a, b) => b.amountPyg - a.amountPyg)
  const totals = methods.reduce((suma, fila) => ({ amountPyg: suma.amountPyg + fila.amountPyg, count: suma.count + fila.count }), { amountPyg: 0, count: 0 })
  return { methods, totals }
}

/**
 * Operaciones de efectivo del rango con su marca de auditoría, el mismo
 * contrato de `/api/cash/audit-operations`.
 */
export function construirDemoAuditoriaEfectivo({ ventas = [], cash = null, desde = '', hasta = '', marcas = {} } = {}) {
  const operaciones = []
  const efectivoExtranjero = {}
  for (const [indice, venta] of ventas.entries()) {
    for (const pago of Array.isArray(venta?.pagos) ? venta.pagos : []) {
      if (!esEfectivoDemo(pago)) continue
      if (!enRango(pago.fecha || venta.creadoEn || venta.fecha, desde, hasta)) continue
      const fechaPago = pago.fecha || venta.creadoEn || venta.fecha
      const moneda = pago.currency || 'PYG'
      const entregado = Number(String(pago.tenderedAmount ?? '').replace(',', '.')) || 0
      if (moneda !== 'PYG') {
        // Efectivo en otra moneda (#455): no entra en la lista en Gs; cuenta en su moneda con lo realmente entregado.
        const aplicado = Number(pago.originalAmount) || 0
        efectivoExtranjero[moneda] = (efectivoExtranjero[moneda] || 0) + (entregado > aplicado ? entregado : aplicado)
      }
      // Vuelto: egreso en Gs ligado al pedido, igual que el servidor.
      const vueltoGs = entregado > 0 ? Math.max(0, Math.round(entregado * (moneda === 'PYG' ? 1 : Number(pago.exchangeRatePyg) || 0)) - (Number(pago.monto) || 0)) : 0
      if (vueltoGs > 0) {
        const marcaVuelto = marcas[claveDeMarca('MOVEMENT', `vuelto-${pago.id}`)]
        operaciones.push({ id: `vuelto-${pago.id}`, kind: 'MOVEMENT', fecha: fechaPago, direction: 'OUT', montoPyg: vueltoGs, pedido: '', cliente: venta.cliente || '', vendedor: 'Hernán Acosta', nota: 'Vuelto', status: marcaVuelto?.status || 'PENDING', notaAuditoria: marcaVuelto?.note || '', auditadoPor: marcaVuelto?.auditadoPor || '', auditadoAt: marcaVuelto?.auditedAt || null })
      }
      if (moneda !== 'PYG') continue
      const marca = marcas[claveDeMarca('PAYMENT', pago.id)]
      operaciones.push({
        id: pago.id,
        kind: 'PAYMENT',
        fecha: fechaPago,
        direction: 'IN',
        montoPyg: entregado > (Number(pago.monto) || 0) ? entregado : Number(pago.monto) || 0,
        pedido: `${getDemoTenant().orderPrefix || 'AUR'}-${String(indice + 1).padStart(4, '0')}`,
        cliente: venta.cliente || '',
        vendedor: 'Hernán Acosta',
        nota: '',
        status: marca?.status || 'PENDING',
        notaAuditoria: marca?.note || '',
        auditadoPor: marca?.auditadoPor || '',
        auditadoAt: marca?.auditedAt || null,
      })
    }
  }
  // Aportes y retiros de la caja demo: cuentan igual que en el servidor (ingresos suman, egresos restan).
  for (const movimiento of Array.isArray(cash?.movements) ? cash.movements : []) {
    const fecha = movimiento.createdAt || cash?.openedAt
    if (!fecha || !enRango(fecha, desde, hasta)) continue
    const marca = marcas[claveDeMarca('MOVEMENT', movimiento.id)]
    operaciones.push({
      id: movimiento.id,
      kind: 'MOVEMENT',
      fecha,
      direction: movimiento.kind === 'INGRESO' ? 'IN' : 'OUT',
      montoPyg: Number(movimiento.amountPyg) || 0,
      pedido: '',
      cliente: '',
      vendedor: movimiento.user || 'Hernán Acosta',
      nota: movimiento.concept || '',
      status: marca?.status || 'PENDING',
      notaAuditoria: marca?.note || '',
      auditadoPor: marca?.auditadoPor || '',
      auditadoAt: marca?.auditedAt || null,
    })
  }
  operaciones.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())

  const aperturaPyg = Number(cash?.openingPyg) || 0
  const recibidoPyg = operaciones.filter((operacion) => operacion.direction === 'IN').reduce((suma, operacion) => suma + operacion.montoPyg, 0)
  const salidasPyg = operaciones.filter((operacion) => operacion.direction === 'OUT').reduce((suma, operacion) => suma + operacion.montoPyg, 0)
  // Esperado del rango: apertura + recibido − salidas (la misma cuenta del servidor y de Caja).
  const esperadoPyg = esperadoCaja(aperturaPyg, recibidoPyg - salidasPyg)
  const diferenciaPyg = cash?.status === 'CLOSED' ? (Number(cash.countedPyg) || 0) - esperadoPyg : 0
  return {
    resumen: {
      aperturaPyg,
      esperadoPyg,
      esperadoPorMoneda: { PYG: esperadoPyg, USD: 0, ...efectivoExtranjero },
      diferenciaPyg,
      recibidoPyg,
      salidasPyg,
      operaciones: operaciones.length,
      verificadas: operaciones.filter((operacion) => operacion.status === 'VERIFIED').length,
      pendientes: operaciones.filter((operacion) => operacion.status === 'PENDING').length,
      conDiferencia: operaciones.filter((operacion) => operacion.status === 'DIFFERENCE').length,
    },
    sesiones: cash?.id ? [cash] : [],
    operaciones,
  }
}
