import assert from 'node:assert/strict'
import { consolidarNecesidades, normalizarNecesidadManual, prioridadMayor } from '../lib/supply'

// ── Prioridad (para consolidar) ─────────────────────────────────────────────
// Los centros de compra no se mezclan (#250 §5): asignar un centro separa el
// grupo consolidado y el destino conserva su centro.
const porCentro = consolidarNecesidades([
  { id: 'k1', productId: 'p9', cantidad: 1, prioridad: 'NORMAL', origen: 'MANUAL' },
  { id: 'k2', productId: 'p9', cantidad: 1, prioridad: 'NORMAL', origen: 'MANUAL', centro: 'USA' },
  { id: 'k3', productId: 'p9', cantidad: 2, prioridad: 'NORMAL', origen: 'MANUAL', centro: 'usa' },
])
assert.equal(porCentro.length, 2, 'sin centro y USA son grupos distintos')
const grupoUsa = porCentro.find((grupo) => grupo.centro === 'USA')!
assert.equal(grupoUsa.cantidad, 3, 'las del mismo centro se suman')
assert.ok(grupoUsa.destinos.every((destino) => destino.centro === 'USA'))
assert.equal(porCentro.find((grupo) => grupo.centro === null)!.cantidad, 1)

// El orden de los destinos pone primero lo comprometido y por promesa más próxima.
const ordenados = consolidarNecesidades([
  { id: 'r1', productId: 'p8', cantidad: 1, prioridad: 'NORMAL', origen: 'BELOW_REORDER', sucursalId: 'b1', sucursal: 'Casa Central' },
  { id: 'r2', productId: 'p8', cantidad: 1, prioridad: 'NORMAL', origen: 'SALE_NO_STOCK', pedidoId: 'o2', pedidoNumero: 'MOB-2', prometidaEl: '2026-10-05T10:00:00.000Z' },
  { id: 'r3', productId: 'p8', cantidad: 1, prioridad: 'NORMAL', origen: 'SALE_NO_STOCK', pedidoId: 'o1', pedidoNumero: 'MOB-1', prometidaEl: '2026-10-01T10:00:00.000Z' },
])
assert.deepEqual(ordenados[0].destinos.map((destino) => destino.pedidoId || 'stock'), ['o1', 'o2', 'stock'])

assert.equal(prioridadMayor('BAJA', 'URGENTE'), 'URGENTE')
assert.equal(prioridadMayor('ALTA', 'NORMAL'), 'ALTA')
assert.equal(prioridadMayor('NORMAL', 'NORMAL'), 'NORMAL')

