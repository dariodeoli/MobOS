import assert from 'node:assert/strict'
import test from 'node:test'
import { ajustesSobrePedido, estadoDelPedido, estadoSobrePedido, siguientePaso, textoPublicoSobrePedido, pedidoEntregado } from '../lib/backorder-status'
import { costoAlAsignarSerial, costoPonderado, decidirCostoDeLinea, propagarCostoAVentas, revertirCostoDeVentas } from '../lib/supply-costs'
import { planRecepcionRapida, recibirRapido, RecepcionRapidaError } from '../lib/supply-quick-receive'
import { asignarCuentaDePago, marcarCompraPagada, modoDePago, PagoCompraError } from '../lib/supply-payments'
import { puedeFinanzas, saldoDeCuenta } from '../lib/supplier-payables'
import { eventosDeRecepcionRapida, eventosDeVentas } from '../lib/kardex'

// ── Estado de lo vendido sin stock ─────────────────────────────────────────
test('estadoSobrePedido recorre pendiente → comprado → en camino → llegó → entregado', () => {
  assert.equal(estadoSobrePedido({ stockPending: 0, serialsPending: 0 }), null, 'una venta común no tiene estado')
  assert.equal(estadoSobrePedido({ stockPending: 2, need: { status: 'ABIERTA', quantity: 2 } }), 'PENDIENTE_COMPRA')
  assert.equal(estadoSobrePedido({ stockPending: 2, need: { status: 'ASIGNADA', quantity: 2 } }), 'PENDIENTE_COMPRA')
  assert.equal(estadoSobrePedido({ stockPending: 2 }), 'PENDIENTE_COMPRA', 'sin necesidad todavía')
  assert.equal(estadoSobrePedido({ stockPending: 2, need: { status: 'COMPRADA', quantity: 0 } }), 'COMPRADO')
  assert.equal(estadoSobrePedido({ stockPending: 2, need: { status: 'COMPRADA', quantity: 0 }, shipmentStatus: 'EN_TRANSITO' }), 'EN_CAMINO')
  assert.equal(estadoSobrePedido({ stockPending: 2, need: { status: 'COMPRADA', quantity: 0 }, shipmentStatus: 'PREPARADO' }), 'COMPRADO')
  assert.equal(estadoSobrePedido({ stockPending: 0, backorderArrivedAt: new Date(), need: { status: 'RECIBIDA', quantity: 0 } }), 'LLEGO')
  assert.equal(estadoSobrePedido({ stockPending: 0, serialsPending: 1, need: { status: 'RECIBIDA', quantity: 0, arrivedAt: new Date() } }), 'LLEGO', 'con IMEI pendiente de asignar sigue «llegó»')
  assert.equal(estadoSobrePedido({ stockPending: 0, backorderArrivedAt: new Date(), need: { status: 'RECIBIDA', quantity: 0 }, entregado: true }), 'ENTREGADO')
})

test('compra parcial: lo que falta comprar atrasa a la línea', () => {
  assert.equal(estadoSobrePedido({ stockPending: 3, need: { status: 'ABIERTA', quantity: 1 } }), 'PENDIENTE_COMPRA')
  assert.equal(estadoSobrePedido({ stockPending: 3, need: { status: 'COMPRADA', quantity: 1 }, shipmentStatus: 'EN_TRANSITO' }), 'PENDIENTE_COMPRA')
  assert.equal(estadoSobrePedido({ stockPending: 3, need: { status: 'CANCELADA', quantity: 0 } }), 'PENDIENTE_COMPRA')
})

test('estadoDelPedido toma la línea más atrasada y descarta las comunes', () => {
  assert.equal(estadoDelPedido([null, null]), null)
  assert.equal(estadoDelPedido([null, 'LLEGO', 'COMPRADO']), 'COMPRADO')
  assert.equal(estadoDelPedido(['ENTREGADO', 'LLEGO']), 'LLEGO')
  assert.equal(estadoDelPedido(['EN_CAMINO', 'PENDIENTE_COMPRA']), 'PENDIENTE_COMPRA')
  assert.equal(pedidoEntregado('PICKED_UP'), true)
  assert.equal(pedidoEntregado('PROCESSING'), false)
})

