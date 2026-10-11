import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('F2 KPI values keep the local and unified server sources without monetary caps', () => {
  const source = read('components/control/Resumen.jsx')
  for (const value of ['total', 'cobrado', 'pendiente', 'ganancia'])
    assert.ok(source.includes(`valor={gs(d.${value})}`))
  for (const contract of [
    'armarResumenDia({ ventas, gastos, prods',
    'metricasEjecutivas({ rango, branchId: sucursal?.id })',
    '...base,',
    'total: metricas.total',
    'cobrado: metricas.cobrado',
    'pendiente: metricas.pendiente',
  ])
    assert.ok(source.includes(contract), contract)
  assert.doesNotMatch(source, /Math\.min\(.*d\.(total|cobrado|pendiente|ganancia)/)
  assert.ok(source.includes('className="inicio-kpi-stripe"'))
  assert.doesNotMatch(source, /<AccesosRapidos|const ACCIONES/)
})

test('F2 keeps secondary metrics, server details, graphs and printing reachable', () => {
  const source = read('components/control/Resumen.jsx')
  assert.match(source, /<details data-testid="inicio-detalles"/)
  for (const control of [
    'Ticket promedio',
    'Comisiones',
    'Evolución',
    'CardTopProductos',
    'CardStock',
    'CardPagos',
    'CardConciliacion',
    'Rendimiento por vendedor',
    'ListaVentasDia',
    'ReportePreview',
    'Imprimir resumen',
  ])
    assert.ok(source.includes(control), control)
  assert.match(source, /onClick={irAPendientes}/)
  assert.match(source, /PENDIENTES_HOY.filter/)
})

test('F2 catalog/customer split keeps real collection, variants and form submission context', () => {
  const catalog = read('components/ventas/venta/PasoProductos.jsx')
  const form = read('components/ventas/FormularioVenta.jsx')
  const payment = read('components/ventas/venta/PasoCobro.jsx')
  for (const contract of [
    'familiasVisibles.map',
    'products={productos}',
    'fam.items.length > 1',
    'onElegirVariante?.(fam)',
    '<SelectorVariante',
    'export function PosCustomer',
    '<CheckoutCustomer',
    'onBillingChange={setBillingTo}',
    "cliente: c?.name ?? ''",
  ])
    assert.ok(catalog.includes(contract), contract)
  for (const contract of [
    'onSubmit={guardar}',
    '<PosCustomer',
    '<PasoCarrito',
    '<PasoCobro',
    'contextoActual()',
    'orderDetailPath(completedOrder, orderContext, contextoActual(), window.location.pathname)',
    '<SerialUnitPicker',
    '<ColaOffline',
    '<Atajo k="F2"',
    'setVenderACredito={setVenderACredito}',
  ])
    assert.ok(form.includes(contract), contract)
  assert.ok(form.indexOf('<PosCustomer') < form.indexOf('<PasoCarrito'))
  for (const contract of [
    '<SelectorMedioPago',
    'onAgregarPago()',
    'onAgregarGiftCard?.()',
    'onConsultarGiftCard',
    'data-testid="cobro-total"',
    'data-testid="cobro-pagado"',
    'data-testid="cobro-pendiente"',
    '<summary>Agregar nota</summary>',
  ])
    assert.ok(payment.includes(contract), contract)
})

test('F2 low-stock action counts the full collection while display stays at eight', () => {
  const source = read('components/control/Resumen.jsx')
  const collection = source.match(
    /const lowStockProducts = catalogo[\s\S]*?const stockBajo = lowStockProducts\.slice\(0, 8\)/,
  )?.[0]
  assert.ok(collection, 'full filtered collection and separate eight-item display list')
  // Execute the actual component collection expression, not a copied implementation.
  const select = new Function(
    'catalogo',
    'num',
    'UMBRAL_STOCK_BAJO',
    `${collection}; return { lowStockProducts, stockBajo }`,
  )
  const catalog = Array.from({ length: 12 }, (_, id) => ({ id, stock: id % 4 }))
  catalog.push({ id: 'negative', stock: -1 }, { id: 'excluded', stock: 4 })
  const original = structuredClone(catalog)
  const { lowStockProducts, stockBajo } = select(catalog, Number, 3)
  assert.equal(lowStockProducts.length, 13, 'includes stock <=3, including negative/zero')
  assert.equal(stockBajo.length, 8, 'visible list remains capped at eight')
  assert.deepEqual(stockBajo, lowStockProducts.slice(0, 8), 'worst-first display is preserved')
  assert.deepEqual(catalog, original, 'source catalog is not sorted or mutated')
  assert.equal(select([{ stock: 4 }], Number, 3).lowStockProducts.length, 0)
  assert.match(source, /\{lowStockProducts\.length\} productos con stock bajo/)
  assert.match(source, /lowStockProducts\.length > 0 && <Button/)
  assert.match(source, /!d\.sinPagar && !lowStockProducts\.length/)
  assert.match(source, /stockBajo\.map\(p =>/)
})
