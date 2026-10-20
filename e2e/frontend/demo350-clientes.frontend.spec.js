import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

async function capture(page, name) {
  const out = process.env.CAPTURE_350
  if (out) { await mkdir(out, { recursive: true }); await page.screenshot({ path: `${out}/${name}.png` }) }
}

async function enterDemo(page) {
  const writes = []
  await page.route('**/api/**', route => {
    if (!new URL(route.request().url()).pathname.startsWith('/api/')) return route.continue()
    // Public page-view telemetry is expected and intercepted too; it never
    // reaches a server and is not a customer persistence request.
    if (new URL(route.request().url()).pathname !== '/api/public/track' && !['GET', 'HEAD', 'OPTIONS'].includes(route.request().method())) writes.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`)
    return route.fulfill({ status: 503, json: { message: 'Frontend-only demo; no API allowed' } })
  })
  await page.route(/https:\/\//, route => route.abort())
  await page.addInitScript(() => {
    sessionStorage.setItem('mobos:demo-guia-vista', '1')
    localStorage.setItem('mobos:aviso-metricas', '1')
  })
  await page.goto('/demo')
  await page.getByRole('button', { name: 'Entrar como Dueño', exact: true }).click()
  await page.getByTestId('shell-lateral').getByRole('button', { name: 'Vender', exact: true }).click()
  return writes
}
const cards = page => page.evaluate(async () => (await import('/src/lib/demoClientes.js')).listarClientesDemo())
async function newEditor(page, name) {
  await page.getByText('Datos de contacto, RUC/CI y direcciones', { exact: true }).click()
  const editor = page.getByRole('dialog', { name: 'Datos del cliente', exact: true })
  await editor.getByLabel('Nombre del cliente en ficha', { exact: true }).fill(name)
  return editor
}

test('demo POS saves/selects a new customer, address, portfolio and reopening without real writes', async ({ page }) => {
  const writes = await enterDemo(page)
  const name = 'Cliente Nuevo Demo350'
  const editor = await newEditor(page, name)
  await editor.getByLabel('Correo del cliente').fill('nuevo350@example.invalid')
  await editor.getByTestId('confirmar-cliente').click()
  await expect(editor).toBeHidden()
  await expect(page.getByTestId('cliente-elegido')).toContainText(name)
  await expect(page.getByTestId('cliente-guardado')).toContainText('guardado en esta demo')
  await capture(page, 'cliente-guardado')
  const created = (await cards(page)).find(row => row.name === name)
  expect(created.id).toMatch(/^demo-cliente-/)
  await page.getByRole('button', { name: 'Editar datos del cliente', exact: true }).click()
  await editor.getByRole('button', { name: 'Nueva dirección', exact: true }).click()
  await editor.getByLabel('Dirección', { exact: true }).fill('Calle sintética 350')
  await editor.getByRole('button', { name: 'Guardar dirección en cliente', exact: true }).click()
  await expect(editor.getByTestId('cliente-guardado')).toContainText('Dirección guardada en esta demo')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Editar datos del cliente', exact: true }).click()
  await expect(editor.getByLabel('Dirección', { exact: true })).toHaveValue('Calle sintética 350')
  await editor.getByLabel('Dirección', { exact: true }).scrollIntoViewIfNeeded()
  await capture(page, 'direccion-reabierta')
  await page.keyboard.press('Escape')
  const stored = (await cards(page)).filter(row => row.id === created.id)
  expect(stored).toHaveLength(1)
  expect(stored[0].addresses[0].address).toBe('Calle sintética 350')
  await page.getByTestId('shell-lateral').getByRole('button', { name: 'Clientes', exact: true }).click()
  await expect(page.getByTestId('cliente-fila').filter({ hasText: name }).filter({ visible: true })).toHaveCount(1)
  await capture(page, 'cartera-cliente-guardado')
  expect(writes).toEqual([])
})

test('demo seed edits keep id, profile and one portfolio row; reload restores seed', async ({ page }) => {
  const writes = await enterDemo(page)
  const seed = (await cards(page)).find(row => row.name === 'María González')
  await page.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill(seed.name)
  await expect(page.getByTestId('cliente-elegido')).toBeVisible()
  await page.getByRole('button', { name: 'Editar datos del cliente', exact: true }).click()
  const editor = page.getByRole('dialog', { name: 'Datos del cliente', exact: true })
  await editor.getByLabel('Nombre del cliente en ficha', { exact: true }).fill('María Demo350 Corregida')
  await editor.getByTestId('confirmar-cliente').click()
  await expect(page.getByTestId('cliente-elegido')).toContainText('María Demo350 Corregida')
  const edited = (await cards(page)).filter(row => row.id === seed.id)
  expect(edited).toHaveLength(1)
  expect(edited[0].demoProfile).toEqual(seed.demoProfile)
  await page.reload()
  await expect(page.getByTestId('shell')).toBeVisible()
  const reset = (await cards(page)).find(row => row.id === seed.id)
  expect(reset.name).toBe(seed.name)
  expect(reset.addresses).toEqual(seed.addresses)
  expect(writes).toEqual([])
})

test('demo reset discards a created card and restores seeds without real writes', async ({ page }) => {
  const writes = await enterDemo(page)
  const editor = await newEditor(page, 'Cliente Reset Demo350')
  await editor.getByTestId('confirmar-cliente').click()
  await expect(page.getByTestId('cliente-elegido')).toContainText('Cliente Reset Demo350')
  await page.getByRole('button', { name: 'Salir de la demo', exact: true }).click()
  await page.getByRole('dialog', { name: '¿Cerrar sesión?' }).getByRole('button', { name: 'Salir', exact: true }).click()
  await expect(page).toHaveURL(/\/login/)
  await page.goto('/demo')
  await page.getByRole('button', { name: 'Entrar como Dueño', exact: true }).click()
  const reset = await cards(page)
  expect(reset.some(row => row.name === 'Cliente Reset Demo350')).toBe(false)
  expect(reset.some(row => row.name === 'María González')).toBe(true)
  expect(writes).toEqual([])
})

test('the built-in RUC fixture creates/selects a demo card without provider requests', async ({ page }) => {
  const writes = await enterDemo(page)
  const lookups = []
  page.on('request', request => { if (request.url().includes('/api/public/ruc')) lookups.push(request.url()) })
  const editor = await newEditor(page, 'Cliente RUC Demo350')
  await editor.getByLabel('CI o RUC del cliente', { exact: true }).fill('5215244')
  await editor.getByRole('button', { name: 'Extraer los datos del RUC' }).click()
  await editor.getByRole('button', { name: 'Usar estos datos' }).click()
  await expect(page.getByTestId('cliente-elegido')).toContainText('Cliente RUC Demo350')
  const created = (await cards(page)).find(row => row.name === 'Cliente RUC Demo350')
  expect(created.id).toMatch(/^demo-cliente-/)
  expect(created.nameOfficial).toBe('DISTRIBUIDORA AURORA S.A.')
  expect(created.document).toBe('5215244-8')
  expect(lookups).toEqual([])
  expect(writes).toEqual([])
})

test('long fiscal data stays recoverable until a valid visible demo name is confirmed', async ({ page }) => {
  const writes = await enterDemo(page)
  const initialCount = (await cards(page)).length
  const official = `  ${'FISCAL; '.repeat(240)}  `
  // Local HTTP fixture only: this request is fulfilled here, never a provider.
  await page.route('**/api/public/ruc?*', route => route.fulfill({ json: {
    reviewRequired: true, source: { provider: 'OwnData' }, query: { normalized: '80012345', fullRuc: '80012345-0' },
    result: { ruc: '80012345', dv: '0', fullRuc: '80012345-0', nameOfficial: official, stateRaw: 'ACTIVO', equivalenceRaw: 'SOCIEDAD' },
  } }))
  const editor = await newEditor(page, '')
  await editor.getByLabel('CI o RUC del cliente', { exact: true }).fill('80012345')
  await editor.getByRole('button', { name: 'Extraer los datos del RUC' }).click()
  await editor.getByRole('button', { name: 'Usar estos datos' }).click()
  await expect(editor).toBeVisible()
  await expect(editor.getByRole('alert')).toContainText(/nombre visible/)
  expect((await cards(page)).length).toBe(initialCount)
  await editor.getByLabel('Nombre del cliente en ficha', { exact: true }).fill('Fiscal visible Demo350')
  await editor.getByTestId('confirmar-cliente').click()
  await expect(page.getByTestId('cliente-elegido')).toContainText('Fiscal visible Demo350')
  const created = (await cards(page)).find(row => row.name === 'Fiscal visible Demo350')
  expect(created.nameOfficial).toBe(official)
  expect(created.id).toMatch(/^demo-cliente-/)
  expect(writes).toEqual([])
})
