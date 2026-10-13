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

test('desktop journey uses primary and scoped context controls, never route shortcuts', async () => {
  const calls = []
  const primary = {
    getByRole: (_, options) => ({
      click: async () => calls.push(['primary', options.name]),
      getAttribute: async () => 'page',
    }),
  }
  const context = {
    count: async () => 1,
    locator: () => ({
      isVisible: async () => false,
      locator: () => ({ textContent: async () => 'Clientes' }),
    }),
    getByRole: (role, options) =>
      role === 'combobox'
        ? {}
        : { click: async () => calls.push(['context', options.name]) },
  }
  const page = {
    getByTestId: id =>
      id === 'shell-lateral'
        ? { waitFor: async () => {}, getByRole: () => ({ ...primary, isVisible: async () => true }) }
        : id === 'shell-contexto'
          ? context
          : { getByRole: () => ({ count: async () => 0 }) },
  }
  await openShellDestination(page, 'Clientes')
  assert.deepEqual(calls, [
    ['primary', 'Ventas'],
    ['context', 'Clientes'],
  ])
  assert.doesNotMatch(source, /\.goto\(|\.navigate\(/)
})

test('mobile journey selects the real native area rather than a hidden desktop button', async () => {
  const calls = []
  const page = {
    getByTestId: id =>
      id === 'shell-lateral'
        ? { waitFor: async () => {}, getByRole: () => ({ isVisible: async () => false }) }
        : id === 'shell-bottom-nav'
          ? {
            getByRole: (_, options) => ({
              click: async () => calls.push(options.name),
              getAttribute: async () => 'page',
            }),
          }
          : id === 'shell-contexto'
            ? {
                count: async () => 1,
                locator: () => ({
                  isVisible: async () => true,
                  selectOption: async value => calls.push(value),
                  inputValue: async () => 'clientes',
                }),
              }
            : { getByRole: () => ({ count: async () => 0 }) },
  }
  await openShellDestination(page, 'Clientes')
  assert.deepEqual(calls, ['Ventas', 'clientes'])
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
