import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

// #377 · Selector de empresa y crear empresa. Frontend-only: la API completa se
// simula con estado (empresa activa) para ejercitar lista, cambio con recarga
// completa, aviso de ventas sin enviar y alta de empresa.
const out = process.env.MOBOS_QA_OUT || '/tmp/mobos-multiempresa-qa'

const EMPRESAS = {
  'tenant-a': { id: 'tenant-a', name: 'Tienda Alfa', slug: 'alfa', role: 'OWNER' },
  'tenant-b': { id: 'tenant-b', name: 'Tienda Beta', slug: 'beta', role: 'ADMIN' },
}

async function montar(page, { tenants = ['tenant-a', 'tenant-b'], canCreate = true, sinSellerEnDestino = false } = {}) {
  const estado = { actual: tenants[0], creadas: [], switches: [], user: true }
  const usuarioDe = (id) => ({
    id: `user-${id}`,
    name: `Dueño ${EMPRESAS[id].name}`,
    role: 'ADMIN',
    tenantId: id,
    branchId: `branch-${id}`,
    branchName: `Sucursal ${EMPRESAS[id].name}`,
  })
  await page.route(/https:\/\//, (route) => route.abort())
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (!path.startsWith('/api/')) return route.continue()
    const metodo = request.method()
    if (path === '/api/auth/me') {
      if (!estado.user) return route.fulfill({ status: 401, json: { message: 'Sin sesión de vendedor' } })
      return route.fulfill({ status: 200, json: { user: usuarioDe(estado.actual), tenant: { id: estado.actual, name: EMPRESAS[estado.actual].name } } })
    }
    if (path === '/api/auth/tenants') {
      return route.fulfill({
        status: 200,
        json: { tenants: tenants.map((id) => ({ ...EMPRESAS[id], current: id === estado.actual })), canCreate },
      })
    }
    if (path === '/api/auth/switch-tenant' && metodo === 'POST') {
      const { tenantId } = request.postDataJSON()
      estado.switches.push(tenantId)
      estado.actual = tenantId
      estado.user = !sinSellerEnDestino
      return route.fulfill({
        status: 200,
        json: { tenant: EMPRESAS[tenantId], sellers: [{ id: 'seller-1', name: 'Vendedor Beta' }], user: sinSellerEnDestino ? null : usuarioDe(tenantId), scope: 'company' },
      })
    }
    if (path === '/api/auth/companies' && metodo === 'POST') {
      const { companyName } = request.postDataJSON()
      estado.creadas.push(companyName)
      EMPRESAS['tenant-nueva'] = { id: 'tenant-nueva', name: companyName, slug: 'nueva', role: 'OWNER' }
      tenants.push('tenant-nueva')
      estado.actual = 'tenant-nueva'
      estado.user = true
      return route.fulfill({ status: 201, json: { tenant: EMPRESAS['tenant-nueva'], sellers: [], user: usuarioDe('tenant-nueva'), scope: 'company' } })
    }
    if (path === '/api/inventory/branches') return route.fulfill({ status: 200, json: [{ id: `branch-${estado.actual}`, name: `Sucursal ${EMPRESAS[estado.actual].name}` }] })
    if (path === '/api/orders' && metodo === 'POST') return route.fulfill({ status: 503, json: { message: 'Sin servidor de prueba' } })
    return route.fulfill({ status: 200, json: [] })
  })
  await page.addInitScript(() => {
    try {
      localStorage.setItem('mobos:theme', localStorage.getItem('mobos:theme') || 'light')
      sessionStorage.setItem('mobos:demo-guia-vista', '1')
    } catch { /* sin storage */ }
  })
  return estado
}

async function medirAncho(page) {
  return page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, ancho: innerWidth }))
}