test('textos para el cliente: sobre pedido con fecha, en camino, listo y entregado', () => {
  const fecha = new Date('2026-10-30T12:00:00Z')
  assert.equal(textoPublicoSobrePedido('PENDIENTE_COMPRA', { fechaPrometida: fecha })?.titulo, 'Sobre pedido · llega aprox. 30/10')
  assert.equal(textoPublicoSobrePedido('COMPRADO', { fechaPrometida: fecha, mostrarFecha: false })?.titulo, 'Sobre pedido')
  assert.equal(textoPublicoSobrePedido('EN_CAMINO')?.titulo, 'En camino')
  assert.equal(textoPublicoSobrePedido('LLEGO')?.titulo, 'Listo para retirar')
  assert.equal(textoPublicoSobrePedido('LLEGO', { entregaADomicilio: true })?.titulo, 'Listo para entregar')
  assert.equal(textoPublicoSobrePedido('ENTREGADO')?.titulo, 'Entregado')
  assert.equal(textoPublicoSobrePedido(null), null)
})

test('una sola acción principal por estado', () => {
  assert.equal(siguientePaso({ estado: 'PENDIENTE_COMPRA' }), 'COMPRAR')
  assert.equal(siguientePaso({ estado: 'COMPRADO', faltaCosto: true }), 'CARGAR_COSTO')
  assert.equal(siguientePaso({ estado: 'COMPRADO', pagado: false }), 'MARCAR_PAGADO')
  assert.equal(siguientePaso({ estado: 'COMPRADO', pagado: true }), 'RECIBIDO')
  assert.equal(siguientePaso({ estado: 'EN_CAMINO', credito: true }), 'RECIBIDO', 'el crédito no obliga a pagar antes de recibir')
  assert.equal(siguientePaso({ estado: 'LLEGO' }), 'AVISAR')
  assert.equal(siguientePaso({ estado: 'LLEGO', avisado: true }), 'ENTREGAR')
  assert.equal(siguientePaso({ estado: 'ENTREGADO' }), null)
})

test('ajustes de la empresa: correo apagado y fecha visible por defecto', () => {
  assert.deepEqual(ajustesSobrePedido(null), { backorderEmailOnArrival: false, backorderShowEtaOnReceipt: true })
  assert.deepEqual(ajustesSobrePedido({ backorderEmailOnArrival: true, backorderShowEtaOnReceipt: false }), { backorderEmailOnArrival: true, backorderShowEtaOnReceipt: false })
})

// ── Costo de la compra a la venta original ─────────────────────────────────
test('costoPonderado promedia las unidades compradas con costo', () => {
  assert.equal(costoPonderado([]), null)
  assert.equal(costoPonderado([{ unidades: 2, unitCostPyg: 1000000 }]), 1000000)
  assert.equal(costoPonderado([{ unidades: 1, unitCostPyg: 1000000 }, { unidades: 2, unitCostPyg: 1300000 }]), 1200000)
  assert.equal(costoPonderado([{ unidades: 1, unitCostPyg: Number.NaN }]), null)
})

test('decidirCostoDeLinea: imputa una vez, no pisa otras fuentes y revierte solo lo de compra', () => {
  const base = { unitCostPyg: null, baseUnitCostPyg: null }
  assert.deepEqual(decidirCostoDeLinea({ costPending: true, costSource: null, ...base, costoCompra: 900000 }), { accion: 'imputar', costoUnitario: 900000 })
  assert.deepEqual(decidirCostoDeLinea({ costPending: false, costSource: 'PURCHASE', unitCostPyg: 900000, baseUnitCostPyg: 900000, costoCompra: 900000 }), { accion: 'sin_cambio' })
  assert.deepEqual(decidirCostoDeLinea({ costPending: false, costSource: 'PURCHASE', unitCostPyg: 900000, baseUnitCostPyg: 900000, costoCompra: 950000 }), { accion: 'imputar', costoUnitario: 950000 })
  assert.deepEqual(decidirCostoDeLinea({ costPending: false, costSource: null, unitCostPyg: 800000, baseUnitCostPyg: 800000, costoCompra: 900000 }), { accion: 'omitir' }, 'costo del producto al vender: no se toca')
  assert.deepEqual(decidirCostoDeLinea({ costPending: false, costSource: 'SERIAL', unitCostPyg: 800000, baseUnitCostPyg: 800000, costoCompra: 900000 }), { accion: 'omitir' })
  assert.deepEqual(decidirCostoDeLinea({ costPending: false, costSource: 'PURCHASE', unitCostPyg: 900000, baseUnitCostPyg: 900000, costoCompra: null }), { accion: 'revertir' })
  assert.deepEqual(decidirCostoDeLinea({ costPending: true, costSource: null, ...base, costoCompra: null }), { accion: 'omitir' })
})

