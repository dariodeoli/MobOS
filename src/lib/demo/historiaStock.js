// Historia de stock de la demo: movimientos del kardex por producto y por IMEI
// (compras, ventas, ajustes, traslados, bajas, reservas, devoluciones) armados
// con los MISMOS pedidos, compras y unidades que el resto de la app. El saldo
// siempre cierra contra el stock actual: los accesorios se reconstruyen con
// reposiciones de proveedor que cubren cada salida; las unidades con IMEI
// suman pares que se anulan entre sí (reserva/liberación, traslado/recibo).
// Puro y sin storage; los tiempos se acotan a «ahora».
import { codigoPedido } from '../../utils/pedido.js'
import { PROVEEDORES_DEMO } from './proveedores.js'
import { CATALOGO_VENTA } from './catalogoPro.js'
import { DIAS_LIBRO } from './historiaCuentas.js'

const MIN = 60000
const HORA = 3600000
const DIA = 86400000
const hash = (texto) => String(texto || '').split('').reduce((suma, c) => (suma * 31 + c.charCodeAt(0)) >>> 0, 7)
const aMs = (valor) => { const t = new Date(valor).getTime(); return Number.isFinite(t) ? t : null }
const COMPRADORA = 'María Benítez'
const JEFE = 'Hernán Acosta'

/** Mapa serial → pedido, para que la venta del IMEI cite el pedido real. */
export function ventasPorSerial(ventas = []) {
  const mapa = new Map()
  for (const venta of ventas) {
    for (const item of venta.items || []) {
      for (const serial of item.serials || item.seriales || []) mapa.set(String(serial).trim().toUpperCase(), venta)
    }
  }
  return mapa
}

/**
 * Movimientos extra de una unidad con IMEI. Cada par se anula (delta total 0),
 * así el stock no cambia: solo cuentan la historia. `ahora` acota las fechas.
 */
export function extrasDeUnidad(unidad = {}, ahora = new Date()) {
  const tope = ahora.getTime()
  const creada = aMs(unidad.createdAt)
  if (creada == null) return []
  const serial = String(unidad.serial || '').trim().toUpperCase()
  const referencia = serial ? `IMEI ${serial}` : ''
  const h = hash(unidad.id || serial)
  const extras = []
  const poner = (clave, t, kind, label, detail, user, delta = 0) => {
    if (t > tope) return
    extras.push({ id: `demo-x-${unidad.id}-${clave}`, at: new Date(t), kind, label, detail, reference: null, user, delta, serial })
  }
  poner('ingreso', creada + 20 * MIN, 'AJUSTE', 'Ingreso a depósito', [referencia, unidad.location?.name || 'Casa Central'].filter(Boolean).join(' · '), COMPRADORA)
  if (unidad.lastVerifiedAt || h % 4 === 0) {
    poner('verificacion', creada + 6 * HORA, 'AJUSTE', 'Verificación e inspección del equipo', [referencia, unidad.inspection?.grado ? `grado ${unidad.inspection.grado}` : 'batería y estado revisados'].join(' · '), unidad.lastVerifiedBy?.name || JEFE)
  }
  if (unidad.status === 'AVAILABLE' && !unidad.removedAt) {
    if (h % 4 === 0) {
      poner('reserva', creada + 3 * DIA, 'AJUSTE', 'Unidad reservada', [referencia, 'cliente con seña'].join(' · '), 'Diego López', -1)
      poner('reserva-lib', creada + 5 * DIA, 'AJUSTE', 'Reserva liberada: el cliente no concretó', referencia, 'Diego López', 1)
    }
    if (unidad.branchId && unidad.branchId !== 'mobos-demo-central') {
      poner('traslado', creada + 1 * DIA + 3 * HORA, 'TRANSFERENCIA', 'Transferencia enviada', [referencia, 'Casa Central → Sucursal Villa Morra'].join(' · '), JEFE, -1)
      poner('traslado-rec', creada + 2 * DIA + 2 * HORA, 'TRANSFERENCIA', 'Transferencia recibida', [referencia, 'Casa Central → Sucursal Villa Morra'].join(' · '), COMPRADORA, 1)
    } else if (h % 6 === 2) {
      poner('taller', creada + 2 * DIA, 'AJUSTE', 'Enviado al taller para revisión', referencia, 'Jorge Villalba', -1)
      poner('taller-vuelta', creada + 4 * DIA, 'AJUSTE', 'Regresó del taller: aprobado', referencia, 'Jorge Villalba', 1)
    }
  }
  return extras
}

