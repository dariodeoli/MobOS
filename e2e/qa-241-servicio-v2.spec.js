// #241 · Lote E (Servicio técnico y Garantías): tokens v2 en el taller
// (stepper del flujo y tiles), en el listado unificado (tiles de servicio y
// garantías) y en la tabla de garantías (chips y resumen).
//
// QA antes/después: por vista (1280/390) y tema (claro/oscuro) se capturan las
// tres pantallas con el flag apagado y prendido y se mide el contraste AA real
// del contenido; con el v2 prendido se exige 0 textos bajo AA y sin scroll
// horizontal, y con el flag apagado solo se informa.
import { test, expect } from '@playwright/test'
import { auditarContraste, informar } from './helpers/contraste.js'

const SHOTS = process.env.MOBOS_CAPTURAS || 'test-results/rediseno'
const TEMAS = [['claro', 'light'], ['oscuro', 'dark']]
const VISTAS = [[1280, 720], [390, 844]]
const RAICES = ['[data-testid="servicio-garantias"]']

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
  if (await page.getByRole('dialog', { name: 'Cómo funciona la demo' }).count()) {
    await page.getByRole('button', { name: 'Cerrar', exact: true }).click()
    await page.waitForTimeout(300)
  }
}

for (const [tema, modo] of TEMAS) {
  for (const [ancho, alto] of VISTAS) {
    const vista = ancho <= 480 ? 'mobile' : 'desktop'
    for (const v2 of [false, true]) {
      const etiqueta = v2 ? 'despues' : 'antes'
      test(`servicio y garantías ${vista} ${tema}: ${etiqueta} del v2 (#241 lote E)`, async ({ page }) => {
        await preparar(page, modo, v2)
        await page.setViewportSize({ width: ancho, height: alto })
        await abrirDemo(page)

        // Servicio: el flujo del taller (stepper) con sus tiles de totales.
        await page.goto('/servicio', { waitUntil: 'domcontentloaded' })
        await page.getByTestId('servicio-tabla').waitFor({ timeout: 20000 })
        const servicio = await auditarContraste(page, [], RAICES)
        informar(`c241f4e-servicio-${vista}-${tema}-${etiqueta}`, servicio)
        const scrollH = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
        expect(scrollH, `scroll horizontal de servicio (${tema} ${vista})`).toBeLessThanOrEqual(0)
        await page.screenshot({ path: `${SHOTS}/c241f4e-servicio-${etiqueta}-${tema}-${vista}.png` })

        // Todo: el listado unificado con los tiles de servicio y garantías.
        await page.getByRole('button', { name: 'Todo', exact: true }).click()
        await page.getByTestId('servicio-garantias-tabla').waitFor({ timeout: 15000 })
        await page.waitForTimeout(200)
        const todo = await auditarContraste(page, [], RAICES)
        informar(`c241f4e-todo-${vista}-${tema}-${etiqueta}`, todo)
        await page.screenshot({ path: `${SHOTS}/c241f4e-todo-${etiqueta}-${tema}-${vista}.png` })

        // Garantías: la tabla con sus chips y el resumen en tiles.
        await page.goto('/garantias', { waitUntil: 'domcontentloaded' })
        await page.getByTestId('garantias-tabla').waitFor({ timeout: 20000 })
        const garantias = await auditarContraste(page, [], RAICES)
        informar(`c241f4e-garantias-${vista}-${tema}-${etiqueta}`, garantias)
        await page.screenshot({ path: `${SHOTS}/c241f4e-garantias-${etiqueta}-${tema}-${vista}.png` })

        if (v2) {
          expect(servicio.totalBajosContenido, `AA de servicio (${tema} ${vista})`).toBe(0)
          expect(todo.totalBajosContenido, `AA del listado unificado (${tema} ${vista})`).toBe(0)
          expect(garantias.totalBajosContenido, `AA de garantías (${tema} ${vista})`).toBe(0)
        }
      })
    }
  }
}
