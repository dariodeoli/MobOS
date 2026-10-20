// #344: real POS components, simulated customer/RUC/order HTTP contracts.
// No provider credentials, provider calls, or real customer data are used.
import { test, expect } from './helpers/seller-test.js'
import { SEED } from './helpers/seed-data.js'

const fixture = (extra = {}) => ({ id: 'fiscal-contract-344', name: 'Fiscal Contract 344', phone: null, email: null, addresses: [], nameOfficial: null, identityKind: null, givenNames: null, surnames: null, ...extra })
async function selected(page, customer) {
  await page.route('**/api/customers?*', route => route.fulfill({ json: [customer] }))
  await page.route(`**/api/customers/${customer.id}`, route => route.fulfill({ json: customer }))
  await page.goto('/pos')
  await page.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill('Fiscal Contract')
  await page.getByRole('button', { name: new RegExp(customer.name) }).click()
  await page.getByRole('button', { name: 'Editar datos del cliente', exact: true }).click()
  await expect(page.getByTestId('confirmar-cliente')).toBeVisible()
}
async function sale(page) {
  await page.getByPlaceholder('Buscar producto…').fill('Cable')
  await page.getByRole('button', { name: new RegExp(SEED.products.cable.name) }).click()
  await page.getByTestId('carrito-listo').click()
  const request = page.waitForRequest(r => r.url().endsWith('/api/orders') && r.method() === 'POST')
  // Return an honest simulated failure to stay on POS and inspect emitted data.
  await page.route('**/api/orders', route => route.request().method() === 'POST'
    ? route.fulfill({ status: 409, json: { error: 'Contrato de venta simulado' } }) : route.continue())
  await page.getByRole('button', { name: /^Crear pedido sin pago/ }).click()
  return (await request).postDataJSON()
}
async function confirm(page, customer, method = 'PATCH') {
  const requests = []
  await page.route('**/api/customers' + (method === 'PATCH' ? '/*' : ''), async route => {
    if (route.request().method() !== method) return route.continue()
    requests.push(route.request().postDataJSON())
    await route.fulfill({ status: method === 'POST' ? 201 : 200, json: { ...customer, ...requests.at(-1) } })
  })
  await page.getByTestId('confirmar-cliente').click()
  await expect(page.getByTestId('cliente-elegido')).toBeVisible()
  expect(requests).toHaveLength(1)
  return requests[0]
}

test('nullable API identity: confirming the actual selected card omits fiscal deletion', async ({ page }) => {
  const customer = fixture()
  await selected(page, customer)
  const payload = await confirm(page, customer)
  for (const key of ['nameOfficial', 'identityKind', 'givenNames', 'surnames']) expect(payload).not.toHaveProperty(key)
})

test('persisted PERSON without phone/email sends identity on confirmation and sale', async ({ page }) => {
  const identity = { nameOfficial: '  JUAN PEREZ  ', identityKind: 'PERSON', givenNames: 'Juan', surnames: 'Pérez' }
  const customer = fixture(identity)
  await selected(page, customer)
  await expect(page.getByRole('dialog', { name: 'Datos del cliente' })).toBeVisible()
  await expect(page.getByLabel('Nombre del cliente en ficha', { exact: true })).toHaveCount(1)
  await page.getByLabel('Nombre del cliente en ficha', { exact: true }).fill('Nombre visible corregido')
  expect(await confirm(page, customer)).toMatchObject({ ...identity, name: 'Nombre visible corregido' })
  const order = await sale(page)
  expect(order.customerId).toBe(customer.id)
  expect(order.customer).toEqual(identity)
})

