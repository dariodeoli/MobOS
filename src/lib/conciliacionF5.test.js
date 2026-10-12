import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const source = readFileSync('src/components/control/Conciliacion.jsx', 'utf8')
const base = execFileSync('git', ['show', 'd54e674e:src/components/control/Conciliacion.jsx'], {
  encoding: 'utf8',
})
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

test('F5 preserves all state, selectors, request contracts and financial handlers byte-for-byte', () => {
  assert.equal(business(source).trimEnd(), business(base).trimEnd())
  assert.ok(!business(source).includes('branchId'))
})
test('F5 preserves the original 115 browser cases as an exact byte prefix', () => {
  const prefix = readFileSync('e2e/frontend/nav-v2.frontend.spec.js').subarray(0, 115759)
  assert.equal(
    createHash('sha256').update(prefix).digest('hex'),
    '8ff58df61d33594380d4a9712c0a1b46abb46267f73542d43281369a8ac2c616',
  )
})
test('F5 retains summary values and original progress, independent of display-state filter', () => {
  const metrics = text =>
    text.slice(text.indexOf('  const tarjetas ='), text.indexOf('\n  return ('))
  assert.equal(metrics(source), metrics(base))
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
  assert.ok(source.includes('const rendered = useRenderedPayments(filtrados)'))
  assert.ok(source.includes('{rendered.rows.map((item) => {'))
  assert.ok(source.includes('const size = compact ? 2 : 20'))
  const paging = source.slice(
    source.indexOf('function useRenderedPayments('),
    source.indexOf('export default function Conciliacion()'),
  )
  assert.ok(!paging.includes('setSeleccion'))
  assert.ok(!paging.includes('api.'))
  assert.ok(source.includes('de todas las páginas, sin reembolsados'))
  assert.ok(source.includes('Paginar conserva la selección'))
})

test('F5 bounded correction changes Stock only by explicit Buffer import', () => {
  const stock = readFileSync('src/lib/stockF4.test.js', 'utf8')
  const checkpoint = execFileSync('git', ['show', 'd54e674e:src/lib/stockF4.test.js'], {
    encoding: 'utf8',
  })
  assert.equal(stock.replace("import { Buffer } from 'node:buffer'\n", ''), checkpoint)
})
test('F5 compact layout preserves full digit strings and accessible request filters', () => {
  const css = readFileSync('src/components/control/conciliacionF5.css', 'utf8')
  assert.ok(css.includes('(min-width: 350px) and (max-width: 619px)'))
  assert.ok(css.includes('.conciliacion-f5-digits'))
  assert.ok(source.includes('gs(tarjeta.valor || 0).slice(3)'))
  assert.ok(source.includes('según cuenta, medio y procesadora'))
  assert.ok(source.includes('el estado no cambia el resumen'))
  assert.ok(source.includes('const size = compact ? 2 : 20'))
})

test('F5 renewed spacing correction retains readable type, touch targets and paging', () => {
  const css = readFileSync('src/components/control/conciliacionF5.css', 'utf8')
  assert.match(css, /\.conciliacion-f5-kpi strong\s*\{\s*font-size: 22px;/)
  assert.match(css, /\.conciliacion-f5-kpi\s*\{\s*padding-inline: 8px;/)
  assert.match(css, /\.conciliacion-f5-panel\s*\{\s*padding: 10px;/)
  assert.match(css, /\.conciliacion-f5-payment-grid\s*\{\s*gap: 6px;/)
  assert.ok(css.includes('min-height: 44px'))
  assert.ok(!/overflow:\s*hidden|line-clamp/.test(css))
  assert.ok(source.includes('const size = compact ? 2 : 20'))
})
