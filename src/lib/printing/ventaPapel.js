// Datos del papel de una venta (#402): lo que el comprobante imprime para el
// cliente y nada más. Nunca costos ni datos internos (código MOV, proveedor
// real). Una sola resolución para el HTML (A4/58/80) y el ticket ESC/POS.

const texto = (valor) => String(valor ?? '').trim()
const numero = (valor) => {
  const n = Number(valor)
  return Number.isFinite(n) ? n : 0
}

// IMEI/seriales de una línea: el arreglo `serials` del pedido o los campos
// sueltos de las formas legacy. Sin repetidos ni vacíos.
export function serialesDeItem(item = {}) {
  const crudos = [
    ...(Array.isArray(item.serials) ? item.serials : []),
    ...(Array.isArray(item.imeis) ? item.imeis : []),
    item.imei,
    item.serial,
    item.unit?.imei,
    item.unit?.serial,
  ]
  const salida = []
  for (const crudo of crudos) {
    const valor = texto(crudo && typeof crudo === 'object' ? crudo.imei || crudo.serial || crudo.value : crudo)
    if (valor && !salida.includes(valor)) salida.push(valor)
  }
  return salida
}

// Proveedor en sigla (#400/#402): ningún papel imprime el nombre real del
// proveedor. Se usa la abreviatura cargada (`code`/`abbreviation`); si el dato
// no la trae, las iniciales del nombre (máx. 4), siempre en mayúsculas.
export function siglaProveedor(nombre = '', codigo = '') {
  const propia = texto(codigo)
  if (propia) return propia.toUpperCase()
  const palabras = texto(nombre).split(/\s+/).filter((palabra) => /[\p{L}\p{N}]/u.test(palabra))
  if (!palabras.length) return ''
  if (palabras.length === 1) return palabras[0].replace(/[^\p{L}\p{N}]/gu, '').slice(0, 4).toUpperCase()
  return palabras.map((palabra) => palabra.replace(/[^\p{L}\p{N}]/gu, '').charAt(0)).join('').slice(0, 4).toUpperCase()
}

// Color de acento de la marca de la empresa: solo un hex válido; si no hay, el
// de la app. Es el único color de los papeles (el resto es gris).
export const ACENTO_POR_DEFECTO = '#0c8876'
export function acentoDeEmpresa(tenant = null) {
  const crudo = texto(tenant?.brandColor || tenant?.primaryColor || tenant?.colorMarca)
  if (!/^#[0-9a-f]{6}$/i.test(crudo)) return ACENTO_POR_DEFECTO
  // Un acento muy claro no se lee sobre papel blanco ni en escala de grises:
  // en ese caso se usa el de la app.
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(crudo.slice(i, i + 2), 16))
  const luminancia = 0.299 * r + 0.587 * g + 0.114 * b
  return luminancia > 150 ? ACENTO_POR_DEFECTO : crudo.toLowerCase()
}

// Garantía resumida: los días de las líneas (o del pedido) y, si no hay dato,
// la leyenda general de la tienda.
export function garantiaDeVenta(order = {}) {
  const dias = [
    ...(Array.isArray(order.items) ? order.items.map((item) => numero(item.warrantyDays)) : []),
    numero(order.warrantyDays),
  ].filter((valor) => valor > 0)
  if (dias.length) {
    const unicos = [...new Set(dias)].sort((a, b) => a - b)
    const rango = unicos.length === 1 ? `${unicos[0]} días` : `${unicos[0]} a ${unicos[unicos.length - 1]} días`
    return `Garantía de ${rango} en los equipos, según las condiciones de la tienda. Presentá este comprobante.`
  }
  return 'Garantía según las condiciones de la tienda. Conservá este comprobante.'
}

// Importes del pie: subtotal, descuento, envío, pagado y saldo solo cuando
// aplican. `pagado` ignora los pagos no confirmados.
export function desgloseVenta(order = {}) {
  const pagos = Array.isArray(order.payments) ? order.payments : order.pagos || []
  const confirmados = pagos.filter((pago) => pago.status === 'CONFIRMED' || pago.status === undefined)
  const total = numero(order.totalPyg ?? order.total)
  const pagado = confirmados.reduce((suma, pago) => suma + numero(pago.amountPyg ?? pago.monto), 0) || numero(order.totalPagado)
  const descuento = numero(order.discountPyg ?? order.descuento)
  const envio = numero(order.deliveryPyg ?? order.montoDelivery)
  const subtotal = numero(order.subtotalPyg) || total
  const saldo = Math.max(0, total - pagado)
  // Redondeo de efectivo (#426): solo cuando la venta lo trae. El «Total
  // ajustado» es lo que se cobra en efectivo; con el efectivo recibido se
  // imprime el vuelto (el dato del pedido manda; si falta, se deriva).
  const redondeo = numero(order.cashRoundingPyg ?? order.roundingPyg ?? order.redondeoPyg)
  const totalAjustado = total + redondeo
  const recibido = numero(order.cashReceivedPyg ?? order.efectivoRecibidoPyg ?? order.efectivoRecibido)
  const vueltoCrudo = order.changePyg ?? order.vueltoPyg ?? order.vuelto
  const vuelto = vueltoCrudo !== undefined && vueltoCrudo !== null && vueltoCrudo !== ''
    ? numero(vueltoCrudo)
    : recibido > totalAjustado ? recibido - totalAjustado : 0
  return {
    redondeo,
    totalAjustado,
    mostrarRedondeo: redondeo !== 0,
    efectivoRecibido: recibido,
    mostrarEfectivo: recibido > 0,
    vuelto,
    total,
    pagado,
    saldo,
    descuento,
    envio,
    subtotal,
    // El subtotal solo aporta si algo lo separa del total.
    mostrarSubtotal: descuento > 0 || envio > 0,
    // «Pagado» se muestra cuando hay saldo; si se pagó todo, el medio de pago
    // ya lo dice y no se repite el total.
    mostrarPagado: pagado > 0 && saldo > 0,
    confirmados,
  }
}
