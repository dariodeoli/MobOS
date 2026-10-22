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
import { MODULE_CATALOG, moduloActivo, moduloDeVista, vistaActiva } from './modulos.js'
import { rutaPadreDeVista } from './modulosAviso.js'
import { nuevoModuleStore } from '../../backend/lib/modulos-catalogo.mjs'

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

test('owner gets eight primary destinations (seven core + Taller) and every existing destination remains reachable', () => {
  const owner = catalog('OWNER_NAV')
  const sections = shellNavigation(owner)
  assert.deepEqual(
    sections.map(section => section.label),
    [
      'Inicio',
      'Vender',
      'Pedidos',
      'Clientes',
      'Taller',
      'Stock',
      'Finanzas',
      'Configuración',
    ],
  )
  const reachable = sections
    .flatMap(section => section.items.map(([id]) => id))
    .concat(['ayuda'])
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
  assert.equal(sections.find(section => section.id === 'pedidos').items[0][0], 'pedidos')
  // Compras es un grupo de Stock; Análisis es Inicio › Reportes; Trade-In vive en Vender.
  assert.equal(activeShellSection(sections, 'compras').id, 'stock')
  assert.equal(activeShellSection(sections, 'abastecimiento').id, 'stock')
  assert.equal(activeShellSection(sections, 'clientes').id, 'clientes')
  assert.equal(activeShellSection(sections, 'tradein-admin').id, 'vender')
  assert.equal(activeShellSection(sections, 'analisis').id, 'inicio')
  assert.equal(activeShellSection(sections, 'repartos').id, 'pedidos')
  // Configuración closes the owner menu (gear), after Análisis.
  const config = sections.at(-1)
  assert.equal(config.id, 'configuracion')
  assert.equal(config.icon, 'settings')
  assert.equal(activeShellSection(sections, 'equipo'), config)
})

test('owner mobile bottom bar is Inicio, Vender, Pedidos, Stock and a Más sheet (D2)', () => {
  const sections = shellNavigation(catalog('OWNER_NAV'))
  const { bottom, more } = shellBottomNav(sections)
  assert.deepEqual(
    bottom.map(section => section.label),
    ['Inicio', 'Vender', 'Pedidos', 'Stock'],
  )
  assert.deepEqual(
    more.map(section => section.label),
    ['Clientes', 'Taller', 'Finanzas', 'Configuración'],
  )
  assert.equal(bottom.length + more.length, sections.length)
})

test('seller, manager and cashier presentation never grants owner destinations', () => {
  const sections = shellNavigation(catalog('SELLER_NAV'))
  assert.deepEqual(
    sections.map(section => section.label),
    ['Vender', 'Pedidos', 'Clientes', 'Stock'],
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
    shellContextGroups(sections.find(section => section.id === 'pedidos')).map(group => group.label),
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
      ['clientes', 'campanas', 'promociones', 'plantillas'],
    )
    const stock = shellContextGroups(sections.find(section => section.id === 'stock'))
    assert.deepEqual(
      stock.map(group => group.label),
      name === 'OWNER_NAV'
        ? ['Unidades', 'Productos', 'Compras', 'Traslados', 'Control', 'Precios', 'Abastecimiento']
        : ['Productos', 'Precios'],
    )
    // Precios y Abastecimiento (owner) agrupan varios destinos; el resto son pestañas simples.
    const segmented = groups.filter(group => shellSegments(group).length)
    assert.deepEqual(
      segmented.map(group => group.id),
      name === 'OWNER_NAV' ? ['precios', 'abastecimiento'] : [],
    )
    if (name === 'OWNER_NAV') {
      assert.deepEqual(
        shellSegments(segmented[0]).map(segment => segment.id),
        ['precios', 'celulares', 'comparador', 'centro-control'],
      )
      assert.equal(activeShellSection(sections, 'analisis').id, 'inicio')
    } else assert.equal(activeShellSection(sections, 'analisis'), null)
  }
})