test('1440 claro: el selector lista las empresas, marca la actual y cierra con Esc', async ({ page }) => {
  await mkdir(out, { recursive: true })
  await page.setViewportSize({ width: 1440, height: 900 })
  await montar(page)
  await page.goto('/')
  await expect(page.getByTestId('shell')).toBeVisible()
  const selector = page.getByTestId('empresa-selector')
  await expect(selector).toBeVisible()
  await expect(selector).toHaveAttribute('aria-label', 'Empresa: Tienda Alfa')
  expect((await selector.boundingBox()).height).toBeGreaterThanOrEqual(44)
  await selector.click()
  const menu = page.getByTestId('empresa-menu')
  await expect(menu).toBeVisible()
  await expect(page.getByTestId('empresa-opcion-tenant-a')).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByTestId('empresa-opcion-tenant-b')).toHaveAttribute('aria-checked', 'false')
  await expect(menu.getByText('Dueño', { exact: true })).toBeVisible()
  await expect(menu.getByText('Admin', { exact: true })).toBeVisible()
  await expect(page.getByTestId('empresa-crear')).toBeVisible()
  for (const id of ['empresa-opcion-tenant-a', 'empresa-opcion-tenant-b', 'empresa-crear'])
    expect((await page.getByTestId(id).boundingBox()).height, id).toBeGreaterThanOrEqual(44)
  const m = await medirAncho(page)
  expect(m.scroll, 'scroll horizontal').toBeLessThanOrEqual(m.ancho)
  await page.screenshot({ path: `${out}/multiempresa-1440.png`, clip: { x: 640, y: 0, width: 800, height: 360 } })
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
})

test('cambiar de empresa recarga completo y no deja nada de la anterior', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const estado = await montar(page)
  await page.addInitScript(() => {
    try {
      localStorage.setItem('mobos:pos-cart:v1:tenant-a:branch-tenant-a:user-tenant-a', JSON.stringify({ items: [{ key: 'a1', productoId: 'pa', nombre: 'Accesorio de Alfa', quantity: 1, precio: 100000 }], customer: {} }))
    } catch { /* sin storage */ }
  })
  await page.goto('/')
  await expect(page.getByTestId('empresa-selector')).toHaveAttribute('aria-label', 'Empresa: Tienda Alfa')
  await page.evaluate(() => { window.__sinRecarga = true })
  await page.getByTestId('empresa-selector').click()
  await page.getByTestId('empresa-opcion-tenant-b').click()
  await expect.poll(() => estado.switches).toEqual(['tenant-b'])
  // Si la página no se recargó, el marcador sigue vivo.
  await page.waitForFunction(() => window.__sinRecarga === undefined)
  await expect(page.getByTestId('empresa-selector')).toHaveAttribute('aria-label', 'Empresa: Tienda Beta')
  await expect(page.getByTestId('shell')).toBeVisible()
  await expect(page.locator('body')).not.toContainText('Tienda Alfa')
  const contexto = await page.evaluate(() => JSON.parse(localStorage.getItem('owncoding_hub_company_context')))
  expect(contexto.tenant.id).toBe('tenant-b')
  await page.goto('/pos')
  await expect(page.getByTestId('shell')).toBeVisible()
  await expect(page.locator('body')).not.toContainText('Accesorio de Alfa')
})

for (const [ancho, oscuro] of [[360, false], [390, true]]) {
  test(`${ancho} ${oscuro ? 'oscuro' : 'claro'}: la hoja del perfil trae la lista, sin scroll horizontal y con Esc`, async ({ page }) => {
    await mkdir(out, { recursive: true })
    await page.setViewportSize({ width: ancho, height: 812 })
    await page.emulateMedia({ colorScheme: oscuro ? 'dark' : 'light' })
    await montar(page)
    await page.addInitScript((d) => { try { localStorage.setItem('mobos:theme', d ? 'dark' : 'light') } catch { /* sin storage */ } }, oscuro)
    await page.goto('/')
    await expect(page.getByTestId('shell-mobile-header')).toBeVisible()
    // La barra superior no suma controles: la empresa vive en la hoja del perfil.
    await expect(page.getByTestId('empresa-selector')).toBeHidden()
    let m = await medirAncho(page)
    expect(m.scroll, 'barra superior').toBeLessThanOrEqual(m.ancho)
    await page.getByTestId('shell-perfil-mobile').click()
    const hoja = page.getByRole('dialog', { name: 'Perfil y preferencias' })
    const lista = page.getByTestId('empresa-lista')
    await expect(lista).toBeVisible()
    await expect(page.getByTestId('empresa-opcion-tenant-a')).toHaveAttribute('aria-checked', 'true')
    for (const id of ['empresa-opcion-tenant-a', 'empresa-opcion-tenant-b', 'empresa-crear'])
      expect((await page.getByTestId(id).boundingBox()).height, id).toBeGreaterThanOrEqual(44)
    m = await medirAncho(page)
    expect(m.scroll, 'hoja del perfil').toBeLessThanOrEqual(m.ancho)
    await page.screenshot({ path: `${out}/multiempresa-${ancho}${oscuro ? '-dark' : ''}.png` })
    await page.keyboard.press('Escape')
    await expect(hoja).toHaveCount(0)
  })
}