// ── Consolidación (#250 §5): agrupa iguales, conserva destinos ──────────────
const grupos = consolidarNecesidades([
  { id: 'n1', productId: 'p1', producto: 'iPhone 15', condicion: 'NEW', cantidad: 1, prioridad: 'NORMAL', origen: 'SALE_NO_STOCK', pedidoId: 'o1', pedidoNumero: 'MOB-0048', clienteId: 'c1', cliente: 'Juan Pérez', prometidaEl: '2026-10-02T10:00:00.000Z', sucursalId: 'b1', sucursal: 'Casa Central' },
  { id: 'n2', productId: 'p1', producto: 'iPhone 15', condicion: 'NEW', cantidad: 2, prioridad: 'ALTA', origen: 'RESERVATION_NO_STOCK', pedidoId: 'o2', pedidoNumero: 'MOB-0051', clienteId: 'c2', cliente: 'Lucía F.', prometidaEl: '2026-10-01T10:00:00.000Z', sucursalId: 'b1', sucursal: 'Casa Central' },
  { id: 'n3', productId: 'p1', producto: 'iPhone 15', condicion: 'NEW', cantidad: 3, prioridad: 'NORMAL', origen: 'BELOW_REORDER', sucursalId: 'b1', sucursal: 'Casa Central' },
  { id: 'n4', productId: 'p1', producto: 'iPhone 15', condicion: 'USED', cantidad: 1, prioridad: 'BAJA', origen: 'MANUAL', sucursalId: 'b2', sucursal: 'Villa Morra' },
])
assert.equal(grupos.length, 2, 'no se mezclan condiciones distintas')
const nuevo = grupos.find((grupo) => grupo.condicion === 'NEW')!
assert.equal(nuevo.cantidad, 6, 'suma las cantidades')
assert.equal(nuevo.prioridad, 'ALTA', 'queda la prioridad más alta')
assert.equal(nuevo.prometidaEl, '2026-10-01T10:00:00.000Z', 'queda la fecha prometida más próxima')
assert.deepEqual(nuevo.origenes.sort(), ['BELOW_REORDER', 'RESERVATION_NO_STOCK', 'SALE_NO_STOCK'])
assert.equal(nuevo.destinos.length, 3, 'conserva los destinos (1 pedido A · 2 pedido B · 3 stock)')
const pedidoA = nuevo.destinos.find((destino) => destino.pedidoId === 'o1')!
assert.equal(pedidoA.cantidad, 1)
assert.equal(pedidoA.etiqueta, 'Pedido MOB-0048 · Juan Pérez')
assert.equal(pedidoA.tipo, 'PEDIDO')
const pedidoB = nuevo.destinos.find((destino) => destino.pedidoId === 'o2')!
assert.equal(pedidoB.cantidad, 2)
const reposicion = nuevo.destinos.find((destino) => destino.tipo === 'STOCK')!
assert.equal(reposicion.cantidad, 3)
assert.equal(reposicion.etiqueta, 'Reposición · Casa Central')
assert.deepEqual(nuevo.necesidades.sort(), ['n1', 'n2', 'n3'])

// Los destinos del mismo pedido se fusionan sumando cantidades.
const fusionados = consolidarNecesidades([
  { id: 'm1', productId: 'p2', cantidad: 1, prioridad: 'NORMAL', origen: 'MANUAL', pedidoId: 'o9', pedidoNumero: 'MOB-0099', sucursalId: 'b1' },
  { id: 'm2', productId: 'p2', cantidad: 2, prioridad: 'ALTA', origen: 'SALE_NO_STOCK', pedidoId: 'o9', pedidoNumero: 'MOB-0099', sucursalId: 'b1', prometidaEl: '2026-09-30T09:00:00.000Z' },
])
assert.equal(fusionados.length, 1)
assert.equal(fusionados[0].destinos.length, 1)
assert.equal(fusionados[0].destinos[0].cantidad, 3)
assert.equal(fusionados[0].destinos[0].prometidaEl, '2026-09-30T09:00:00.000Z')

// Orden del panel: primero la prioridad más alta; sin datos no rompe.
assert.equal(consolidarNecesidades([]).length, 0)
assert.equal(consolidarNecesidades([{ id: 'x', productId: '', cantidad: 1, prioridad: 'NORMAL', origen: 'MANUAL' }]).length, 0)
const orden = consolidarNecesidades([
  { id: 'o1', productId: 'p1', cantidad: 1, prioridad: 'BAJA', origen: 'MANUAL' },
  { id: 'o2', productId: 'p2', cantidad: 1, prioridad: 'URGENTE', origen: 'MANUAL' },
  { id: 'o3', productId: 'p3', cantidad: 1, prioridad: 'NORMAL', origen: 'MANUAL', prometidaEl: '2026-09-25T00:00:00.000Z' },
  { id: 'o4', productId: 'p4', cantidad: 1, prioridad: 'NORMAL', origen: 'MANUAL', prometidaEl: '2026-12-01T00:00:00.000Z' },
])
assert.deepEqual(orden.map((grupo) => grupo.productoId), ['p2', 'p3', 'p4', 'p1'])

