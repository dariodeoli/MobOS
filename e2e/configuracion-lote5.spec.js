// Rediseño Lote 5 (#165): Configuración y Equipo con slug por subpágina,
// formularios en panel derecho en escritorio (apilados en móvil) y sin scroll
// horizontal en 360/768/1440.

import { test, expect } from '@playwright/test'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { selectConfigSection } from './helpers/shell-navigation.js'
import { SEED } from './helpers/seed-data.js'

const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`

const SUBPAGINAS = [
  ['organizacion', 'Organización'],
  ['equipo', 'Equipo y acceso'],
  ['dispositivos', 'Impresoras'],
  ['comercial', 'Comercial'],
  ['seguridad', 'Seguridad'],
  ['sistema', 'Sistema'],
  ['mi-cuenta', 'Mi cuenta'],
]

const ANCHOS = [
  [360, 780],
  [768, 1024],
  [1440, 900],
]

async function sinScrollHorizontal(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)
}

test.describe('Configuración Lote 5', () => {
  test('cada subpágina tiene su slug y su título', async ({ page }) => {
    for (const [slug, titulo] of SUBPAGINAS) {
      await page.goto(`/configuracion/${slug}`)
      await expect(page).toHaveURL(new RegExp(`/configuracion/${slug}$`))
      await expect(page.locator('h1')).toHaveText(titulo)
    }
  })

  test('sin scroll horizontal en 360, 768 y 1440', async ({ page }) => {
    test.setTimeout(180_000)
    for (const [ancho, alto] of ANCHOS) {
      await page.setViewportSize({ width: ancho, height: alto })
      for (const [slug] of SUBPAGINAS) {
        await page.goto(`/configuracion/${slug}`)
        await expect(page.locator('h1')).toBeVisible()
        expect(await sinScrollHorizontal(page), `/configuracion/${slug} desborda a ${ancho}px`).toBe(true)
      }
    }
  })

  test('en escritorio el formulario vive en el panel derecho', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })

    // Equipo: el alta está a la vista, sin abrir modales, en la columna derecha.
    await page.goto('/configuracion/equipo')
    const panelEquipo = page.locator('#equipo-form')
    await expect(panelEquipo).toBeVisible()
    await expect(page.locator('#invite-name')).toBeVisible()
    const cajaEquipo = await panelEquipo.boundingBox()
    expect(cajaEquipo.x).toBeGreaterThan(1440 * 0.5)

    // Sucursales (dentro de Organización): el formulario queda a la derecha de la lista.
    await page.goto('/configuracion/organizacion')
    await page.getByTestId('organizacion-secciones').getByRole('tab', { name: 'Sucursales y depósitos', exact: true }).click()
    const panelSucursal = page.locator('#sucursal-form')
    await expect(panelSucursal).toBeVisible()
    await expect(page.locator('#sucursal-nombre')).toBeVisible()
    const cajaSucursal = await panelSucursal.boundingBox()
    expect(cajaSucursal.x).toBeGreaterThan(1440 * 0.5)
  })

  test('en móvil el formulario se apila y el botón lleva hasta él', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 })
    await page.goto('/configuracion/equipo')
    const boton = page.getByRole('button', { name: '+ Invitar persona' })
    await expect(boton).toBeVisible()
    await boton.click()
    await expect(page.locator('#equipo-form')).toBeInViewport()
    await expect(page.locator('#invite-name')).toBeVisible()

    // En escritorio el botón no hace falta: el panel ya está a la vista.
    await page.setViewportSize({ width: 1440, height: 900 })
    await expect(boton).toBeHidden()
  })

  test('la tienda enlaza editores existentes, presenta próximos módulos y es responsive', async ({ page }) => {
    const abrirTienda = async () => {
      await page.goto('/configuracion/organizacion')
      await page.getByTestId('organizacion-secciones').getByRole('tab', { name: 'Tienda de módulos', exact: true }).click()
      await expect(page.getByTestId('tienda-modulos')).toBeVisible()
    }
    await abrirTienda()
    const printCard = page.getByTestId('modulo-card-impresion')
    const messageCard = page.getByTestId('modulo-card-mensajes')
    const imeiCard = page.getByTestId('modulo-card-verificacion-imei')
    const advertisingCard = page.getByTestId('modulo-card-publicidad')
    const assistantsCard = page.getByTestId('modulo-card-asistentes')
    const billingCard = page.getByTestId('modulo-card-facturacion')
    await expect(printCard.getByRole('link', { name: 'Abrir editor' })).toHaveAttribute('href', '/configuracion/dispositivos')
    await expect(messageCard.getByRole('link', { name: 'Abrir editor' })).toHaveAttribute('href', '/plantillas')
    await expect(imeiCard).toContainText('IMEIcheck.net · actual')
    await expect(imeiCard).toContainText('IMEI.info · próximamente / no configurado')
    await expect(advertisingCard).toContainText('Próximamente')
    await expect(advertisingCard.getByRole('button', { name: 'Próximamente', exact: true })).toBeDisabled()
    await expect(assistantsCard).toContainText('Solo catálogo')
    await expect(billingCard).toContainText('KudeExpress y futuros adaptadores')
    await expect(billingCard.getByRole('button', { name: 'Próximamente', exact: true })).toBeDisabled()
    await expect(page.getByTestId('modulo-card-inventario')).toContainText('Apple/iPhone: modelo, capacidad, color, IMEI, condición y garantía')
    const imeiApi = await page.context().request.get(`http://localhost:${process.env.MOBOS_E2E_API_PORT}/api/imei`, { headers: { origin: process.env.MOBOS_APP_URL } })
    expect(imeiApi.status()).toBe(200)
    expect((await imeiApi.json()).proveedores).toEqual([
      { id: 'imeicheck.net', estado: expect.any(String), seleccionado: true },
      { id: 'imei.info', estado: 'no-configurado', seleccionado: false },
    ])
    await expect(messageCard).toContainText('Activo')
    await expect(imeiCard).toContainText('Activo')
    await page.setViewportSize({ width: 360, height: 780 })
    await expect(page.getByTestId('modulo-card-impresion')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true)
  })
})

