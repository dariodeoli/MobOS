// #295 · Estado público honesto: la página no puede anunciar «degradado»
// cuando lo único que pasó es que un chequeo requiere sesión o no es
// verificable públicamente. Se interceptan los hosts públicos para probar los
// tres escenarios sin tocar producción.
//
// Capturas: MOBOS_295_CAPTURAS=docs/qa/295-estado-publico \
//   npx playwright test e2e/qa-295-estado-publico.spec.js
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const SALIDA = process.env.MOBOS_295_CAPTURAS || ''
const URL_ESTADO = '/status-preview'

async function prepararHosts(page, { health, appFalla = false } = {}) {
  const cabeceras = { 'access-control-allow-origin': '*' }
  await page.route('https://app.moboss.online/**', (ruta) => appFalla
    ? ruta.abort()
    : ruta.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>MobOS</title>' }))
  await page.route('https://api.moboss.online/**', (ruta) => {
    const url = ruta.request().url()
    if (url.includes('/api/health')) {
      return ruta.fulfill({
        status: health?.status || 200,
        headers: cabeceras,
        json: health?.body || { ok: true, services: { api: 'operational', database: 'operational', email: 'configured' } },
      })
    }
    if (url.includes('/api/auth/google')) return ruta.fulfill({ status: 200, headers: cabeceras, json: { configured: true } })
    if (url.includes('/api/inventory-reservations')) return ruta.fulfill({ status: 401, headers: cabeceras, body: '' })
    return ruta.fulfill({ status: 404, headers: cabeceras, body: '' })
  })
}

async function capturar(page, nombre) {
  if (!SALIDA) return
  mkdirSync(SALIDA, { recursive: true })
  await page.screenshot({ path: join(SALIDA, `${nombre}.png`), fullPage: true })
}

test('#295 · con la app sana, lo que requiere sesión no anuncia degradación', async ({ page }) => {
  await prepararHosts(page, {})
  await page.goto(URL_ESTADO)
  await expect(page.getByTestId('estado-titulo')).toHaveText('Los servicios comprobables están operativos')
  await expect(page.getByTestId('estado-badge-app')).toHaveText('Operativo')
  await expect(page.getByTestId('estado-badge-database')).toHaveText('Operativo')
  // Reservas 401: requiere sesión, no es una caída.
  await expect(page.getByTestId('estado-badge-reservations')).toHaveText('Requiere sesión')
  // El correo configurado no se puede verificar públicamente desde afuera.
  await expect(page.getByTestId('estado-badge-email')).toHaveText('No verificable públicamente')
  await expect(page.getByText('Operación parcialmente degradada')).toHaveCount(0)
  await expect(page.getByTestId('estado-resumen')).toContainText('1 servicio requiere sesión y 1 no se puede verificar públicamente')
  await capturar(page, '01-operativo')
})

test('#295 · con la base caída sí anuncia degradación (y el API sigue operativo)', async ({ page }) => {
  await prepararHosts(page, { health: { status: 503, body: { ok: false, services: { api: 'operational', database: 'unavailable', email: 'configured' } } } })
  await page.goto(URL_ESTADO)
  await expect(page.getByTestId('estado-titulo')).toHaveText('Operación parcialmente degradada')
  await expect(page.getByTestId('estado-badge-api')).toHaveText('Operativo')
  await expect(page.getByTestId('estado-badge-database')).toHaveText('Degradado')
  await capturar(page, '02-degradado-base')
})

test('#295 · sin respuesta externa no se inventa operativo ni degradado', async ({ page }) => {
  await page.route('https://app.moboss.online/**', (ruta) => ruta.abort())
  await page.route('https://api.moboss.online/**', (ruta) => ruta.abort())
  await page.goto(URL_ESTADO)
  await expect(page.getByTestId('estado-titulo')).toHaveText('No pudimos verificar el estado desde este navegador')
  await expect(page.getByTestId('estado-badge-app')).toHaveText('No verificable públicamente')
  await expect(page.getByTestId('estado-badge-reservations')).toHaveText('No verificable públicamente')
  await expect(page.getByText('Operación parcialmente degradada')).toHaveCount(0)
  await capturar(page, '03-sin-verificar')
})