// ── Carga manual: validaciones ──────────────────────────────────────────────
assert.equal(normalizarNecesidadManual({}).ok, false)
assert.equal(normalizarNecesidadManual({ productId: 'p1', quantity: 0 }).ok, false)
assert.equal(normalizarNecesidadManual({ productId: 'p1', quantity: 2.5 }).ok, false)
assert.equal(normalizarNecesidadManual({ productId: 'p1', quantity: 1, priority: 'YA' }).ok, false)
assert.equal(normalizarNecesidadManual({ productId: 'p1', quantity: 1, condition: 'ROTO' }).ok, false)
assert.equal(normalizarNecesidadManual({ productId: 'p1', quantity: 1, promisedAt: 'nada' }).ok, false)
const manual = normalizarNecesidadManual({ productId: ' p1 ', quantity: 2, condition: 'used', priority: 'urgente', promisedAt: '2026-10-05T12:00:00.000Z', notes: '  Reposición preventiva  ' })
assert.equal(manual.ok, true)
assert.deepEqual(manual.ok && manual.data, { productId: 'p1', branchId: null, quantity: 2, condition: 'USED', priority: 'URGENTE', promisedAt: '2026-10-05T12:00:00.000Z', notes: 'Reposición preventiva' })

// ── Fase 2: compra rápida (#250 §6) ─────────────────────────────────────────
import { codigoCompra, normalizarCompra, normalizarSeriales } from '../lib/supply'

assert.equal(codigoCompra({ origen: 'cde', secuencia: 48 }), 'COM-CDE-0048')
assert.equal(codigoCompra({ origen: 'CDE', destino: 'ASU', secuencia: 21 }), 'COM-CDE-ASU-0021')
assert.equal(codigoCompra({ secuencia: 0 }), 'COM-CDE-0001', 'la secuencia mínima es 1')
assert.equal(codigoCompra({ origen: 'c d e!!', secuencia: 7 }), 'COM-CDE-0007')

// Seriales: texto pegado, mayúsculas, repetidos, Luhn y seriales de producto.
assert.deepEqual(normalizarSeriales('490154203237518, aur-0001\n490154203237518'), { ok: false, error: 'El serial 490154203237518 está repetido en la compra.' })
assert.deepEqual(normalizarSeriales('490154203237518, aur-0001'), { ok: true, seriales: ['490154203237518', 'AUR-0001'] })
assert.equal(normalizarSeriales('490154203237519').ok, false, 'IMEI con dígito control inválido')
assert.equal(normalizarSeriales('xx').ok, false, 'serial demasiado corto')
assert.deepEqual(normalizarSeriales([]), { ok: true, seriales: [] })

// Compra: proveedor, costo/moneda y líneas con IMEI o pendientes.
const compraBase = {
  supplierName: '  Proveedor Test  ',
  currency: 'USD',
  originalCost: 350.5,
  exchangeRatePyg: 7500,
  reference: 'FAC-001-002',
  lines: [{ productId: 'p1', quantity: 2, serials: '490154203237518 490154203237526' }, { productId: 'p2', quantity: 1 }],
}
const normalizada = normalizarCompra(compraBase)
assert.equal(normalizada.ok, true)
if (normalizada.ok) {
  assert.equal(normalizada.data.supplierName, 'Proveedor Test')
  assert.equal(normalizada.data.costPyg, Math.round(350.5 * 7500), 'convierte el total a guaraníes')
  assert.equal(normalizada.data.originalCost, 350.5)
  assert.equal(normalizada.data.lines.length, 2)
  assert.deepEqual(normalizada.data.lines[0].serials, ['490154203237518', '490154203237526'])
  assert.deepEqual(normalizada.data.lines[1].serials, [], 'IMEI pendiente: la línea puede ir sin seriales')
  assert.equal(normalizada.data.code, null, 'sin código se genera después')
}
assert.equal(normalizarCompra({ ...compraBase, supplierName: '', supplierId: null }).ok, false, 'sin proveedor')
assert.equal(normalizarCompra({ ...compraBase, lines: [] }).ok, false, 'sin líneas')
assert.equal(normalizarCompra({ ...compraBase, originalCost: 350.555 }).ok, false, 'USD con más de 2 decimales')
assert.equal(normalizarCompra({ ...compraBase, exchangeRatePyg: undefined }).ok, false, 'USD sin cotización')
assert.equal(normalizarCompra({ ...compraBase, lines: [{ productId: 'p1', quantity: 1, serials: ['a', 'b'] }] }).ok, false, 'más seriales que unidades')
assert.equal(normalizarCompra({ ...compraBase, lines: [{ productId: 'p1', quantity: 1, condition: 'ROTO' }] }).ok, false, 'condición inválida')
assert.equal(normalizarCompra({ ...compraBase, code: 'com' }).ok, false, 'código demasiado corto')
const sinMonto = normalizarCompra({ supplierName: 'Proveedor', lines: [{ productId: 'p1', quantity: 1 }] })
assert.equal(sinMonto.ok && sinMonto.data.costPyg, null, 'la compra puede registrarse sin costo')
const enGs = normalizarCompra({ supplierName: 'Proveedor', currency: 'PYG', originalCost: 1500000, lines: [{ productId: 'p1', quantity: 1, unitCostPyg: 1500000 }] })
assert.equal(enGs.ok && enGs.data.costPyg, 1500000)
assert.equal(enGs.ok && enGs.data.lines[0].unitCostPyg, 1500000)