// ---- Módulos: el núcleo son siete secciones; los módulos suman grupos solo si están activos ----
const ETIQUETAS = sections => sections.map(section => section.label)
const gruposDe = (sections, id) => shellContextGroups(sections.find(section => section.id === id)).map(group => group.id)
const conModulosFuente = (...activos) => {
  const fuente = { moduleStore: nuevoModuleStore('2026-10-21T00:00:00.000Z') }
  for (const id of activos) fuente.moduleStore.modules[id] = { enabled: true }
  return fuente
}
const conModulos = (...activos) => {
  const fuente = conModulosFuente(...activos)
  return id => vistaActiva(fuente, id)
}

test('núcleo: una empresa nueva ve siete secciones y ningún grupo de módulo', () => {
  const sections = shellNavigation(catalog('OWNER_NAV'), { modulos: conModulos() })
  assert.deepEqual(ETIQUETAS(sections), ['Inicio', 'Vender', 'Pedidos', 'Clientes', 'Stock', 'Finanzas', 'Configuración'])
  assert.deepEqual(gruposDe(sections, 'inicio'), ['resumen', 'analisis'])
  assert.deepEqual(gruposDe(sections, 'vender'), ['cargar'])
  assert.deepEqual(gruposDe(sections, 'pedidos'), ['pedidos', 'cotizaciones', 'autorizaciones'])
  assert.deepEqual(gruposDe(sections, 'clientes'), ['clientes', 'plantillas'])
  // Inventario por unidades apagado: Stock abre en Productos (control por cantidad).
  assert.deepEqual(gruposDe(sections, 'stock'), ['productos', 'compras', 'control'])
  const ids = sections.flatMap(section => section.items.map(([id]) => id))
  for (const apagado of ['cotizador', 'tradein-admin', 'repartos', 'campanas', 'promociones', 'servicio', 'garantias', 'traslados', 'precios', 'celulares', 'comparador', 'abastecimiento', 'recepcion', 'ops'])
    assert.ok(!ids.includes(apagado), `${apagado} no aparece con su módulo apagado`)
})

test('cada módulo activo suma su grupo en la sección que corresponde', () => {
  const owner = catalog('OWNER_NAV')
  const caso = (modulo, seccion, grupo, etiquetas) => {
    const sections = shellNavigation(owner, { modulos: conModulos(modulo) })
    assert.ok(gruposDe(sections, seccion).includes(grupo), `${modulo} suma ${grupo} en ${seccion}`)
    if (etiquetas) assert.deepEqual(ETIQUETAS(sections), etiquetas)
  }
  caso('tradein', 'vender', 'cotizador')
  caso('delivery', 'pedidos', 'repartos')
  caso('campanas-recompra', 'clientes', 'campanas')
  caso('promociones', 'clientes', 'promociones')
  caso('multisucursal', 'stock', 'traslados')
  caso('listas-precios', 'stock', 'precios')
  caso('comparador', 'stock', 'precios')
  caso('abastecimiento', 'stock', 'abastecimiento')
  caso('ops', 'inicio', 'ops')
  // Taller aparece como sección solo con `servicios`.
  caso('servicios', 'taller', 'servicio', ['Inicio', 'Vender', 'Pedidos', 'Clientes', 'Taller', 'Stock', 'Finanzas', 'Configuración'])
})

test('los módulos solo restan: un rol sin Finanzas no la gana por tener módulos activos', () => {
  const sections = shellNavigation(catalog('SELLER_NAV'), { modulos: () => true })
  assert.deepEqual(ETIQUETAS(sections), ['Vender', 'Pedidos', 'Clientes', 'Stock'])
  const todo = shellNavigation(catalog('OWNER_NAV'), { modulos: () => true })
  assert.deepEqual(ETIQUETAS(todo), ETIQUETAS(shellNavigation(catalog('OWNER_NAV'))))
})

