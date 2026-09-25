// Kardex por producto: arma el saldo corrido desde los documentos que mueven
// stock (compras, ventas, transferencias, devoluciones y altas/bajas de
// unidades) y lo cierra contra el stock actual del producto.
//
// No existe una tabla de movimientos: cada fuente se traduce a eventos con su
// delta y el saldo inicial absorbe lo que no tiene documento (carga inicial,
// ediciones viejas de stock, ajustes previos al registro). El saldo final
// siempre coincide con `Product.stock`; cuando el saldo inicial queda distinto
// de la carga inicial documentada, la vista lo advierte con `sinDocumentar`.

export type KardexKind = 'ALTA' | 'COMPRA' | 'VENTA' | 'TRANSFERENCIA' | 'DEVOLUCION' | 'AJUSTE'

export type KardexEvento = {
  id: string
  at: Date
  kind: KardexKind
  label: string
  detail: string
  reference: string | null
  user: string | null
  delta: number
  /** Restitución reconstruida desde el pedido/auditoría: puede diferir del movimiento real. */
  estimated?: boolean
}

export type KardexMovimiento = KardexEvento & { saldo: number }

export type KardexVista = {
  saldoInicial: number
  movimientos: KardexMovimiento[]
  cierre: number
  totales: { entradas: number; salidas: number; neto: number }
  total: number
  truncado: boolean
}

const numero = (valor: unknown) => (Number.isFinite(Number(valor)) ? Number(valor) : 0)
const gs = (valor: unknown) => `Gs ${numero(valor).toLocaleString('es-PY')}`
const unid = (cantidad: number) => `${cantidad} ${cantidad === 1 ? 'unidad' : 'unidades'}`
const unir = (...partes: Array<string | null | undefined | false>) => partes.filter(Boolean).join(' · ')

// ── Armado del saldo corrido ────────────────────────────────────────────────
// El saldo inicial se calcula hacia atrás desde el stock actual: es la única
// ancla confiable. Con un rango de fechas, la vista arranca con el saldo a esa
// fecha, no con el saldo de hoy.
export function construirKardex(eventos: KardexEvento[], stockActual: number, opciones: { desde?: Date | null; hasta?: Date | null; limite?: number } = {}): KardexVista {
  const ordenados = [...eventos].sort((a, b) => a.at.getTime() - b.at.getTime() || a.id.localeCompare(b.id))
  let saldo = numero(stockActual) - ordenados.reduce((suma, evento) => suma + numero(evento.delta), 0)
  const conSaldo: KardexMovimiento[] = ordenados.map(evento => {
    saldo += numero(evento.delta)
    return { ...evento, saldo }
  })
  const desde = opciones.desde ?? null
  const hasta = opciones.hasta ?? null
  const primerIndice = desde ? conSaldo.findIndex(movimiento => movimiento.at >= desde) : 0
  const inicio = primerIndice === -1 ? conSaldo.length : primerIndice
  const saldoInicial = inicio < conSaldo.length ? conSaldo[inicio].saldo - conSaldo[inicio].delta : numero(stockActual)
  let visibles = conSaldo.slice(inicio)
  if (hasta) visibles = visibles.filter(movimiento => movimiento.at <= hasta)
  const limite = Math.max(1, opciones.limite ?? 500)
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
    saldoInicial,
    movimientos: visibles,
    cierre: visibles.length ? visibles[visibles.length - 1].saldo : saldoInicial,
    totales,
    total: conSaldo.length,
    truncado,
  }
}

/** Carga inicial documentada por la auditoría del alta (null si no hay). */
export function cargaInicialDocumentada(metadata: unknown): number | null {
  if (!metadata || typeof metadata !== 'object') return null
  const stock = (metadata as Record<string, unknown>).stock
  return Number.isFinite(Number(stock)) ? Number(stock) : null
}

// ── Audit del producto: alta y ediciones manuales de stock ──────────────────
export type AuditoriaProducto = { id: string; action: string; createdAt: Date; metadata: unknown; user: { name: string } | null }

