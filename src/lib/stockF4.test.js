import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { runInNewContext } from 'node:vm'
import { createHash } from 'node:crypto'
import { gs, formatUsd } from '../utils/calculos.js'
import {
  costoEnGs,
  sinCostoUnitario,
  sigueEnInventario,
  estadoInventario,
} from '../utils/inventario.js'

const path = 'src/components/control/Inventario.jsx'
const source = readFileSync(path, 'utf8')
const base = execFileSync('git', ['show', `b437eaa9:${path}`], { encoding: 'utf8' })
const between = (s, start, end) => {
  const a = s.indexOf(start)
  const b = s.indexOf(end, a)
  assert.ok(a >= 0 && b > a, `${start} → ${end}`)
  return s.slice(a, b)
}
test('Stock business, role, store, sorting, selection and printing logic stays byte-identical', () => {
  assert.equal(
    between(source, 'export default function', '  return <div className={cn'),
    between(base, 'export default function', '  return <div className={cn'),
  )
  assert.equal(
    between(source, 'function TarjetaUnidad(', 'export default function'),
    between(base, 'function TarjetaUnidad(', 'export default function'),
  )
  assert.equal(
    source.slice(source.indexOf('<Modal open={receiveOpen}')),
    base.slice(base.indexOf('<Modal open={receiveOpen}')),
  )
})
// One prior Clientes warning assertion is authorized to become text-scoped.
const previousWarningAssertion =
  "    await expect(root.getByRole('status')).toContainText('Resumen de tienda no disponible')\n"
const scopedWarningAssertion = `    await expect(
      root.getByRole('status').filter({ hasText: 'Resumen de tienda no disponible' }),
    ).toContainText('Resumen de tienda no disponible')
`

test('Stock previous 87 frontend cases preserve all bytes except the authorized warning locator', () => {
  const path = 'e2e/frontend/nav-v2.frontend.spec.js'
  const original = execFileSync('git', ['show', `b437eaa9:${path}`], { encoding: 'utf8' })
  assert.equal(original.split(previousWarningAssertion).length, 2)
  assert.ok(
    readFileSync(path, 'utf8').startsWith(
      original.replace(previousWarningAssertion, scopedWarningAssertion),
    ),
  )
})
test('Stock preserves missing costs, zero costs, USD conversion and delivery availability', () => {
  assert.equal(sinCostoUnitario({}), true)
  assert.equal(sinCostoUnitario({ originalCost: 0 }), false)
  assert.equal(
    costoEnGs({ originalCost: 719, costCurrency: 'USD', exchangeRatePyg: 7300 }),
    5248700,
  )
  assert.equal(costoEnGs({ costPyg: 100000000, costCurrency: 'PYG' }), 100000000)
  assert.equal(
    sigueEnInventario({ status: 'SOLD', sale: { fulfillmentStatus: 'READY_FOR_PICKUP' } }),
    true,
  )
  assert.equal(
    sigueEnInventario({ status: 'SOLD', sale: { fulfillmentStatus: 'DELIVERED' } }),
    false,
  )
  assert.equal(
    estadoInventario({ status: 'SOLD', sale: { fulfillmentStatus: 'READY_FOR_PICKUP' } }).label,
    'Listo p/ retirar',
  )
  assert.ok(source.includes('costoGs / cotizacion'))
  assert.ok(source.includes("currency === 'USD' && original !== null"))
})
test('Stock required identity is not truncated and physical actor is never abbreviated', () => {
  const rows = between(source, 'function FilaUnidad(', 'function TarjetaUnidad(')
  assert.ok(rows.includes('v.quien'))
  assert.ok(rows.includes('fechaVerificacionCorta(unit.lastVerifiedAt)'))
  assert.ok(!rows.includes('inicialesNombre'))
  assert.ok(!rows.includes('fechaVerificacionDia'))
  assert.ok(!rows.includes('locksParaChips'))
  assert.ok(!rows.includes('min-w-[3rem] truncate'))
  assert.ok(rows.includes('unit.batteryHealth'))
  assert.ok(rows.includes('unit.color || unit.product?.color'))
})
test('Stock menu and row keyboard handlers remain local and preserve callback identity', () => {
  const menu = between(source, 'function MenuAcciones(', 'function accionesDeUnidad(')
  for (const key of ['Escape', 'ArrowDown', 'ArrowUp', 'Home', 'End', 'Tab'])
    assert.ok(menu.includes(key))
  for (const text of [
    'aria-haspopup="menu"',
    'aria-expanded={abierto}',
    'role="menuitem"',
    'trigger.current?.focus()',
    'accion.run()',
  ])
    assert.ok(menu.includes(text))
  assert.ok(source.includes('event.target === event.currentTarget'))
  const callbacks = [
    'onVerify',
    'onSell',
    'onReserve',
    'onLabel',
    'onAdjust',
    'onRemove',
    'onMove',
    'onEdit',
    'onCosto',
    'onComprobante',
    'onApartar',
    'onLiberarApartado',
  ]
  const row = between(source, 'function FilaUnidad(', 'function TarjetaUnidadMovil(')
  for (const callback of callbacks) assert.ok(row.includes(callback), callback)
})
test('Stock grid is shared with loading/header, scoped cards retain touch and full amounts', () => {
  const css = readFileSync('src/components/control/stockF4.css', 'utf8')
  for (const text of [
    '@container',
    'min-height: 44px',
    'overflow-wrap: anywhere',
    'rgb(var(--c-ink))',
  ])
    assert.ok(css.includes(text))
  assert.ok(!css.includes('.shell-'))
  assert.ok(!css.includes('text-overflow: ellipsis'))
  assert.ok(!source.includes('min-w-[60rem]'))
  assert.ok(source.includes('Costo (USD)'))
  assert.equal(source.match(/\$\{UNIDADES_GRID\}/g).length, 3)
})

