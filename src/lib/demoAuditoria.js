import { metodoDeMedio } from './demoConciliacion.js'
import { leerDemo, guardarDemo } from './demoStorage.js'
import { getDemoTenant } from './demoTenant.js'
import { esperadoCaja } from './demoCash.js'

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
  const clave = String(valor || '').slice(0, 10)
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
  for (const [indice, venta] of ventas.entries()) {
    for (const pago of Array.isArray(venta?.pagos) ? venta.pagos : []) {
      if (String(pago.medioPago || '').toUpperCase() !== 'DINERO') continue
      if (!enRango(pago.fecha || venta.creadoEn || venta.fecha, desde, hasta)) continue
      const marca = marcas[claveDeMarca('PAYMENT', pago.id)]
      operaciones.push({
        id: pago.id,
        kind: 'PAYMENT',
        fecha: pago.fecha || venta.creadoEn || venta.fecha,
        direction: 'IN',
        montoPyg: Number(pago.monto) || 0,
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
