// #240/#250 · Recepción de equipos y repuestos con el buscador dependiente de
// dispositivos de la biblioteca (v0.24.0): en la orden de servicio el modelo
// manda y capacidad/color se despliegan después; en el caso de garantía el
// repuesto se elige del catálogo (producto → marca/categoría) y se suma a la
// lista; un modelo fuera del catálogo se guarda tal cual y sincroniza el tipo.
//
// QA por vista (1280/390) y tema (claro/oscuro): contraste AA real del diálogo,
// sin scroll horizontal de página y capturas con el buscador en uso.
import { test, expect } from '@playwright/test'
import { auditarContraste, informar } from './helpers/contraste.js'
import { cerrarGuiaDemo } from './helpers/demo.js'

const SHOTS = process.env.MOBOS_CAPTURAS || 'test-results/rediseno'
const TEMAS = [['claro', 'light'], ['oscuro', 'dark']]
const VISTAS = [[1280, 720], [390, 844]]
const RAICES = ['[role="dialog"]']

const preparar = (page, tema, v2) =>
  page.addInitScript(({ tema, v2 }) => {
    try {
      localStorage.setItem('mobos:theme', tema)
      localStorage.setItem('mobos:tema-v2', v2 ? '1' : '0')
    } catch { /* sin storage */ }
  }, { tema, v2 })

async function abrirDemo(page) {
  await page.goto('/demo', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
  await page.getByRole('button', { name: /Dueño/ }).first().click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 30000 })
  await page.waitForTimeout(800)
  // La guía puede montar unos segundos después de entrar: se la espera.
  await cerrarGuiaDemo(page, { timeout: 8000 })
}

async function nuevaOrden(page) {
  await page.goto('/servicio', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '+ Nueva orden' }).click()
  const dialogo = page.getByRole('dialog')
  await dialogo.getByTestId('recepcion-dispositivo').waitFor({ timeout: 15000 })
  return dialogo
}

// Los locators van dentro del diálogo y con exact: afuera hay campos ocultos
// de otras pantallas («Modelo y capacidad» del POS) que comparten palabras.
async function elegirModelo(dialogo, texto, opcion) {
  const modelo = dialogo.getByRole('combobox', { name: 'Modelo', exact: true })
  await modelo.fill(texto)
  if (opcion) await dialogo.getByRole('option', { name: opcion, exact: true }).click()
  else await modelo.press('Enter')
}

const sinScrollHorizontal = async (page, contexto) => {
  const desborde = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(desborde, `scroll horizontal (${contexto})`).toBeLessThanOrEqual(0)
}

for (const [tema, modo] of TEMAS) {
  for (const [ancho, alto] of VISTAS) {
    const vista = ancho <= 480 ? 'mobile' : 'desktop'
    test(`orden de servicio ${vista} ${tema}: modelo → capacidad/color (#240/#250)`, async ({ page }) => {
      await preparar(page, modo, true)
      await page.setViewportSize({ width: ancho, height: alto })
      await abrirDemo(page)
      const dialogo = await nuevaOrden(page)

      // El modelo manda: recién al elegirlo se despliegan capacidad y color.
      await expect(dialogo.getByLabel('Capacidad', { exact: true })).toHaveCount(0)
      await elegirModelo(dialogo, 'iPhone 17', 'iPhone 17')
      await dialogo.getByLabel('Capacidad', { exact: true }).selectOption('256 GB')
      const color = await dialogo.getByLabel('Color', { exact: true }).locator('option').nth(1).getAttribute('value')
      await dialogo.getByLabel('Color', { exact: true }).selectOption(color)
      const etiqueta = `iPhone 17 · 256 GB · ${color}`

      await dialogo.locator('#cliente').fill('Lucía Fernández')
      await dialogo.getByPlaceholder('Qué reporta el cliente').fill('No enciende.')
      await dialogo.getByTestId('recepcion-dispositivo').scrollIntoViewIfNeeded()
      await page.screenshot({ path: `${SHOTS}/c241f4g-buscador-orden-${tema}-${vista}.png` })

      const contraste = await auditarContraste(page, [], RAICES)
      informar(`c241f4g-buscador-orden-${vista}-${tema}`, contraste)
      expect(contraste.totalBajosContenido, `AA del formulario (${tema} ${vista})`).toBe(0)
      await sinScrollHorizontal(page, `formulario ${tema} ${vista}`)

      // La orden guarda la etiqueta compuesta y la lista la muestra tal cual.
      await dialogo.getByRole('button', { name: 'Crear orden' }).click()
      await expect(page.getByText(etiqueta, { exact: true }).first()).toBeVisible({ timeout: 15000 })
      await page.screenshot({ path: `${SHOTS}/c241f4g-buscador-lista-${tema}-${vista}.png` })
    })
  }
}

