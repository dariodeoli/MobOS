// Kardex de la demo (#306): reconstruye los movimientos del producto desde el
// inventario serializado del demo (unidades, ventas, reservas y traslados) para
// que la ficha del producto sea auditable sin conexión. Es un módulo puro: no
// lee storage ni la API (recibe los datos), así se testea con node --test.
//
// El stock del demo es el de las unidades disponibles (el mismo que sincroniza
// el catálogo, #257): por eso las unidades reservadas, en revisión o en tránsito
// dejan su ajuste para que el saldo corrido cierre contra ese stock.

const nombreDe = (producto) => producto?.name || producto?.nombre || ''
const serialDe = (unidad) => String(unidad?.serial || '').trim().toUpperCase()
const numero = (valor) => (Number.isFinite(Number(valor)) ? Number(valor) : 0)
const aFecha = (valor) => {
  if (!valor) return null
  const fecha = valor instanceof Date ? valor : new Date(valor)
  return Number.isNaN(fecha.getTime()) ? null : fecha
}

const unidadesDe = (producto, unidades) => (unidades || []).filter((unidad) => unidad?.productId === producto?.id)

// Un traslado mueve una línea con producto y seriales. La unidad viaja hasta la
// recepción física: recién ahí el stock vuelve a sumar (mismo criterio que el
// kardex real).
function lineasDeTransferencia(producto, transferencias, serialesDelProducto) {
  const eventos = []
  const serialesEnTransito = new Set()
  for (const transferencia of transferencias || []) {
    for (const linea of transferencia?.lines || []) {
      const seriales = Array.isArray(linea?.serials) ? linea.serials : []
      const delProducto = linea?.productId === producto?.id || seriales.some((serial) => serialesDelProducto.has(String(serial || '').trim().toUpperCase()))
      if (!delProducto) continue
      const cantidad = seriales.length || numero(linea?.quantity)
      if (cantidad <= 0) continue
      const ruta = [transferencia?.sourceBranch?.name, transferencia?.destinationBranch?.name].filter(Boolean).join(' → ')
      const detalle = [`${cantidad} ${cantidad === 1 ? 'unidad' : 'unidades'}`, ruta].filter(Boolean).join(' · ')
      eventos.push({
        id: `demo-transferencia-envio-${transferencia.id}-${linea.productId || ''}`,
        at: aFecha(transferencia.createdAt),
        kind: 'TRANSFERENCIA',
        label: 'Transferencia enviada',
        detail: detalle,
        reference: transferencia.id,
        user: transferencia.dispatchedBy?.name || null,
        delta: -cantidad,
      })
      for (const serial of seriales) serialesEnTransito.add(String(serial || '').trim().toUpperCase())
      if (transferencia.receivedAt) {
        eventos.push({
          id: `demo-transferencia-recibo-${transferencia.id}-${linea.productId || ''}`,
          at: aFecha(transferencia.receivedAt),
          kind: 'TRANSFERENCIA',
          label: 'Transferencia recibida',
          detail: detalle,
          reference: transferencia.id,
          user: transferencia.receivedBy?.name || null,
          delta: cantidad,
        })
      }
    }
  }
  return { eventos, serialesEnTransito }
}