// IA de Configuración (#251): siete secciones sin duplicar, con Documentación
// fuera de Configuración (entrada «Ayuda» del shell).
test.describe('Configuración IA', () => {
  test('las siete secciones no duplican Dispositivos, Sistema ni Preferencias', async ({ page }) => {
    await page.goto('/configuracion/dispositivos')
    await expect(page.getByTestId('config-grupos').locator('[data-tab-id]')).toHaveCount(7)

    // Impresoras: configuración, puentes, estado global y colas de impresión.
    await expect(page.getByTestId('config-grupos').locator('[data-tab-id="dispositivos"]')).toHaveAttribute('aria-current', 'page')
    await expect(page.getByTestId('paneles-impresion')).toBeVisible()
    await page.getByTestId('panel-sincronizacion').click()
    await expect(page.getByTestId('impresoras-sincronizacion')).toBeVisible()
    await expect(page.getByTestId('impresoras-sync-puentes')).toContainText('en línea')
    await page.getByTestId('panel-diagnostico').click()
    await expect(page.getByRole('heading', { name: 'Diagnóstico de impresión (esta computadora)' })).toBeVisible()
    await expect(page.getByTestId('config-grupos').getByRole('button', { name: 'Sistema', exact: true })).toBeAttached()

    // Sistema: solo el monitoreo global (Estado del sistema).
    await selectConfigSection(page, 'Sistema')
    await expect(page).toHaveURL(/\/configuracion\/sistema$/)
    await expect(page.getByRole('heading', { name: 'Sincronización' })).toBeVisible()

    // Las preferencias del dispositivo viven en Mi cuenta, una sola vez.
    await selectConfigSection(page, 'Mi cuenta')
    await expect(page.locator('#pref-bloqueo')).toBeVisible()
  })

  // #542 · Impresoras: estado, puentes y colas se encuentran bajo el dominio
  // de impresión; el slug histórico de dispositivos sigue siendo estable.
  test('Impresoras agrupa estado global, configuración, puentes y colas', async ({ page }) => {
    await page.goto('/configuracion/dispositivos')
    const paneles = page.getByTestId('paneles-impresion')
    for (const label of ['Estado y sincronización', 'Impresoras', 'Puentes', 'Ruteo de documentos', 'Diagnóstico local', 'Cola e historial']) {
      await expect(paneles.getByRole('button', { name: label, exact: true })).toBeVisible()
    }
    await paneles.getByTestId('panel-sincronizacion').click()
    await expect(page.getByTestId('impresoras-sincronizacion')).toBeVisible()
    await expect(page).toHaveURL(/panel=sincronizacion/)
    for (const id of ['puentes', 'impresoras', 'trabajos']) await expect(page.getByTestId(`impresoras-sync-${id}`)).toBeVisible()

    // Puentes: la gestión es una sección (ya no un modal suelto).
    await page.getByTestId('panel-puentes').click()
    await expect(page.getByTestId('puentes-impresion')).toBeVisible()
    await expect(page).toHaveURL(/panel=puentes/)
    await expect(page.getByRole('button', { name: 'Agregar puente' })).toBeVisible()

    // Diagnóstico: estado local y red del agente.
    await page.getByTestId('panel-diagnostico').click()
    await expect(page.getByTestId('diagnostico-impresion')).toBeVisible()

    // Cola e historial: la cola de esta computadora y la actividad.
    await page.getByTestId('panel-cola').click()
    await expect(page.getByTestId('cola-impresion')).toBeVisible()
    await expect(page.getByText('Actividad de impresión')).toBeVisible()

    // Ruteo de documentos: la impresora recordada por tipo de documento.
    await page.getByTestId('panel-formatos').click()
    await expect(page.getByTestId('formatos-impresion')).toBeVisible()

    // Sistema conserva sus métricas de servicios ajenos a la impresión.
    await page.goto('/configuracion/sistema')
    await expect(page.getByTestId('monitoreo-vs-impresoras')).toContainText('Impresoras')
  })

  test('Documentación sale de Configuración: la ruta vieja redirige a Ayuda', async ({ page }) => {
    await page.goto('/configuracion/documentacion')
    await expect(page).toHaveURL(/\/ayuda\/ayuda$/)
    await expect(page.getByTestId('documentacion')).toBeVisible()
    await expect(page.locator('h1')).toHaveText('Ayuda')
  })

  // Capturas del antes/después (#251), reproducibles:
  //   MOBOS_CAPTURAS=docs/qa/config-ia/despues npx playwright test e2e/configuracion-lote5.spec.js -g capturas
  // Sin variable escribe en test-results y CI no ensucia el repo.
  test('capturas de los grupos y de Ayuda', async ({ page }) => {
    test.setTimeout(120_000)
    const salida = process.env.MOBOS_CAPTURAS || 'test-results/config-ia'
    mkdirSync(salida, { recursive: true })
    for (const [tema, modo] of [['claro', 'light'], ['oscuro', 'dark']]) {
      for (const [vista, ancho, alto] of [['desktop', 1280, 900], ['mobile', 390, 844]]) {
        await page.addInitScript(({ m }) => { try { localStorage.setItem('mobos:theme', m) } catch { /* sin storage */ } }, { m: modo })
        await page.setViewportSize({ width: ancho, height: alto })
        // #410: en celular /configuracion es la lista de secciones; la sección abierta no la repite.
        await page.goto(vista === 'desktop' ? '/configuracion/dispositivos' : '/configuracion')
        await expect(page.getByTestId('config-grupos')).toBeVisible({ timeout: 20_000 })
        await page.screenshot({ path: `${salida}/config-secciones-${tema}-${vista}.png` })
        await page.goto('/ayuda/ayuda')
        await expect(page.getByTestId('documentacion')).toBeVisible({ timeout: 20_000 })
        await page.screenshot({ path: `${salida}/ayuda-${tema}-${vista}.png` })
      }
    }
  })
})

