import assert from 'node:assert/strict'
import { leerFuente } from './fuenteStock.js'
import test from 'node:test'
import {
  activeShellSection,
  shellBottomNav,
  shellContextGroups,
  shellNavigation,
  shellSegments,
} from './shellNavigation.js'
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

test('owner gets nine primary destinations and every existing destination remains reachable', () => {
  const owner = catalog('OWNER_NAV')
  const sections = shellNavigation(owner)
  assert.deepEqual(
    sections.map(section => section.label),
    ['Inicio', 'Vender', 'Ventas', 'Clientes', 'Taller', 'Stock', 'Compras', 'Finanzas', 'Análisis'],
  )
  const reachable = sections
    .flatMap(section => section.items.map(([id]) => id))
    .concat(['equipo', 'ayuda'])
  // «Control» (Stock) es una pestaña proyectada: agrupa vistas del inventario
  // (conteos, alertas, taller…) que no son destinos del catálogo.
  assert.deepEqual(
    [...reachable].filter(id => id !== 'control').sort(),
    owner[0].items.map(([id]) => id).sort(),
  )
  assert.ok(reachable.includes('control'), 'Control existe para quien tiene Unidades')
  assert.equal(new Set(reachable).size, reachable.length)
  // Every catalog id is a tab (level 1) or a segment (level 2) somewhere.
  const clickable = sections.flatMap(section =>
    shellContextGroups(section).flatMap(group => group.items.map(([id]) => id)),
  )
  assert.deepEqual(
    [...clickable].sort(),
    sections.flatMap(section => section.items.map(([id]) => id)).sort(),
  )
  for (const section of sections)
    for (const [id] of section.items) {
      assert.equal(activeShellSection(sections, id), section)
      assert.ok(
        rutaDeVista(id) || ['unidades', 'traslados', 'control', 'ayuda'].includes(id),
        `${id} retains route or existing subsection handler`,
      )
    }
  assert.equal(DESTINO_LEGADO.ventas, '/pos')
  assert.equal(sections.find(section => section.id === 'ventas').items[0][0], 'pedidos')
  // D1/D3: Compras, Clientes and Taller are primary destinations of their own.
  assert.equal(activeShellSection(sections, 'compras').id, 'compras')
  assert.equal(activeShellSection(sections, 'abastecimiento').id, 'compras')
  assert.equal(activeShellSection(sections, 'clientes').id, 'clientes')
  assert.equal(activeShellSection(sections, 'tradein-admin').id, 'taller')
  assert.equal(activeShellSection(sections, 'analisis').id, 'analisis')
})

test('owner mobile bottom bar is Inicio, Vender, Ventas, Stock and a Más sheet (D2)', () => {
  const sections = shellNavigation(catalog('OWNER_NAV'))
  const { bottom, more } = shellBottomNav(sections)
  assert.deepEqual(
    bottom.map(section => section.label),
    ['Inicio', 'Vender', 'Ventas', 'Stock'],
  )
  assert.deepEqual(
    more.map(section => section.label),
    ['Clientes', 'Taller', 'Compras', 'Finanzas', 'Análisis'],
  )
  assert.equal(bottom.length + more.length, sections.length)
})

test('seller, manager and cashier presentation never grants owner destinations', () => {
  const sections = shellNavigation(catalog('SELLER_NAV'))
  assert.deepEqual(
    sections.map(section => section.label),
    ['Vender', 'Ventas', 'Clientes', 'Stock'],
  )
  assert.equal(sections[0].items[0][0], 'cargar')
  assert.ok(
    !sections
      .flatMap(section => section.items)
      .some(([id]) =>
        ['finanzas', 'resumen', 'equipo', 'unidades', 'compras', 'analisis'].includes(id),
      ),
  )
  assert.deepEqual(
    sections.find(section => section.id === 'stock').items.map(([id]) => id),
    ['productos', 'precios'],
  )
  // Four sections: all of them stay on the bottom bar, no "Más".
  assert.equal(shellBottomNav(sections).more.length, 0)
  assert.deepEqual(
    shellContextGroups(sections.find(section => section.id === 'ventas')).map(group => group.label),
    ['Mis pedidos', 'Cotizaciones', 'Entregas'],
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

test('profile uses real handlers; tabs, header and stacking remain explicit', () => {
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
  // No native dropdown anywhere in the shell: tabs replace SectionSelector.
  assert.ok(!shell.includes('SectionSelector'))
  assert.match(shell, /testId="shell-contexto"/)
  assert.match(shell, /testId="shell-subcontexto"/)
  assert.match(shell, /<PageHeader/)
  const tabs = leerFuente(new URL('../components/app/SectionTabs.jsx', import.meta.url), 'utf8')
  assert.ok(!/<select|<Select/.test(tabs))
  assert.match(tabs, /overflow-x-auto/)
  assert.match(tabs, /data-tab-more/)
  assert.match(tabs, /min-h-11/)
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
  // Rediseño 2A: las secciones (Unidades · Productos · Traslados · Control ·
  // Precios) son pestañas del shell y las vistas de cada una un segundo nivel
  // en la barra de la pestaña.
  assert.match(inventory, /data-testid="grupos-inventario"[\s\S]*?data-testid="subtabs-inventario"[\s\S]*?ariaLabel=\{`Vistas de \$\{grupo\.label\}`\}/)
  assert.match(inventory, /data-testid="subtabs-inventario"/)
  assert.match(inventory, /id === 'autorizaciones' && pendientesStock > 0/)
  assert.ok(!inventory.includes('onClick={() => cambiarGrupo'))
})

test('approved presentation groups keep tabs per area and segments only where a group has several views', () => {
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
    assert.equal(activeShellSection(sections, 'promociones').id, 'clientes')
    assert.equal(activeShellSection(sections, 'plantillas').id, 'clientes')
    const clients = shellContextGroups(sections.find(section => section.id === 'clientes'))
    assert.deepEqual(
      clients.map(group => group.id),
      ['clientes', 'promociones', 'plantillas'],
    )
    const stock = shellContextGroups(sections.find(section => section.id === 'stock'))
    assert.deepEqual(
      stock.map(group => group.label),
      name === 'OWNER_NAV'
        ? ['Unidades', 'Productos', 'Traslados', 'Control', 'Precios']
        : ['Productos', 'Precios'],
    )
    // Only Precios (owner) groups several destinations; the rest are plain tabs.
    const segmented = groups.filter(group => shellSegments(group).length)
    assert.deepEqual(
      segmented.map(group => group.id),
      name === 'OWNER_NAV' ? ['precios'] : [],
    )
    if (name === 'OWNER_NAV') {
      assert.deepEqual(
        shellSegments(segmented[0]).map(segment => segment.id),
        ['precios', 'celulares', 'comparador', 'centro-control'],
      )
      assert.equal(activeShellSection(sections, 'analisis').id, 'analisis')
    } else assert.equal(activeShellSection(sections, 'analisis'), null)
  }
})
