import assert from 'node:assert/strict'
import { leerFuente } from './fuenteStock.js'
import test from 'node:test'
import { activeShellSection, shellNavigation, shellContextGroups } from './shellNavigation.js'
import { DESTINO_LEGADO, rutaDeVista } from './rutas.js'

const panel = leerFuente(new URL('../pages/PanelVendedor.jsx', import.meta.url), 'utf8')
const catalog = name => {
  const source = panel.split(`const ${name} = [`)[1].split('\n]\n')[0]
  return [
    {
      items: [...source.matchAll(/\['([^']+)', '([^']+)', '([^']+)'\]/g)].map(match =>
        match.slice(1, 4),
      ),
    },
  ]
}

test('owner gets five primary destinations and every existing destination remains reachable', () => {
  const owner = catalog('OWNER_NAV')
  const sections = shellNavigation(owner)
  assert.deepEqual(
    sections.map(section => section.label),
    ['Inicio', 'Vender', 'Ventas', 'Stock', 'Finanzas'],
  )
  const reachable = sections
    .flatMap(section => section.items.map(([id]) => id))
    .concat(['equipo', 'ayuda'])
  assert.deepEqual([...reachable].sort(), owner[0].items.map(([id]) => id).sort())
  assert.equal(new Set(reachable).size, reachable.length)
  for (const section of sections)
    for (const [id] of section.items) {
      assert.equal(activeShellSection(sections, id), section)
      assert.ok(
        rutaDeVista(id) || ['unidades', 'traslados', 'ayuda'].includes(id),
        `${id} retains route or existing subsection handler`,
      )
    }
  assert.equal(DESTINO_LEGADO.ventas, '/pos')
  assert.equal(sections.find(section => section.id === 'ventas').items[0][0], 'pedidos')
})

test('seller, manager and cashier presentation never grants owner destinations', () => {
  const sections = shellNavigation(catalog('SELLER_NAV'))
  assert.deepEqual(
    sections.map(section => section.label),
    ['Vender', 'Ventas', 'Stock'],
  )
  assert.equal(sections[0].items[0][0], 'cargar')
  assert.ok(
    !sections
      .flatMap(section => section.items)
      .some(([id]) => ['finanzas', 'resumen', 'equipo', 'unidades'].includes(id)),
  )
  assert.ok(
    sections.find(section => section.id === 'stock').items.some(([id]) => id === 'productos'),
  )
})

test('technician opens Taller and delivery opens Entregas without inaccessible primary entries', () => {
  const technician = shellNavigation(catalog('TECNICO_NAV'))
  assert.deepEqual(
    technician.map(section => section.label),
    ['Taller'],
  )
  assert.equal(technician[0].items[0][0], 'servicio')
  const delivery = shellNavigation([
    {
      items: [
        ['repartos', 'Mis repartos', 'truck'],
        ['rendiciones', 'Rendiciones', 'receipt'],
      ],
    },
  ])
  assert.deepEqual(
    delivery.map(section => section.label),
    ['Entregas'],
  )
  assert.equal(delivery[0].items[0][0], 'repartos')
  assert.equal(delivery[0].items[1][0], 'rendiciones')
})

test('unknown shell catalogs preserve destinations and absent permissions produce no entries', () => {
  assert.deepEqual(shellNavigation([]), [])
  const sections = shellNavigation([
    { titulo: 'Operación', items: [['custom', 'Custom', 'chart']] },
  ])
  assert.equal(sections[0].items[0][0], 'custom')
  assert.equal(activeShellSection(sections, 'missing'), null)
})

test('profile uses real handlers; mobile selectors and stacking remain explicit', () => {
  const shell = leerFuente(new URL('../components/app/AppShell.jsx', import.meta.url), 'utf8')
  for (const handler of [
    'onMiCuenta()',
    'onHelp()',
    'onLockRequest()',
    'onLogout()',
    'navegar(id)',
  ])
    assert.ok(shell.includes(handler), handler)
  assert.match(shell, /id === 'equipo' \|\| id === 'ayuda'/)
  assert.ok(!shell.includes('ProductFooter'))
  assert.ok(!shell.includes('onOpenMenu'))
  const selector = leerFuente(
    new URL('../components/app/SectionSelector.jsx', import.meta.url),
    'utf8',
  )
  assert.match(selector, /<Select/)
  assert.match(selector, /lg:hidden/)
  assert.match(selector, /hidden flex-wrap/)
  const css = leerFuente(
    new URL('../components/app/shellNavigation.css', import.meta.url),
    'utf8',
  )
  assert.match(css, /56px \+ env\(safe-area-inset-bottom/)
  assert.match(css, /max-height: 480px/)
})

test('AEX guide and grouped inventory selector remain available at every viewport', () => {
  const inventory = leerFuente(
    new URL('../components/control/Inventario.jsx', import.meta.url),
    'utf8',
  )
  const guideForm = inventory.match(/<form onSubmit=\{guardarGuia\} className="([^"]+)"/)
  assert.ok(guideForm, 'the existing AEX guide form remains wired to guardarGuia')
  assert.equal(guideForm[1], 'flex flex-wrap items-center gap-1')
  // U3: el selector agrupado pasó a dos filas de pestañas (secciones y vistas).
  assert.match(inventory, /data-testid="tabs-inventario"[\s\S]*?ariaLabel="Secciones de stock"/)
  assert.match(inventory, /data-testid="subtabs-inventario"/)
  assert.match(inventory, /id === 'autorizaciones' && pendientesStock > 0/)
  assert.ok(!inventory.includes('onClick={() => cambiarGrupo'))
})

test('approved presentation groups keep reports in finance, client tools in sales and four stock buckets', () => {
  for (const name of ['OWNER_NAV', 'SELLER_NAV', 'TECNICO_NAV']) {
    const sections = shellNavigation(catalog(name))
    const groups = sections.flatMap(section => shellContextGroups(section))
    assert.deepEqual(
      groups.flatMap(group => group.items.map(([id]) => id)).sort(),
      sections.flatMap(section => section.items.map(([id]) => id)).sort(),
    )
    if (name === 'TECNICO_NAV') {
      assert.equal(sections.length, 1)
      continue
    }
    assert.equal(activeShellSection(sections, 'promociones').id, 'ventas')
    assert.equal(activeShellSection(sections, 'plantillas').id, 'ventas')
    const clients = shellContextGroups(sections.find(section => section.id === 'ventas')).find(
      group => group.id === 'clientes',
    )
    assert.deepEqual(
      clients.items.map(([id]) => id),
      ['clientes', 'promociones', 'plantillas'],
    )
    const stock = shellContextGroups(sections.find(section => section.id === 'stock'))
    assert.deepEqual(
      stock.map(group => group.label),
      name === 'OWNER_NAV'
        ? ['Inventario', 'Compras', 'Traslados', 'Precios']
        : ['Inventario', 'Precios'],
    )
    if (name === 'OWNER_NAV') assert.equal(activeShellSection(sections, 'analisis').id, 'finanzas')
    else assert.equal(activeShellSection(sections, 'analisis'), null)
  }
})