test('un IMEI posterior con otro costo no pisa el costo de compra: se audita', () => {
  assert.deepEqual(costoAlAsignarSerial({ linea: { costSource: 'PURCHASE', costPending: false, baseUnitCostPyg: 900000 }, costoSerial: 950000 }), { accion: 'auditar_diferencia' })
  assert.deepEqual(costoAlAsignarSerial({ linea: { costSource: 'PURCHASE', costPending: false, baseUnitCostPyg: 900000 }, costoSerial: 900000 }), { accion: 'conservar' })
  assert.deepEqual(costoAlAsignarSerial({ linea: { costSource: null, costPending: true, baseUnitCostPyg: null }, costoSerial: 950000 }), { accion: 'completar', costSource: 'SERIAL' })
  assert.deepEqual(costoAlAsignarSerial({ linea: { costSource: null, costPending: true, baseUnitCostPyg: null }, costoSerial: null }), { accion: 'nada' })
})

// ── Base en memoria mínima para las transacciones ──────────────────────────
type Fila = Record<string, any>
function coincide(fila: Fila, where: Fila = {}): boolean {
  return Object.entries(where).every(([clave, valor]) => {
    if (clave === 'OR') return (valor as Fila[]).some((opcion) => coincide(fila, opcion))
    if (valor && typeof valor === 'object' && !(valor instanceof Date)) {
      if ('in' in valor) return (valor as any).in.includes(fila[clave])
      if ('not' in valor) return (valor as any).not === null ? fila[clave] !== null && fila[clave] !== undefined : fila[clave] !== (valor as any).not
      if ('gte' in valor) return fila[clave] >= (valor as any).gte
      if ('gt' in valor) return fila[clave] > (valor as any).gt
      if ('is' in valor) return fila[clave] !== undefined
    }
    return fila[clave] === valor
  })
}
function tabla(nombre: string, filas: Fila[]) {
  return {
    findFirst: async ({ where }: any) => { const fila = filas.find((candidata) => coincide(candidata, where)); return fila ? { ...fila } : null },
    findMany: async ({ where }: any = {}) => filas.filter((fila) => coincide(fila, where)),
    update: async ({ where, data }: any) => {
      const fila = filas.find((candidata) => candidata.id === where.id)!
      for (const [clave, valor] of Object.entries(data)) {
        if (valor && typeof valor === 'object' && 'increment' in (valor as any)) fila[clave] = Number(fila[clave]) + Number((valor as any).increment)
        else if (valor && typeof valor === 'object' && 'decrement' in (valor as any)) fila[clave] = Number(fila[clave]) - Number((valor as any).decrement)
        else fila[clave] = valor
      }
      return fila
    },
    updateMany: async ({ where, data }: any) => {
      const objetivo = filas.filter((fila) => coincide(fila, where))
      for (const fila of objetivo) {
        for (const [clave, valor] of Object.entries(data)) {
          if (valor && typeof valor === 'object' && 'decrement' in (valor as any)) fila[clave] = Number(fila[clave]) - Number((valor as any).decrement)
          else fila[clave] = valor
        }
      }
      return { count: objetivo.length }
    },
    create: async ({ data }: any) => {
      if (nombre === 'cashMovement' && data.idempotencyKey && filas.some((fila) => fila.tenantId === data.tenantId && fila.idempotencyKey === data.idempotencyKey)) {
        throw Object.assign(new Error('unique'), { code: 'P2002' })
      }
      const fila = { id: `${nombre}-${filas.length + 1}`, ...data }
      filas.push(fila)
      return fila
    },
  }
}

