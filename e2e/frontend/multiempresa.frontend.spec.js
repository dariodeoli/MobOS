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

async function montar(page, { tenants = ['tenant-a', 'tenant-b'], canCreate = true, puedeGestionarEmpresas = true, rolUsuario = 'ADMIN', sinSellerEnDestino = false, onboardingEnDestino = false, errorCambio = null, errorLista = null } = {}) {
  const estado = { actual: tenants[0], creadas: [], switches: [], user: true, onboardings: [], pines: [] }
  const usuarioDe = (id) => ({
    id: `user-${id}`,
    name: `Dueño ${EMPRESAS[id].name}`,
    role: rolUsuario,
    canManageCompanies: puedeGestionarEmpresas,
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
      if (errorLista) return route.fulfill({ status: errorLista, json: { message: 'Sin cuenta vinculada' } })
      return route.fulfill({
        status: 200,
        json: { tenants: tenants.map((id) => ({ ...EMPRESAS[id], current: id === estado.actual })), canCreate },
      })
    }
    if (path === '/api/auth/switch-tenant' && metodo === 'POST') {
      const { tenantId } = request.postDataJSON()
      estado.switches.push(tenantId)
      if (errorCambio) return route.fulfill({ status: errorCambio.status, json: { message: errorCambio.message, code: errorCambio.code } })
      estado.actual = tenantId
      estado.user = !sinSellerEnDestino
      return route.fulfill({
        status: 200,
        json: { tenant: EMPRESAS[tenantId], sellers: [{ id: 'seller-1', name: 'Vendedor Beta' }], user: sinSellerEnDestino ? null : usuarioDe(tenantId), onboardingRequired: onboardingEnDestino, scope: 'company' },
      })
    }
    if (path === '/api/auth/onboarding' && metodo === 'POST') {
      estado.onboardings.push(request.postDataJSON().pin)
      return route.fulfill({ status: 200, json: { admin: { id: 'seller-1' } } })
    }
    if (path === '/api/auth/pin' && metodo === 'POST') {
      estado.pines.push(request.postDataJSON())
      estado.user = true
      return route.fulfill({ status: 200, json: { user: usuarioDe(estado.actual), tenant: EMPRESAS[estado.actual] } })
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

test('deep link de creación: prellena sólo si coincide empresa y usuario, sin POST automático', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 812 })
  const estado = await montar(page)
  await page.goto('/mi-cuenta?crearEmpresa=1&nombre=Empresa%20desde%20MCP&expectedTenantId=tenant-a&expectedUserId=user-tenant-a')
  await expect(page.getByTestId('shell')).toBeVisible()
  await expect(page.getByTestId('empresa-crear-form')).toBeVisible()
  await expect(page.getByLabel('Nombre de la empresa')).toHaveValue('Empresa desde MCP')
  expect(estado.creadas).toEqual([])
  const query = await page.evaluate(() => window.location.search)
  expect(query).not.toContain('crearEmpresa')
  await page.getByTestId('empresa-crear-confirmar').click()
  await expect.poll(() => estado.creadas).toEqual(['Empresa desde MCP'])
})

test('deep link de creación: contexto distinto limpia parámetros, avisa y no hace POST', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 812 })
  const estado = await montar(page)
  await page.goto('/mi-cuenta?crearEmpresa=1&nombre=No%20debe%20crear&expectedTenantId=tenant-b&expectedUserId=user-tenant-a')
  await expect(page.getByTestId('empresa-crear-form')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => window.location.search)).toBe('')
  expect(estado.creadas).toEqual([])
})

test('deep link de creación: vendedor sin permiso no abre alta ni publica datos', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 812 })
  const estado = await montar(page, { puedeGestionarEmpresas: false, rolUsuario: 'VENDEDOR' })
  await page.goto('/mi-cuenta?crearEmpresa=1&nombre=Sin%20permiso&expectedTenantId=tenant-a&expectedUserId=user-tenant-a')
  await expect(page.getByTestId('empresa-crear-form')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => window.location.search)).toBe('')
  expect(estado.creadas).toEqual([])
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

test('empresa nueva sin perfil: tras la recarga queda «Elegí tu PIN» y activarla abre la sesión de vendedor', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 })
  const estado = await montar(page, { sinSellerEnDestino: true, onboardingEnDestino: true })
  await page.goto('/')
  await page.getByTestId('shell-perfil-mobile').click()
  await page.getByTestId('empresa-opcion-tenant-b').click()
  await expect.poll(() => estado.switches).toEqual(['tenant-b'])
  await expect(page).toHaveURL(/\/login/)
  await expect(page.getByRole('heading', { name: 'Elegí tu PIN de administrador' })).toBeVisible()
  await expect(page.locator('#seller-pin')).toHaveCount(0)
  const m = await medirAncho(page)
  expect(m.scroll, 'scroll horizontal').toBeLessThanOrEqual(m.ancho)
  await page.locator('#setup-pin').focus()
  await page.keyboard.type('4821')
  await page.getByRole('button', { name: 'Activar mi tienda' }).click()
  await expect.poll(() => estado.onboardings).toEqual(['4821'])
  await expect.poll(() => estado.pines.length).toBe(1)
  expect(estado.pines[0].sellerId).toBe('seller-1')
  await expect(page.getByTestId('shell')).toBeVisible()
  const contexto = await page.evaluate(() => JSON.parse(localStorage.getItem('owncoding_hub_company_context')))
  expect(contexto.onboardingRequired).toBe(false)
})

for (const [status, code, mensaje] of [
  [401, 'UNAUTHORIZED', 'Ingresá con tu PIN de dueño e intentá de nuevo.'],
  [403, 'FORBIDDEN', 'Ingresá con tu PIN de dueño e intentá de nuevo.'],
  [409, 'TENANT_SWITCH_RACE', 'Otro cambio está en curso, intentá de nuevo.'],
]) {
  test(`el cambio directo que falla con ${status} avisa con un mensaje claro y no recarga`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 812 })
    const estado = await montar(page, { errorCambio: { status, code, message: 'Error del servidor' } })
    await page.goto('/')
    await page.evaluate(() => { window.__sinRecarga = true })
    await page.getByTestId('shell-perfil-mobile').click()
    await page.getByTestId('empresa-opcion-tenant-b').click()
    await expect.poll(() => estado.switches).toEqual(['tenant-b'])
    await expect(page.getByText(mensaje)).toBeVisible()
    expect(await page.evaluate(() => window.__sinRecarga)).toBe(true)
  })
}

test('dueño sin cuenta vinculada: Configuración → Tiendas explica qué hacer y deja la alta con Google', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 })
  await montar(page, { errorLista: 403 })
  await page.goto('/configuracion/negocio')
  await page.getByTestId('organizacion-secciones').getByRole('tab', { name: 'Sucursales y depósitos', exact: true }).click()
  const aviso = page.getByTestId('tiendas-sin-cuenta')
  await expect(aviso).toBeVisible()
  await expect(aviso).toContainText('Para cambiar o crear empresas, ingresá con tu PIN de dueño')
  await expect(page.getByRole('button', { name: /Crear otra tienda/ })).toBeVisible()
  await expect(page.getByTestId('empresa-selector')).toHaveCount(0)
  const m = await medirAncho(page)
  expect(m.scroll, 'scroll horizontal').toBeLessThanOrEqual(m.ancho)
})
