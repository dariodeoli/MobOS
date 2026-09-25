// IA de Configuración (#IA · #250/#83): siete secciones sin duplicar, las
// rutas viejas redirigen a la sección nueva y Documentación vive en /ayuda.
//
// Capturas: `QA_IA_CAPTURAS` (default test-results/qa-ia-config) — se
// versionan en docs/qa/ia-config/ (claro y mobile; oscuro para Organización).
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const DIR = process.env.QA_IA_CAPTURAS || join('test-results', 'qa-ia-config')
mkdirSync(DIR, { recursive: true })

const capturar = (page, nombre) => page.screenshot({ path: join(DIR, `ia-config-${nombre}.png`) })

// Sección nueva → contenido que la identifica (título o encabezado propio).
const SECCIONES = [
  ['Mi cuenta', 'Tu nombre de vendedor', 'mi-cuenta'],
  ['Organización', 'Datos de la tienda', 'organizacion'],
  ['Equipo y acceso', 'Funcionarios y metas', 'equipo'],
  ['Comercial', 'Seguro y límites', 'comercial'],
  ['Seguridad y auditoría', 'Sesiones activas', 'seguridad'],
  ['Dispositivos', 'Estado del sistema de impresión', 'dispositivos'],
  ['Sistema', 'Sincronización', 'sistema'],
]

test('las rutas viejas de Configuración entran por su sección nueva', async ({ page }) => {
  // Slugs históricos (marcadores y enlaces enviados) → sección actual.
  const REDIRECCIONES = [
    ['/configuracion/identidad', /\/configuracion\/mi-cuenta$/],
    ['/configuracion/preferencias', /\/configuracion\/mi-cuenta$/],
    ['/configuracion/negocio', /\/configuracion\/organizacion$/],
    ['/configuracion/sucursales', /\/configuracion\/organizacion$/],
    ['/configuracion/roles', /\/configuracion\/equipo$/],
    ['/configuracion/precios', /\/configuracion\/comercial$/],
    ['/configuracion/historial', /\/configuracion\/seguridad$/],
    ['/configuracion/impresoras', /\/configuracion\/dispositivos$/],
    ['/configuracion/impresion', /\/configuracion\/dispositivos$/],
    ['/configuracion/documentacion', /\/ayuda\/ayuda$/],
  ]
  for (const [vieja, nueva] of REDIRECCIONES) {
    await page.goto(vieja)
    await expect(page).toHaveURL(nueva)
  }
})

