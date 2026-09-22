// #148 §16 — Comentarios internos por pedido + menciones @ con notificación.
// Verifica: (1) el comentario con mención queda en la cronología del pedido,
// (2) el mencionado recibe la novedad «Te mencionaron en un pedido» en la
// campana, y (3) el comentario NUNCA es visible al cliente (público por token).
import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { SEED } from './helpers/seed-data.js'

const API = SEED.api

async function contextoVendedor(browser) {
  // Réplica del sellerSession del harness: login de empresa -> PIN con Bearer.
  const ctx = await browser.newContext()
  const login = await ctx.request.post(`${API}/api/auth/login`, { data: { email: SEED.company.email, password: SEED.company.password, deviceId: SEED.company.deviceId } })
  const setCookies = (await login.headersArray()).filter((h) => h.name.toLowerCase() === 'set-cookie').map((h) => h.value)
  const company = setCookies.map((c) => c.match(/mobos_company_session=([^;]*)/)?.[1]).find(Boolean)
  const sellers = (await login.json()).sellers || []
  const seller = sellers.find((s) => s.name === SEED.sellers[0].name) || sellers[0]
  await ctx.request.post(`${API}/api/auth/pin`, { headers: { Authorization: `Bearer ${company}` }, data: { sellerId: seller?.id, pin: SEED.sellers[0].pin } })
  return ctx
}

const SALIDA = 'test-results/QA-148-16-menciones'
const MENCIONADO = SEED.sellers[0].name // Vendedor E2E Uno (sesión de seller.json)
const marca = Date.now().toString(36).toUpperCase()
const comentario = `Revisar stock ${marca} con @${MENCIONADO} antes de entregar`

test('menciones: comentario interno, notificación al mencionado y nada para el cliente', async ({ page, browser }) => {
  const seedOrder = JSON.parse(readFileSync('e2e/.auth/seed-order.json', 'utf8'))

  // (1) Comentario interno con mención en la cronología del pedido (admin).
  // La lista puede quedar larga con la suite: se busca el pedido por número.
  await page.goto('/pedidos')
  await page.getByLabel('Buscar pedidos').fill(seedOrder.orderNumber)
  const filaSeed = page.getByTestId('pedido-fila').filter({ hasText: seedOrder.orderNumber }).first()
  await expect(filaSeed).toBeVisible({ timeout: 15000 })
  await filaSeed.click()
  await page.getByRole('button', { name: /Cronología/ }).click()
  const caja = page.getByLabel('Comentario del pedido')
  await expect(caja).toBeVisible()
  await caja.fill(comentario)
  await page.getByRole('button', { name: 'Comentar' }).click()
  await expect(page.getByText(comentario).first()).toBeVisible({ timeout: 15000 })
  await expect(page.getByText('Solo tú y otros empleados pueden ver los comentarios.')).toBeVisible()
  await page.screenshot({ path: `${SALIDA}/01-comentario-con-mencion.png` })

  // (2) El mencionado ve la novedad en su campana (sesión del vendedor).
  // Sesión fresca del vendedor por API (sin cargar páginas antes de /pedidos).
  const vendedor = await contextoVendedor(browser)
  const pagina = await vendedor.newPage()
  await pagina.goto('/pedidos')
  await expect(pagina.getByTestId('notificaciones-aviso')).toBeVisible({ timeout: 20000 })
  await pagina.getByTestId('notificaciones-aviso').click()
  await expect(pagina.getByText('Te mencionaron en un pedido').first()).toBeVisible({ timeout: 15000 })
  await expect(pagina.getByText(new RegExp(seedOrder.orderNumber)).first()).toBeVisible()
  await expect(pagina.getByText(new RegExp(`Revisar stock ${marca}`)).first()).toBeVisible()
  await pagina.screenshot({ path: `${SALIDA}/02-campana-mencion.png` })

  // (3) Nunca visible al cliente: el público por token no trae comentarios.
  const publico = await pagina.request.get(`${API}/api/public/orders/${seedOrder.publicToken}`)
  const texto = await publico.text()
  expect(texto).not.toContain(`Revisar stock ${marca}`)
  expect(texto.toLowerCase()).not.toContain('ordercomment')
  const publica = await vendedor.newPage()
  await publica.goto(`/pedidos/${seedOrder.publicToken}`)
  await expect(publica.locator('h1').first()).toBeVisible({ timeout: 20000 })
  await expect(publica.getByText(new RegExp(`Revisar stock ${marca}`))).toHaveCount(0)
  await expect(publica.getByText(/Solo tú y otros empleados/)).toHaveCount(0)
  await publica.screenshot({ path: `${SALIDA}/03-publico-sin-comentarios.png` })
  await vendedor.close()
})
