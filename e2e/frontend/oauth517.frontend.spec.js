import { test, expect } from '@playwright/test'

const empresa = { tenant: { id: 'empresa-517', name: 'Empresa ficticia 517' }, sellers: [{ id: 'persona-517', name: 'Persona ficticia' }] }
const diferida = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve } }
async function fixture(page) {
  await page.route('**/api/**', route => new URL(route.request().url()).pathname.startsWith('/api/') ? route.fulfill({ status: 401, json: { message: 'Sin sesión de vendedor' } }) : route.continue())
  await page.route(/https:\/\//, route => route.abort())
  await page.route('**/login?*', async route => {
    const url = new URL(route.request().url())
    url.pathname = '/e2e/fixtures/auth516.html'
    return route.continue({ url: url.href })
  })
}
async function contexto(page) { return page.evaluate(() => JSON.parse(localStorage.getItem('owncoding_hub_company_context') || 'null')) }

for (const strict of [false, true]) test(`#517 fresh callback ${strict ? 'StrictMode' : 'normal'}: sin probes401, un POST y selección hasta PIN`, async ({ page }) => {
  await fixture(page)
  let probes = 0
  await page.route('**/api/auth/me', route => { probes++; return route.fulfill({ status: 401, json: { message: 'Sin sesión de vendedor' } }) })
  const start = diferida(), finish = diferida(), cuerpos = []
  await page.addInitScript(() => localStorage.setItem('owncoding_hub_company_context', JSON.stringify({ tenant: { id: 'empresa-antigua', name: 'No mostrar anterior' }, cookieSession: true, sellers: [{ id: 'anterior', name: 'No mostrar persona anterior' }] })))
  await page.route('**/api/auth/google/complete', async route => {
    cuerpos.push(route.request().postDataJSON())
    if (cuerpos.length === 1) {
      start.resolve(); await finish.promise
      return route.fulfill({ json: { storeRequired: true, stores: [{ id: empresa.tenant.id, name: empresa.tenant.name }] } })
    }
    return route.fulfill({ json: empresa })
  })
  await page.goto(`/login?plataforma=web&google=ready${strict ? '&strict=1' : ''}`)
  await expect(page.locator('main')).toBeVisible()
  await start.promise
  await expect(page.getByRole('button', { name: 'Conectando con Google…', exact: true })).toBeVisible()
  await expect(page.getByText('No mostrar anterior', { exact: true })).toHaveCount(0)
  finish.resolve()
  await expect(page.getByRole('button', { name: empresa.tenant.name, exact: true })).toBeVisible()
  expect(await contexto(page)).toEqual({ stores: [{ id: empresa.tenant.id, name: empresa.tenant.name }] })
  await page.getByRole('button', { name: empresa.tenant.name, exact: true }).click()
  await expect(page.locator('#seller-pin')).toBeVisible()
  expect(cuerpos).toEqual([{ action: 'login' }, { action: 'login', storeId: empresa.tenant.id }])
  expect(probes).toBe(0)
  expect((await contexto(page)).tenant.id).toBe(empresa.tenant.id)
})

for (const orden of ['probe-primero', 'credencial-primero']) test(`#517 correo ${orden}: arranque no borra empresa nueva`, async ({ page }) => {
  await fixture(page)
  const started = diferida(), release = diferida(); let probes = 0, logins = 0
  await page.route('**/api/auth/me', async route => { probes++; started.resolve(); await release.promise; await route.fulfill({ status: 401, json: { message: 'Sin sesión de vendedor' } }).catch(() => {}) })
  await page.route('**/api/auth/login', route => { logins++; return route.fulfill({ json: empresa }) })
  await page.goto('/login?plataforma=web')
  await started.promise
  if (orden === 'probe-primero') { release.resolve(); await expect(page.getByText('Verificando tu sesión…')).toHaveCount(0) }
  await page.locator('#mail').fill('fixture@example.invalid'); await page.locator('#pass').fill('Fixture517!')
  await page.getByRole('button', { name: 'Continuar', exact: true }).click()
  await expect(page.locator('#seller-pin')).toBeVisible()
  release.resolve()
  await expect.poll(async () => (await contexto(page))?.tenant?.id).toBe(empresa.tenant.id)
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(logins).toBe(1); expect(probes).toBe(1)
})

for (const cambio of ['A-B-A', 'rol', 'logout', 'unmount']) test(`#517 ${cambio}: callback tardío no persiste ni restaura contexto`, async ({ page }) => {
  await fixture(page)
  const started = diferida(), release = diferida(), ended = diferida()
  const salidaIniciada = diferida(), salidaLiberada = diferida()
  let salida
  if (cambio === 'logout') await page.route('**/api/auth/logout', async route => { salidaIniciada.resolve(); await salidaLiberada.promise; await route.fulfill({ json: { ok: true } }) })
  await page.route('**/api/auth/google/complete', async route => {
    started.resolve(); await release.promise
    await route.fulfill({ json: empresa }); ended.resolve()
  })
  await page.goto(`/login?plataforma=web&google=ready${cambio === 'unmount' ? '&desmontable=1&observarOAuth=1' : ''}`)
  await started.promise
  if (cambio === 'unmount') await page.getByTestId('desmontar-login').click()
  else if (cambio === 'logout') {
    salida = page.evaluate(async () => (await import('/src/lib/api/session.js')).sessionApi.logout())
    await salidaIniciada.promise
  } else await page.evaluate(async cambio => {
    const { activarContextoSnapshots } = await import('/src/lib/offline/snapshot.js')
    const base = { empresaId: 'A', sucursalId: 'local-A', userId: 'persona-A', rol: 'OWNER', permisos: ['ventas'], fuente: 'api' }
    activarContextoSnapshots(base)
    if (cambio === 'A-B-A') { activarContextoSnapshots({ ...base, empresaId: 'B' }); activarContextoSnapshots(base) }
    else activarContextoSnapshots({ ...base, rol: 'SELLER', permisos: [] })
  }, cambio)
  release.resolve(); await ended.promise
  if (cambio !== 'unmount') await expect(page.getByRole('alert')).toContainText('El contexto de acceso cambió.')
  else {
    await expect(page.locator('html')).toHaveAttribute('data-oauth-finalizado', '1')
    await expect(page.locator('html')).toHaveAttribute('data-oauth-resultado', 'CONTEXT_CHANGED')
    await expect(page.getByRole('heading', { name: 'Entrá a tu tienda' })).toHaveCount(0)
  }
  expect(await contexto(page)).toBeNull()
  if (salida) { salidaLiberada.resolve(); await salida }
})

test('#517 continuación selección y desmontaje: no guarda empresa de respuesta tardía', async ({ page }) => {
  await fixture(page)
  const started = diferida(), release = diferida(), ended = diferida()
  const stores = [{ id: empresa.tenant.id, name: empresa.tenant.name }]
  let llamadas = 0
  await page.route('**/api/auth/google/complete', async route => {
    llamadas++
    if (llamadas === 1) return route.fulfill({ json: { storeRequired: true, stores } })
    started.resolve(); await release.promise
    await route.fulfill({ json: empresa }); ended.resolve()
  })
  await page.goto('/login?plataforma=web&google=ready&desmontable=1&observarOAuth=1')
  await page.getByRole('button', { name: empresa.tenant.name, exact: true }).click()
  await started.promise
  await expect(page.locator('html')).toHaveAttribute('data-oauth-finalizado', '1')
  await page.getByTestId('desmontar-login').click()
  release.resolve(); await ended.promise
  await expect(page.locator('html')).toHaveAttribute('data-oauth-finalizado', '2')
  await expect(page.locator('html')).toHaveAttribute('data-oauth-resultado', 'CONTEXT_CHANGED')
  await expect(page.getByRole('heading', { name: 'Entrá a tu tienda' })).toHaveCount(0)
  expect(await contexto(page)).toEqual({ stores })
  expect(llamadas).toBe(2)
})

for (const proveedor of ['apple', 'google']) test(`#517 ${proveedor} nativo espera cancelar el probe previo antes de la credencial`, async ({ page }) => {
  await fixture(page)
  const started = diferida(), release = diferida(); let probes = 0, logins = 0
  await page.route('**/api/auth/me', async route => { probes++; started.resolve(); await release.promise; await route.fulfill({ status: 401, json: { message: 'Sin sesión de vendedor' } }).catch(() => {}) })
  const nombre = proveedor === 'apple' ? 'Apple' : 'Google'
  await page.route(`**/src/lib/nativo/${proveedor}.js*`, route => {
    if (route.request().url().includes('fixture-original')) return route.continue()
    return route.fulfill({ contentType: 'application/javascript', body: `export * from '/src/lib/nativo/${proveedor}.js?fixture-original'; export async function iniciarSesionCon${nombre}() { return { identityToken: 'fixture-token', idToken: 'fixture-token', authorizationCode: 'fixture-code', nonce: '${'a'.repeat(64)}' } }` })
  })
  await page.route(`**/api/auth/${proveedor === 'apple' ? 'apple' : 'google/native'}`, route => { logins++; return route.fulfill({ json: empresa }) })
  await page.goto('/login?plataforma=ios')
  await started.promise
  await page.getByRole('button', { name: `Continuar con ${nombre}`, exact: true }).click()
  await expect(page.locator('#seller-pin')).toBeVisible()
  release.resolve()
  await expect.poll(async () => (await contexto(page))?.tenant?.id).toBe(empresa.tenant.id)
  expect(logins).toBe(1); expect(probes).toBe(1)
})

test('#517 denegación401 del callback conserva purga502 y error explícito', async ({ page }) => {
  await fixture(page)
  await page.route('**/api/auth/google/complete', route => route.fulfill({ status: 401, json: { message: 'Identidad ficticia vencida' } }))
  await page.goto('/login?plataforma=web&google=ready')
  await expect(page.getByRole('alert')).toContainText('Identidad ficticia vencida')
  await expect(page.getByRole('button', { name: 'Continuar con Google', exact: true })).toBeEnabled()
  expect(await page.evaluate(async () => (await import('/src/lib/offline/snapshot.js')).generacionSnapshots())).toBeGreaterThan(0)
  expect(await contexto(page)).toBeNull()
})

test('#517 registro desde identidad Google no vuelve a probar me al pasar a PIN', async ({ page }) => {
  await fixture(page)
  let probes = 0
  await page.route('**/api/auth/me', route => { probes++; return route.fulfill({ status: 401, json: { message: 'Sin vendedor todavía' } }) })
  const cuerpos = []
  await page.route('**/api/auth/google/complete', route => {
    cuerpos.push(route.request().postDataJSON())
    return cuerpos.length === 1
      ? route.fulfill({ status: 400, json: { code: 'onboarding_required', message: 'Elegí el nombre de la tienda' } })
      : route.fulfill({ json: empresa })
  })
  await page.goto('/login?plataforma=web&google=ready')
  await page.getByLabel('Nombre de la tienda', { exact: true }).fill('Empresa ficticia 517')
  await page.getByRole('button', { name: 'Crear mi tienda', exact: true }).click()
  await expect(page.locator('#seller-pin')).toBeVisible()
  expect(cuerpos).toEqual([{ action: 'login' }, { action: 'create', companyName: 'Empresa ficticia 517' }])
  expect(probes).toBe(0)
  expect((await contexto(page)).tenant.id).toBe(empresa.tenant.id)
})