function mundo() {
  const datos = {
    supplyPurchase: [{ id: 'c1', tenantId: 't', code: 'CDE-0001', status: 'COMPRADA', paidAt: null, paymentCondition: 'CONTADO', supplierName: 'Prov', branchId: null, costPyg: 2000000 }] as Fila[],
    supplierPayable: [{ id: 'p1', tenantId: 't', supplyPurchaseId: 'c1', amountPyg: 2000000, paidPyg: 0, consumedPyg: 0, condition: 'CONTADO', supplierName: 'Prov', concept: 'Compra CDE-0001', reference: 'CDE-0001', branchId: null }] as Fila[],
    paymentAccount: [{ id: 'cta', tenantId: 't', isActive: true }] as Fila[],
    cashMovement: [] as Fila[],
    auditLog: [] as Fila[],
    supplyNeed: [{ id: 'n1', tenantId: 't', orderId: 'o1', orderItemId: 'i1', productId: 'prod', status: 'COMPRADA', quantity: 0, receivedQty: 0, arrivedAt: null, purchaseId: 'c1' }] as Fila[],
    orderItem: [{ id: 'i1', orderId: 'o1', order: { tenantId: 't' }, tenantId: 't', stockPending: 2, serialsPending: 0, costPending: true, costSource: null, unitCostPyg: null, baseUnitCostPyg: null, insurancePyg: 0, extraCostPyg: 0, backorderArrivedAt: null }] as Fila[],
    supplyPurchaseLine: [{ id: 'l1', tenantId: 't', purchaseId: 'c1', needId: 'n1', quantity: 2, coveredQuantity: 2, unitCostPyg: 1000000, need: { orderItemId: 'i1' }, purchase: { status: 'COMPRADA', costPyg: 2000000, lines: [{ quantity: 2 }] } }] as Fila[],
  }
  const tx = {
    supplyPurchase: tabla('supplyPurchase', datos.supplyPurchase),
    supplierPayable: tabla('supplierPayable', datos.supplierPayable),
    paymentAccount: tabla('paymentAccount', datos.paymentAccount),
    cashMovement: tabla('cashMovement', datos.cashMovement),
    auditLog: tabla('auditLog', datos.auditLog),
    supplyNeed: tabla('supplyNeed', datos.supplyNeed),
    orderItem: tabla('orderItem', datos.orderItem),
    supplyPurchaseLine: tabla('supplyPurchaseLine', datos.supplyPurchaseLine),
  }
  // `orderItem.findFirst` con `order: { tenantId }` y `supplyPurchaseLine` con relaciones anidadas se resuelven con los campos planos de arriba.
  const original = tx.orderItem.findFirst
  tx.orderItem.findFirst = async ({ where }: any) => original({ where: { id: where.id } })
  const lineas = tx.supplyPurchaseLine.findMany
  tx.supplyPurchaseLine.findMany = async ({ where }: any) => {
    const filtro: Fila = { tenantId: where.tenantId }
    if (where.purchaseId) filtro.purchaseId = where.purchaseId
    if (where.needId) filtro.needId = where.needId
    let filas = await lineas({ where: filtro })
    if (where.need?.is?.orderItemId) filas = filas.filter((fila) => fila.need?.orderItemId === where.need.is.orderItemId)
    if (where.purchase?.is?.status?.not) filas = filas.filter((fila) => fila.purchase.status !== where.purchase.is.status.not)
    if (where.unitCostPyg?.not === null) filas = filas.filter((fila) => fila.unitCostPyg !== null)
    return filas
  }
  const needFind = tx.supplyNeed.findMany
  tx.supplyNeed.findMany = async ({ where }: any) => (await needFind({ where: { tenantId: where.tenantId } })).filter((fila) => (where.id?.in ? where.id.in.includes(fila.id) : true) && fila.orderItemId)
  return { datos, tx: tx as any }
}

// ── Propagación del costo ──────────────────────────────────────────────────
test('propagarCostoAVentas imputa el costo una sola vez (idempotente)', async () => {
  const { datos, tx } = mundo()
  const primera = await propagarCostoAVentas(tx, 'c1', { tenantId: 't', userId: 'u' })
  assert.equal(primera.imputadas, 1)
  assert.equal(datos.orderItem[0].unitCostPyg, BigInt(1000000))
  assert.equal(datos.orderItem[0].costSource, 'PURCHASE')
  assert.equal(datos.orderItem[0].costPending, false)
  const auditorias = datos.auditLog.length
  const segunda = await propagarCostoAVentas(tx, 'c1', { tenantId: 't', userId: 'u' })
  assert.equal(segunda.imputadas, 0, 'la segunda corrida no cambia nada')
  assert.equal(datos.auditLog.length, auditorias, 'ni duplica la auditoría')
})

