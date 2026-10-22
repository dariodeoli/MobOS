// Comprobante de pago desde el mismo cobro del POS (puro, sin React ni red).
//
// La empresa decide qué medios piden verificación (PIX, USDT, transferencia…):
// el servidor es quien fija el estado del cobro («Pendiente de verificación»);
// acá solo se arma lo que el cobro tiene que pedir y cómo se sube cada archivo
// una vez creada la venta. La venta NO cambia de payload: los comprobantes se
// suben después, uno por pago, al endpoint privado que ya usa el pedido.

export const VERIFICABLES = ['CARD', 'PIX', 'CRYPTO', 'TRANSFER']

// Empresas nuevas (y la demo) arrancan con PIX, USDT y transferencia en «verificar».
export const POLITICA_POR_DEFECTO = Object.freeze({
  methods: { CASH: 'auto', CARD: 'auto', PIX: 'verificar', CRYPTO: 'verificar', TRANSFER: 'verificar' },
  accounts: {},
  requireProof: true,
  blockDelivery: true,
})

const modo = (valor) => (valor === 'verificar' || valor === 'auto' ? valor : null)

/** Política que devuelve el servidor, saneada. Algo inválido → null (no se pide nada). */
export function normalizarPolitica(raw) {
  if (!raw || typeof raw !== 'object') return null
  const methods = {}
  for (const metodo of VERIFICABLES) methods[metodo] = modo(raw.methods?.[metodo]) || 'auto'
  const accounts = {}
  for (const [id, valor] of Object.entries(raw.accounts && typeof raw.accounts === 'object' ? raw.accounts : {})) {
    if (id && modo(valor)) accounts[id] = valor
  }
  return { methods, accounts, requireProof: raw.requireProof !== false, blockDelivery: raw.blockDelivery !== false }
}

/** ¿Este medio/cuenta pide verificación? La cuenta manda sobre el medio (igual que el servidor). */
export function requiereVerificacion(politica, { method, accountId } = {}) {
  if (!politica || !VERIFICABLES.includes(method)) return false
  const porCuenta = accountId ? politica.accounts?.[accountId] : undefined
  return (porCuenta ?? politica.methods?.[method] ?? 'auto') === 'verificar'
}

const cuentaDe = (pago, cuentas) => (cuentas || []).find(cuenta => cuenta.id === pago?.accountId && cuenta.isActive !== false) || null

/** ¿Esta fila del cobro es de un medio que se verifica? (gift card y filas sin cuenta, nunca). */
export function filaPideComprobante(politica, pago, cuentas) {
  if (!pago || pago.giftCardCode !== undefined) return false
  const cuenta = cuentaDe(pago, cuentas)
  return Boolean(cuenta) && requiereVerificacion(politica, { method: cuenta.kind, accountId: cuenta.id })
}

/** Archivo adjunto a una fila (File), o null. */
export const archivoDeFila = (pago) => pago?.comprobante?.file || null

/** Filas que piden comprobante y todavía no lo tienen (solo si la empresa lo exige). */
export function comprobantesFaltantes(politica, pagos, cuentas) {
  if (!politica?.requireProof) return []
  return (pagos || []).flatMap((pago, indice) => (
    filaPideComprobante(politica, pago, cuentas) && !archivoDeFila(pago)
      ? [{ indice, nombre: cuentaDe(pago, cuentas)?.name || `Pago ${indice + 1}` }]
      : []
  ))
}

/** «Adjuntá el comprobante de Transferencia Continental y PIX Itaú.» ('' si no falta ninguno). */
export function textoFaltaComprobante(faltantes) {
  const nombres = [...new Set((faltantes || []).map(item => item.nombre))]
  if (!nombres.length) return ''
  const lista = nombres.length === 1 ? nombres[0] : `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`
  return `Adjuntá el comprobante de ${lista}.`
}

