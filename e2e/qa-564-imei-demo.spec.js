// QA #564 — la demo pública IMEI solo muestra escenarios ficticios y mantiene
// coherentes blacklist/Find My en anchos de móvil, tablet y escritorio.
import { test, expect } from '@playwright/test'

const ANCHOS = [320, 390, 768, 1440]

async function desbordeHorizontal(page, ancho) {
  const medida = await page.evaluate(() => ({
    viewport: window.innerWidth,
    documento: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }))
  expect(medida.viewport).toBe(ancho)
  expect(medida.documento, `documento sin overflow a ${ancho}px`).toBe(ancho)
  expect(medida.body, `body sin overflow a ${ancho}px`).toBe(ancho)
}

async function comprobarEscenario(page, escenario) {
  const limpio = escenario === 'limpio'
  const selector = page.getByTestId(limpio ? 'imei-escenario-limpio' : 'imei-escenario-blacklist')
  const navegacionesAntes = await page.evaluate(() => performance.getEntriesByType('navigation').length)
  const urlAntes = page.url()
  await selector.click()

  const resultado = page.getByTestId('imei-resultado')
  await expect(resultado).toBeVisible({ timeout: 10_000 })
  expect(page.url(), 'cambiar de escenario no recarga ni navega').toBe(urlAntes)
  await expect(resultado).toContainText(/simulad[oa]/i)
  await expect(resultado).toContainText('Fuente de ejemplo (simulada)')
  await expect(resultado).not.toContainText(/imeicheck\.net|consulta real|proveedor real/i)
  expect(await page.evaluate(() => performance.getEntriesByType('navigation').length)).toBe(navegacionesAntes)
  await expect(page.getByText(/datos ficticios/i).first()).toBeVisible()
  await expect(resultado).toHaveAttribute('data-tone', limpio ? 'good' : 'bad')

  const blacklist = page.getByTestId('imei-blacklist')
  const findMy = page.getByTestId('imei-find-my')
  for (const etiqueta of ['Historial de reportes', 'SIM lock', 'MDM', 'Garantía'])
    await expect(page.getByText(etiqueta, { exact: true })).toBeVisible()
  if (limpio) {
    await expect(blacklist).toContainText(/sin reportes/i)
    await expect(findMy).toContainText(/desactivado/i)
    await expect(resultado).toContainText(/sin reportes/i)
    await expect(resultado).not.toContainText(/no comprar/i)
  } else {
    await expect(blacklist).toContainText(/reportad[oa]/i)
    await expect(blacklist).toContainText(/motivo/i)
    await expect(blacklist).toContainText(/simulad[oa]|fictici[oa]/i)
    await expect(blacklist).toContainText(/reporte:\s*\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/i)
    await expect(findMy).toContainText(/activado/i)
    await expect(page.getByText(/no comprar ni aceptar como parte de pago/i)).toBeVisible()
  }
}

test('demo IMEI: los dos escenarios son simulados, consistentes y responsive (#564)', async ({ page }) => {
  // Acelera la animación de demostración sin alterar el resultado probado.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const llamadas = []
  page.on('request', (request) => {
    const url = request.url()
    if (/\/api\/imei(?:\?|$)|imeicheck|imei\.info/i.test(url)) llamadas.push(url)
  })

  for (const ancho of ANCHOS) {
    await page.setViewportSize({ width: ancho, height: 900 })
    await page.goto('/landing-preview')
    await expect(page.getByRole('heading', { name: /Un IMEI deja de ser un número suelto/i })).toBeVisible()
    const entrada = page.getByLabel('IMEI del equipo')
    await expect(entrada).toBeVisible()
    const anchoEntrada = await entrada.evaluate(element => element.getBoundingClientRect().width)
    expect(anchoEntrada, `input IMEI compacto a ${ancho}px`).toBeLessThanOrEqual(ancho - 32)

    await comprobarEscenario(page, 'limpio')
    await desbordeHorizontal(page, ancho)

    await comprobarEscenario(page, 'blacklist')
    await desbordeHorizontal(page, ancho)
  }

  expect(llamadas, 'la demo no consulta la API ni a proveedores IMEI').toEqual([])
})