test('Configuración tiene siete secciones y ninguna duplica contenido', async ({ page }) => {
  await page.goto('/configuracion')
  // Sin hijo entra por la primera: Mi cuenta.
  await expect(page).toHaveURL(/\/configuracion\/mi-cuenta$/)
  await expect(page.locator('main').getByRole('tab')).toHaveCount(SECCIONES.length)

  for (const [nombre, contenido, slug] of SECCIONES) {
    await page.locator('main').getByRole('tab', { name: nombre, exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/configuracion/${slug}$`))
    await expect(page.getByRole('heading', { name: contenido }).first()).toBeVisible()
    await capturar(page, slug)
  }

  // Documentación ya no es una pestaña de Configuración: vive en Ayuda.
  await expect(page.locator('main').getByRole('tab', { name: 'Documentación', exact: true })).toHaveCount(0)

  // Sin duplicar: la foto es de Mi cuenta y el ID de tienda no se repite en
  // Datos de la tienda (el detalle de Tiendas es el único lugar donde se copia).
  await page.locator('main').getByRole('tab', { name: 'Organización', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Datos de la tienda', exact: true })).toHaveCount(1)
  await expect(page.getByText('Mi foto')).toHaveCount(0)
  await expect(page.getByText('ID de la tienda', { exact: true })).toHaveCount(0)
  // El ID de tienda vive en el detalle de Tiendas (cuando la cuenta tiene
  // tiendas cargadas), nunca en la ficha de Datos de la tienda.
  await expect(page.getByRole('heading', { name: 'Tiendas', exact: true })).toBeVisible()
  // #253: Tiendas y sucursales es una sola sección y el archivado no se repite
  // (antes había «Archivar tienda» dentro de la lista y «Archivar empresa» al
  // final; ahora queda solo el segundo, con motivo y reautenticación).
  const unificada = page.getByTestId('tiendas-sucursales')
  await expect(unificada).toBeVisible()
  await expect(unificada.getByRole('heading', { name: 'Tiendas', exact: true })).toBeVisible()
  await expect(unificada.getByRole('heading', { name: 'Sucursales', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Archivar tienda' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Archivar empresa' })).toHaveCount(1)
  // Evidencia de la sección unificada (antes eran dos tarjetas separadas).
  await expect(unificada.getByTestId('tiendas-bloque')).toBeVisible()
  await expect(unificada.getByTestId('sucursales-bloque')).toBeVisible()
  await page.getByTestId('tiendas-bloque').scrollIntoViewIfNeeded()
  await page.screenshot({ path: join(DIR, 'ia-config-organizacion-tiendas.png') })
  await page.getByTestId('sucursales-bloque').scrollIntoViewIfNeeded()
  await page.screenshot({ path: join(DIR, 'ia-config-organizacion-sucursales.png') })
  await page.locator('main').getByRole('tab', { name: 'Mi cuenta', exact: true }).click()
  await expect(page.getByText('Mi foto')).toHaveCount(1)
})

test('Documentación vive en Ayuda con su buscador', async ({ page }) => {
  await page.goto('/ayuda/ayuda')
  await expect(page.getByRole('heading', { name: 'Ayuda', exact: true })).toBeVisible()
  await expect(page.getByTestId('documentacion')).toBeVisible()
  await capturar(page, 'ayuda')

  await page.getByLabel('Buscar en la documentación').fill('PIN')
  await expect(page.getByRole('heading', { name: 'Staff, roles y PIN' })).toBeVisible()
  await page.getByRole('button', { name: 'Ir a Staff, roles y PIN' }).click()
  await expect(page).toHaveURL(/\/configuracion\/equipo$/)
})

test('Ayuda lista todos los comandos y atajos con su pantalla', async ({ page }) => {
  await page.goto('/ayuda/ayuda')
  const seccion = page.getByTestId('comandos-atajos')
  await expect(seccion.getByRole('heading', { name: 'Comandos y atajos' })).toBeVisible()

  // Cada fila: la tecla (y su variante Mac) y el enlace a la pantalla.
  const casos = [
    ['Búsqueda global', 'Ctrl + K', 'Cmd + K', '/pos'],
    ['Nueva venta', 'F1', null, '/pos'],
    ['Buscar producto', 'F2', null, '/productos'],
    ['Crear cliente', 'F3', null, '/clientes'],
    ['Cotizar Trade-In', 'F4', null, '/trade-in'],
    ['Guardar venta (POS)', 'Ctrl + S', 'Cmd + S', '/pos'],
    ['Cerrar', 'Esc', null, '/pos'],
    ['Cambiar de vendedor', '1 clic', null, '/pos'],
    ['Bloquear pantalla', 'Triple clic', null, '/pos'],
  ]
  for (const [titulo, tecla, mac, ruta] of casos) {
    await expect(seccion.getByText(tecla, { exact: true })).toBeVisible()
    if (mac) await expect(seccion.getByText(mac, { exact: true })).toBeVisible()
    await expect(seccion.getByRole('link', { name: `Ir a ${titulo}` })).toHaveAttribute('href', ruta)
  }

  // La aclaración de Mac y las pantallas de soporte (/status y /ops).
  await expect(seccion.getByText(/las teclas de función van con/)).toBeVisible()
  await expect(seccion.getByText('Fn+F1')).toBeVisible()
  await expect(seccion.getByRole('link', { name: 'Ir a Estado del sistema' })).toHaveAttribute('href', '/status')
  await expect(seccion.getByRole('link', { name: 'Ir a Tablero de operaciones' })).toHaveAttribute('href', '/ops')
  await capturar(page, 'ayuda-atajos')
})

test('Organización: capturas por bloque (#253)', async ({ page }) => {
  // Evidencia del grupo completo, bloque por bloque: datos generales, identidad
  // visual (logos), datos legales, tiendas y sucursales, numeración y archivar.
  await page.goto('/configuracion/organizacion')
  await expect(page.getByRole('heading', { name: 'Datos de la tienda', exact: true })).toBeVisible({ timeout: 20_000 })
  await capturar(page, 'organizacion-datos-generales')

  const bloques = [
    ['organizacion-logos', 'Logo de la empresa'],
    ['organizacion-legales', 'Empresas/personas jurídicas (privado)'],
    ['organizacion-tiendas-sucursales', 'Tiendas y sucursales'],
    ['organizacion-numeracion', 'Identificador de pedidos'],
    ['organizacion-archivar', 'Archivar empresa'],
  ]
  for (const [nombre, titulo] of bloques) {
    const encabezado = page.getByRole('heading', { name: titulo, exact: true }).first()
    await encabezado.scrollIntoViewIfNeeded()
    await expect(encabezado).toBeVisible()
    await capturar(page, nombre)
  }
})

test('las secciones nuevas se ven en mobile y en oscuro sin desborde', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/configuracion/organizacion')
  await expect(page.getByRole('heading', { name: 'Datos de la tienda', exact: true })).toBeVisible()
  await capturar(page, 'organizacion-mobile')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true)

  await page.goto('/configuracion/mi-cuenta')
  await expect(page.getByText('Mi foto')).toBeVisible()
  await capturar(page, 'mi-cuenta-mobile')

  // Oscuro: el tema se guarda en `mobos:theme` y se aplica al recargar.
  await page.addInitScript(() => localStorage.setItem('mobos:theme', 'dark'))
  await page.goto('/configuracion/organizacion')
  await expect(page.locator('html.dark')).toHaveCount(1)
  await expect(page.getByRole('heading', { name: 'Datos de la tienda', exact: true })).toBeVisible()
  await capturar(page, 'organizacion-oscuro')
})