const proveedorDe = (producto, indice) => PROVEEDORES_DEMO[(hash(producto.id) + indice) % PROVEEDORES_DEMO.length]

/**
 * Kardex de un producto SIN IMEI (accesorios, protectores, audio…).
 * Devuelve movimientos cuya suma es exactamente el stock actual, con saldo
 * nunca negativo: las reposiciones aparecen justo antes de la salida que las
 * necesita y un único «carga inicial» o ajuste de conteo cierra la cuenta.
 */
export function eventosAccesorio({ producto, ventas = [], compras = [], ahora = new Date(), dias = DIAS_LIBRO } = {}) {
  const tope = ahora.getTime()
  const inicio = tope - dias * DIA
  const stock = Math.max(0, Number(producto?.stock) || 0)
  const costoUnitario = Number(CATALOGO_VENTA[producto?.id]?.costo) || Number(producto?.precioCosto) || 0
  const h = hash(producto?.id)
  const eventos = []
  const poner = (clave, t, kind, label, detail, user, delta, extra = {}) => {
    if (t > tope || t < inicio - DIA || !delta) return
    eventos.push({ id: `demo-k-${producto.id}-${clave}`, at: new Date(t), kind, label, detail, reference: null, user, delta, ...extra })
  }

  for (const venta of ventas) {
    const creado = aMs(venta.creadoEn || venta.createdAt)
    if (creado == null) continue
    const cantidad = (venta.items || []).filter((item) => item.productoId === producto.id).reduce((suma, item) => suma + (Number(item.quantity ?? item.cantidad) || 1), 0)
    if (!cantidad) continue
    const numero = venta.orderNumber || venta.numero || venta.id
    const cliente = venta.cliente || venta.customer?.name || ''
    const vendedor = venta.seller?.name || 'Equipo demo'
    poner(`v-${venta.id}`, creado, 'VENTA', `Venta ${codigoPedido(numero)}`, cliente, vendedor, -cantidad, { reference: numero })
    if (venta.status === 'CANCELLED' || venta.anulada) {
      poner(`a-${venta.id}`, creado + 40 * MIN, 'DEVOLUCION', `Pedido anulado ${codigoPedido(numero)}`, 'Unidades repuestas al stock', 'Ana Giménez', cantidad, { reference: numero })
    } else if (cantidad === 1 && hash(`${venta.id}${producto.id}`) % 41 === 0 && creado < tope - 6 * DIA) {
      // Falla de fábrica: vuelve la unidad, sale una nueva y la fallada se da de baja.
      poner(`d-${venta.id}`, creado + 4 * DIA, 'DEVOLUCION', `Devolución del pedido ${codigoPedido(numero)}`, 'Falla de fábrica', 'Diego López', 1, { reference: numero })
      poner(`dr-${venta.id}`, creado + 4 * DIA + 5 * MIN, 'VENTA', `Cambio por garantía ${codigoPedido(numero)}`, 'Se entregó una unidad nueva', 'Diego López', -1, { reference: numero })
      poner(`db-${venta.id}`, creado + 4 * DIA + 10 * MIN, 'AJUSTE', 'Baja de la unidad fallada', 'Enviada al proveedor para garantía', COMPRADORA, -1)
    }
  }
  for (const compra of compras) {
    for (const linea of compra.lines || []) {
      if (linea.productId !== producto.id) continue
      const cantidad = Number(linea.receivedQty ?? linea.quantity) || 0
      const recibido = aMs(compra.receivedAt)
      if (!cantidad || recibido == null) continue
      poner(`c-${compra.id}-${linea.id}`, recibido, 'COMPRA', 'Compra recibida', `${compra.supplierReference || compra.id} · ${compra.supplierName}`, COMPRADORA, cantidad, { costo: Number(linea.unitCostPyg) || costoUnitario || null, reference: compra.supplierReference || compra.id })
    }
  }
  // Movimientos operativos deterministas del producto.
  const dia = (n, hora = 11) => Math.round(tope - n * DIA + (hora - 12) * HORA)
  poner('conteo', dia(18 + (h % 40), 17), 'AJUSTE', 'Ajuste por conteo físico', h % 3 === 0 ? 'Sobrante en el inventario del mes' : 'Faltante en el inventario del mes', JEFE, h % 3 === 0 ? 1 : -1)
  const traslado = 1 + (h % 3)
  poner('traslado', dia(30 + (h % 30), 10), 'TRANSFERENCIA', 'Transferencia enviada', `${traslado} unid. · Casa Central → Sucursal Villa Morra`, JEFE, -traslado)
  poner('traslado-rec', dia(28 + (h % 30), 15), 'TRANSFERENCIA', 'Transferencia recibida', `${traslado} unid. · Casa Central → Sucursal Villa Morra`, COMPRADORA, traslado)
  if (h % 2 === 0) poner('merma', dia(55 + (h % 30), 12), 'AJUSTE', 'Baja por merma', 'Empaque dañado en el depósito', COMPRADORA, -1)
  if (h % 3 === 1) {
    poner('reserva', dia(6, 12), 'AJUSTE', 'Reservado para un pedido', 'Cliente retira en unos días', 'Sofía Cáceres', -1)
    poner('reserva-lib', dia(4, 16), 'AJUSTE', 'Reserva liberada', 'Se vendió por el mostrador', 'Sofía Cáceres', 1)
  }

  // Reposiciones mínimas para que el saldo nunca sea negativo, simulando con saldo 0.
  eventos.sort((a, b) => a.at - b.at || String(a.id).localeCompare(String(b.id)))
  const colchon = costoUnitario >= 1500000 ? 1 : costoUnitario >= 400000 ? 3 : 8
  const resultado = []
  let saldo = 0
  let lote = 0
  for (const evento of eventos) {
    if (saldo + evento.delta < 0) {
      const faltan = -(saldo + evento.delta) + (lote === 0 ? colchon : Math.ceil(colchon / 2))
      lote += 1
      const proveedor = proveedorDe(producto, lote)
      resultado.push({
        id: `demo-k-${producto.id}-rep-${lote}`, at: new Date(Math.max(inicio, evento.at.getTime() - 5 * HORA)), kind: 'COMPRA', label: 'Compra recibida',
        detail: `${proveedor.code}-${String(2000 + (h % 900) + lote * 7)} · ${proveedor.name}`, reference: `${proveedor.code}-${2000 + (h % 900) + lote * 7}`, user: COMPRADORA, costo: costoUnitario || null, delta: faltan,
      })
      saldo += faltan
    }
    resultado.push(evento)
    saldo += evento.delta
  }
  // Cierre contra el stock actual: carga inicial (si falta) o ajuste de conteo (si sobra).
  const diferencia = stock - saldo
  if (diferencia > 0) {
    resultado.push({ id: `demo-k-${producto.id}-inicial`, at: new Date(inicio - DIA), kind: 'ALTA', label: 'Carga inicial de stock', detail: 'Existencia al comenzar el historial', reference: null, user: JEFE, delta: diferencia })
  } else if (diferencia < 0) {
    const ultimo = resultado.reduce((max, e) => Math.max(max, e.at.getTime()), inicio)
    resultado.push({ id: `demo-k-${producto.id}-cierre`, at: new Date(Math.min(tope, ultimo + HORA)), kind: 'AJUSTE', label: 'Ajuste por conteo físico', detail: 'Diferencia detectada al contar el depósito', reference: null, user: JEFE, delta: diferencia })
  }
  return resultado
}