// Movimientos de un producto del demo, en crudo y con fechas Date. La venta, la
// baja y la reserva salen del estado real de cada unidad; no se inventan fechas
// cuando el fixture no las trae (se usa la última marca conocida).
export function eventosDemo({ producto, unidades = [], transferencias = [] } = {}) {
  const delProducto = unidadesDe(producto, unidades)
  const serialesDelProducto = new Set(delProducto.map(serialDe).filter(Boolean))
  const { eventos: eventosDeTraslado, serialesEnTransito } = lineasDeTransferencia(producto, transferencias, serialesDelProducto)
  const eventos = []

  for (const unidad of delProducto) {
    const serial = serialDe(unidad)
    const referencia = serial ? `IMEI ${serial}` : ''
    const creada = aFecha(unidad.createdAt || unidad.lastVerifiedAt || null)
    if (creada) {
      const conProveedor = Boolean(unidad.supplierName)
      eventos.push({
        id: `demo-alta-${unidad.id}`,
        at: creada,
        kind: conProveedor ? 'COMPRA' : 'ALTA',
        label: conProveedor ? 'Compra recibida' : 'Alta de unidad',
        detail: [referencia, unidad.supplierName].filter(Boolean).join(' · '),
        reference: null,
        user: unidad.lastVerifiedBy?.name || null,
        costo: numero(unidad.costPyg) || null,
        delta: 1,
      })
    }
    if (unidad.removedAt) {
      eventos.push({
        id: `demo-baja-${unidad.id}`,
        at: aFecha(unidad.removedAt),
        kind: 'AJUSTE',
        label: 'Unidad dada de baja',
        detail: [referencia, unidad.removedReason].filter(Boolean).join(' · '),
        reference: null,
        user: null,
        delta: -1,
      })
      continue
    }
    if (unidad.status === 'SOLD') {
      const venta = unidad.sale || {}
      const eventoVenta = (unidad.events || []).find((evento) => evento.type === 'sale')
      const fecha = aFecha(venta.soldAt || eventoVenta?.at || unidad.lastVerifiedAt || creada)
      if (!fecha) continue
      eventos.push({
        id: `demo-venta-${unidad.id}`,
        at: fecha,
        kind: 'VENTA',
        label: venta.orderNumber ? `Venta ${venta.orderNumber}` : 'Venta',
        detail: [referencia, venta.customerName].filter(Boolean).join(' · '),
        reference: venta.orderNumber || null,
        user: null,
        delta: -1,
      })
      continue
    }
    if (unidad.status === 'RESERVED') {
      eventos.push({
        id: `demo-reserva-${unidad.id}`,
        at: aFecha(unidad.reservedUntil || unidad.lastVerifiedAt || creada),
        kind: 'AJUSTE',
        label: 'Unidad reservada',
        detail: [referencia, unidad.reservationCustomer].filter(Boolean).join(' · '),
        reference: null,
        user: null,
        delta: -1,
      })
      continue
    }
    if (unidad.status === 'DEFECTIVE') {
      eventos.push({
        id: `demo-revision-${unidad.id}`,
        at: aFecha(unidad.lastVerifiedAt || creada),
        kind: 'AJUSTE',
        label: 'Unidad en revisión',
        detail: [referencia, 'fuera de venta hasta revisarla'].filter(Boolean).join(' · '),
        reference: null,
        user: null,
        delta: -1,
      })
      continue
    }
    if (unidad.status === 'IN_TRANSIT' && serial && !serialesEnTransito.has(serial)) {
      eventos.push({
        id: `demo-transito-${unidad.id}`,
        at: aFecha(unidad.lastVerifiedAt || creada),
        kind: 'TRANSFERENCIA',
        label: 'Unidad en tránsito',
        detail: referencia,
        reference: null,
        user: null,
        delta: -1,
      })
    }
  }

  return [...eventos, ...eventosDeTraslado].filter((evento) => evento.at instanceof Date && !Number.isNaN(evento.at.getTime()))
}

// Mismo contrato que GET /api/products/:id/kardex: saldo corrido, rango por
// fecha y totales. El saldo inicial se calcula hacia atrás desde el stock para
// que la última línea siempre cierre contra lo que muestra el catálogo.
export function construirKardexDemo({ producto, unidades = [], transferencias = [], desde = null, hasta = null, limite = 5000 } = {}) {
  const stockActual = numero(producto?.stock)
  const ordenados = [...eventosDemo({ producto, unidades, transferencias })].sort((a, b) => a.at.getTime() - b.at.getTime() || String(a.id).localeCompare(String(b.id)))
  let saldo = stockActual - ordenados.reduce((suma, evento) => suma + numero(evento.delta), 0)
  const conSaldo = ordenados.map((evento) => {
    saldo += numero(evento.delta)
    return { ...evento, saldo }
  })
  const inicio = aFecha(desde) ? (() => {
    const indice = conSaldo.findIndex((movimiento) => movimiento.at >= aFecha(desde))
    return indice === -1 ? conSaldo.length : indice
  })() : 0
  const saldoInicial = inicio < conSaldo.length ? conSaldo[inicio].saldo - conSaldo[inicio].delta : stockActual
  const fin = aFecha(hasta)
  let visibles = conSaldo.slice(inicio)
  if (fin) visibles = visibles.filter((movimiento) => movimiento.at <= fin)
  let truncado = false
  if (visibles.length > limite) {
    visibles = visibles.slice(visibles.length - limite)
    truncado = true
  }
  const totales = visibles.reduce((acumulado, movimiento) => {
    if (movimiento.delta >= 0) acumulado.entradas += movimiento.delta
    else acumulado.salidas += -movimiento.delta
    acumulado.neto += movimiento.delta
    return acumulado
  }, { entradas: 0, salidas: 0, neto: 0 })
  return {
    producto: { id: producto?.id || '', sku: producto?.sku || '', name: nombreDe(producto), stock: stockActual },
    desde: aFecha(desde) ? aFecha(desde).toISOString() : null,
    hasta: fin ? fin.toISOString() : null,
    cargaInicial: null,
    // En el demo el saldo inicial debería ser 0: la carga inicial son las
    // unidades fuera del rango pedido. Si algo no cierra, se advierte.
    sinDocumentar: !desde && saldoInicial !== 0 ? saldoInicial : null,
    saldoInicial,
    movimientos: visibles.map((movimiento) => ({ ...movimiento, at: movimiento.at.toISOString() })),
    cierre: visibles.length ? visibles[visibles.length - 1].saldo : saldoInicial,
    totales,
    total: conSaldo.length,
    truncado,
    verCostos: true,
    demo: true,
  }
}
