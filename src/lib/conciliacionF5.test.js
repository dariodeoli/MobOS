import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync('src/components/control/Conciliacion.jsx', 'utf8')
const business = text =>
  text.slice(
    text.indexOf('export default function Conciliacion()'),
    text.indexOf(
      text.includes('// F5 presentation boundary')
        ? '\n  // F5 presentation boundary'
        : '\n  return (',
      text.indexOf('export default function Conciliacion()'),
    ),
  )

test('F5 preserves state, selectors, request contracts and financial handlers (semantic contract)', () => {
  const logic = business(source)
  for (const contract of [
    "api.get(`/api/finance/reconciliation?${params}`)",
    "api.post('/api/finance/reconciliation', {",
    "action: 'batch'",
    'paymentIds: seleccionados.map((item) => item.id)',
    'receivedPyg: Number(recibido) || 0',
    'note: nota.trim() || undefined',
    "params.set('accountId', filtros.accountId)",
    "params.set('method', filtros.method)",
    "params.set('processor', filtros.processor)",
    "new URLSearchParams({ from: rango.desde, to: rango.hasta })",
    "item.status !== 'REFUNDED'",
    "item.conciliacion.state !== 'VERIFIED'",
    'errorMonto(recibido)',
    'conciliarDemoLote({ items: seleccionados',
    'construirDemoConciliacion({ ventas, cuentas',
    "setSeleccion([]); setRecibido(''); setNota('')",
    'ventaDesdeApi(await api.get(`/api/orders/${encodeURIComponent(item.orderId)}`))',
    'const pendientes = filtrados.filter(',
    'const diferencia = (Number(recibido) || 0) - esperado',
  ])
    assert.ok(logic.includes(contract), contract)
  assert.ok(!business(source).includes('branchId'))
})
test('F5 keeps its original browser cases in the frontend spec (semantic contract)', () => {
  // Intención del candado histórico por bytes: los casos de conciliación del
  // arnés de navegación no se pierden ni se debilitan cuando otras pantallas
  // (p. ej. Stock) cambian sus propios casos en el mismo archivo.
  const spec = readFileSync('e2e/frontend/nav-v2.frontend.spec.js', 'utf8')
  const casos = spec.match(/test\(\`?'?F5 /g) || []
  assert.ok(casos.length >= 8, `casos F5: ${casos.length}`)
  assert.ok(spec.includes('F5 demo reconciliation'))
  assert.ok(spec.includes('reconciliationMetrics'))
  assert.ok(!/\.(skip|fixme|only)\(/.test(spec))
})
test('F5 retains summary values and original progress, independent of display-state filter', () => {
  const metrics = text =>
    text.slice(text.indexOf('  const tarjetas ='), text.indexOf('\n  return ('))
  const cards = metrics(source)
  for (const contract of [
    "label: 'Ingresos conciliables', valor: n(resumen.confirmedPyg)",
    "label: 'Conciliado', valor: n(resumen.verifiedPyg)",
    "label: 'Por conciliar', valor: n(resumen.unverifiedPyg)",
    "label: 'Diferencia de lotes', valor: n(resumen.differencePyg)",
  ])
    assert.ok(cards.includes(contract), contract)
  assert.ok(source.includes('resumen={data?.resumen || {}}'))
  assert.match(source, /valor=\{n\(resumen.verifiedCount\)\}\s+max=\{n\(resumen.count\)\}/)
  assert.ok(source.includes('Esta consulta no envía sucursal'))
  assert.ok(source.includes('El estado solo filtra esta lista'))
})
test('F5 exposes full-money cells, distinct payment states and named collapsed disclosure', () => {
  assert.ok(!source.includes('min-w-[60rem]'))
  assert.ok(!source.includes('min-w-[46rem]'))
  assert.ok(!source.includes('Conciliación y trazabilidad</h2>'))
  assert.ok(source.includes('const [abierto, setAbierto] = useState(false)'))
  assert.ok(source.includes('aria-controls="conciliacion-group-content"'))
  assert.ok(source.includes('Pago: {item.status'))
  assert.ok(source.includes('Selección para el lote:'))
  assert.ok(source.includes('data-label="Monto" className="conciliacion-f5-money'))
  assert.ok(source.includes('aria-required={diferencia !== 0}'))
})
test('F5 styles stay scoped, use flat tokens and reflow without clipping money', () => {
  const css = readFileSync('src/components/control/conciliacionF5.css', 'utf8')
  assert.ok(css.includes('@container (min-width: 1060px)'))
  assert.ok(css.includes('min-height: 44px'))
  assert.ok(css.includes(':focus-visible'))
  assert.ok(css.includes('overflow-wrap: anywhere'))
  assert.ok(!css.includes('ellipsis'))
  assert.ok(!css.includes('.shell-'))
  assert.ok(!css.includes('gradient'))
})
test('F5 paging only slices presentation; bulk pending and selection retain original semantics', () => {
  // U5a: paging now comes from the shared usePaginaLista block (2 cards compact, 20 wide).
  assert.ok(source.includes('const rendered = usePaginaLista(filtrados, {'))
  assert.ok(source.includes('renderFila={(item) => {'))
  assert.ok(source.includes('tamano: { compacto: 2, amplio: 20 }'))
  const paging = readFileSync('src/components/shared/usePaginaLista.js', 'utf8')
  assert.ok(!paging.includes('setSeleccion'))
  assert.ok(!paging.includes('api.'))
  assert.ok(source.includes('de todas las páginas, sin reembolsados'))
  assert.ok(source.includes('Paginar conserva la selección'))
})

test('F5 Stock test keeps its explicit Buffer import (no git dependency)', () => {
  const stock = readFileSync('src/lib/stockF4.test.js', 'utf8')
  assert.ok(stock.includes("import { Buffer } from 'node:buffer'"))
})
test('F5 compact layout preserves full digit strings and accessible request filters', () => {
  const css = readFileSync('src/components/control/conciliacionF5.css', 'utf8')
  assert.ok(css.includes('(min-width: 350px) and (max-width: 619px)'))
  assert.ok(css.includes('.conciliacion-f5-digits'))
  // El símbolo y los dígitos salen del formateador compartido (`partesGs`): el
  // signo va pegado al símbolo y la cifra completa queda en su propio tramo.
  assert.ok(source.includes('partesGs(tarjeta.valor || 0).digitos'))
  assert.ok(source.includes('partesGs(tarjeta.valor || 0).signo'))
  assert.ok(source.includes('según cuenta, medio y procesadora'))
  assert.ok(source.includes('el estado no cambia el resumen'))
  assert.ok(source.includes('tamano: { compacto: 2, amplio: 20 }'))
})

test('F5 renewed spacing correction retains readable type, touch targets and paging', () => {
  const css = readFileSync('src/components/control/conciliacionF5.css', 'utf8')
  assert.match(css, /\.conciliacion-f5-kpi strong\s*\{\s*font-size: 20px;/)
  assert.match(css, /\.conciliacion-f5-kpi\s*\{\s*padding-inline: 8px;/)
  assert.match(css, /\.conciliacion-f5-panel\s*\{\s*padding: 10px;/)
  assert.match(css, /\.conciliacion-f5-payment-grid\s*\{\s*gap: 6px;/)
  assert.ok(css.includes('min-height: 44px'))
  assert.ok(!/overflow:\s*hidden|line-clamp/.test(css))
  assert.ok(source.includes('tamano: { compacto: 2, amplio: 20 }'))
})