test('compra parcial: el costo es el promedio de las unidades compradas y se ajusta con la segunda compra', async () => {
  const { datos, tx } = mundo()
  datos.supplyPurchaseLine[0].quantity = 1
  datos.supplyPurchaseLine[0].coveredQuantity = 1
  await propagarCostoAVentas(tx, 'c1', { tenantId: 't', userId: 'u' })
  assert.equal(datos.orderItem[0].unitCostPyg, BigInt(1000000))
  datos.supplyPurchaseLine.push({ id: 'l2', tenantId: 't', purchaseId: 'c2', needId: 'n1', quantity: 1, coveredQuantity: 1, unitCostPyg: 1200000, need: { orderItemId: 'i1' }, purchase: { status: 'COMPRADA', costPyg: 1200000, lines: [{ quantity: 1 }] } })
  const resultado = await propagarCostoAVentas(tx, 'c1', { tenantId: 't', userId: 'u' })
  assert.equal(resultado.imputadas, 1)
  assert.equal(datos.orderItem[0].unitCostPyg, BigInt(1100000))
})

test('cancelar la compra devuelve el costo pendiente solo si venía de la compra', async () => {
  const { datos, tx } = mundo()
  await propagarCostoAVentas(tx, 'c1', { tenantId: 't', userId: 'u' })
  datos.supplyPurchase[0].status = 'CANCELADA'
  datos.supplyPurchaseLine[0].purchase.status = 'CANCELADA'
  const revertido = await revertirCostoDeVentas(tx, 'c1', { tenantId: 't', userId: 'u' })
  assert.equal(revertido.revertidas, 1)
  assert.equal(datos.orderItem[0].costPending, true)
  assert.equal(datos.orderItem[0].unitCostPyg, null)
  assert.equal(datos.orderItem[0].costSource, null)
  // Un costo que vino del producto al vender no se toca aunque se cancele una compra.
  const otro = mundo()
  otro.datos.orderItem[0].costPending = false
  otro.datos.orderItem[0].unitCostPyg = BigInt(700000)
  otro.datos.supplyPurchaseLine[0].purchase.status = 'CANCELADA'
  const intacto = await revertirCostoDeVentas(otro.tx, 'c1', { tenantId: 't', userId: 'u' })
  assert.equal(intacto.revertidas, 0)
  assert.equal(otro.datos.orderItem[0].unitCostPyg, BigInt(700000))
})

test('si la factura trae solo el total, el costo por unidad sale del total repartido', async () => {
  const { datos, tx } = mundo()
  datos.supplyPurchaseLine[0].unitCostPyg = null
  datos.supplyPurchaseLine[0].purchase = { status: 'COMPRADA', costPyg: 3000000, lines: [{ quantity: 2 }, { quantity: 1 }] }
  await propagarCostoAVentas(tx, 'c1', { tenantId: 't', userId: 'u' })
  assert.equal(datos.orderItem[0].unitCostPyg, BigInt(1000000))
})

// ── Recibido rápido ────────────────────────────────────────────────────────
test('planRecepcionRapida pone tope en lo pendiente y en lo comprado', () => {
  assert.deepEqual(planRecepcionRapida({ cantidad: 5, stockPending: 3, comprada: 3, recibida: 0 }), { aplicar: 3, tope: 3, porRecibir: 3 })
  assert.equal(planRecepcionRapida({ cantidad: 1, stockPending: 3, comprada: 3, recibida: 0 }).aplicar, 1)
  assert.equal(planRecepcionRapida({ cantidad: 9, stockPending: 4, comprada: 2, recibida: 1 }).aplicar, 1, 'solo lo comprado que falta llegar')
  assert.throws(() => planRecepcionRapida({ cantidad: 0, stockPending: 3, comprada: 3, recibida: 0 }), (e: any) => e instanceof RecepcionRapidaError && e.status === 400)
  assert.throws(() => planRecepcionRapida({ cantidad: 1, stockPending: 0, comprada: 3, recibida: 0 }), /ya no tiene unidades pendientes/)
  assert.throws(() => planRecepcionRapida({ cantidad: 1, stockPending: 3, comprada: 0, recibida: 0 }), /Primero registrá la compra/)
  assert.throws(() => planRecepcionRapida({ cantidad: 1, stockPending: 0, serialsPending: 1, comprada: 1, recibida: 0 }), /lleva IMEI/)
})