// FIN (#254): costo por línea en la moneda de la compra y total derivado.
const porLinea = normalizarCompra({ supplierName: 'Proveedor', currency: 'USD', exchangeRatePyg: 7500, lines: [
  { productId: 'p1', quantity: 2, originalUnitCost: 900 },
  { productId: 'p2', quantity: 1, originalUnitCost: 700.5, unitCostPyg: 5000000 },
] })
assert.equal(porLinea.ok, true)
if (porLinea.ok) {
  assert.equal(porLinea.data.lines[0].unitCostPyg, Math.round(900 * 7500), 'la línea convierte su costo en USD')
  assert.equal(porLinea.data.lines[0].originalUnitCost, 900)
  assert.equal(porLinea.data.lines[1].unitCostPyg, 5000000, 'el Gs explícito manda sobre el original')
  assert.equal(porLinea.data.lines[1].originalUnitCost, 700.5)
  assert.equal(porLinea.data.costPyg, Math.round(900 * 7500) * 2 + 5000000, 'sin total explícito, el total es la suma de líneas')
  assert.equal(porLinea.data.originalCost, Number((900 * 2 + 700.5).toFixed(2)), 'el total original suma lo cargado en origen')
}
assert.equal(normalizarCompra({ supplierName: 'Proveedor', currency: 'USD', lines: [{ productId: 'p1', quantity: 1, originalUnitCost: 900 }] }).ok, false, 'USD por línea sin cotización')
assert.equal(normalizarCompra({ supplierName: 'Proveedor', currency: 'USD', exchangeRatePyg: 7500, lines: [{ productId: 'p1', quantity: 1, originalUnitCost: 900.999 }] }).ok, false, 'USD por línea con más de 2 decimales')
const lineaGs = normalizarCompra({ supplierName: 'Proveedor', currency: 'PYG', lines: [{ productId: 'p1', quantity: 3, originalUnitCost: 1200000 }] })
assert.equal(lineaGs.ok && lineaGs.data.lines[0].unitCostPyg, 1200000)
assert.equal(lineaGs.ok && lineaGs.data.costPyg, 3600000, 'el total en Gs sale de la suma')
const enBrl = normalizarCompra({ supplierName: 'Proveedor', currency: 'BRL', exchangeRatePyg: 1400, lines: [{ productId: 'p1', quantity: 1, originalUnitCost: 100 }] })
assert.equal(enBrl.ok && enBrl.data.lines[0].unitCostPyg, 140000, 'BRL con cotización convierte igual')
assert.equal(enBrl.ok && enBrl.data.originalCost, 100)
const conTotal = normalizarCompra({ supplierName: 'Proveedor', currency: 'USD', originalCost: 100, exchangeRatePyg: 7500, lines: [{ productId: 'p1', quantity: 1, originalUnitCost: 90 }] })
assert.equal(conTotal.ok && conTotal.data.costPyg, 750000, 'un total explícito manda tal cual')
assert.equal(conTotal.ok && conTotal.data.originalCost, 100)
assert.equal(normalizarCompra({ supplierName: 'Proveedor', currency: 'EUR', lines: [{ productId: 'p1', quantity: 1 }] }).ok, false, 'moneda fuera de PYG/USD/BRL')

