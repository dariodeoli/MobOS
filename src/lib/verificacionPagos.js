import { codigoPedido } from '../utils/pedido.js'

// Verificación de pagos (puro, sin React): textos, estados y agrupaciones que
// comparten «Autorizaciones › Pagos», el detalle del pedido y Finanzas ›
// Verificación. El servidor decide quién aprueba y cuándo se entrega; esto solo
// presenta lo que el servidor ya resolvió.

export const ROLES_VERIFICADORES = ['ADMIN', 'GERENTE', 'CAJERA']
export const puedeVerificarPagos = (rol) => ROLES_VERIFICADORES.includes(rol)
// Gerente y caja ven de Finanzas solo esta pestaña (no el resto de la sección).
export const TABS_FINANZAS_VERIFICADOR = ['verificacion-dia']

// Tabs de Autorizaciones: cada tipo comercial pertenece a una sola pestaña.
export const TABS_AUTORIZACIONES = [
  ['precios', 'Precios'],
  ['credito', 'Crédito'],
  ['pagos', 'Pagos'],
  ['otros', 'Otros'],
]
export const TIPOS_POR_TAB = {
  precios: ['WHOLESALE', 'DISCOUNT', 'BELOW_LIST_PRICE'],
  credito: ['CREDIT', 'CREDIT_DAYS', 'ORDER_CREDIT_OVER', 'ORDER_DELIVER_UNPAID'],
  otros: ['STOCK_ADJUST', 'ORDER_VOID', 'EXPENSE_OVER_LIMIT', 'TRANSFER', 'PURCHASE_CREDIT'],
}
/** Pestaña de un tipo de autorización; lo desconocido va a «Otros» para que nada desaparezca. */
export function tabDeTipo(kind) {
  if (TIPOS_POR_TAB.precios.includes(kind)) return 'precios'
  if (TIPOS_POR_TAB.credito.includes(kind)) return 'credito'
  return 'otros'
}
export const tabValida = (valor) => (TABS_AUTORIZACIONES.some(([id]) => id === valor) ? valor : '')

/** «hace 5 min», «hace 3 h», «hace 2 d». */
export function antiguedadTexto(minutos) {
  const n = Math.floor(Number(minutos))
  if (!Number.isFinite(n) || n < 1) return 'recién'
  if (n < 60) return `hace ${n} min`
  if (n < 1440) return `hace ${Math.floor(n / 60)} h`
  return `hace ${Math.floor(n / 1440)} d`
}
export const minutosDesde = (iso, ahora = Date.now()) => {
  const t = new Date(iso).getTime()
  return Number.isFinite(t) ? Math.max(0, Math.floor((ahora - t) / 60000)) : 0
}

/**
 * Estado visible de un pago del pedido.
 * PENDING + VERIFICACION → Pendiente de verificación; CONFIRMED + VERIFICACION → Aprobado;
 * REJECTED → Rechazado (con el motivo de la conciliación). El resto conserva su texto de siempre.
 */
export function estadoVisiblePago(pago) {
  const motivo = pago?.reconciliation?.note || pago?.rejectionNote || ''
  const origen = pago?.pendingReason
  if (pago?.status === 'REJECTED') return { clave: 'rechazado', label: 'Rechazado', tono: 'red', motivo }
  if (pago?.status === 'PENDING' && origen === 'VERIFICACION') return { clave: 'pendiente', label: 'Pendiente de verificación', tono: 'orange', motivo: '' }
  if (pago?.status === 'PENDING') return { clave: 'por-cobrar', label: 'Por cobrar', tono: 'orange', motivo: '' }
  if (pago?.status === 'CONFIRMED' && origen === 'VERIFICACION') return { clave: 'aprobado', label: 'Aprobado', tono: 'green', motivo: '' }
  if (pago?.status === 'REFUNDED') return { clave: 'reembolsado', label: 'Reembolsado', tono: 'slate', motivo: '' }
  return { clave: 'confirmado', label: 'Confirmado', tono: 'green', motivo: '' }
}

export const pagoEnVerificacion = (pago) => pago?.status === 'PENDING' && pago?.pendingReason === 'VERIFICACION'

/** Pagos de un pedido que esperan verificación y qué implica para la entrega. */
export function resumenVerificacionPedido(pagos = []) {
  const lista = (Array.isArray(pagos) ? pagos : []).filter(pagoEnVerificacion)
  const montoPyg = lista.reduce((suma, pago) => suma + Number(pago.amountPyg ?? pago.monto ?? 0), 0)
  const sinComprobante = lista.filter(pago => !(pago.proofs || []).length)
  return { cantidad: lista.length, montoPyg, bloqueaEntrega: lista.length > 0, sinComprobante }
}

export function motivoEntregaBloqueada(resumen, formatear = (n) => String(n)) {
  if (!resumen?.bloqueaEntrega) return ''
  const { cantidad, montoPyg } = resumen
  return `Pago en verificación (${cantidad} cobro${cantidad === 1 ? '' : 's'} · ${formatear(montoPyg)}): el pedido no se entrega hasta que se apruebe.`
}

/** ¿Mantener el refresco automático del pedido? Solo mientras haya pagos por verificar. */
export const necesitaRefrescoPagos = (pagos = []) => (Array.isArray(pagos) ? pagos : []).some(pagoEnVerificacion)