export function eventosDeProducto(auditorias: AuditoriaProducto[]): KardexEvento[] {
  const eventos: KardexEvento[] = []
  for (const auditoria of auditorias) {
    const metadata = (auditoria.metadata && typeof auditoria.metadata === 'object' ? auditoria.metadata : {}) as Record<string, unknown>
    if (auditoria.action === 'PRODUCT_CREATED') {
      const stock = numero(metadata.stock)
      if (!stock) continue
      eventos.push({
        id: `alta-${auditoria.id}`, at: auditoria.createdAt, kind: 'ALTA',
        label: 'Alta del producto', detail: `Stock inicial: ${unid(stock)}`,
        reference: null, user: auditoria.user?.name ?? null, delta: stock,
      })
      continue
    }
    if (auditoria.action === 'PRODUCT_UPDATED' && metadata.stockBefore !== undefined) {
      const antes = numero(metadata.stockBefore)
      const despues = numero(metadata.stock)
      const delta = despues - antes
      if (!delta) continue
      eventos.push({
        id: `ajuste-${auditoria.id}`, at: auditoria.createdAt, kind: 'AJUSTE',
        label: 'Ajuste manual de stock', detail: `${antes} → ${despues}`,
        reference: null, user: auditoria.user?.name ?? null, delta,
      })
    }
  }
  return eventos
}

// ── Compras recibidas ───────────────────────────────────────────────────────
export type CompraKardex = {
  id: string
  receivedQty: number
  lotReference: string | null
  unitCostPyg: number
  finalUnitCostPyg: number
  purchase: { id: string; supplierName: string; status: string; createdAt: Date; receivedAt: Date | null; createdBy: { name: string } | null }
}

export function eventosDeCompras(lineas: CompraKardex[], opciones: { costos?: boolean } = {}): KardexEvento[] {
  const eventos: KardexEvento[] = []
  for (const linea of lineas) {
    const cantidad = numero(linea.receivedQty)
    if (cantidad <= 0) continue
    const parcial = linea.purchase.status === 'PARTIAL'
    const costo = numero(linea.finalUnitCostPyg) || numero(linea.unitCostPyg)
    eventos.push({
      id: `compra-${linea.id}`,
      at: linea.purchase.receivedAt ?? linea.purchase.createdAt,
      kind: 'COMPRA',
      label: parcial ? 'Recepción parcial de compra' : 'Compra recibida',
      detail: unir(parcial ? `recibido: ${unid(cantidad)}` : unid(cantidad), linea.purchase.supplierName, linea.lotReference ? `lote ${linea.lotReference}` : null, opciones.costos && costo ? `${gs(costo)} c/u` : null),
      reference: linea.purchase.id,
      user: linea.purchase.createdBy?.name ?? null,
      delta: cantidad,
    })
  }
  return eventos
}

// ── Ventas, entregas de IMEI y restituciones de pedidos ─────────────────────
export type VentaKardex = {
  id: string
  quantity: number
  serials: unknown
  serialsPending: number
  // Unidades sin serial vendidas sobre pedido: tampoco descontaron stock.
  stockPending: number
  unitPricePyg: number
  order: { id: string; orderNumber: string; status: string; createdAt: Date; customer: { name: string } | null; seller: { name: string } | null }
}
export type AdjuntoSerialKardex = { itemId: string; at: Date; cantidad: number; user: string | null }
export type RestitucionKardex = { orderId: string; at: Date; action: string; restock: string | null; reference: string | null; user: string | null }

const serialesDe = (valor: unknown): string[] => Array.isArray(valor) ? valor.filter((serial): serial is string => typeof serial === 'string') : []

// Una restitución existe cuando el pedido se anuló o se registró una devolución
// con reposición. La cantidad se reconstruye con la misma regla de la ruta: las
// unidades serializadas vuelven al stock solo si entran a disponible y los
// productos sin unidades lo hacen por cantidad. Queda marcada como estimada
// porque el flujo real no guarda el detalle por producto.
function deltaDeRestitucion(item: VentaKardex, restock: string | null): number {
  const seriales = serialesDe(item.serials)
  if (restock === 'NONE') return 0
  if (seriales.length) return restock === 'AVAILABLE' ? seriales.length : 0
  return numero(item.serialsPending) === 0 && numero(item.stockPending) === 0 ? numero(item.quantity) : 0
}