test('con una sola empresa y sin permiso de crear el selector no aparece', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await montar(page, { tenants: ['tenant-a'], canCreate: false })
  await page.goto('/')
  await expect(page.getByTestId('shell')).toBeVisible()
  await expect(page.getByTestId('shell-sucursal-desktop')).toBeVisible()
  await expect(page.getByTestId('empresa-selector')).toHaveCount(0)
})

test('con ventas sin enviar advierte antes de cambiar; Esc cancela y «Cambiar igual» sigue', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const estado = await montar(page)
  await page.goto('/')
  await expect(page.getByTestId('empresa-selector')).toBeVisible()
  await page.evaluate(async () => {
    const ventas = await import('/src/lib/offline/ventas.js')
    await ventas.encolarVenta({ payload: { offline: true, items: [] }, idempotencyKey: 'qa-pendiente-1', resumen: { total: 1000 } })
  })
  await page.getByTestId('empresa-selector').click()
  await page.getByTestId('empresa-opcion-tenant-b').click()
  const aviso = page.getByTestId('empresa-pendientes')
  await expect(aviso).toBeVisible()
  expect(estado.switches).toEqual([])
  await expect(page.getByTestId('empresa-sincronizar')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(aviso).toHaveCount(0)
  expect(estado.switches).toEqual([])
  await page.getByTestId('empresa-selector').click()
  await page.getByTestId('empresa-opcion-tenant-b').click()
  await page.evaluate(() => { window.__sinRecarga = true })
  await page.getByTestId('empresa-cambiar-igual').click()
  await expect.poll(() => estado.switches).toEqual(['tenant-b'])
  await page.waitForFunction(() => window.__sinRecarga === undefined)
  await expect(page.getByTestId('empresa-selector')).toHaveAttribute('aria-label', 'Empresa: Tienda Beta')
})

test('crear empresa: valida el nombre, crea con la misma cuenta y pasa a la nueva', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 812 })
  const estado = await montar(page)
  await page.goto('/')
  await page.getByTestId('shell-perfil-mobile').click()
  await page.getByTestId('empresa-crear').click()
  const form = page.getByTestId('empresa-crear-form')
  await expect(form).toBeVisible()
  await expect(page.getByTestId('empresa-crear-confirmar')).toBeDisabled()
  const m = await medirAncho(page)
  expect(m.scroll).toBeLessThanOrEqual(m.ancho)
  await page.getByLabel('Nombre de la empresa').fill('Tienda Nueva')
  await expect(page.getByTestId('empresa-crear-confirmar')).toBeEnabled()
  await page.evaluate(() => { window.__sinRecarga = true })
  await page.getByTestId('empresa-crear-confirmar').click()
  await expect.poll(() => estado.creadas).toEqual(['Tienda Nueva'])
  await page.waitForFunction(() => window.__sinRecarga === undefined)
  await page.getByTestId('shell-perfil-mobile').click()
  await expect(page.getByTestId('shell-empresa')).toHaveText('Tienda Nueva')
})

test('crear empresa se cierra con Esc', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await montar(page)
  await page.goto('/')
  await page.getByTestId('empresa-selector').click()
  await page.getByTestId('empresa-crear').click()
  await expect(page.getByTestId('empresa-crear-form')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('empresa-crear-form')).toHaveCount(0)
})

test('si el destino no tiene sesión de vendedor, tras la recarga queda el PIN', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 812 })
  const estado = await montar(page, { sinSellerEnDestino: true })
  await page.goto('/')
  await page.getByTestId('shell-perfil-mobile').click()
  await page.getByTestId('empresa-opcion-tenant-b').click()
  await expect.poll(() => estado.switches).toEqual(['tenant-b'])
  await expect(page).toHaveURL(/\/login/)
  await expect(page.locator('#seller-pin')).toBeVisible()
})
