// #240 → portal — Mensajes de la tienda: el equipo publica desde la ficha y el
// cliente lo ve en su cuenta (con «Nuevo» la primera vez); la ficha muestra el
// visto/no visto y la cronología registra el envío y el visto.
import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'

const API = SEED.api
const SALIDA = 'test-results/QA-240-mensajes-tienda'

async function api(page, path, options = {}) {
  return page.evaluate(async ({ api, path, options }) => {
    const response = await fetch(`${api}${path}`, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...options })
    const body = await response.json().catch(() => null)
    return { status: response.status, body }
  }, { api: API, path, options })
}

test('el mensaje de la tienda llega al portal y la ficha ve el visto', async ({ page }) => {
  await page.goto('/clientes')
  const marca = Date.now().toString(36).toUpperCase()
  const cliente = await api(page, '/api/customers', {
    method: 'POST',
    body: JSON.stringify({ name: `Cliente Mensaje ${marca}`, phone: `0986${String(Date.now()).slice(-6)}` }),
  })
  expect(cliente.status, JSON.stringify(cliente.body)).toBe(201)
  const contenido = `Tu equipo ya está listo para retirar (${marca}).`

  // La ficha publica el mensaje.
  await page.goto(`/clientes?cliente=${encodeURIComponent(cliente.body.id)}`)
  const ficha = page.getByRole('dialog')
  await ficha.getByRole('tab', { name: /^Cronología/ }).click()
  await ficha.getByLabel('Nuevo mensaje').fill(contenido)
  await ficha.getByRole('button', { name: 'Publicar mensaje' }).click()
  await expect(page.getByText('Mensaje publicado.').first()).toBeVisible({ timeout: 15000 })
  const fila = ficha.getByTestId('perfil-mensajes').locator('li').filter({ hasText: marca }).first()
  await expect(fila.getByTestId('mensaje-sin-ver')).toBeVisible({ timeout: 15000 })
  await page.screenshot({ path: `${SALIDA}/01-ficha-mensaje.png` })

  // El portal lo muestra y lo marca como nuevo en la primera apertura.
  const portal = await api(page, `/api/customers/${encodeURIComponent(cliente.body.id)}/access-token`, {
    method: 'POST',
    body: JSON.stringify({ level: 'completo' }),
  })
  expect(portal.status, JSON.stringify(portal.body)).toBe(200)
  await page.goto(`/cuenta/${encodeURIComponent(portal.body.token)}`)
  const seccion = page.getByTestId('portal-mensajes')
  await expect(seccion).toBeVisible({ timeout: 20000 })
  await expect(seccion.getByText(contenido)).toBeVisible()
  await expect(seccion.getByText('Nuevo')).toBeVisible()
  await page.screenshot({ path: `${SALIDA}/02-portal-mensaje.png`, fullPage: true })

  // La segunda apertura ya no lo marca como nuevo.
  await page.reload()
  await expect(page.getByTestId('portal-mensajes').getByText(contenido)).toBeVisible({ timeout: 20000 })
  await expect(page.getByTestId('portal-mensajes').getByText('Nuevo')).toHaveCount(0)

  // La ficha quedó con el visto y la cronología con los dos eventos.
  await page.goto(`/clientes?cliente=${encodeURIComponent(cliente.body.id)}`)
  const fichaVisto = page.getByRole('dialog')
  await fichaVisto.getByRole('tab', { name: /^Cronología/ }).click()
  const filaVisto = fichaVisto.getByTestId('perfil-mensajes').locator('li').filter({ hasText: marca }).first()
  await expect(filaVisto.getByTestId('mensaje-visto')).toBeVisible({ timeout: 15000 })
  await expect(fichaVisto.getByText('Mensaje visto por el cliente').first()).toBeVisible()
  await page.screenshot({ path: `${SALIDA}/03-ficha-visto.png` })
})

test('demo: los mensajes de la tienda se ven en el portal', async ({ browser }) => {
  const contexto = await browser.newContext({ viewport: { width: 1280, height: 1000 } })
  const page = await contexto.newPage()
  await page.goto('/cuenta/demo-demo-cliente-lucia-rapido')
  const seccion = page.getByTestId('portal-mensajes')
  await expect(seccion).toBeVisible({ timeout: 20000 })
  await expect(seccion.getByText(/listo para retirar/)).toBeVisible()
  await expect(seccion.getByText('Nuevo')).toBeVisible()
  await page.screenshot({ path: `${SALIDA}/04-demo-portal-mensajes.png`, fullPage: true })
  await contexto.close()
})