export function eventosDeVentas(items: VentaKardex[], adjuntosPorItem: Map<string, AdjuntoSerialKardex[]>, restitucionesPorPedido: Map<string, RestitucionKardex[]>, opciones: { precios?: boolean } = {}): KardexEvento[] {
  const eventos: KardexEvento[] = []
  for (const item of items) {
    const cantidad = numero(item.quantity)
    if (cantidad <= 0) continue
    const adjuntos = adjuntosPorItem.get(item.id) ?? []
    const adjuntado = adjuntos.reduce((suma, adjunto) => suma + numero(adjunto.cantidad), 0)
    // Lo que salió al crear el pedido: el total ya salido menos lo que se
    // entregó después (los IMEI que se adjuntan descuentan stock al asignarse).
    const inicial = Math.max(0, cantidad - numero(item.serialsPending) - numero(item.stockPending) - adjuntado)
    const cliente = item.order.customer?.name ?? 'Consumidor final'
    if (inicial > 0) {
      eventos.push({
        id: `venta-${item.id}`, at: item.order.createdAt, kind: 'VENTA',
        label: `Venta ${item.order.orderNumber}`,
        detail: unir(cliente, unid(inicial), opciones.precios ? gs(item.unitPricePyg) : null, item.order.seller?.name ? `vendió ${item.order.seller.name}` : null),
        reference: item.order.id, user: item.order.seller?.name ?? null, delta: -inicial,
      })
    }
    for (const adjunto of adjuntos) {
      if (!adjunto.cantidad) continue
      eventos.push({
        id: `entrega-${item.id}-${adjunto.at.getTime()}-${adjunto.cantidad}`, at: adjunto.at, kind: 'VENTA',
        label: `Entrega de IMEI · ${item.order.orderNumber}`,
        detail: unir(cliente, unid(adjunto.cantidad)),
        reference: item.order.id, user: adjunto.user, delta: -adjunto.cantidad,
      })
    }
    for (const restitucion of restitucionesPorPedido.get(item.order.id) ?? []) {
      const anulacion = restitucion.action === 'ORDER_VOIDED' || restitucion.action === 'ORDER_CANCELLED'
      const delta = deltaDeRestitucion(item, anulacion ? 'AVAILABLE' : restitucion.restock)
      if (!delta) continue
      eventos.push({
        id: `devolucion-${item.id}-${restitucion.at.getTime()}`, at: restitucion.at, kind: 'DEVOLUCION',
        label: anulacion ? `Anulación de pedido ${item.order.orderNumber}` : `Devolución de ${item.order.orderNumber}`,
        detail: unir(cliente, unid(delta), anulacion ? null : 'restituido al stock'),
        reference: restitucion.reference ?? item.order.id, user: restitucion.user, delta, estimated: true,
      })
    }
  }
  return eventos
}

// ── Transferencias entre sucursales ─────────────────────────────────────────
export type TransferenciaKardex = {
  id: string
  quantity: number
  serials: unknown
  sourceProductId: string
  destinationProductId: string
  transfer: { id: string; createdAt: Date; receivedAt: Date | null; sourceBranch: { name: string } | null; destinationBranch: { name: string } | null }
}

export function eventosDeTransferencias(lineas: TransferenciaKardex[], productId: string): KardexEvento[] {
  const eventos: KardexEvento[] = []
  for (const linea of lineas) {
    const cantidad = numero(linea.quantity)
    if (cantidad <= 0) continue
    const ruta = unir(linea.transfer.sourceBranch?.name, linea.transfer.destinationBranch?.name ? `→ ${linea.transfer.destinationBranch.name}` : null)
    if (linea.sourceProductId === productId) {
      eventos.push({
        id: `transferencia-envio-${linea.id}`, at: linea.transfer.createdAt, kind: 'TRANSFERENCIA',
        label: 'Transferencia enviada', detail: unir(unid(cantidad), ruta),
        reference: linea.transfer.id, user: null, delta: -cantidad,
      })
    }
    if (linea.destinationProductId === productId) {
      // Serializada: el stock de destino recién suma con la recepción física.
      const seriales = serialesDe(linea.serials)
      if (seriales.length && !linea.transfer.receivedAt) continue
      eventos.push({
        id: `transferencia-recibo-${linea.id}`, at: linea.transfer.receivedAt ?? linea.transfer.createdAt, kind: 'TRANSFERENCIA',
        label: 'Transferencia recibida', detail: unir(unid(cantidad), ruta, seriales.length ? 'con IMEI' : null),
        reference: linea.transfer.id, user: null, delta: cantidad,
      })
    }
  }
  return eventos
}