test('recibirRapido baja stockPending con tope 0, marca la llegada y deja el kardex en cero', async () => {
  const { datos, tx } = mundo()
  const parcial = await recibirRapido(tx, { tenantId: 't', userId: 'u', needId: 'n1', quantity: 1 })
  assert.deepEqual([parcial.aplicadas, parcial.restantes, parcial.llegoTodo], [1, 1, false])
  assert.equal(datos.orderItem[0].stockPending, 1)
  assert.equal(datos.supplyNeed[0].status, 'COMPRADA')
  const resto = await recibirRapido(tx, { tenantId: 't', userId: 'u', needId: 'n1', quantity: 5 })
  assert.deepEqual([resto.aplicadas, resto.restantes, resto.llegoTodo], [1, 0, true])
  assert.equal(datos.orderItem[0].stockPending, 0, 'nunca baja de 0')
  assert.ok(datos.orderItem[0].backorderArrivedAt)
  assert.equal(datos.supplyNeed[0].status, 'RECIBIDA')
  assert.ok(datos.supplyNeed[0].arrivedAt)
  await assert.rejects(() => recibirRapido(tx, { tenantId: 't', userId: 'u', needId: 'n1', quantity: 1 }), /ya no tiene unidades pendientes/)
  // Kardex: entrada y salida del mismo monto, neto cero.
  const recepciones = datos.auditLog.filter((fila) => fila.action === 'SUPPLY_QUICK_RECEIVED')
  assert.equal(recepciones.length, 2)
  const entradas = eventosDeRecepcionRapida(recepciones.map((fila, i) => ({ orderId: 'o1', at: new Date(2026, 9, 23, 10, i), cantidad: fila.metadata.quantity, user: 'U', orderNumber: 'MOB-1' })))
  const salidas = eventosDeVentas(
    [{ id: 'i1', quantity: 2, serials: [], serialsPending: 0, stockPending: 0, unitPricePyg: 1500000, order: { id: 'o1', orderNumber: 'MOB-1', status: 'COMPLETED', createdAt: new Date(2026, 9, 20), customer: null, seller: null } }],
    new Map([['i1', recepciones.map((fila, i) => ({ itemId: 'i1', at: new Date(2026, 9, 23, 10, i), cantidad: fila.metadata.quantity, user: 'U', etiqueta: 'Entrega de lo recibido' }))]]),
    new Map(),
  )
  const neto = [...entradas, ...salidas].reduce((suma, evento) => suma + evento.delta, 0)
  assert.equal(neto, 0)
  assert.ok(entradas.every((evento) => evento.delta > 0) && salidas.every((evento) => evento.delta < 0))
})

test('recibirRapido rechaza un equipo con IMEI y una necesidad sin compra', async () => {
  const conImei = mundo()
  conImei.datos.orderItem[0].stockPending = 0
  conImei.datos.orderItem[0].serialsPending = 2
  await assert.rejects(() => recibirRapido(conImei.tx, { tenantId: 't', userId: 'u', needId: 'n1', quantity: 1 }), /lleva IMEI/)
  const sinCompra = mundo()
  sinCompra.datos.supplyPurchaseLine.length = 0
  await assert.rejects(() => recibirRapido(sinCompra.tx, { tenantId: 't', userId: 'u', needId: 'n1', quantity: 1 }), /Primero registrá la compra/)
})

// ── Pago al proveedor ──────────────────────────────────────────────────────
test('contado pide la cuenta: Finanzas sin cuenta es 400 y sin Finanzas con cuenta es 403', () => {
  assert.throws(() => modoDePago({ finanzas: true, accountId: '' }), (e: any) => e instanceof PagoCompraError && e.status === 400)
  assert.throws(() => modoDePago({ finanzas: false, accountId: 'cta' }), (e: any) => e instanceof PagoCompraError && e.status === 403)
  assert.equal(modoDePago({ finanzas: true, accountId: 'cta' }), 'CON_CUENTA')
  assert.equal(modoDePago({ finanzas: false }), 'SIN_CUENTA')
  assert.equal(puedeFinanzas(['stock:manage']), false)
  assert.equal(puedeFinanzas(['cash:manage']), true)
  assert.equal(puedeFinanzas(['*']), true)
})