// FIN (#254): condición de pago de la compra (el crédito exige vencimiento).
const sinCondicion = normalizarCompra({ supplierName: 'Proveedor', lines: [{ productId: 'p1', quantity: 1 }] })
assert.equal(sinCondicion.ok && sinCondicion.data.paymentCondition, 'CONTADO', 'por defecto, contado')
assert.equal(sinCondicion.ok && sinCondicion.data.dueAt, null)
assert.equal(normalizarCompra({ ...compraBase, paymentCondition: 'CREDITO' }).ok, false, 'crédito sin vencimiento')
assert.equal(normalizarCompra({ ...compraBase, paymentCondition: 'CREDITO', dueAt: 'no-es-fecha' }).ok, false, 'vencimiento inválido')
assert.equal(normalizarCompra({ ...compraBase, paymentCondition: 'CONSIGNACION' }).ok, false, 'condición fuera de contado/crédito')
const credito = normalizarCompra({ ...compraBase, paymentCondition: 'CREDITO', dueAt: '2026-10-15T00:00:00.000Z' })
assert.equal(credito.ok && credito.data.paymentCondition, 'CREDITO')
assert.equal(credito.ok && credito.data.dueAt, '2026-10-15T00:00:00.000Z')

// ── Fase 3: IMEI y preparación (#250 §7 y §11) ──────────────────────────────
import { compararModelo, cuadrarSeriales, etiquetasPreparacion, resumenPreparacion } from '../lib/supply'

// Cuadre del lote: Luhn, repetidos, ya cargados y cantidad comprada.
assert.deepEqual(cuadrarSeriales({ seriales: '490154203237518 490154203237526', cantidad: 2 }), { ok: true, nuevos: ['490154203237518', '490154203237526'] })
assert.equal(cuadrarSeriales({ seriales: '490154203237519', cantidad: 1 }).ok, false, 'Luhn inválido')
assert.equal(cuadrarSeriales({ seriales: '490154203237518 490154203237518', cantidad: 2 }).ok, false, 'repetido en el lote')
assert.equal(cuadrarSeriales({ seriales: 'AUR-0001', cantidad: 1, yaEnLinea: ['AUR-0001'] }).ok, false, 'ya cargado en la línea')
assert.equal(cuadrarSeriales({ seriales: '490154203237518 490154203237526', cantidad: 1 }).ok, false, 'más IMEI que unidades')
assert.deepEqual(cuadrarSeriales({ seriales: 'aur-2', cantidad: 2, yaEnLinea: ['aur-1'] }), { ok: true, nuevos: ['AUR-2'] })

// Modelo detectado vs esperado (aviso, no bloquea).
assert.deepEqual(compararModelo('iPhone 15 Pro Max', 'iPhone 15 Pro Max'), { coincide: true, esperado: 'iPhone 15 Pro Max', detectado: 'iPhone 15 Pro Max' })
assert.equal(compararModelo('iPhone 15 Pro Max', 'IPHONE 15 PRO')?.coincide, true)
assert.equal(compararModelo('iPhone 15', 'iPhone 16 Pro')?.coincide, false)
assert.equal(compararModelo('iPhone 15', null), null, 'sin dato del proveedor no hay aviso')