/**
 * Compras "implícitas" del historial (reposiciones de accesorios y lotes de
 * equipos con IMEI) como órdenes pagadas al día siguiente de recibirse: las usa
 * el libro de bancos para que los pagos a proveedores coincidan con el kardex.
 */
export function lotesDeCompraDemo({ productos = [], unidades = [], ventas = [], compras = [], ahora = new Date() } = {}) {
  const lotes = []
  for (const producto of productos) {
    for (const evento of eventosAccesorio({ producto, ventas, compras, ahora })) {
      if (evento.kind !== 'COMPRA' || !String(evento.id).includes('-rep-')) continue
      lotes.push({ id: evento.id, supplierName: String(evento.detail).split(' · ')[1] || 'Proveedor', supplierReference: evento.reference, receivedAt: evento.at.toISOString(), createdAt: evento.at.toISOString(), payments: [{ id: `${evento.id}-pago`, amountPyg: Math.round((Number(evento.costo) || 0) * evento.delta), paidAt: new Date(Math.min(ahora.getTime(), evento.at.getTime() + DIA)).toISOString(), reference: 'Transferencia Itaú' }], lines: [] })
    }
  }
  const porLote = new Map()
  for (const unidad of unidades) {
    if (unidad.removedAt || !unidad.createdAt) continue
    const clave = `${unidad.supplierName || 'Proveedor'}|${String(unidad.createdAt).slice(0, 10)}`
    const lote = porLote.get(clave) || { id: `demo-lote-u-${porLote.size + 1}`, supplierName: unidad.supplierName || 'Proveedor', supplierReference: `LOTE-${String(unidad.createdAt).slice(5, 10)}`, receivedAt: unidad.createdAt, createdAt: unidad.createdAt, payments: [], lines: [], total: 0 }
    lote.total += Number(unidad.costPyg) || 0
    porLote.set(clave, lote)
  }
  for (const lote of porLote.values()) {
    if (!(lote.total > 0)) continue
    lotes.push({ ...lote, payments: [{ id: `${lote.id}-pago`, amountPyg: lote.total, paidAt: new Date(Math.min(ahora.getTime(), new Date(lote.receivedAt).getTime() + DIA)).toISOString(), reference: 'Transferencia Itaú / dólares' }] })
  }
  return lotes
}