test('markPaid con cuenta crea la salida de caja por el monto completo, una sola vez', async () => {
  const { datos, tx } = mundo()
  const pago = await marcarCompraPagada(tx, { tenantId: 't', purchaseId: 'c1', userId: 'u', accountId: 'cta', finanzas: true })
  assert.equal(pago.pagadoPyg, 2000000)
  assert.equal(pago.conCuenta, true)
  assert.equal(datos.cashMovement.length, 1)
  assert.equal(datos.cashMovement[0].direction, 'OUT')
  assert.equal(datos.cashMovement[0].amountPyg, 2000000)
  assert.equal(datos.cashMovement[0].idempotencyKey, 'supply-purchase-paid:c1')
  assert.equal(datos.supplierPayable[0].paidPyg, 2000000)
  assert.ok(datos.supplyPurchase[0].paidAt)
  assert.equal(datos.supplyPurchase[0].paymentPendingAccount, false)
  assert.equal(saldoDeCuenta(datos.supplierPayable[0] as any), 0)
  await assert.rejects(() => marcarCompraPagada(tx, { tenantId: 't', purchaseId: 'c1', userId: 'u', accountId: 'cta', finanzas: true }), /ya está pagada/)
  assert.equal(datos.cashMovement.length, 1, 'sin doble pago')
  assert.equal(datos.supplierPayable[0].paidPyg, 2000000)
})

test('markPaid sin permiso de Finanzas queda «ya pagado» sin cuenta y Finanzas la asigna sin doble salida', async () => {
  const { datos, tx } = mundo()
  const pago = await marcarCompraPagada(tx, { tenantId: 't', purchaseId: 'c1', userId: 'enc', finanzas: false })
  assert.equal(pago.conCuenta, false)
  assert.equal(pago.pendienteDeCuenta, true)
  assert.equal(datos.cashMovement.length, 0, 'todavía no hay salida de caja')
  assert.equal(datos.supplierPayable[0].paidPyg, 2000000)
  assert.equal(datos.supplyPurchase[0].paymentPendingAccount, true)
  const asignada = await asignarCuentaDePago(tx, { tenantId: 't', userId: 'fin', purchaseId: 'c1', accountId: 'cta' })
  assert.equal(asignada.amountPyg, 2000000)
  assert.equal(datos.cashMovement.length, 1)
  assert.equal(datos.supplierPayable[0].paidPyg, 2000000, 'asignar la cuenta no vuelve a sumar al pagado')
  assert.equal(datos.supplyPurchase[0].paymentPendingAccount, false)
  await assert.rejects(() => asignarCuentaDePago(tx, { tenantId: 't', userId: 'fin', purchaseId: 'c1', accountId: 'cta' }), /no está pendiente de cuenta/)
  assert.equal(datos.cashMovement.length, 1)
})

test('markPaid exige el costo cargado y no paga una compra cancelada', async () => {
  const sinCosto = mundo()
  sinCosto.datos.supplierPayable.length = 0
  await assert.rejects(() => marcarCompraPagada(sinCosto.tx, { tenantId: 't', purchaseId: 'c1', userId: 'u', accountId: 'cta', finanzas: true }), /Cargá primero el costo/)
  const cancelada = mundo()
  cancelada.datos.supplyPurchase[0].status = 'CANCELADA'
  await assert.rejects(() => marcarCompraPagada(cancelada.tx, { tenantId: 't', purchaseId: 'c1', userId: 'u', accountId: 'cta', finanzas: true }), /cancelada/)
  const cuentaInexistente = mundo()
  await assert.rejects(() => marcarCompraPagada(cuentaInexistente.tx, { tenantId: 't', purchaseId: 'c1', userId: 'u', accountId: 'no-existe', finanzas: true }), /cuenta no existe/)
})

test('la clave única de la salida de caja frena un segundo intento aunque el reclamo se salte', async () => {
  const { datos, tx } = mundo()
  await marcarCompraPagada(tx, { tenantId: 't', purchaseId: 'c1', userId: 'u', accountId: 'cta', finanzas: true })
  datos.supplyPurchase[0].paidAt = null
  datos.supplierPayable[0].paidPyg = 0
  await assert.rejects(() => marcarCompraPagada(tx, { tenantId: 't', purchaseId: 'c1', userId: 'u', accountId: 'cta', finanzas: true }), (e: any) => e?.code === 'P2002')
  assert.equal(datos.cashMovement.length, 1)
})
