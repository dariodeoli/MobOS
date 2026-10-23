// Venta sin stock · estado de lo que se vendió sobre pedido.
//
// Puro (sin base de datos): una línea vendida sin stock recorre
// PENDIENTE_COMPRA → COMPRADO → EN_CAMINO → LLEGO → ENTREGADO. El estado sale de
// datos que ya existen (necesidad, lote, llegada y entrega), nunca se guarda. El
// pedido muestra el de su línea más atrasada. Lo comparten Por comprar, el
// pedido interno, el pedido público y el aviso al cliente.

export const ESTADOS_SOBRE_PEDIDO = ['PENDIENTE_COMPRA', 'COMPRADO', 'EN_CAMINO', 'LLEGO', 'ENTREGADO'] as const
export type EstadoSobrePedido = (typeof ESTADOS_SOBRE_PEDIDO)[number]

/** Etiqueta interna (encargado y vendedor). */
export const ESTADO_SOBRE_PEDIDO_LABEL: Record<EstadoSobrePedido, string> = {
  PENDIENTE_COMPRA: 'Por comprar',
  COMPRADO: 'Comprado',
  EN_CAMINO: 'En camino',
  LLEGO: 'Llegó',
  ENTREGADO: 'Entregado',
}

const ESTADOS_LOTE_EN_CAMINO = ['DESPACHADO', 'EN_TRANSITO', 'CON_INCIDENCIA', 'RECEPCION_PARCIAL']
const ESTADOS_ENTREGADOS = ['DELIVERED', 'PICKED_UP']

export type LineaSobrePedido = {
  stockPending?: number | null
  serialsPending?: number | null
  backorderArrivedAt?: Date | string | null
  /** Necesidad de compra de la línea (null = todavía no tiene o no corresponde). */
  need?: { status: string; quantity?: number | null; arrivedAt?: Date | string | null } | null
  /** Estado del lote entrante de la compra que cubre la línea. */
  shipmentStatus?: string | null
  /** El pedido ya se entregó al cliente. */
  entregado?: boolean
}

const positivo = (valor: unknown) => Math.max(0, Math.round(Number(valor) || 0))

/** La línea se entregó cuando el pedido salió (retirado/entregado). */
export function pedidoEntregado(fulfillmentStatus: string | null | undefined): boolean {
  return ESTADOS_ENTREGADOS.includes(String(fulfillmentStatus || ''))
}

/**
 * Estado de una línea vendida sin stock; `null` si la línea nunca fue sobre
 * pedido (una venta común no muestra estado).
 */
export function estadoSobrePedido(linea: LineaSobrePedido): EstadoSobrePedido | null {
  const pendientes = positivo(linea.stockPending) + positivo(linea.serialsPending)
  const llegada = Boolean(linea.backorderArrivedAt) || Boolean(linea.need?.arrivedAt) || linea.need?.status === 'RECIBIDA'
  const esSobrePedido = pendientes > 0 || llegada || Boolean(linea.need)
  if (!esSobrePedido) return null
  if (linea.entregado && pendientes === 0) return 'ENTREGADO'
  if (llegada) return 'LLEGO'
  const need = linea.need
  if (!need || need.status === 'CANCELADA') return 'PENDIENTE_COMPRA'
  // Compra parcial: lo que todavía falta comprar atrasa a toda la línea.
  if (positivo(need.quantity) > 0) return 'PENDIENTE_COMPRA'
  if (need.status === 'COMPRADA') return ESTADOS_LOTE_EN_CAMINO.includes(String(linea.shipmentStatus || '')) ? 'EN_CAMINO' : 'COMPRADO'
  return 'PENDIENTE_COMPRA'
}

/** Estado del pedido = el de su línea más atrasada (null si no hay líneas sobre pedido). */
export function estadoDelPedido(estados: Array<EstadoSobrePedido | null | undefined>): EstadoSobrePedido | null {
  const validos = estados.filter((estado): estado is EstadoSobrePedido => Boolean(estado))
  if (!validos.length) return null
  return validos.reduce((atrasado, actual) => (ESTADOS_SOBRE_PEDIDO.indexOf(actual) < ESTADOS_SOBRE_PEDIDO.indexOf(atrasado) ? actual : atrasado))
}

