import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { openShellDestination } from '../helpers/shell-navigation.js'

// #422 · Secciones de Configuración al estilo del admin de Shopify: filas de
// Datos generales con ventana de edición, vista previa en vivo del ID de pedido,
// tabla de Usuarios con filtros, y las pestañas Portal / Notificaciones / Plan.
// Frontend solo (demo), sin backend.
const out = process.env.MOBOS_QA_OUT || '/tmp/mobos-config2'

async function enterDemo(page) {
  await page.route('**/api/**', route =>
    !new URL(route.request().url()).pathname.startsWith('/api/')
      ? route.continue()
      : route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Frontend-only harness"}' }),
  )
  await page.route(/https:\/\//, route => route.abort())
  await page.addInitScript(() => sessionStorage.setItem('mobos:demo-guia-vista', '1'))
  await page.goto('/demo', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Entrar como Dueño', exact: true }).click()
  await expect(page.getByTestId('shell')).toBeVisible()
}

const sinScrollHorizontal = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)

test('Datos generales: filas, ventana de contacto y formato del ID de pedido con vista previa', async ({ page }) => {
  await mkdir(out, { recursive: true })
  await page.setViewportSize({ width: 1440, height: 900 })
  await enterDemo(page)
  await openShellDestination(page, 'Configuración')
  const general = page.getByTestId('general-pantalla')
  await expect(general).toBeVisible()
  for (const id of ['fila-comercial', 'fila-contacto', 'fila-direccion', 'fila-formato-pedido', 'fila-archivar-preparados', 'fila-novedades', 'fila-atajos', 'fila-actividad']) {
    await expect(general.getByTestId(id), id).toBeVisible()
  }
  // Valores predeterminados de Paraguay.
  await expect(general).toContainText('PYG ₲')
  await expect(general).toContainText('America/Asuncion')
  // Columna acotada a 1280 px (Configuración usa el ancho disponible, sin cortarse), con las tarjetas dentro.
  const caja = await page.getByTestId('config-pagina').boundingBox()
  expect(caja.width).toBeLessThanOrEqual(1281)
  await page.screenshot({ path: `${out}/datos-generales-1440.png` })

  // «Contacto» abre el formulario existente de la tienda en una ventana.
  await general.getByTestId('fila-contacto').click()
  const ventana = page.getByTestId('cuenta-form-ventana')
  await expect(ventana).toBeVisible()
  await expect(ventana.getByLabel('Nombre de la tienda')).toBeVisible()
  await expect(ventana.getByLabel('RUC')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('cuenta-form-ventana')).toHaveCount(0)

  // «Formato del ID»: lleva a Numeración y la vista previa sigue lo que se escribe.
  await expect(general.getByTestId('fila-formato-pedido')).toContainText(/-#0001, .*-#0002, .*-#0003/)
  await general.getByTestId('fila-formato-pedido').click()
  const prefijo = page.getByLabel('Prefijo de pedidos')
  await expect(prefijo).toBeVisible()
  await prefijo.fill('ped')
  await page.getByLabel('Número inicial de pedidos').fill('1001')
  await expect(page.getByTestId('numeracion-vista-previa')).toHaveText('PED-#1001, PED-#1002, PED-#1003…')
})

test('Datos generales: «Registro de cambios» y «Atajos de teclado» abren su ventana', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await enterDemo(page)
  await openShellDestination(page, 'Configuración')
  await page.getByTestId('fila-atajos').click()
  await expect(page.getByRole('dialog', { name: 'Atajos de teclado' })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByTestId('fila-novedades').click()
  await expect(page.getByTestId('registro-cambios')).toBeVisible()
  await expect(page.getByTestId('registro-cambios').locator('section')).toHaveCount(3)
})

test('Portal, Mensajes y avisos y Plan y facturación: solo lo que existe y sin desborde a 375', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await enterDemo(page)
  await openShellDestination(page, 'Configuración')
  const secciones = page.getByRole('tablist', { name: 'Secciones de Negocio' })

  await secciones.getByRole('tab', { name: 'Portal de clientes', exact: true }).click()
  const portal = page.getByTestId('portal-pantalla')
  await expect(portal.getByTestId('fila-portal-saldo')).toBeVisible()
  await expect(portal.getByTestId('fila-portal-url')).toContainText('clientes.moboss.online')
  // No hay interruptores de funciones que el sistema todavía no tiene.
  await expect(portal.getByRole('switch')).toHaveCount(1)

  // Notificaciones vive en «Mensajes y avisos» (grupo propio de Configuración).
  await expect(secciones.getByRole('tab', { name: 'Notificaciones', exact: true })).toHaveCount(0)
  await page.getByTestId('config-grupos').locator('[data-tab-id="mensajes"]').click()
  const notificaciones = page.getByTestId('notificaciones-pantalla')
  for (const id of ['fila-remitente', 'fila-notif-clientes', 'fila-notif-equipo', 'fila-notif-webhooks']) await expect(notificaciones.getByTestId(id), id).toBeVisible()

  await page.getByTestId('config-grupos').locator('[data-tab-id="negocio"]').click()
  await secciones.getByRole('tab', { name: 'Plan y facturación', exact: true }).click()
  const plan = page.getByTestId('plan-pantalla')
  await expect(plan).toContainText('La facturación del servicio todavía no está activa')
  await page.screenshot({ path: `${out}/plan-1440.png` })

  await page.setViewportSize({ width: 375, height: 812 })
  expect(await sinScrollHorizontal(page), 'sin scroll horizontal a 375').toBe(true)
})

test('Usuarios: tabla con estado, rol, filtros y exportación; Roles y Seguridad como subsecciones', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await enterDemo(page)
  await openShellDestination(page, 'Configuración')
  await page.getByTestId('config-grupos').locator('[data-tab-id="equipo"]').click()
  const equipo = page.getByTestId('equipo-pantalla')
  await equipo.getByRole('tab', { name: 'Usuarios', exact: true }).click()
  await expect(equipo.getByRole('tab', { name: 'Usuarios', exact: true })).toHaveAttribute('aria-selected', 'true')
  const tabla = page.getByTestId('usuarios-tabla')
  await expect(tabla).toBeVisible()
  expect(await tabla.getByTestId('usuario-fila').count()).toBeGreaterThan(0)
  await expect(tabla.getByRole('columnheader', { name: 'Estado' })).toBeVisible()
  await expect(tabla.getByRole('columnheader', { name: 'Seguridad' })).toBeVisible()
  const filtros = page.getByRole('tablist', { name: 'Filtrar usuarios' })
  for (const nombre of ['Todos', 'Activos', 'Pendientes', 'Solo POS']) await expect(filtros.getByRole('tab', { name: new RegExp(`^${nombre}`) })).toBeVisible()
  // La demo trae invitaciones sin responder: una pendiente y una vencida.
  await expect(filtros.getByRole('tab', { name: /^Pendientes/ })).toHaveText(/2/)
  await filtros.getByRole('tab', { name: /^Pendientes/ }).click()
  await expect(page.getByTestId('usuario-fila').filter({ hasText: 'Lorena Ortiz' })).toBeVisible()
  await expect(page.getByTestId('usuario-fila').filter({ hasText: 'Hernán Acosta' })).toHaveCount(0)
  await filtros.getByRole('tab', { name: /^Solo POS/ }).click()
  await expect(page.getByTestId('usuario-fila').first()).toBeVisible()
  const descarga = page.waitForEvent('download')
  await page.getByTestId('usuarios-exportar').click()
  expect((await descarga).suggestedFilename()).toBe('usuarios-pos.csv')
  await expect(page.getByTestId('fila-roles')).toBeVisible()
  await expect(page.getByTestId('fila-seguridad')).toBeVisible()
  await page.screenshot({ path: `${out}/usuarios-1440.png` })
  await page.getByTestId('usuarios-agregar').click()
  await expect(equipo.getByRole('tab', { name: 'Invitaciones', exact: true })).toHaveAttribute('aria-selected', 'true')
})
