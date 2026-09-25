// Recorrido de PRODUCCIÓN de la landing (#202): claro/oscuro, móvil y el
// verificador de IMEI. Temporal, no se commitea.
import { test, expect } from '@playwright/test'

const SHOTS = '/tmp/mobos-qa-dsn'
const IMEI_EJEMPLO = '356938035643809'
const sinScrollHorizontal = async (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
const temaOscuro = async (page) => page.addInitScript(() => { try { localStorage.setItem('mobos:theme', 'dark') } catch {} })

test('producción: estructura, versión y CTAs', async ({ page }) => {
  const errores = []
  page.on('pageerror', (error) => errores.push(error.message))
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Vendé con PIN')
  for (const ancla of ['#modulos', '#imei', '#portal', '#impresion', '#demo', '#precio']) {
    await expect(page.locator(ancla), `sección ${ancla}`).toHaveCount(1)
  }
  await expect(page.getByRole('heading', { name: 'Un IMEI deja de ser un número suelto.' })).toBeVisible()
  const version = await page.getByText(/v\d+\.\d+\.\d+/).first().textContent().catch(() => '')
  console.log('[prod] versión visible:', version)
  const cta = page.getByRole('link', { name: /Probar( el)? demo/i }).first()
  expect(await cta.getAttribute('href')).toContain('app.moboss.online/demo')
  expect(errores, `errores de runtime: ${errores.join(' | ')}`).toEqual([])
})

test('producción: verificador de IMEI completo (claro)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 })
  await page.goto('/')
  const seccion = page.locator('#imei')
  await seccion.scrollIntoViewIfNeeded()
  const campo = seccion.getByLabel('IMEI del equipo')
  await expect(campo).toHaveValue(IMEI_EJEMPLO)

  await seccion.getByRole('button', { name: 'Verificar IMEI' }).click()
  await expect(seccion.getByRole('status')).toBeVisible()
  await seccion.screenshot({ path: `${SHOTS}/c202-prod-imei-escaneo.png` })

  await expect(seccion.getByText('Verificado', { exact: true })).toBeVisible({ timeout: 15_000 })
  for (const texto of ['Dispositivo', 'Blacklist actual', 'Historial Blacklist Pro', 'Find My / iCloud', 'SIM lock', 'MDM', 'Garantía']) {
    await expect(seccion.getByText(texto, { exact: true }).first()).toBeVisible()
  }
  await expect(seccion.getByText('Sin reportes actuales').first()).toBeVisible()
  await expect(seccion.getByText('IMEIcheck.net (simulado)').first()).toBeVisible()
  await expect(seccion.getByText(/costo US\$ 0\.00/)).toBeVisible()
  await expect(seccion.getByText('•••••••••••3809').first()).toBeVisible()
  await expect(seccion.getByText('Ejemplo simulado')).toBeVisible()
  await seccion.screenshot({ path: `${SHOTS}/c202-prod-imei-resultado.png` })

  // Casos honestos.
  await seccion.getByRole('button', { name: 'Ver caso pendiente' }).click()
  await expect(seccion.getByText('No verificado').first()).toBeVisible()
  await seccion.getByRole('button', { name: 'Ver caso parcial' }).click()
  await expect(seccion.getByText('Parcial', { exact: true }).first()).toBeVisible()

  // IMEI inválido: aviso, sin resultado inventado.
  await campo.fill('356789102345678')
  await seccion.getByRole('button', { name: 'Verificar IMEI' }).click()
  await expect(seccion.getByRole('alert')).toContainText('Luhn')
  await expect(seccion.getByText('Verificado', { exact: true })).toHaveCount(0)
})

test('producción: claro y oscuro en móvil/desktop con capturas', async ({ page }) => {
  for (const [tema, width] of [['claro', 390], ['claro', 768], ['claro', 1440], ['oscuro', 390], ['oscuro', 1440]]) {
    if (tema === 'oscuro') await temaOscuro(page)
    else await page.addInitScript(() => { try { localStorage.setItem('mobos:theme', 'light') } catch {} })
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const oscuro = await page.evaluate(() => document.documentElement.classList.contains('dark'))
    expect(oscuro, `tema ${tema} aplicado a ${width}px`).toBe(tema === 'oscuro')
    expect(await sinScrollHorizontal(page), `sin scroll horizontal a ${width}px (${tema})`).toBeTruthy()
    // La ficha de IMEI se ve en ambos temas.
    const seccion = page.locator('#imei')
    await seccion.scrollIntoViewIfNeeded()
    await seccion.getByRole('button', { name: 'Verificar IMEI' }).click()
    await expect(seccion.getByText('Sin reportes actuales').first()).toBeVisible({ timeout: 15_000 })
    if (width === 1440) await page.screenshot({ path: `${SHOTS}/c202-prod-${tema}-1440.png`, fullPage: true })
    if (width === 390) await page.screenshot({ path: `${SHOTS}/c202-prod-${tema}-390.png`, fullPage: true })
    if (width === 768) await page.screenshot({ path: `${SHOTS}/c202-prod-${tema}-768.png`, fullPage: true })
  }
})