/** Fecha estimada «llega aprox.» para mostrar: dd/mm. */
export function fechaCorta(valor: Date | string | null | undefined): string | null {
  if (!valor) return null
  const fecha = valor instanceof Date ? valor : new Date(String(valor))
  if (Number.isNaN(fecha.getTime())) return null
  return `${String(fecha.getUTCDate()).padStart(2, '0')}/${String(fecha.getUTCMonth() + 1).padStart(2, '0')}`
}

export type EstadoPublico = { estado: EstadoSobrePedido; titulo: string; detalle: string | null }

/**
 * Texto para el cliente: «Sobre pedido · llega aprox. {fecha}» → «En camino» →
 * «Listo para retirar/entregar» → «Entregado». Sin costos ni datos internos.
 */
export function textoPublicoSobrePedido(estado: EstadoSobrePedido | null, { fechaPrometida = null, mostrarFecha = true, entregaADomicilio = false }: { fechaPrometida?: Date | string | null; mostrarFecha?: boolean; entregaADomicilio?: boolean } = {}): EstadoPublico | null {
  if (!estado) return null
  const fecha = mostrarFecha ? fechaCorta(fechaPrometida) : null
  switch (estado) {
    case 'PENDIENTE_COMPRA':
    case 'COMPRADO':
      return { estado, titulo: fecha ? `Sobre pedido · llega aprox. ${fecha}` : 'Sobre pedido', detalle: estado === 'COMPRADO' ? 'Ya compramos tu producto.' : 'Estamos consiguiendo tu producto.' }
    case 'EN_CAMINO':
      return { estado, titulo: 'En camino', detalle: fecha ? `Llega aprox. ${fecha}.` : null }
    case 'LLEGO':
      return { estado, titulo: entregaADomicilio ? 'Listo para entregar' : 'Listo para retirar', detalle: 'Tu producto ya llegó.' }
    case 'ENTREGADO':
      return { estado, titulo: 'Entregado', detalle: null }
  }
}

export type SiguientePaso = 'COMPRAR' | 'CARGAR_COSTO' | 'MARCAR_PAGADO' | 'RECIBIDO' | 'AVISAR' | 'ENTREGAR' | null

/**
 * La UNA acción principal de cada fila de Por comprar:
 * Comprar → Cargar costo → Marcar pagado → Recibido → Avisar → Entregar.
 * Crédito no obliga a pagar antes de recibir.
 */
export function siguientePaso({ estado, faltaCosto = false, pagado = false, credito = false, avisado = false }: { estado: EstadoSobrePedido | null; faltaCosto?: boolean; pagado?: boolean; credito?: boolean; avisado?: boolean }): SiguientePaso {
  switch (estado) {
    case 'PENDIENTE_COMPRA': return 'COMPRAR'
    case 'COMPRADO':
    case 'EN_CAMINO':
      if (faltaCosto) return 'CARGAR_COSTO'
      if (!pagado && !credito) return 'MARCAR_PAGADO'
      return 'RECIBIDO'
    case 'LLEGO': return avisado ? 'ENTREGAR' : 'AVISAR'
    default: return null
  }
}

export type AjustesSobrePedido = { backorderEmailOnArrival: boolean; backorderShowEtaOnReceipt: boolean }

/** Ajustes de la empresa (Tenant.settings): correo apagado y fecha visible por defecto. */
export function ajustesSobrePedido(settings: unknown): AjustesSobrePedido {
  const raiz = settings && typeof settings === 'object' && !Array.isArray(settings) ? settings as Record<string, unknown> : {}
  return {
    backorderEmailOnArrival: raiz.backorderEmailOnArrival === true,
    backorderShowEtaOnReceipt: raiz.backorderShowEtaOnReceipt !== false,
  }
}