// Etiquetas de la preparación: una por unidad, n de N, IMEI o pendiente.
const etiquetas = etiquetasPreparacion({
  compra: 'COM-CDE-0001',
  destino: 'Casa Central',
  lineas: [
    { productId: 'p1', producto: 'iPhone 15', capacidad: '128GB', condicion: 'NEW', quantity: 2, serials: ['490154203237518'], pedidoNumero: 'MOB-0048' },
    { productId: 'p2', producto: 'iPhone 14', condicion: 'USED', quantity: 1 },
  ],
})
assert.equal(etiquetas.length, 3)
assert.deepEqual(etiquetas.map((etiqueta) => `${etiqueta.n} de ${etiqueta.total}`), ['1 de 3', '2 de 3', '3 de 3'])
assert.equal(etiquetas[0].imei, '490154203237518')
assert.equal(etiquetas[0].pendiente, false)
assert.equal(etiquetas[0].pedido, 'MOB-0048')
assert.equal(etiquetas[0].destino, 'Casa Central')
assert.equal(etiquetas[1].pendiente, true, 'la unidad sin IMEI sale como pendiente')
assert.equal(etiquetas[2].condicion, 'USED')
assert.equal(etiquetas[0].compra, 'COM-CDE-0001')

assert.deepEqual(resumenPreparacion([{ quantity: 2, serials: ['a'] }, { quantity: 1, serials: [] }]), { unidades: 3, conImei: 1, pendientes: 2 })
assert.deepEqual(resumenPreparacion([]), { unidades: 0, conImei: 0, pendientes: 0 })

// ── Fase 4: lotes y tránsito (#250 §8 y §11) ────────────────────────────────
import { codigoEnvio, expandirItemsEnvio, manifiestoEnvio, transicionEnvioValida } from '../lib/supply'

assert.equal(codigoEnvio({ origen: 'cde', destino: 'asu', secuencia: 21 }), 'ENV-CDE-ASU-0021')
assert.equal(codigoEnvio({ secuencia: 1 }), 'ENV-CDE-ASU-0001')

// Máquina de estados: solo las transiciones válidas.
assert.equal(transicionEnvioValida('BORRADOR', 'PREPARANDO'), true)
assert.equal(transicionEnvioValida('PREPARANDO', 'DESPACHADO'), true)
assert.equal(transicionEnvioValida('DESPACHADO', 'EN_TRANSITO'), true)
assert.equal(transicionEnvioValida('EN_TRANSITO', 'CON_INCIDENCIA'), true)
assert.equal(transicionEnvioValida('BORRADOR', 'EN_TRANSITO'), false)
assert.equal(transicionEnvioValida('RECIBIDO', 'EN_TRANSITO'), false)
assert.equal(transicionEnvioValida('CANCELADO', 'PREPARANDO'), false)

// Unidades del lote: IMEI conocido primero y pendientes después.
const lote = expandirItemsEnvio({ lineas: [{ id: 'l1', productId: 'p1', quantity: 3, serials: ['a1', 'a2'] }] })
assert.deepEqual(lote.ok && lote.items.map((item) => item.serial), ['A1', 'A2', null])
const segundo = expandirItemsEnvio({ lineas: [{ id: 'l1', productId: 'p1', quantity: 3, serials: ['A1', 'A2'] }], asignados: [{ lineId: 'l1', serial: 'A1', cantidad: 1 }] })
assert.deepEqual(segundo.ok && segundo.items.map((item) => item.serial), ['A2', null])
assert.equal(expandirItemsEnvio({ lineas: [{ id: 'l1', productId: 'p1', quantity: 1, serials: ['A1'] }], asignados: [{ lineId: 'l1', cantidad: 1 }] }).ok, false, 'sin lugar no hay envío')

