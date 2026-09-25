import { ticketPromedio } from '../utils/calculos.js'
import { PAYMENT_METHOD_LABELS } from './constants.js'

// Núcleo puro del adaptador de métricas (#171, fase 2 de #145).
//
// Acá viven las normalizaciones que comparten la vista ejecutiva (Resumen) y
// la extendida (Análisis): el mismo indicador se arma una sola vez y las
// pantallas no recalculan nada. Sin red ni estado para poder probarlo aislado.

// Clases de la curva ABC. El servidor ya manda `abcClass` y
// `accumulatedPct`; el resumen por clase se arma acá una sola vez.
export const CURVA_CORTES = { A: 80, B: 95 }

/** Filas de un reporte `groupBy=payments` normalizadas para listados. */
export function filasDePagos(groups = []) {
  return (Array.isArray(groups) ? groups : [])
    .map((grupo) => {
      const key = grupo?.key || grupo?.label || 'sin-medio'
      // Los cortes por medio llegan con el código (CASH, TRANSFER…) o con el
      // prefijo `metodo:` cuando el pago no tiene cuenta: se muestran con la
      // etiqueta humana compartida. Cuentas y procesadoras conservan su nombre.
      const codigo = String(key).replace(/^metodo:/i, '').toUpperCase()
      return {
        key,
        label: (Object.hasOwn(PAYMENT_METHOD_LABELS, codigo) ? PAYMENT_METHOD_LABELS[codigo] : '') || grupo?.label || 'Sin método',
        monto: Number(grupo?.totalPyg || 0),
        operaciones: Number(grupo?.units || 0),
        reembolsado: Number(grupo?.refundedPyg || 0),
      }
    })
    .filter((fila) => fila.monto !== 0 || fila.operaciones > 0)
    .sort((a, b) => b.monto - a.monto || a.label.localeCompare(b.label))
}

/** Monto y cantidad por clase ABC, para el resumen ejecutivo. */
export function resumenCurva(groups = []) {
  const clases = { A: { productos: 0, monto: 0 }, B: { productos: 0, monto: 0 }, C: { productos: 0, monto: 0 } }
  for (const grupo of Array.isArray(groups) ? groups : []) {
    const clase = grupo?.abcClass === 'A' || grupo?.abcClass === 'B' ? grupo.abcClass : 'C'
    clases[clase].productos += 1
    clases[clase].monto += Number(grupo?.grossPyg || 0)
  }
  return clases
}

/** Filas del reporte por producto listas para las pantallas de ganadores.
 *  `criterio` define el orden: 'venta' respeta el del backend (curva ABC por
 *  venta) y 'ganancia' prioriza la plata que deja cada producto. */
export function topProductos(groups = [], limite = 8, criterio = 'venta') {
  const filas = (Array.isArray(groups) ? groups : []).map((grupo) => {
    const monto = Number(grupo?.grossPyg || 0)
    const ganancia = Number(grupo?.profitPyg || 0)
    return {
      id: grupo?.key || grupo?.label || 'producto',
      nombre: grupo?.label || 'Producto sin nombre',
      cantidad: Number(grupo?.units || 0),
      monto,
      ganancia,
      // Sin venta no hay porcentaje: null evita un 0% engañoso.
      margenPct: monto > 0 ? (ganancia / monto) * 100 : null,
      sinCosto: Number(grupo?.salesWithoutCostPyg || 0),
      clase: grupo?.abcClass || 'C',
      acumuladoPct: Number(grupo?.accumulatedPct || 0),
    }
  })
  if (criterio === 'ganancia') {
    // Primero los que dejan más plata; el empate se resuelve por venta.
    return [...filas]
      .sort((a, b) => b.ganancia - a.ganancia || b.monto - a.monto)
      .slice(0, Math.max(0, limite))
  }
  return filas.slice(0, Math.max(0, limite))
}

function numero(valor) {
  const n = Number(valor)
  return Number.isFinite(n) ? n : 0
}

/**
 * Contrato estable de la vista ejecutiva. Recibe las respuestas crudas de
 * `/api/reports` (día, productos, pagos) y el resumen liviano de conciliación.
 * Nunca lanza: sin datos devuelve ceros (la pantalla decide si ocultar).
 */
export function normalizarMetricas({ dia, productos, procesadoras, cuentas, conciliacion } = {}) {
  const totals = dia?.totals || {}
  const previous = dia?.previous?.totals || {}
  const total = numero(totals.totalPyg)
  const pedidos = numero(totals.orders)
  const inventory = productos?.inventory || {}
  const resumenConciliacion = conciliacion?.resumen || {}

  return {
    fuente: 'api',
    generadoEn: dia?.generatedAt || new Date().toISOString(),
    truncado: Boolean(dia?.truncated || productos?.truncated),
    rango: { desde: dia?.from || '', hasta: dia?.to || '', grupo: dia?.groupBy || 'day' },
    total,
    totalAnterior: numero(previous.totalPyg),
    cobrado: numero(totals.collectedPyg),
    pendiente: numero(totals.pendingPyg),
    pedidos,
    pedidosPagados: numero(totals.paidOrders ?? pedidos),
    pedidosPendientes: numero(totals.pendingOrders),
    unidades: numero(totals.units),
    ticket: ticketPromedio(total, pedidos),
    ticketAnterior: ticketPromedio(previous.totalPyg, previous.orders),
    serie: (Array.isArray(dia?.groups) ? dia.groups : []).map((grupo) => [grupo.key, numero(grupo.totalPyg)]),
    sinCosto: { lineas: numero(totals.linesWithoutCost), monto: numero(totals.salesWithoutCostPyg) },
    topProductos: topProductos(productos?.groups, 8),
    curva: resumenCurva(productos?.groups),
    inventario: {
      unidades: numero(inventory.onHandUnits),
      valorPyg: numero(inventory.stockValuePyg),
      rotacionPct: inventory.sellThroughPct === null || inventory.sellThroughPct === undefined ? null : numero(inventory.sellThroughPct),
      diasDeStock: inventory.daysOfStock === null || inventory.daysOfStock === undefined ? null : numero(inventory.daysOfStock),
      sinCosto: numero(inventory.stockWithoutCost),
      faltantes: Array.isArray(inventory.shortages) ? inventory.shortages : [],
    },
    procesadoras: filasDePagos(procesadoras?.groups),
    cuentas: filasDePagos(cuentas?.groups),
    conciliacion: {
      operaciones: numero(resumenConciliacion.count),
      conciliadoPyg: numero(resumenConciliacion.verifiedPyg),
      porConciliarPyg: numero(resumenConciliacion.porConciliar ?? resumenConciliacion.unverifiedPyg),
      diferenciaPyg: numero(resumenConciliacion.differencePyg),
      lotes: numero(resumenConciliacion.lotes),
    },
  }
}
