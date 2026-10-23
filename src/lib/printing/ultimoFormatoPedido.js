// «Imprimir» del pedido (estilo Shopify): el botón principal imprime con el
// ÚLTIMO formato que usó ESTA persona para pedidos; el ▾ permite elegir otro y
// ese pasa a ser el último. La memoria es por usuario (misma computadora, dos
// cajeros, dos preferencias). Sin historial usa el predeterminado de la empresa.
// Solo recuerda una selección (nunca permisos ni importes); sin almacenamiento
// no rompe y cae al predeterminado. El núcleo es puro y recibe el storage.

export const FORMATOS_IMPRESION_PEDIDO = Object.freeze([
  { id: 'a4', etiqueta: 'Comprobante A4', corta: 'A4' },
  { id: 'ticket-80', etiqueta: 'Ticket 80 mm', corta: '80 mm' },
  { id: 'nota-entrega', etiqueta: 'Nota de entrega', corta: 'Nota de entrega' },
  { id: 'pagina', etiqueta: 'Página del pedido', corta: 'Página' },
])

const IDS = FORMATOS_IMPRESION_PEDIDO.map((formato) => formato.id)
const PREFIJO = 'mobos:pedido:impresion:'

export const formatoImpresionValido = (id) => IDS.includes(String(id))
export const etiquetaFormatoPedido = (id) => FORMATOS_IMPRESION_PEDIDO.find((formato) => formato.id === id)?.etiqueta || ''

/** Predeterminado de la empresa: la impresora térmica de 80 mm si está configurada; si no, A4. */
export function formatoPredeterminadoEmpresa({ ancho = 0, formatoPreferido = '' } = {}) {
  if (Number(ancho) === 80 || Number(ancho) === 58) return 'ticket-80'
  if (formatoPreferido && String(formatoPreferido).startsWith('thermal')) return 'ticket-80'
  return 'a4'
}

/** Núcleo puro: mismo comportamiento con localStorage o un mock. */
export function crearMemoriaFormatoPedido(storage) {
  const clave = (userId) => `${PREFIJO}${String(userId || 'anonimo')}`
  return {
    ultimo: (userId) => {
      try {
        const guardado = storage?.getItem(clave(userId))
        return formatoImpresionValido(guardado) ? guardado : ''
      } catch { return '' }
    },
    recordar: (userId, formato) => {
      if (!formatoImpresionValido(formato)) return
      try { storage?.setItem(clave(userId), String(formato)) } catch { /* sin almacenamiento */ }
    },
  }
}

const memoria = crearMemoriaFormatoPedido(typeof localStorage !== 'undefined' ? localStorage : null)

export const ultimoFormatoPedido = (userId) => memoria.ultimo(userId)
export const recordarFormatoPedido = (userId, formato) => memoria.recordar(userId, formato)

/** Formato con el que imprime el botón principal: el último del usuario o el de la empresa. */
export const formatoPedidoEfectivo = (userId, predeterminadoEmpresa) => memoria.ultimo(userId) || predeterminadoEmpresa