/** Los pagos sin el archivo: el borrador del carrito y las ventas suspendidas nunca guardan un File. */
export const sinComprobantes = (pagos) => (Array.isArray(pagos) ? pagos : []).map(({ comprobante: _descartado, ...resto }) => resto)

/** Un File (o null) por cada fila, solo de las filas que de verdad piden comprobante. */
export function archivosPorFila(politica, pagos, cuentas) {
  return (pagos || []).map(pago => (filaPideComprobante(politica, pago, cuentas) ? archivoDeFila(pago) : null))
}

/**
 * Sin conexión no se sube nada: una venta con comprobantes no se encola (el
 * archivo se perdería) y se pide la conexión. El carrito queda como está.
 */
export function mensajeSinConexion(archivos) {
  return (archivos || []).some(Boolean)
    ? 'Sin conexión: el comprobante se sube junto con la venta. Esperá a tener conexión y volvé a confirmar; el carrito queda guardado.'
    : ''
}
export const puedeEncolarVenta = (archivos) => !(archivos || []).some(Boolean)

/**
 * Empareja cada archivo con el pago que creó el servidor. Se busca por cuenta y
 * monto entre los pagos «en verificación» todavía sin asignar; si el monto no
 * coincide (redondeo), por cuenta; y por último por orden.
 * Devuelve [{ indice, file, paymentId|null }].
 */
export function emparejarComprobantes(enviados, archivos, creados) {
  const libres = (Array.isArray(creados) ? creados : []).filter(pago => pago?.id && pago.pendingReason === 'VERIFICACION')
  const tomar = (predicado) => {
    const posicion = libres.findIndex(predicado)
    return posicion < 0 ? null : libres.splice(posicion, 1)[0]
  }
  return (enviados || []).flatMap((enviado, indice) => {
    const file = archivos?.[indice]
    if (!file) return []
    const mismoMonto = pago => Number(pago.amountPyg) === Number(enviado.amountPyg)
    const mismaCuenta = pago => !enviado.accountId || pago.accountId === enviado.accountId
    const pago = tomar(p => mismaCuenta(p) && mismoMonto(p)) || tomar(mismaCuenta) || tomar(() => true)
    return [{ indice, file, paymentId: pago?.id || null }]
  })
}

/**
 * Sube cada comprobante a su pago, con reintentos. Es idempotente: el servidor
 * ignora el mismo archivo para el mismo pago (mismo SHA-256), así que reintentar
 * tras un corte nunca duplica. Devuelve { subidos, fallidos }.
 */
export async function subirComprobantes({ pares, subir, reintentos = 2, esperar = () => Promise.resolve() }) {
  const subidos = []
  const fallidos = []
  for (const par of pares || []) {
    if (!par.paymentId) { fallidos.push({ indice: par.indice, error: 'No se encontró el cobro en la venta.' }); continue }
    let ultimo = null
    let listo = false
    for (let intento = 0; intento <= reintentos && !listo; intento += 1) {
      try {
        await subir(par.paymentId, par.file)
        listo = true
      } catch (causa) {
        ultimo = causa
        if (intento < reintentos) await esperar(intento)
      }
    }
    if (listo) subidos.push({ indice: par.indice, paymentId: par.paymentId })
    else fallidos.push({ indice: par.indice, paymentId: par.paymentId, error: ultimo?.message || 'No se pudo subir el comprobante.' })
  }
  return { subidos, fallidos }
}

export function textoComprobantesFallidos(fallidos) {
  const n = (fallidos || []).length
  if (!n) return ''
  return `${n === 1 ? 'El comprobante no se subió' : `${n} comprobantes no se subieron`}. La venta quedó guardada: subí ${n === 1 ? 'el archivo' : 'los archivos'} desde el pedido.`
}

export const tamanoLegible = (bytes) => {
  const n = Number(bytes)
  if (!Number.isFinite(n) || n <= 0) return ''
  return n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}
