import { fechaClave, gs } from '../utils/calculos.js'
import { ETIQUETA_RACK, agruparRack, bateriaDe, estadoEnRack, gradoDe } from './tallerRack.js'

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

/** Equipos en proceso (todavía no listos para vender), en orden del rack. */
export function equiposEnProceso(unidades = [], limite = 6) {
  const grupos = agruparRack(unidades)
  return [...grupos['por-verificar'], ...grupos.verificado].slice(0, limite).map((unit) => {
    const estado = estadoEnRack(unit)
    return {
      id: unit.id,
      modelo: nombreDeUnidad(unit),
      serial: unit.serial,
      estado,
      tono: TONO_ESTADO[estado],
      grado: gradoDe(unit),
      bateria: bateriaDe(unit),
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