// ── Devoluciones al proveedor ───────────────────────────────────────────────
export type DevolucionProveedorKardex = {
  id: string
  quantity: number
  unitCostPyg: number
  purchaseReturn: { id: string; createdAt: Date; reason: string; purchase: { supplierName: string } }
}

export function eventosDeDevolucionesProveedor(lineas: DevolucionProveedorKardex[], opciones: { costos?: boolean } = {}): KardexEvento[] {
  const eventos: KardexEvento[] = []
  for (const linea of lineas) {
    const cantidad = numero(linea.quantity)
    if (cantidad <= 0) continue
    eventos.push({
      id: `devolucion-proveedor-${linea.id}`, at: linea.purchaseReturn.createdAt, kind: 'DEVOLUCION',
      label: 'Devolución al proveedor',
      detail: unir(unid(cantidad), linea.purchaseReturn.purchase.supplierName, linea.purchaseReturn.reason, opciones.costos ? `${gs(linea.unitCostPyg)} c/u` : null),
      reference: linea.purchaseReturn.id, user: null, delta: -cantidad,
    })
  }
  return eventos
}

// ── Altas, bajas y restauraciones de unidades físicas ───────────────────────
export type AuditoriaUnidad = { id: string; entityId: string | null; action: string; createdAt: Date; metadata: unknown; user: { name: string } | null }

export function eventosDeUnidades(auditorias: AuditoriaUnidad[]): KardexEvento[] {
  const eventos: KardexEvento[] = []
  for (const auditoria of auditorias) {
    const metadata = (auditoria.metadata && typeof auditoria.metadata === 'object' ? auditoria.metadata : {}) as Record<string, unknown>
    const serial = typeof metadata.serial === 'string' ? metadata.serial : null
    const detalleSerial = serial ? `IMEI ${serial}` : null
    if (auditoria.action === 'INVENTORY_UNIT_RECEIVED') {
      eventos.push({ id: `unidad-alta-${auditoria.id}`, at: auditoria.createdAt, kind: 'AJUSTE', label: 'Unidad recibida', detail: unir(detalleSerial, 'ingresa al stock'), reference: auditoria.entityId, user: auditoria.user?.name ?? null, delta: 1 })
    } else if (auditoria.action === 'INVENTORY_REMOVED') {
      eventos.push({ id: `unidad-baja-${auditoria.id}`, at: auditoria.createdAt, kind: 'AJUSTE', label: 'Unidad dada de baja', detail: unir(detalleSerial, typeof metadata.reason === 'string' ? metadata.reason : null), reference: auditoria.entityId, user: auditoria.user?.name ?? null, delta: -1 })
    } else if (auditoria.action === 'INVENTORY_RESTORED') {
      eventos.push({ id: `unidad-restaurada-${auditoria.id}`, at: auditoria.createdAt, kind: 'AJUSTE', label: 'Unidad restaurada', detail: unir(detalleSerial, 'vuelve a disponible'), reference: auditoria.entityId, user: auditoria.user?.name ?? null, delta: 1 })
    }
  }
  return eventos
}

export const KARDEX_MOVIMIENTO_LABEL: Record<KardexKind, string> = {
  ALTA: 'Alta',
  COMPRA: 'Compra',
  VENTA: 'Venta',
  TRANSFERENCIA: 'Transferencia',
  DEVOLUCION: 'Devolución',
  AJUSTE: 'Ajuste',
}
