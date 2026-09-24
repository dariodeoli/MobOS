import { fechaClave, gs } from '../utils/calculos.js'
import { locksDeVerificacion } from './phonecheck.js'
import { ETIQUETA_RACK, ORDEN_RACK, agruparRack, bateriaDe, estadoEnRack, gradoDe } from './tallerRack.js'

// Tablero F3 (#241): arma los datos reales de `/ops` (detrás de VITE_OPS_V2)
// desde el inventario del rack del taller (#240) y los pedidos recientes. Las
// cuentas viven acá (probadas en `opsTablero.test.js`); la UI es compartida con
// la vista previa en `components/ops/TableroOps.jsx`.

/** Tonos visuales del tablero (los consumen las clases de `TableroOps`). */
const TONO_ESTADO = { 'por-verificar': 'slate', verificado: 'info', listo: 'ok' }

export function nombreDeUnidad(unit) {
  return unit?.product?.name || unit?.product?.nombre || 'Equipo'
}

export function ultimos4(serial) {
  return String(serial || '').slice(-4)
}

function esMismoDia(fecha, clave) {
  if (!fecha) return false
  const valor = new Date(fecha)
  if (Number.isNaN(valor.getTime())) return false
  return fechaClave(valor) === clave
}

function pagosConfirmados(pedido) {
  return (pedido?.payments || []).filter((pago) => pago?.status === 'CONFIRMED')
}

/** Un pedido está pagado cuando sus pagos acreditados cubren el total. */
function pagadoDe(pedido) {
  const total = Number(pedido?.totalPyg || 0)
  const cobrado = pagosConfirmados(pedido).reduce((suma, pago) => suma + Number(pago.amountPyg || 0), 0)
  return total > 0 && cobrado >= total
}

/**
 * Resumen del día para el tablero: cobrado (pagos acreditados de hoy), pedidos
 * de hoy (pagados/pendientes) y el estado del taller (rack #240).
 */
export function resumenOps({ unidades = [], pedidos = [], ahora = new Date() } = {}) {
  const clave = fechaClave(ahora)
  const grupos = agruparRack(unidades)
  const pagosHoy = pedidos.flatMap(pagosConfirmados).filter((pago) => esMismoDia(pago.paidAt, clave))
  const cobradoPyg = pagosHoy.reduce((suma, pago) => suma + Number(pago.amountPyg || 0), 0)
  const pedidosHoy = pedidos.filter((pedido) => esMismoDia(pedido?.createdAt, clave) && pedido?.status !== 'CANCELLED')
  const pagados = pedidosHoy.filter(pagadoDe).length
  return {
    clave,
    cobradoPyg,
    pagosHoy: pagosHoy.length,
    pedidosHoy: pedidosHoy.length,
    pedidosPagados: pagados,
    pedidosPendientes: pedidosHoy.length - pagados,
    porVerificar: grupos['por-verificar'].length,
    verificados: grupos.verificado.length,
    listos: grupos.listo.length,
    enTaller: grupos['por-verificar'].length + grupos.verificado.length,
  }
}

/** Los cuatro KPIs del tablero, listos para mostrar. */
export function kpisOps(resumen) {
  return [
    {
      clave: 'cobrado',
      label: 'Cobrado hoy',
      valor: gs(resumen.cobradoPyg),
      detalle: `${resumen.pagosHoy} pago(s) acreditado(s)`,
      tono: 'ok',
    },
    {
      clave: 'pedidos',
      label: 'Pedidos hoy',
      valor: String(resumen.pedidosHoy),
      detalle: `${resumen.pedidosPagados} pagados · ${resumen.pedidosPendientes} pendientes`,
      tono: 'info',
    },
    {
      clave: 'taller',
      label: 'En taller',
      valor: String(resumen.enTaller),
      detalle: `${resumen.porVerificar} por verificar`,
      tono: 'warn',
    },
    {
      clave: 'listos',
      label: 'Listos para vender',
      valor: String(resumen.listos),
      detalle: `${resumen.verificados} verificados en cola`,
      tono: 'fono',
    },
  ]
}

/** «x de y» del checklist de la inspección (#240): pasan, fallan y porcentaje. */
export function checklistDe(unit) {
  const items = Object.values(unit?.inspection?.items || {})
  if (!items.length) return null
  const pasan = items.filter((fila) => fila?.estado === 'pasa').length
  const fallan = items.filter((fila) => fila?.estado === 'falla').length
  return {
    pasan,
    fallan,
    revisados: pasan + fallan,
    total: items.length,
    porcentaje: Math.round((pasan / items.length) * 100),
  }
}