const manifiesto = manifiestoEnvio({
  envio: { code: 'ENV-CDE-ASU-0001', origin: 'CDE', method: 'BUS', status: 'EN_TRANSITO', publicToken: 'tok-123', purchase: { code: 'COM-CDE-0001' }, destinationBranch: { name: 'Casa Central' }, responsible: { name: 'Ana' }, sentAt: '2026-09-24T10:00:00.000Z', etaAt: null, arrivedAt: null, company: 'Bus SA', driver: 'Juan', guide: 'G-1', notes: null },
  items: [
    { lineId: 'l1', producto: 'iPhone 15', capacidad: '128GB', condicion: 'NEW', serial: 'A1' },
    { lineId: 'l1', producto: 'iPhone 15', capacidad: '128GB', condicion: 'NEW', serial: null },
  ],
  base: 'https://app.moboss.online',
})
assert.equal(manifiesto.metodoLabel, 'Bus')
assert.equal(manifiesto.unidades, 2)
assert.equal(manifiesto.conImei, 1)
assert.equal(manifiesto.pendientes, 1)
assert.equal(manifiesto.lineas[0].cantidad, 2)
assert.deepEqual(manifiesto.lineas[0].imeis, ['A1'])
assert.equal(manifiesto.destino, 'Casa Central')
assert.equal(manifiesto.compra, 'COM-CDE-0001')
assert.equal(manifiesto.enlace, 'https://app.moboss.online/envio/tok-123')

// ── Fase 5: recepción (#250 §9 y §10) ───────────────────────────────────────
import { compararEscaneo, costoPorUnidad, estadoLoteRecepcion, RESULTADOS_RECEPCION, resumenRecepcion } from '../lib/supply'

// Escaneo contra lo esperado: conocidos, unidades con IMEI diferido y sobrantes.
const escaneo = compararEscaneo({
  esperados: [{ shipmentItemId: 'i1', serial: 'A1' }, { shipmentItemId: 'i2', serial: null }, { shipmentItemId: 'i3', serial: 'A3' }],
  escaneados: ['a1', 'a2', 'x9', 'a3'],
})
assert.deepEqual(escaneo.recibidos, [{ shipmentItemId: 'i1', serial: 'A1' }, { shipmentItemId: 'i2', serial: 'A2' }, { shipmentItemId: 'i3', serial: 'A3' }])
assert.deepEqual(escaneo.sobrantes, ['X9'], 'lo que no estaba en el manifiesto es sobrante')

// Estado final del lote.
assert.equal(estadoLoteRecepcion({ unidades: 3, recibidas: 3, incidencias: 0 }), 'RECIBIDO')
assert.equal(estadoLoteRecepcion({ unidades: 3, recibidas: 2, incidencias: 0 }), 'RECEPCION_PARCIAL')
assert.equal(estadoLoteRecepcion({ unidades: 3, recibidas: 3, incidencias: 1 }), 'CON_INCIDENCIA')

// Costo por unidad: unitario de la línea o parte proporcional de la compra.
assert.deepEqual(costoPorUnidad({ totalCostPyg: 3000000, currency: 'PYG', unidades: 3 }), { costPyg: 1000000, originalCost: 1000000, costCurrency: 'PYG', exchangeRatePyg: null })
assert.deepEqual(costoPorUnidad({ totalCostPyg: 2628750, totalOriginal: 350.5, currency: 'USD', rate: 7500, unidades: 2 }), { costPyg: 1314375, originalCost: 175.25, costCurrency: 'USD', exchangeRatePyg: 7500 })
assert.equal(costoPorUnidad({ totalCostPyg: 1000000, currency: 'PYG', unidades: 2, unitCostPyg: 400000 }).costPyg, 400000, 'el costo unitario de la línea manda')
assert.equal(costoPorUnidad({ totalCostPyg: null, currency: 'PYG', unidades: 2 }).costPyg, null, 'sin costo queda pendiente')

assert.deepEqual(resumenRecepcion([{ resultado: 'RECIBIDO' }, { resultado: 'DANADO' }, { resultado: 'RECIBIDO' }]), { RECIBIDO: 2, FALTANTE: 0, SOBRANTE: 0, DANADO: 1, INCORRECTO: 0 })
assert.deepEqual(resumenRecepcion([]), { RECIBIDO: 0, FALTANTE: 0, SOBRANTE: 0, DANADO: 0, INCORRECTO: 0 })
assert.ok(RESULTADOS_RECEPCION.includes('SOBRANTE'))
