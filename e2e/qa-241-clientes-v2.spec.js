// #241 · Lote B (Clientes/CRM): tiles de cliente, filas y chips con los tokens
// v2, detrás del flag `mobos:tema-v2`.
//
// QA antes/después: por cada vista (1280/390) y tema (claro/oscuro) se captura
// la lista y la ficha del cliente con el flag apagado y prendido, y se mide el
// contraste AA real del contenido (helper del piloto). Con el v2 prendido se
// exige 0 textos bajo AA en la lista y la ficha; con el flag apagado solo se
// informa (el default anterior no cambia).
import { test, expect } from '@playwright/test'
import { auditarContraste, informar } from './helpers/contraste.js'
import { cerrarGuiaDemo } from './helpers/demo.js'

const SHOTS = process.env.MOBOS_CAPTURAS || 'test-results/rediseno'
const TEMAS = [['claro', 'light'], ['oscuro', 'dark']]
const VISTAS = [[1280, 720], [390, 844]]
const RAICES_FICHA = ['[role="dialog"]']
const RAICES_LISTA = ['[data-testid="clientes-tabla"]', '[data-testid="resumen-clientes"]']

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
  // La guía se abre sola la primera vez por pestaña (#201) y monta un render
  // después de entrar: el helper compartido espera a que aparezca (en CI la
  // comprobación instantánea perdía la carrera y tapaba los clics).
  await cerrarGuiaDemo(page)
}

for (const [tema, modo] of TEMAS) {
  for (const [ancho, alto] of VISTAS) {
    const vista = ancho <= 480 ? 'mobile' : 'desktop'
    for (const v2 of [false, true]) {
      const etiqueta = v2 ? 'despues' : 'antes'
      test(`clientes ${vista} ${tema}: lista y ficha ${etiqueta} del v2 (#241 lote B)`, async ({ page }) => {
        await preparar(page, modo, v2)
        await page.setViewportSize({ width: ancho, height: alto })
        await abrirDemo(page)

        // Lista: filas, chips y el resumen en tiles (solo con el v2).
        await page.goto('/clientes', { waitUntil: 'domcontentloaded' })
        await page.getByTestId('cliente-fila').first().waitFor({ timeout: 20000 })
        const lista = await auditarContraste(page, [], RAICES_LISTA)
        informar(`c241f4b-clientes-lista-${vista}-${tema}-${etiqueta}`, lista)
        // Criterio del plan F4: sin scroll horizontal del documento.
        const scrollH = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
        expect(scrollH, `scroll horizontal de la lista (${tema} ${vista})`).toBeLessThanOrEqual(0)
        await page.screenshot({ path: `${SHOTS}/c241f4b-clientes-lista-${etiqueta}-${tema}-${vista}.png` })

        // Ficha (Resumen): los tiles de cliente.
        await page.goto('/clientes?cliente=demo-cliente-lucia', { waitUntil: 'domcontentloaded' })
        const ficha = page.getByRole('dialog')
        await expect(ficha.getByText('Total gastado')).toBeVisible({ timeout: 20000 })
        await page.waitForTimeout(300)
        const fichaMedicion = await auditarContraste(page, [], RAICES_FICHA)
        informar(`c241f4b-clientes-ficha-${vista}-${tema}-${etiqueta}`, fichaMedicion)
        await page.screenshot({ path: `${SHOTS}/c241f4b-clientes-ficha-${etiqueta}-${tema}-${vista}.png` })

        if (v2) {
          expect(lista.totalBajosContenido, `AA de la lista (${tema} ${vista})`).toBe(0)
          expect(fichaMedicion.totalBajosContenido, `AA de la ficha (${tema} ${vista})`).toBe(0)
        }
      })
    }
  }
}
