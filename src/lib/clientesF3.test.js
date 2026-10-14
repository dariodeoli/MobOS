import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const read = path => readFileSync(path, 'utf8')
const seller = read('src/components/ventas/SellerCustomers.jsx')
const table = read('src/components/customers/ClientesTabla.jsx')
const css = read('src/components/ventas/clientesF3.css')
const digest = text => createHash('sha256').update(text).digest('hex')
const between = (text, start, end) => text.slice(text.indexOf(start), text.indexOf(end)).trim()

test('Clientes preserves create/import/export payloads, validation and original form', () => {
  // Intentional fiscal-identity additions are covered by customerIdentity tests.
  // Keep fingerprints for unchanged import/export and reviewed create/profile blocks.
  const originalHandlers = seller
    .replace('; setResumenRevision((value) => value + 1)', '')
    .replace('      setResumenRevision((value) => value + 1)\n', '')
  for (const [start, end, expected] of [
    [
      '  async function create(event)',
      '  async function exportar()',
      '576f43351ace32ecc98039b1e47b897132cfa1bde7c51ccf6efb31a49b70d7ca',
    ],
    [
      '  async function exportar()',
      '  async function importar(event)',
      '1c6a75ce2ea448110b09700954ffad67828c664e690b6ff121f3e52c7c802a2f',
    ],
    [
      '  async function importar(event)',
      '  const filasImportadas',
      '1f12f39b80c7505e52c4642354bdd081d9a736862e04e5267196a0cdaf92a6b8',
    ],
    [
      '    <Modal open={crearAbierto}',
      '    </>}',
      '89bea545805bc6d12f2c6af605d4e98266828c83ce05cb502d0d2d8cac64768c',
    ],
  ])
    assert.equal(digest(between(originalHandlers, start, end)), expected)
})

test('Clientes preserves reviewed fiscal profile and unchanged summary/communication engines', () => {
  for (const [file, expected] of [
    ['CustomerProfile.jsx', 'a48efa99634260cd62678de5f3d89ee8dda7da953db478f379c1ebaa2fe1c5ad'],
    ['ClienteResumenPopup.jsx', 'a12e1ed5afa6d281167d0f105f573f3eac7b9d3054e64371a3eb09193163c98a'],
    [
      'CustomerCommunicationCard.jsx',
      '0e4be9e86ebc7167a8651ff7ee4c3ca063db1aff3c72e00e0b3f911bb42cf407',
    ],
  ])
    assert.equal(digest(read(`src/components/customers/${file}`)), expected)
  for (const contract of [
    'clienteParam',
    "siguientes.delete('cliente')",
    "setProfileTab('datos')",
    'onUnificar={(a, b)',
    "['ADMIN', 'GERENTE'].includes(usuario?.role)",
  ])
    assert.ok(seller.includes(contract), contract)
  assert.ok(
    seller.indexOf('aria-label="Secciones de clientes"') <
      seller.indexOf("seccion === 'campanas' ?"),
  )
})

test('Clientes preserves bulk export/copy/merge, page sorting and server pagination', () => {
  assert.equal(
    digest(
      between(
        table,
        '  async function copiarTelefonos()',
        '\n  return (\n    <div className="clientes-f3-list">',
      ),
    ),
    '8fac9c5ebc56ba3565c898450b075e3abe870f8a0a5549485a12fd319810b4c1',
  )
  for (const contract of [
    '{ limit: 50 }',
    "params.set('q', search)",
    "params.set('filtro', filtro)",
    "params.set('orden', orden === 'recientes' ? 'actividad' : orden)",
    'data.cargarMas',
  ])
    assert.ok(seller.includes(contract), contract)
  assert.ok(table.includes('filas = orden ? [...rows].sort'))
  assert.ok(table.includes('row.email ||')) // Retained in CSV, not in the list.
  assert.ok(!table.includes('telefonoMostrado, row.email'))
  assert.ok(!table.includes(' · ${row.email}'))
})

test('Clientes explicitly separates unavailable tenant summary from loaded page debt', () => {
  assert.ok(!seller.includes('resumenMostrar?.total ?? rows.length'))
  assert.ok(seller.includes("resumenMostrar?.total ?? '—'"))
  assert.equal((seller.match(/setResumenRevision\(\(value\) => value \+ 1\)/g) || []).length, 2)
  for (const contract of [
    'cacheMs: 0',
    'controller.abort()',
    'controller.signal.aborted',
    'resumenV2.porCobrar',
    "alcance: 'En pantalla'",
    'Resumen de tienda no disponible',
  ])
    assert.ok(seller.includes(contract), contract)
})

test('Clientes scoped presentation supports readable full amounts and keyboard menus', () => {
  for (const contract of [
    'min-height: 44px',
    'overflow-wrap: anywhere',
    'white-space: nowrap',
    'text-overflow: clip',
    'grid-template-columns: minmax(0, 1fr)',
    '.clientes-f3-table',
  ])
    assert.ok(css.includes(contract), contract)
  for (const contract of [
    'onKeyDownCapture={navegarMenu}',
    'onClickCapture=',
    'trigger.current?.focus()',
    "'ArrowDown'",
    "'ArrowUp'",
    "'Home'",
    "'End'",
    "event.key === 'Escape'",
  ])
    assert.ok(table.includes(contract), contract)
  assert.ok(!css.includes('.shell-'))
  assert.ok(!css.includes('perfil-'))
})