// Claro, las dos vistas: modelo fuera del catálogo (texto libre + tipo del
// checklist) y la recepción de repuestos del caso de garantía.
for (const [ancho, alto] of VISTAS) {
  const vista = ancho <= 480 ? 'mobile' : 'desktop'
  test(`recepción libre y repuestos ${vista} claro (#240/#250)`, async ({ page }) => {
    await preparar(page, 'light', true)
    await page.setViewportSize({ width: ancho, height: alto })
    await abrirDemo(page)

    const dialogo = await nuevaOrden(page)
    await elegirModelo(dialogo, 'MacBook Air M2')
    await expect(dialogo.locator('#tipo-de-dispositivo'), 'el tipo se sincroniza con el modelo').toHaveValue('MacBook')
    await dialogo.locator('#cliente').fill('Lucía Fernández')
    await dialogo.getByTestId('recepcion-dispositivo').scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${SHOTS}/c241f4g-buscador-libre-claro-${vista}.png` })
    await sinScrollHorizontal(page, `formulario libre ${vista}`)
    await dialogo.getByRole('button', { name: 'Crear orden' }).click()
    await expect(page.getByText('MacBook Air M2', { exact: true }).first()).toBeVisible({ timeout: 15000 })

    await page.goto('/garantias', { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: 'Nuevo caso' }).first().click()
    const caso = page.getByRole('dialog')
    await caso.getByTestId('recepcion-repuesto').waitFor({ timeout: 15000 })
    await caso.getByPlaceholder('Nombre del cliente').fill('Lucía Fernández')
    await caso.getByPlaceholder('Serial o IMEI').fill('DEMO-REP-0001')
    await caso.getByPlaceholder('Falla reportada, revisión solicitada…').fill('Revisión de pantalla.')

    // Producto o modelo compatible → marca y categoría; se agrega a la lista.
    const repuesto = caso.getByRole('combobox', { name: 'Producto o modelo compatible', exact: true })
    await repuesto.fill('Pantalla OLED')
    await repuesto.press('Enter')
    await caso.getByLabel('Marca', { exact: true }).selectOption('Apple')
    await caso.getByLabel('Categoría', { exact: true }).selectOption('Repuestos')
    await caso.getByRole('button', { name: 'Agregar a la lista' }).click()
    await expect(caso.locator('textarea[placeholder^="Pantalla OLED"]')).toHaveValue('Pantalla OLED · Apple · Repuestos')
    await page.screenshot({ path: `${SHOTS}/c241f4g-buscador-repuestos-claro-${vista}.png` })

    const contraste = await auditarContraste(page, [], RAICES)
    informar(`c241f4g-buscador-repuestos-${vista}-claro`, contraste)
    expect(contraste.totalBajosContenido, `AA del caso (${vista})`).toBe(0)
    await sinScrollHorizontal(page, `caso ${vista}`)

    await caso.getByRole('button', { name: 'Registrar caso' }).click()
    await expect(page.getByText(/Repuestos: Pantalla OLED · Apple · Repuestos/).first()).toBeVisible({ timeout: 15000 })
  })
}