// Execute the actual local display derivation without importing React or its API graph.
function displayedCost(unit, cotizacion, mobile = false) {
  const row = between(
    source,
    mobile ? 'function TarjetaUnidadMovil(' : 'function FilaUnidad(',
    mobile ? 'function TarjetaUnidad(' : 'function TarjetaUnidadMovil(',
  )
  const start =
    row.indexOf('  const costoGs =') >= 0
      ? row.indexOf('  const costoGs =')
      : row.indexOf('  const { costoGs, enUsd, sinCosto } =')
  const end = row.indexOf(mobile ? '  const acciones =' : '  // #285:', start)
  const helper = source.includes('function costoVisible(')
    ? between(source, 'function costoVisible(', '// Stock display helper end')
    : ''
  return runInNewContext(
    `${helper}
${row.slice(start, end)}
costoTexto`,
    { unit, cotizacion, costoEnGs, sinCostoUnitario, gs, formatUsd },
  )
}

test('Stock display explicit stored zero survives PYG and USD paths', () => {
  for (const unit of [
    { costPyg: 0 },
    { costPyg: '0' },
    { costPyg: null, originalCost: 0, costCurrency: 'PYG' },
    { originalCost: '0', costCurrency: 'PYG' },
    { costPyg: '', originalCost: 0, costCurrency: 'PYG' },
    { costPyg: null, originalCost: 0, costCurrency: 'USD', exchangeRatePyg: 7300 },
  ]) {
    assert.equal(displayedCost(unit, 7300), formatUsd(0), JSON.stringify(unit))
    assert.equal(displayedCost(unit, 7300, true), gs(0), JSON.stringify(unit))
  }
  assert.equal(displayedCost({ originalCost: 0, costCurrency: 'PYG' }, null), gs(0))
  const usd = { originalCost: 0, costCurrency: 'USD' }
  assert.equal(displayedCost(usd, null), formatUsd(0))
  assert.equal(displayedCost(usd, null, true), formatUsd(0))
})

test('Stock display missing null undefined and blank do not become zero', () => {
  for (const unit of [
    {},
    { originalCost: null },
    { originalCost: undefined },
    { originalCost: '' },
    { originalCost: '  ' },
    { costPyg: '', originalCost: null },
  ]) {
    assert.equal(displayedCost(unit, 7300), null)
    assert.equal(displayedCost(unit, 7300, true), 'Sin costo')
  }
  // A stored PYG cost without an original USD amount must not coerce null to USD zero.
  const stored = { costPyg: 7300, originalCost: null, costCurrency: 'USD' }
  assert.equal(displayedCost(stored, null), gs(7300))
})

test('Stock display negatives and invalid values never fabricate amounts', () => {
  for (const field of ['originalCost', 'costPyg']) {
    for (const value of [-1, '-1', 'invalid', Infinity, NaN, false, {}, []]) {
      const unit = { [field]: value, costCurrency: 'PYG' }
      assert.equal(displayedCost(unit, 7300), '—', `${field}: ${String(value)}`)
      assert.equal(displayedCost(unit, 7300, true), '—')
    }
  }
})

test('Stock display retains positive conversion and shared financial zero rejection', () => {
  const unit = { originalCost: 719, costCurrency: 'USD', exchangeRatePyg: 7300 }
  assert.equal(displayedCost(unit, 7300), formatUsd(719))
  assert.equal(displayedCost(unit, 7300, true), gs(5248700))
  assert.equal(displayedCost({ ...unit, costPyg: '' }, 7300), formatUsd(719))
  assert.equal(costoEnGs({ originalCost: 0, costCurrency: 'PYG' }), null)
  assert.equal(sinCostoUnitario({ originalCost: 0 }), false)
})

// Historical 111-case proof remains reproducible by reversing exactly this one assertion.
test('Stock prior 111 cases preserve all bytes except the authorized Clientes warning locator', () => {
  const prefix = readFileSync('e2e/frontend/nav-v2.frontend.spec.js').subarray(0, 111168)
  assert.equal(
    createHash('sha256').update(prefix).digest('hex'),
    'da116dfbcf1d4cca667ba45102ef828220066ee7014bd8be5ad299adb60e950f',
  )
  const text = prefix.toString('utf8')
  assert.equal(text.split(scopedWarningAssertion).length, 2)
  const historical = text.replace(scopedWarningAssertion, previousWarningAssertion)
  assert.equal(Buffer.byteLength(historical), 111100)
  assert.equal(
    createHash('sha256').update(historical).digest('hex'),
    '6b71cde94e06cc900147894cafbf3aedfd6f16ce99da005f189d4c79789ac6b0',
  )
})
