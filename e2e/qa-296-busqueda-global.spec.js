// #296 · Búsqueda global: fallback demo y errores diferenciados.
//
// - En la demo la búsqueda funciona sin backend (catálogo local, sin acentos y
//   sin distinguir mayúsculas).
// - Tres estados claros: sin resultados · servicio no disponible · error de
//   conexión, con acción de reintento (la paleta la trae en su estado de error).
//
// Capturas: MOBOS_296_CAPTURAS=docs/qa/296-busqueda-global \
//   npx playwright test e2e/qa-296-busqueda-global.spec.js
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { cerrarGuiaDemo } from './helpers/demo.js'

const SALIDA = process.env.MOBOS_296_CAPTURAS || ''

async function capturar(page, nombre) {
  if (!SALIDA) return
  mkdirSync(SALIDA, { recursive: true })
  await page.screenshot({ path: join(SALIDA, `${nombre}.png`), fullPage: true })
}

const BUSQUEDAS = ['/api/customers', '/api/products', '/api/orders', '/api/quotes', '/api/warranties', '/api/purchases', '/api/suppliers', '/api/inventory-units']
const esBusqueda = (url) => BUSQUEDAS.includes(url.pathname)

async function abrirBuscador(page) {
  const boton = page.getByTestId('shell-buscar').first()
  await expect(boton).toBeVisible({ timeout: 30_000 })
  await boton.click()
  return page.getByRole('combobox', { name: 'Buscar en toda la tienda' })
}

// La guía de la demo puede montar más tarde que el cierre: además del helper,
// se descarta cualquier diálogo que quede encima antes de abrir la búsqueda.
async function asegurarSinGuias(page) {
  await cerrarGuiaDemo(page)
  await page.keyboard.press('Escape').catch(() => {})
  const cerrar = page.getByRole('button', { name: 'Cerrar', exact: true })
  if (await cerrar.count()) await cerrar.first().click().catch(() => {})
}

test('#296 · en la demo la búsqueda global funciona sin backend', async ({ page }) => {
  await page.goto('/demo')
  await page.getByRole('button', { name: /Entrar como Dueño/ }).first().click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 30_000 })
  await asegurarSinGuias(page)

  const buscador = await abrirBuscador(page)
  await buscador.fill('maria')
  // «maria» encuentra «María González» con el catálogo local (sin acentos).
  await expect(page.getByRole('option', { name: /María González/ }).first()).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('No se pudo consultar el catálogo')).toHaveCount(0)
  await capturar(page, '01-demo-maria')

  // Sin resultados: la consulta corre completa y lo dice claro.
  await buscador.fill('zzz-296-no-existe')
  await expect(page.getByText('Sin resultados')).toBeVisible({ timeout: 20_000 })
})

test('#296 · servicio no disponible: mensaje propio y reintento que recupera', async ({ page }) => {
  let modo = '503'
  await page.goto('/resumen')
  await expect(page.getByTestId('shell-buscar').first()).toBeVisible({ timeout: 30_000 })
  // La intercepción se activa con el shell ya cargado: las APIs de arranque
  // (productos, notificaciones) no se tocan.
  await page.route(esBusqueda, (ruta) => {
    if (modo === '503') return ruta.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Servicio en mantenimiento' }) })
    return ruta.continue()
  })
  const buscador = await abrirBuscador(page)
  await buscador.fill('zzz-296-servicio')

  await expect(page.getByText(/El servicio no está disponible/)).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('button', { name: 'Reintentar' })).toBeVisible()
  await capturar(page, '02-servicio-no-disponible')

  // Reintentar con el servicio recuperado vuelve a correr la consulta: la
  // consulta sin coincidencias ahora dice «Sin resultados», no un error.
  modo = 'ok'
  await page.getByRole('button', { name: 'Reintentar' }).click()
  await expect(page.getByText('Sin resultados')).toBeVisible({ timeout: 20_000 })
})

test('#296 · error de conexión: mensaje propio y reintento disponible', async ({ page }) => {
  await page.goto('/resumen')
  await expect(page.getByTestId('shell-buscar').first()).toBeVisible({ timeout: 30_000 })
  await page.route(esBusqueda, (ruta) => ruta.abort())
  const buscador = await abrirBuscador(page)
  await buscador.fill('zzz-296-sin-local')
  await expect(page.getByText(/Sin conexión/)).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('button', { name: 'Reintentar' })).toBeVisible()
  await capturar(page, '03-error-conexion')
})
