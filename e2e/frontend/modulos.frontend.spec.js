import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { MODULE_CATALOG } from '../../backend/lib/modulos-catalogo.mjs'
import { esperarAnimaciones } from '../helpers/animaciones.js'
import { openShellDestination, shellPrimary } from '../helpers/shell-navigation.js'
import { entrarDemoComo } from '../helpers/demo.js'

// Módulos: un módulo apagado desaparece del menú y su URL vuelve a la vista padre
// con aviso; la pantalla «Módulos» (lista tipo tienda de apps) se maneja con
// teclado y se ve bien a 375 px en claro y oscuro. Cada módulo es una tarjeta
// con un interruptor (role=switch) cuyo nombre accesible es el del módulo. Frontend solo: la API es un
// doble local con el mismo contrato que /api/tenant/modules.
const out = process.env.MOBOS_QA_OUT || '/tmp/mobos-modulos'

function estadoInicial(apagados) {
  const modules = {}
  for (const def of MODULE_CATALOG)
    modules[def.id] = { enabled: def.nucleo || (def.status === 'available' && !apagados.includes(def.id)), source: 'manual', updatedAt: '2026-10-20T10:00:00.000Z' }
  return { version: 2, preset: 'comercio', modules }
}

async function entrarConModulos(page, { apagados = [], rol = 'ADMIN', canManage = true, rechazos = {} } = {}) {
  const estado = estadoInicial(apagados)
  const cambios = []
  await page.route('**/api/**', async route => {
    const solicitud = route.request()
    const path = new URL(solicitud.url()).pathname
    if (!path.startsWith('/api/')) return route.continue()
    if (path === '/api/auth/me')
      return route.fulfill({
        json: {
          user: { id: 'qa-user', name: 'Usuario local', role: rol, tenantId: 'qa-tenant', branchId: 'qa-branch', branchName: 'Sucursal local' },
          tenant: { id: 'qa-tenant', name: 'Tienda local' },
        },
      })
    if (path === '/api/tenant/modules') {
      if (solicitud.method() === 'PUT') {
        const cambio = solicitud.postDataJSON()
        cambios.push(cambio)
        const rechazo = rechazos[cambio.moduleId]
        if (rechazo && cambio.enabled === false) return route.fulfill({ status: 409, json: rechazo })
        estado.modules[cambio.moduleId] = { ...estado.modules[cambio.moduleId], enabled: cambio.enabled, source: 'manual', updatedAt: new Date().toISOString() }
        return route.fulfill({ json: { ok: true, state: estado } })
      }
      return route.fulfill({ json: { catalogVersion: 2, catalog: MODULE_CATALOG, presets: ['comercio', 'servicios', 'salud'], state: estado, canManage } })
    }
    return route.fulfill({ status: 200, json: [] })
  })
  await page.route(/https:\/\//, route => route.abort())
  await page.goto('/pos')
  await expect(page.getByTestId('shell')).toBeVisible()
  return { cambios, estado }
}

async function entrarDemo(page, rol = 'Dueño') {
  await page.route('**/api/**', route =>
    !new URL(route.request().url()).pathname.startsWith('/api/')
      ? route.continue()
      : route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Frontend-only harness"}' }),
  )
  await page.route(/https:\/\//, route => route.abort())
  await page.addInitScript(() => sessionStorage.setItem('mobos:demo-guia-vista', '1'))
  await page.goto('/demo', { waitUntil: 'domcontentloaded' })
  await entrarDemoComo(page, rol)
  await expect(page.getByTestId('shell')).toBeVisible()
}

const sinScrollHorizontal = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
const aviso = page => page.getByTestId('aviso-modulo-apagado')
const interruptor = (page, nombre) => page.getByRole('switch', { name: nombre, exact: true })
const tarjetas = page => page.getByTestId('modulos-lista').locator('[data-testid^="modulo-fila-"]')

test('módulo apagado: no está en el menú y la URL vuelve a la vista padre con aviso y enlace a Módulos', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await entrarConModulos(page, { apagados: ['delivery', 'campanas-recompra', 'servicios', 'comisiones', 'multisucursal', 'stock-avanzado'] })

  // Menú: sin la sección Taller ni la pestaña Entregas.
  const primaria = await shellPrimary(page)
  await expect(primaria.getByRole('button', { name: 'Pedidos', exact: true })).toBeVisible()
  await expect(primaria.getByRole('button', { name: 'Taller', exact: true })).toHaveCount(0)
  await primaria.getByRole('button', { name: 'Pedidos', exact: true }).click()
  await expect(page.getByTestId('shell-contexto').locator('[data-tab-id="pedidos"]')).toHaveCount(1)
  await expect(page.getByTestId('shell-contexto').locator('[data-tab-id="repartos"]')).toHaveCount(0)

  // Cada ruta de un módulo apagado vuelve a su vista padre y avisa.
  const casos = [
    ['/delivery', /\/pedidos$/, 'El módulo Delivery externo está desactivado.'],
    ['/campanas', /\/clientes$/, 'El módulo Campañas de recompra está desactivado.'],
    ['/servicio', /\/resumen$/, 'El módulo Taller y servicios está desactivado.'],
    ['/stock/traslados', /\/stock\/unidades$/, 'El módulo Varias sucursales está desactivado.'],
    ['/stock/conteos', /\/stock\/unidades$/, 'El módulo Control de stock avanzado está desactivado.'],
    ['/finanzas/comisiones', /\/finanzas\/caja$/, 'El módulo Comisiones está desactivado.'],
  ]
  for (const [ruta, destino, texto] of casos) {
    await page.goto(ruta)
    await expect(page, ruta).toHaveURL(destino)
    await expect(aviso(page), ruta).toContainText(texto)
  }

  // El dueño llega a Módulos desde el aviso; el aviso se puede cerrar.
  await page.goto('/delivery')
  const enlace = aviso(page).getByRole('link', { name: 'Ir a Módulos', exact: true })
  await expect(enlace).toHaveAttribute('href', '/configuracion/modulos')
  await expect(aviso(page)).toBeVisible()
  await mkdir(out, { recursive: true })
  await page.screenshot({ path: `${out}/modulos-aviso-1440.png` })
  await aviso(page).getByRole('button', { name: 'Cerrar aviso', exact: true }).click()
  await expect(aviso(page)).toHaveCount(0)
  await page.goto('/delivery')
  await aviso(page).getByRole('link', { name: 'Ir a Módulos', exact: true }).click()
  await expect(page).toHaveURL(/\/configuracion\/modulos$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Módulos', exact: true })).toBeVisible()
  // El núcleo y los módulos activos siguen abriendo normal.
  await page.goto('/pedidos')
  await expect(page).toHaveURL(/\/pedidos$/)
  await expect(aviso(page)).toHaveCount(0)
})

test('un rol que no es dueño ve el aviso sin el enlace a Módulos y nunca gana vistas', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await entrarConModulos(page, { apagados: ['delivery'], rol: 'VENDEDOR', canManage: false })
  await page.goto('/delivery')
  await expect(page).toHaveURL(/\/pedidos$/)
  await expect(aviso(page)).toContainText('El módulo Delivery externo está desactivado.')
  await expect(aviso(page).getByRole('link')).toHaveCount(0)
  // Un módulo activo no le abre lo que su rol no tiene (Finanzas es del dueño).
  await page.goto('/finanzas/caja')
  await expect(page).not.toHaveURL(/\/finanzas/)
})

test('pantalla Módulos: activar y desactivar con confirmación, Esc, detalle por teclado y saldos abiertos', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  const { cambios } = await entrarConModulos(page, {
    apagados: ['delivery'],
    rechazos: { tradein: { message: 'No se puede desactivar: quedan saldos abiertos.', details: { code: 'MODULE_OPEN_BALANCES', saldos: [{ tipo: 'tradein', detalle: '2 trade-ins en curso' }] } } },
  })
  await page.goto('/configuracion/modulos')
  await expect(page.getByTestId('modulos-pantalla')).toBeVisible()
  await expect(page.getByTestId('modulo-fila-delivery')).toHaveAttribute('data-estado', 'apagado')
  await expect(page.getByTestId('modulo-fila-tradein')).toHaveAttribute('data-estado', 'activo')
  // Los textos internos de la tienda vieja ya no aparecen.
  for (const interno of ['Solo catálogo', 'Control pendiente', 'Catálogo v', 'Preset'])
    await expect(page.getByTestId('modulos-pantalla')).not.toContainText(interno)

  // Activar: sin confirmación, guarda y la tarjeta pasa a Activo con «Ir a Entregas».
  await expect(interruptor(page, 'Delivery externo')).not.toBeChecked()
  await interruptor(page, 'Delivery externo').click()
  await expect(page.getByTestId('modulo-fila-delivery')).toHaveAttribute('data-estado', 'activo')
  await expect(interruptor(page, 'Delivery externo')).toBeChecked()
  await expect(page.getByTestId('modulo-fila-delivery').getByRole('link', { name: /Ir a Entregas/ })).toHaveAttribute('href', '/delivery')
  expect(cambios).toEqual([{ moduleId: 'delivery', enabled: true }])

  // Desactivar pide confirmación: Esc la cierra sin guardar y el interruptor sigue prendido.
  await interruptor(page, 'Trade-In').click()
  const confirmar = page.getByRole('alertdialog')
  await expect(confirmar).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(confirmar).toHaveCount(0)
  await expect(interruptor(page, 'Trade-In')).toBeChecked()
  expect(cambios).toHaveLength(1)
  // Confirmar con saldos abiertos: el 409 se muestra con texto claro y la tarjeta no cambia.
  await interruptor(page, 'Trade-In').click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Desactivar', exact: true }).click()
  const error = page.getByTestId('modulos-error')
  await expect(error).toContainText('No se pudo desactivar Trade-In.')
  await expect(error).toContainText('2 trade-ins en curso')
  await expect(page.getByTestId('modulo-fila-tradein')).toHaveAttribute('data-estado', 'activo')
  await expect(interruptor(page, 'Trade-In')).toBeChecked()

  // Teclado: el nombre abre el detalle (qué incluye, dependencias, qué pasa al desactivar) y Esc lo cierra.
  const abrir = page.getByRole('button', { name: 'Taller y servicios: ver detalle', exact: true })
  await abrir.focus()
  await page.keyboard.press('Enter')
  const detalle = page.getByTestId('modulo-detalle')
  await expect(detalle).toBeVisible()
  for (const texto of ['Qué incluye', 'De qué depende', 'Qué pasa al desactivarlo']) await expect(detalle).toContainText(texto)
  await page.keyboard.press('Escape')
  await expect(detalle).toHaveCount(0)
  await expect(abrir).toBeFocused()

  // Grilla agrupada por área, cada tarjeta con su ilustración de ejemplo.
  for (const grupo of ['Ventas', 'Stock', 'Finanzas', 'Clientes', 'Integraciones'])
    await expect(page.getByTestId('modulos-lista').getByRole('heading', { level: 2, name: new RegExp(`^${grupo}`) })).toBeVisible()
  await expect(page.getByTestId('modulo-fila-delivery')).toContainText('Ilustración de ejemplo: los datos no son reales.')
  await expect(page.getByTestId('modulo-fila-delivery')).toContainText('Vive en: Pedidos › Entregas')

  // Filtros: Activos y un grupo.
  await page.getByRole('tab', { name: 'Finanzas', exact: true }).click()
  await expect(tarjetas(page)).toHaveCount(3)
  await page.getByRole('tab', { name: 'Activos', exact: true }).click()
  await expect(page.getByTestId('modulo-fila-servicios')).toHaveCount(1)
})