test('toda vista de módulo del menú pertenece a una sección y su módulo existe en el catálogo', () => {
  const ids = new Set(MODULE_CATALOG.flatMap(modulo => modulo.navIds))
  const sections = shellNavigation(catalog('OWNER_NAV'))
  for (const [id] of sections.flatMap(section => section.items))
    if (ids.has(id)) assert.ok(MODULE_CATALOG.some(modulo => modulo.navIds.includes(id)), id)
})

// ---- Módulos «Inventario por unidades» y «Venta sin stock» ----
const destinoDeStock = modulos => {
  const stock = shellNavigation(catalog('OWNER_NAV'), { modulos }).find(section => section.id === 'stock')
  return { primero: stock.items[0][0], ids: stock.items.map(([id]) => id) }
}

test('ruteo de Stock: apagado abre en Productos; activo abre primero en Inventario (unidades)', () => {
  const apagado = destinoDeStock(conModulos())
  assert.equal(apagado.primero, 'productos')
  assert.ok(!apagado.ids.includes('unidades'))
  assert.ok(apagado.ids.includes('control'), 'las alertas de reposición siguen alcanzables')
  const activo = destinoDeStock(conModulos('inventario-unidades'))
  assert.equal(activo.primero, 'unidades')
  assert.deepEqual(activo.ids.slice(0, 2), ['unidades', 'productos'])
})

test('inventario por unidades: las vistas de unidades pertenecen al módulo y vuelven a Productos al apagarse', () => {
  for (const id of ['unidades', 'vendidos', 'eliminados']) {
    assert.equal(moduloDeVista(id), 'inventario-unidades', id)
    assert.equal(rutaPadreDeVista(id), '/productos', id)
  }
  assert.equal(moduloDeVista('alertas'), null, 'las alertas de reposición son del núcleo')
  assert.equal(moduloDeVista('productos'), null)
  assert.equal(vistaActiva(conModulosFuente(), 'vendidos'), false)
  assert.equal(vistaActiva(conModulosFuente('inventario-unidades'), 'vendidos'), true)
})

test('venta sin stock: «Por comprar» queda visible si está activo este módulo o Abastecimiento', () => {
  assert.equal(vistaActiva(conModulosFuente(), 'abastecimiento'), false)
  assert.equal(vistaActiva(conModulosFuente('venta-sin-stock'), 'abastecimiento'), true)
  assert.equal(vistaActiva(conModulosFuente('abastecimiento'), 'abastecimiento'), true)
  assert.equal(moduloActivo(conModulosFuente('venta-sin-stock'), 'venta-sin-stock'), true)
  assert.equal(moduloActivo(conModulosFuente(), 'venta-sin-stock'), false)
  assert.equal(moduloActivo(conModulosFuente(), 'venta-sin-stock', { demo: true }), true, 'la demo ve ambos módulos activos')
  assert.equal(moduloActivo(conModulosFuente(), 'inventario-unidades', { demo: true }), true)
})

test('Stock en el panel: sin el módulo se redirige a Productos y el POS gobierna «sobre pedido» con el módulo', () => {
  assert.match(panel, /subpadre === 'stock' && modulos\.resuelto && !esTecnico && !modulos\.vistaVisible\('unidades'\)/)
  assert.match(panel, /navigate\('\/productos', \{ replace: true \}\)/)
  const cobro = leerFuente(new URL('../components/ventas/venta/PasoCobro.jsx', import.meta.url), 'utf8')
  assert.match(cobro, /ventaSinStock \?/)
  const venta = leerFuente(new URL('../components/ventas/FormularioVenta.jsx', import.meta.url), 'utf8')
  assert.match(venta, /moduloOn\('venta-sin-stock'\)/)
  assert.match(venta, /const puedeVenderSinStock = ventaSinStock/)
  assert.match(venta, /ventaSinStock=\{ventaSinStock\}/)
})
