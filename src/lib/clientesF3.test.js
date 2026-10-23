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
  // #389: the create modal markup (Identidad/Contacto/Direcciones, CountrySelect, widths)
  // was restructured on purpose; the create/export/import handlers keep their fingerprints.
  const originalHandlers = seller
    .replace('; setResumenRevision((value) => value + 1)', '')
    .replace('      setResumenRevision((value) => value + 1)\n', '')
  for (const [start, end, expected] of [
    [
      '  async function create(event)',
      '  async function exportar()',
      'e000372aa85036465717365652adb002e88a5e4e9550b3cae3f3f8e4b947d613',
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
      '    </>\n    </div>\n  </SellerSection>',
      'a6a8f7f572ed0ff61c67f33533909a7237a04e3b87cbd0fcb989737dc65eeb14',
    ],
  ])
    assert.equal(digest(between(originalHandlers, start, end)), expected)
})

test('Clientes preserves reviewed fiscal profile and unchanged summary/communication engines', () => {
  for (const [file, expected] of [
    // Módulo Mayoristas: ficha y resumen ocultan el tipo/solicitud mayorista con el módulo apagado (useModulos).
    // Rediseño página de cliente: solo estructura visual (encabezado, KPI, columna lateral); la lógica no cambió.
    // #498: alta/edición fiscal demo y geometría de teclado revisadas; cubierta por ruc498-identidad frontend y demoBillingIdentities.
    // Historial del cliente: filtros por tipo/período, totales y apertura del pedido desde la cronología.
    // Demo funcional: las acciones de la ficha (etiquetas, direcciones, notas, seguimientos, puntos, solicitudes) se aplican en la sesión demo.
    ['CustomerProfile.jsx', '41bfcefe666fca0345940b0ca509aaf62920d8b04af10cd4eb1d6858f9a4604a'],
    ['ClienteResumenPopup.jsx', 'd8fd0e032ca0542a911b6582621971099fa2cad69fa810b7398d4798e91cc510'],
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
  // Campañas es una pestaña de la fila única de Clientes (no una segunda fila).
  assert.ok(!seller.includes('aria-label="Secciones de clientes"'))
  assert.ok(seller.includes('export function CampanasVista'))
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
    "pista={!esDemo",
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

test('Clientes: el vacío vive debajo del encabezado y sin filtros es una tarjeta con «Crear cliente»', () => {
  const despues = table.indexOf("encabezado('deuda'")
  assert.ok(despues > 0 && table.indexOf('{!filas.length && vacio}', despues) > despues, 'el aviso va tras el encabezado')
  assert.ok(seller.includes('data-testid="clientes-vacio"'))
  assert.ok(seller.includes('Ningún cliente coincide') && seller.includes('Limpiar filtros'))
  assert.ok(!seller.includes('<SellerFeedback {...data} empty={!rows.length} />'), 'sin «No hay resultados.» flotando sobre la tabla')
})