test('long fiscal text remains exact through accepted RUC, manual visible name, POST/PATCH and sale', async ({ page }) => {
  const official = `  ${'EMPRESA FISCAL; '.repeat(120)}  `
  expect(official.length).toBeGreaterThan(200)
  expect(official.length).toBeLessThanOrEqual(2000)
  let searchRequests = 0
  let releaseSearch
  await page.route('**/api/customers?*', async route => {
    searchRequests += 1
    await new Promise(resolve => { releaseSearch = resolve })
    await route.fulfill({ json: [fixture({ id: 'wrong-homonym', name: 'Fiscal temporal' })] })
  })
  await page.route('**/api/ruc?*', route => route.fulfill({ json: {
    reviewRequired: true, source: { provider: 'OwnData' }, query: { normalized: '80012345', fullRuc: '80012345-0' },
    result: { ruc: '80012345', dv: '0', fullRuc: '80012345-0', nameOfficial: official, stateRaw: 'ACTIVO', equivalenceRaw: 'SOCIEDAD' },
  } }))
  await page.goto('/pos')
  await page.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill('Fiscal temporal')
  await expect.poll(() => typeof releaseSearch).toBe('function')
  await page.getByText('Datos de contacto, RUC/CI y direcciones').click()
  await page.getByLabel('Nombre del cliente en ficha', { exact: true }).fill('')
  const staleResponse = page.waitForResponse(r => r.url().includes('/api/customers?q='))
  releaseSearch()
  await staleResponse
  await expect(page.getByLabel('Nombre del cliente en ficha', { exact: true })).toHaveValue('')
  await expect(page.getByRole('dialog', { name: 'Datos del cliente' })).toBeVisible()
  await page.getByLabel('CI o RUC del cliente', { exact: true }).fill('80012345')
  await page.getByRole('button', { name: 'Extraer los datos del RUC' }).click()
  await page.getByRole('button', { name: 'Usar estos datos' }).click()
  await expect(page.getByRole('dialog', { name: 'Datos del cliente' })).toBeVisible()
  await expect(page.getByLabel('Nombre del cliente en ficha', { exact: true })).toHaveCount(1)
  await expect(page.getByLabel('Nombre del cliente en ficha', { exact: true })).toHaveAttribute('maxlength', '200')
  await page.getByLabel('Nombre del cliente en ficha', { exact: true }).fill('Mostrador manual')
  // Wait beyond the search debounce: a card edit must never start a lookup.
  await page.waitForTimeout(350)
  expect(searchRequests).toBe(1)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Datos del cliente' })).toHaveCount(0)
  await expect(page.getByLabel('Nombre, teléfono, CI o RUC del cliente')).toHaveValue('Mostrador manual')
  await page.waitForTimeout(350)
  expect(searchRequests).toBe(1)
  await page.getByText('Datos de contacto, RUC/CI y direcciones').click()
  const customer = fixture({ name: 'Mostrador manual', nameOfficial: official })
  expect(await confirm(page, customer, 'POST')).toMatchObject({ name: customer.name, nameOfficial: official })
  await page.getByRole('button', { name: 'Editar datos del cliente', exact: true }).click()
  expect(await confirm(page, customer)).toMatchObject({ name: customer.name, nameOfficial: official })
  const order = await sale(page)
  expect(order.customerId).toBe(customer.id)
  expect(order.customer.nameOfficial).toBe(official)
})

test('customer 409 keeps editing data/error visible and retry 201 closes the editor', async ({ page }) => {
  await page.route('**/api/customers?*', route => route.fulfill({ json: [] }))
  await page.goto('/pos')
  await page.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill('Cliente reintento 344')
  await page.getByText('Datos de contacto, RUC/CI y direcciones').click()
  await page.getByLabel('Correo del cliente').fill('retry344@example.com')
  const requests = []
  await page.route('**/api/customers', async route => {
    requests.push(route.request().postDataJSON())
    await route.fulfill(requests.length === 1 ? { status: 409, json: { message: 'Conflicto fiscal simulado' } }
      : { status: 201, json: fixture(requests.at(-1)) })
  })
  await page.getByTestId('confirmar-cliente').click()
  await expect(page.getByTestId('cliente-guardado')).toContainText('Conflicto fiscal simulado')
  await expect(page.getByTestId('confirmar-cliente')).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Datos del cliente' })).toBeVisible()
  await expect(page.getByLabel('Correo del cliente')).toHaveValue('retry344@example.com')
  await page.getByTestId('confirmar-cliente').click()
  await expect(page.getByTestId('cliente-elegido')).toBeVisible()
  await expect(page.getByTestId('confirmar-cliente')).not.toBeVisible()
  expect(requests).toHaveLength(2)
  expect(requests[1]).toEqual(requests[0])
})
