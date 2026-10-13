import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SHELL_DESTINATIONS, openShellDestination } from '../../e2e/helpers/shell-navigation.js'
import { shellNavigation, shellContextGroups } from './shellNavigation.js'

const source = readFileSync(
  new URL('../../e2e/helpers/shell-navigation.js', import.meta.url),
  'utf8',
)
const panel = readFileSync(new URL('../pages/PanelVendedor.jsx', import.meta.url), 'utf8')
const shell = readFileSync(new URL('../components/app/AppShell.jsx', import.meta.url), 'utf8')
const delivery = readFileSync(new URL('../pages/PanelDelivery.jsx', import.meta.url), 'utf8')
const catalogs = ['OWNER_NAV', 'SELLER_NAV', 'TECNICO_NAV', 'DELIVERY_NAV'].map(name => {
  const entries =
    (name === 'DELIVERY_NAV' ? delivery : panel).split(`const ${name} = [`)[1]?.split('\n]\n')[0] ||
    ''
  return shellNavigation([
    {
      items: [...entries.matchAll(/\['([^']+)', '([^']+)', '([^']+)'\]/g)].map(m => m.slice(1, 4)),
    },
  ])
})

test('E2E journey contracts identify real permitted primary/context destinations', () => {
  for (const [label, [section, group, destination]] of Object.entries(SHELL_DESTINATIONS)) {
    assert.ok(
      catalogs.some(sections =>
        sections.some(
          item =>
            item.label === section &&
            shellContextGroups(item).some(
              context => context.id === group && context.items.some(([id]) => id === destination),
            ),
        ),
      ),
      label,
    )
  }
})

// Minimal page double: records every click so the journey can be asserted.
function fakePage({ desktop, sectionsInBar = [], segmentsPresent = false }) {
  const calls = []
  const tab = (scope, selector) => ({
    count: async () => 1,
    click: async () => calls.push([scope, selector.match(/data-tab-id="([^"]+)"/)[1]]),
  })
  const button = (scope, name) => ({
    count: async () => (sectionsInBar.includes(name) ? 1 : 0),
    click: async () => calls.push([scope, name]),
    getAttribute: async () => 'page',
  })
  const container = scope => ({
    count: async () => 1,
    locator: selector => {
      const match = selector.match(/\[data-tab-id="([^"]+)"\]\[aria-current="page"\]/)
      return match ? { count: async () => 1 } : tab(scope, selector)
    },
  })
  const bar = scope => ({ getByRole: (_, options) => button(scope, options.name) })
  const page = {
    getByTestId: id => {
      if (id === 'shell-lateral')
        return {
          waitFor: async () => {},
          getByRole: () => ({ isVisible: async () => desktop, ...bar('primary') }),
        }
      if (id === 'shell-bottom-nav') return bar('primary')
      if (id === 'shell-contexto') return container('tab')
      if (id === 'shell-subcontexto')
        return segmentsPresent ? container('segment') : { count: async () => 0 }
      if (id === 'shell-mas')
        return {
          count: async () => 1,
          click: async () => calls.push(['mas', 'Más']),
          getAttribute: async () => 'page',
        }
      if (id === 'shell-mas-hoja') return bar('sheet')
      throw new Error(id)
    },
  }
  return { page, calls }
}

test('desktop journey clicks the primary section and its context tab, never route shortcuts', async () => {
  const { page, calls } = fakePage({ desktop: true, sectionsInBar: ['Clientes', 'Stock'] })
  await openShellDestination(page, 'Promociones')
  assert.deepEqual(calls, [
    ['primary', 'Clientes'],
    ['tab', 'promociones'],
  ])
  assert.doesNotMatch(source, /\.goto\(|\.navigate\(/)
  assert.doesNotMatch(source, /selectOption/, 'tabs are clicked, never chosen from a native select')
})

test('segmented destinations are reached by clicking the tab, then the segment', async () => {
  const { page, calls } = fakePage({ desktop: true, sectionsInBar: ['Stock'], segmentsPresent: true })
  await openShellDestination(page, 'Lista por modelo')
  assert.deepEqual(calls, [
    ['primary', 'Stock'],
    ['tab', 'precios'],
    ['segment', 'celulares'],
  ])
})

test('mobile journey reaches sections outside the bottom bar through the Más sheet', async () => {
  const { page, calls } = fakePage({ desktop: false, sectionsInBar: ['Stock'] })
  await openShellDestination(page, 'Compras del Centro')
  assert.deepEqual(calls, [
    ['mas', 'Más'],
    ['sheet', 'Compras'],
    ['tab', 'compras-centro'],
  ])
})

test('unknown journey fails closed without clicking a destination', async () => {
  const page = {
    getByTestId: () => ({
      waitFor: async () => {},
      getByRole: () => ({ isVisible: async () => true }),
    }),
  }
  await assert.rejects(openShellDestination(page, 'Unknown'), /Unknown shell journey/)
})

test('profile tenant identity uses only the existing server-derived company name', () => {
  const profile = shell.slice(shell.indexOf('title="Perfil y preferencias"'))
  assert.match(profile, /empresa\?\.nombre &&/)
  assert.match(profile, /data-testid="shell-empresa"[^>]*>\{empresa\.nombre\}/)
  assert.match(profile, /data-testid="shell-bloquear"/)
  assert.doesNotMatch(profile, /localStorage.*empresa|Mi tienda/)
  assert.match(
    source,
    /\.or\(page\.getByTestId\('shell-perfil-mobile'\)\)[\s\S]*?\.filter\(\{ visible: true \}\)[\s\S]*?\.click\(\)/,
  )
})