test('el estado de Mensajes se carga para vendedor y gerente y protege sus rutas', async ({ browser }) => {
  test.setTimeout(90_000)
  const require = createRequire(new URL('../backend/package.json', import.meta.url))
  const { PrismaClient } = require('@prisma/client')
  const { PrismaPg } = require('@prisma/adapter-pg')
  const bcrypt = require('bcryptjs')
  const pgPort = process.env.MOBOS_E2E_PGPORT, dbName = process.env.MOBOS_E2E_DB
  expect(pgPort).toBeTruthy(); expect(dbName).toMatch(/^mobos_e2e(?:_|$)/)
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://postgres@127.0.0.1:${pgPort}/${dbName}` }) })
  const contexts = []
  let tenantId
  try {
    const seeded = await db.tenant.findFirstOrThrow({ where: { email: SEED.company.email }, select: { passwordHash: true } })
    const slug = `module-store-${randomUUID()}`
    const tenant = await db.tenant.create({ data: {
      name: 'Tienda E2E guardas de módulos', email: `${slug}@test.local`, slug, passwordHash: seeded.passwordHash,
      settings: { moduleStore: { version: 1, preset: 'comercio', modules: { mensajes: { enabled: false, manuallySelected: true, source: 'manual', updatedAt: new Date().toISOString() } } } },
    } })
    tenantId = tenant.id
    const branch = await db.branch.create({ data: { tenantId, name: 'Sucursal guardas' } })
    const personas = [
      { name: 'Gerente guardas', role: 'GERENTE', pin: '731204' },
      { name: 'Vendedor guardas', role: 'VENDEDOR', pin: '842315' },
    ]
    for (const persona of personas) {
      const pinHash = await bcrypt.hash(persona.pin, 12)
      const user = await db.user.create({ data: { tenantId, branchId: branch.id, name: persona.name, role: persona.role, pinHash, pinLength: persona.pin.length } })
      persona.userId = user.id
    }

    for (const persona of personas) {
      const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
      contexts.push(context)
      const rolePage = await context.newPage()
      await rolePage.goto('/login')
      const login = await rolePage.evaluate(async ({ api, email, password, deviceId, sellerId, pin }) => {
        const auth = await fetch(`${api}/api/auth/login`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, deviceId }) })
        const access = auth.ok ? await fetch(`${api}/api/auth/pin`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sellerId, pin }) }) : null
        return { auth: auth.status, access: access?.status ?? null }
      }, { api: API, email: tenant.email, password: SEED.company.password, deviceId: `module-store-${persona.role.toLowerCase()}`, sellerId: persona.userId, pin: persona.pin })
      expect(login, persona.role).toEqual({ auth: 200, access: 200 })
      const origin = new URL(rolePage.url()).origin
      const respuestaModulos = rolePage.waitForResponse(response => response.url().includes('/api/tenant/modules') && response.status() === 200)
      await rolePage.goto('/pos')
      await respuestaModulos
      const estadoResponse = await context.request.get(`${API}/api/tenant/modules`, { headers: { origin } })
      const estado = await estadoResponse.json()
      expect(estadoResponse.status(), persona.role).toBe(200)
      expect(estado.canManage, persona.role).toBe(false)
      expect(estado.state.modules.mensajes.enabled, persona.role).toBe(false)
      await expect(rolePage.getByText('Plantillas', { exact: true })).toHaveCount(0)
      await expect(rolePage.getByText('Campañas', { exact: true })).toHaveCount(0)
      const plantillasApi = await context.request.get(`${API}/api/message-templates`, { headers: { origin } })
      expect(plantillasApi.status(), `${persona.role} API`).toBe(403)
      await rolePage.goto('/plantillas')
      await expect(rolePage).not.toHaveURL(/\/plantillas$/)
      await rolePage.goto('/campanas')
      await expect(rolePage).not.toHaveURL(/\/campanas$/)
    }
  } finally {
    await Promise.all(contexts.map(context => context.close()))
    if (tenantId) await db.tenant.delete({ where: { id: tenantId } }).catch(() => {})
    await db.$disconnect()
  }
})