/**
 * ¿El serial se puede consultar en `/api/imei`? Solo los IMEI de 15 dígitos: el
 * backend ignora el filtro cuando el IMEI no valida y devolvería las últimas
 * consultas del negocio (de otros equipos).
 */
export function imeiConsultable(serial) {
  return /^\d{15}$/.test(String(serial || ''))
}

/**
 * Chips de locks del equipo (iCloud/Find My, MDM, ESN/blacklist y carrier) a
 * partir de una consulta IMEI guardada (`/api/imei`). La máscara del registro
 * conserva los últimos 4 dígitos: si no coinciden con el serial, la consulta es
 * de otro equipo y no se muestra. Sin datos devuelve `null`: la UI muestra el
 * estado honesto («sin verificar»), nunca «libre» de arriba.
 */
export function locksDeConsulta(consulta, serial = '') {
  if (!consulta) return null
  const ultimos4 = String(serial || '').replace(/\D/g, '').slice(-4)
  if (ultimos4 && !String(consulta.imei || '').endsWith(ultimos4)) return null
  const chips = locksDeVerificacion({ normalized: consulta.normalized })
  if (!chips.length) return null
  return chips.map((chip) => ({ clave: chip.clave, estado: chip.ok ? 'libre' : 'activo', detalle: `${chip.label}: ${chip.valor}` }))
}

/**
 * Chips de locks del equipo (iCloud/Find My, MDM, ESN/blacklist y carrier) desde
 * la consulta IMEI guardada en la inspección. Sin datos devuelve `null`: la UI
 * muestra el estado honesto («sin verificar»), nunca «libre» de arriba.
 */
export function locksDe(unit) {
  const crudo = unit?.inspection?.verificacion || unit?.inspection?.verificacionImei || unit?.imeiVerification || null
  if (!crudo) return null
  const verificacion = crudo?.campos || crudo?.normalized ? crudo : (crudo?.data || {})
  const chips = locksDeVerificacion(verificacion)
  if (!chips.length) return null
  return chips.map((chip) => ({ clave: chip.clave, estado: chip.ok ? 'libre' : 'activo', detalle: `${chip.label}: ${chip.valor}` }))
}

/** Pasos del lote del taller con la carga de cada etapa (stepper del tablero). */
export function pasosDelLote(resumen) {
  return ORDEN_RACK.map((clave) => ({ clave, label: ETIQUETA_RACK[clave], total: resumen?.[clave === 'por-verificar' ? 'porVerificar' : clave === 'verificado' ? 'verificados' : 'listos'] || 0 }))
}

/** Equipos en proceso (todavía no listos para vender), en orden del rack. */
export function equiposEnProceso(unidades = [], limite = 6) {
  const grupos = agruparRack(unidades)
  // Se alternan los equipos que esperan verificación con los ya verificados: el
  // tablero muestra el taller en curso, no solo la fila de entrada.
  const colas = [grupos['por-verificar'], grupos.verificado]
  const mezcla = []
  for (let i = 0; mezcla.length < limite && (colas[0].length || colas[1].length); i += 1) {
    const cola = colas[i % 2]
    if (cola.length) mezcla.push(cola.shift())
  }
  return mezcla.map((unit) => {
    const estado = estadoEnRack(unit)
    return {
      id: unit.id,
      modelo: nombreDeUnidad(unit),
      serial: unit.serial,
      estado,
      tono: TONO_ESTADO[estado],
      grado: gradoDe(unit),
      bateria: bateriaDe(unit),
      checklist: checklistDe(unit),
      locks: locksDe(unit),
      ubicacion: unit.location?.name || unit.locationName || null,
    }
  })
}

/** Colas de trabajo del taller: por verificar, verificados y listos. */
export function colasDelTaller(unidades = [], porCola = 5) {
  const grupos = agruparRack(unidades)
  return ['por-verificar', 'verificado', 'listo'].map((estado) => ({
    estado,
    titulo: ETIQUETA_RACK[estado],
    tono: TONO_ESTADO[estado],
    total: grupos[estado].length,
    items: grupos[estado].slice(0, porCola).map((unit) => ({
      id: unit.id,
      texto: `${nombreDeUnidad(unit)} · ${ultimos4(unit.serial)}`,
      ubicacion: unit.location?.name || unit.locationName || null,
    })),
  }))
}
