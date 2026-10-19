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
  const escenarios = {
    limpio: { testId: 'imei-escenario-limpio', tono: 'good', campo: 'imei-blacklist', valor: /sin reportes/i },
    blacklist: { testId: 'imei-escenario-blacklist', tono: 'bad', campo: 'imei-blacklist', valor: /reportad[oa]/i },
    operadora: { testId: 'imei-escenario-operadora', tono: 'bad', campo: 'imei-sim-lock', valor: /bloqueado para operador/i },
    tigo: { testId: 'imei-escenario-tigo', tono: 'bad', campo: 'imei-sim-lock', valor: /bloqueado por Tigo/i },
    'garantia-apple-vigente': { testId: 'imei-escenario-apple-vigente', tono: 'good', campo: 'imei-garantia', valor: /cobertura vigente/i },
    'garantia-apple-vencida': { testId: 'imei-escenario-apple-vencida', tono: 'warn', campo: 'imei-garantia', valor: /cobertura vencida/i },
  }
  const esperado = escenarios[escenario]
  const limpio = escenario === 'limpio'
  const selector = page.getByTestId(esperado.testId)
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
  await expect(resultado).toHaveAttribute('data-tone', esperado.tono)

  const blacklist = page.getByTestId('imei-blacklist')
  const findMy = page.getByTestId('imei-find-my')
  const campoEscenario = page.getByTestId(esperado.campo)
  await expect(campoEscenario).toContainText(esperado.valor)
  const detalle = page.getByTestId('imei-escenario-detalle')
  await expect(detalle).toContainText(/Motivo:/i)
  await expect(detalle).toContainText(/Recomendación:/i)
  for (const etiqueta of ['Historial de reportes', 'SIM lock', 'MDM', 'Garantía'])
    await expect(page.getByText(etiqueta, { exact: true })).toBeVisible()
  if (limpio) {
    await expect(blacklist).toContainText(/sin reportes/i)
    await expect(findMy).toContainText(/desactivado/i)
    await expect(resultado).toContainText(/sin reportes/i)
    await expect(resultado).not.toContainText(/no comprar/i)
  } else {
    if (escenario === 'blacklist') {
      await expect(blacklist).toContainText(/reportad[oa]/i)
      await expect(detalle).toContainText(/equipo denunciado/i)
      await expect(detalle).toContainText(/reporte:\s*\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/i)
      await expect(findMy).toContainText(/activado/i)
      await expect(page.getByText(/no comprar ni aceptar como parte de pago/i)).toBeVisible()
    }
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

    for (const escenario of ['limpio', 'blacklist', 'operadora', 'tigo', 'garantia-apple-vigente', 'garantia-apple-vencida']) {
      await comprobarEscenario(page, escenario)
      await desbordeHorizontal(page, ancho)
    }

    await page.getByTestId('imei-escenario-tigo').click()
    const imeiAnterior = await entrada.inputValue()
    await page.getByRole('button', { name: 'Otro ejemplo', exact: true }).click()
    await expect(entrada).not.toHaveValue(imeiAnterior)
    const verificacionAuto = page.getByTestId('imei-resultado')
    await expect(verificacionAuto).toBeVisible({ timeout: 10_000 })
    await expect(verificacionAuto).toContainText('Bloqueado por Tigo')
    await expect(verificacionAuto).toHaveAttribute('data-tone', 'bad')
    const imeiActual = await entrada.inputValue()
    await expect(verificacionAuto).toContainText(imeiActual.slice(-4))
    await desbordeHorizontal(page, ancho)
  }

  expect(llamadas, 'la demo no consulta la API ni a proveedores IMEI').toEqual([])
})