test('solo el dueño edita: los demás ven la lista en lectura', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await entrarConModulos(page, { apagados: ['delivery'], rol: 'ADMIN', canManage: false })
  await page.goto('/configuracion/modulos')
  await expect(page.getByTestId('modulos-solo-lectura')).toBeVisible()
  await expect(interruptor(page, 'Delivery externo')).toBeDisabled()
  await expect(interruptor(page, 'Delivery externo')).not.toBeChecked()
  await expect(interruptor(page, 'Trade-In')).toBeDisabled()
  await expect(interruptor(page, 'Trade-In')).toBeChecked()
})

for (const esquema of ['light', 'dark']) {
  test(`pantalla Módulos a 375 px (${esquema}): sin scroll horizontal y toques de 44 px`, async ({ page }) => {
    await mkdir(out, { recursive: true })
    await page.emulateMedia({ colorScheme: esquema })
    // El tema vive en `mobos:theme` y se aplica al cargar.
    await page.addInitScript(modo => { try { localStorage.setItem('mobos:theme', modo) } catch { /* sin storage */ } }, esquema)
    await page.setViewportSize({ width: 375, height: 800 })
    await entrarConModulos(page, { apagados: ['delivery', 'servicios'] })
    await page.goto('/configuracion/modulos')
    await expect(page.getByTestId('modulos-lista')).toBeVisible()
    await expect(page.locator('html')).toHaveClass(esquema === 'dark' ? /dark/ : /^((?!dark).)*$/)
    await esperarAnimaciones(page)
    expect(await sinScrollHorizontal(page), 'sin scroll horizontal').toBe(true)
    const botones = page.getByTestId('modulos-lista').locator('button, a')
    expect(await botones.count()).toBeGreaterThan(10)
    for (const boton of await botones.all()) {
      const caja = await boton.boundingBox()
      if (caja) expect(caja.height, await boton.textContent()).toBeGreaterThanOrEqual(43.5)
    }
    // Interruptores: zona de toque de 44 px (la etiqueta que envuelve al control).
    const switches = page.getByTestId('modulos-lista').getByRole('switch')
    expect(await switches.count()).toBeGreaterThan(10)
    for (const control of await switches.all()) {
      const caja = await control.locator('xpath=ancestor::label[1]').boundingBox()
      if (caja) {
        expect(caja.height).toBeGreaterThanOrEqual(43.5)
        expect(caja.width).toBeGreaterThanOrEqual(43.5)
      }
    }
    // Todo texto del listado se lee: ninguna tarjeta se corta fuera de la pantalla.
    for (const fila of await tarjetas(page).all()) {
      const caja = await fila.boundingBox()
      expect(caja.x).toBeGreaterThanOrEqual(0)
      expect(caja.x + caja.width).toBeLessThanOrEqual(376)
    }
    if (esquema === 'light') await page.screenshot({ path: `${out}/modulos-375-claro.png` })
    else await page.screenshot({ path: `${out}/modulos-375-oscuro.png` })
  })
}