// ── Verificación diaria ─────────────────────────────────────────────────────
export const CATEGORIAS_DIA = {
  CASH: 'Efectivo',
  TRANSFER: 'Transferencias',
  PIX: 'PIX',
  CRYPTO: 'USDT',
  CARD: 'Tarjeta',
  TRADE_IN: 'Canje',
}
export const etiquetaCategoria = (method) => CATEGORIAS_DIA[method] || method

export const ESTADO_DIA = {
  OPEN: { label: 'Abierto', tono: 'orange' },
  VERIFIED: { label: 'Verificado', tono: 'green' },
  DISCREPANCIES: { label: 'Con discrepancias', tono: 'red' },
}
export const ESTADO_LINEA = {
  VERIFIED: { label: 'Verificado', tono: 'green' },
  TO_VERIFY: { label: 'Por verificar', tono: 'orange' },
  PENDING: { label: 'Pendiente de aprobación', tono: 'orange' },
  REJECTED: { label: 'Rechazado', tono: 'red' },
}

/** Agrupa los grupos método+cuenta del servidor en categorías por método (Efectivo, Transferencias…). */
export function categoriasDelDia(groups = []) {
  const mapa = new Map()
  for (const grupo of groups) {
    let categoria = mapa.get(grupo.method)
    if (!categoria) {
      categoria = { method: grupo.method, label: etiquetaCategoria(grupo.method), confirmedPyg: 0, pendingPyg: 0, rejectedPyg: 0, count: 0, porVerificar: 0, grupos: [] }
      mapa.set(grupo.method, categoria)
    }
    categoria.confirmedPyg += grupo.confirmedPyg
    categoria.pendingPyg += grupo.pendingPyg
    categoria.rejectedPyg += grupo.rejectedPyg
    categoria.count += grupo.count
    categoria.porVerificar += grupo.toVerifyCount + grupo.pendingCount
    categoria.grupos.push(grupo)
  }
  return [...mapa.values()].sort((a, b) => (b.confirmedPyg + b.pendingPyg) - (a.confirmedPyg + a.pendingPyg) || a.label.localeCompare(b.label))
}

/** «#04234» para números solo de dígitos; «MOB-0001» y similares ya traen su prefijo. */
export const numeroPedidoVisible = (numero) => {
  const texto = codigoPedido(String(numero ?? '').trim().replace(/^#(?=\d)/, ''))
  return /^\d/.test(texto) ? `#${texto}` : texto
}

/** Línea de texto de un pago del día: «Pedido #04234 · Gs 545.000 · Cliente · cobrado por Ana · 14:32». */
export function lineaDelDia(pago, { formatear, hora } = {}) {
  return [
    `Pedido ${numeroPedidoVisible(pago.orderNumber)}`,
    formatear ? formatear(pago.amountPyg) : String(pago.amountPyg),
    pago.customerName || 'Consumidor final',
    pago.collectedByName ? `cobrado por ${pago.collectedByName}` : '',
    hora ? hora(pago.at) : '',
  ].filter(Boolean).join(' · ')
}

export function resumenResultado(resultado) {
  if (!resultado) return ''
  const partes = []
  partes.push(`${resultado.verified} verificado${resultado.verified === 1 ? '' : 's'}`)
  if (resultado.alreadyVerified) partes.push(`${resultado.alreadyVerified} ya estaba${resultado.alreadyVerified === 1 ? '' : 'n'} verificado${resultado.alreadyVerified === 1 ? '' : 's'}`)
  if (resultado.skipped?.length) partes.push(`${resultado.skipped.length} sin verificar`)
  return partes.join(' · ')
}

export const MOTIVOS_OMITIDO = { OWN: 'es un cobro propio', PROOF: 'falta el comprobante', CONFLICT: 'ya estaba resuelto', DELIVERY: 'está en un reparto sin rendir' }

export function sumarResultados(resultados = []) {
  return resultados.reduce((total, r) => ({
    scope: r.scope,
    attempted: total.attempted + (r.attempted || 0),
    verified: total.verified + (r.verified || 0),
    alreadyVerified: total.alreadyVerified + (r.alreadyVerified || 0),
    skipped: [...total.skipped, ...(r.skipped || [])],
  }), { scope: 'CATEGORY', attempted: 0, verified: 0, alreadyVerified: 0, skipped: [] })
}

/** Valida el formulario de discrepancia; devuelve el mensaje o '' si es válido. */
export function errorDiscrepancia({ recibido, esperado, motivo }) {
  if (recibido === '' || recibido === null || recibido === undefined) return 'Indicá lo recibido en Gs (puede ser 0).'
  const monto = Number(recibido)
  if (!Number.isSafeInteger(monto) || monto < 0) return 'Lo recibido debe ser un entero en Gs, mayor o igual a 0.'
  if (monto === Number(esperado)) return 'Lo recibido coincide con lo esperado: no hay diferencia que registrar.'
  if (!String(motivo || '').trim()) return 'Indicá el motivo de la diferencia.'
  if (String(motivo).trim().length > 500) return 'El motivo admite hasta 500 caracteres.'
  return ''
}

export const hoyParaguay = (ahora = new Date()) => new Date(ahora.getTime() - 3 * 3600000).toISOString().slice(0, 10)