/**
 * Historial de un IMEI para la ficha de la unidad (`Cronologia`): compra con
 * proveedor y costo, ingreso, verificación, reservas, traslados, taller, venta
 * con su pedido real, baja. Más reciente primero.
 */
export function historiaUnidadDemo(unidad = {}, { ventas = [], ahora = new Date() } = {}) {
  const tope = ahora.getTime()
  const creada = aMs(unidad.createdAt)
  if (creada == null) return []
  const serial = String(unidad.serial || '').trim().toUpperCase()
  const id = unidad.id || serial
  const eventos = []
  const poner = (clave, t, type, label, detail, nombre) => {
    if (t == null || t > tope) return
    eventos.push({ id: `demo-hu-${id}-${clave}`, type, label, action: label, createdAt: new Date(t).toISOString(), user: nombre ? { id: 'demo-user', name: nombre } : null, detail })
  }
  const costo = unidad.costCurrency === 'USD' && unidad.originalCost ? `USD ${unidad.originalCost} (cotización ${unidad.exchangeRatePyg})` : unidad.costPyg ? `Gs ${Number(unidad.costPyg).toLocaleString('es-PY')}` : 'costo pendiente'
  poner('compra', creada, 'purchase', 'Compra recibida', [unidad.supplierName, costo].filter(Boolean).join(' · '), COMPRADORA)
  poner('etiqueta', creada + 30 * MIN, 'unit', 'IMEI registrado y etiqueta impresa', `IMEI ${serial} · código QR y de barras`, COMPRADORA)
  for (const extra of extrasDeUnidad(unidad, ahora)) {
    poner(extra.id.replace(`demo-x-${unidad.id}-`, ''), extra.at.getTime(), 'unit', extra.label, extra.detail, extra.user)
  }
  const pedido = ventasPorSerial(ventas).get(serial)
  if (unidad.status === 'SOLD') {
    const numero = pedido?.orderNumber || pedido?.numero || unidad.sale?.orderNumber
    const t = aMs(pedido?.creadoEn || pedido?.createdAt) ?? aMs(unidad.soldAt) ?? creada
    poner('venta', t, 'sale', `Vendida · pedido ${codigoPedido(numero || '')}`.trim(), [pedido?.cliente || pedido?.customer?.name || unidad.sale?.customerName, pedido?.seller?.name && `vendedor ${pedido.seller.name}`].filter(Boolean).join(' · '), pedido?.seller?.name || 'Diego López')
    poner('garantia', t + 5 * MIN, 'unit', 'Garantía iniciada', 'Comprobante con IMEI entregado al cliente', pedido?.seller?.name || 'Diego López')
    const estado = pedido?.fulfillmentStatus || unidad.sale?.fulfillmentStatus
    if (estado === 'DELIVERED' || estado === 'PICKED_UP') poner('entrega', t + 90 * MIN, 'sale', estado === 'DELIVERED' ? 'Entregada al cliente' : 'Retirada en tienda', pedido?.orderNumber ? `Pedido ${codigoPedido(pedido.orderNumber)}` : '', 'Marcos Aquino')
  }
  if (unidad.status === 'RESERVED') poner('reservada', aMs(unidad.lastVerifiedAt) ?? creada + 2 * DIA, 'unit', 'Reservada', [unidad.reservationCustomer, unidad.reservedUntil && `hasta ${new Date(unidad.reservedUntil).toLocaleDateString('es-PY')}`].filter(Boolean).join(' · '), 'Diego López')
  if (unidad.status === 'DEFECTIVE') poner('revision', aMs(unidad.lastVerifiedAt) ?? creada + 2 * DIA, 'unit', 'Enviada a revisión técnica', 'Fuera de venta hasta revisarla', 'Jorge Villalba')
  if (unidad.status === 'IN_TRANSIT') poner('transito', creada + 20 * HORA, 'unit', 'Despachada en traslado', 'Casa Central → Sucursal Villa Morra · guía AEX-004711', JEFE)
  if (unidad.removedAt) poner('baja', aMs(unidad.removedAt), 'unit', 'Dada de baja', unidad.removedReason || '', JEFE)
  return eventos.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}

/**
 * Margen de una unidad vendida (demo): precio de la línea del pedido menos el
 * costo de la unidad. Misma forma que `margen` de /api/inventory-units/:id/history.
 */
export function margenUnidadDemo(unidad = {}, { ventas = [] } = {}) {
  const serial = String(unidad.serial || '').trim().toUpperCase()
  const costo = Number(unidad.costPyg)
  if (!serial || !Number.isFinite(costo) || costo <= 0) return null
  const venta = ventasPorSerial(ventas).get(serial)
  if (!venta || venta.status === 'CANCELLED') return null
  const linea = (venta.items || []).find((item) => (item.serials || item.seriales || []).some((s) => String(s).trim().toUpperCase() === serial))
  if (!linea) return null
  const cantidad = Math.max(1, Number(linea.quantity) || 1)
  const ventaPyg = Math.round(Number(linea.totalPyg ?? (Number(linea.unitPricePyg) || 0) * cantidad) / cantidad)
  if (!ventaPyg) return null
  return { costPyg: costo, ventaPyg, margenPyg: ventaPyg - costo, pedido: codigoPedido(venta.orderNumber || venta.numero || ''), orderId: venta.id }
}