test('demo: todos los módulos activos y la pantalla Módulos los apaga y reactiva solo en la sesión', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await entrarDemo(page)
  const primaria = await shellPrimary(page)
  await expect(primaria.getByRole('button', { name: 'Taller', exact: true })).toBeVisible()
  await openShellDestination(page, 'Delivery')
  await expect(page).toHaveURL(/\/delivery$/)
  await openShellDestination(page, 'Configuración')
  await page.goto('/configuracion/modulos')
  await expect(page.getByTestId('modulos-demo')).toBeVisible()
  await expect(page.getByTestId('modulo-fila-delivery')).toHaveAttribute('data-estado', 'activo')
  const fila = page.getByTestId('modulo-fila-delivery')
  await interruptor(page, 'Delivery externo').click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Desactivar' }).click()
  // En demo el cambio se aplica en pantalla (sin guardar): el módulo queda apagado hasta salir.
  await expect(fila).toHaveAttribute('data-estado', 'apagado')
  await expect(interruptor(page, 'Delivery externo')).not.toBeChecked()
  await expect(fila.getByRole('link', { name: /Ir a Entregas/ })).toHaveCount(0)
  await interruptor(page, 'Delivery externo').click()
  await expect(fila).toHaveAttribute('data-estado', 'activo')
  await expect(interruptor(page, 'Delivery externo')).toBeChecked()
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
})
