// #215/#241 · Tablero por etapas de Servicio y Garantías: las órdenes con sus
// 8 estados y las garantías con sus 4, tarjetas con cliente/equipo/IMEI,
// contadores por etapa y avance desde la tarjeta.
//
// QA: por vista (1280/390) y tema (claro/oscuro) se recorren los dos tableros,
// se verifica que cada contador sea igual a las tarjetas de su etapa, se avanza
// una orden y se mide el contraste AA real del contenido; sin scroll horizontal
// de página (crítico en mobile). Además, dos corridas con el flag v2 apagado
// dejan la captura del tema anterior.
import { test, expect } from '@playwright/test'
import { auditarContraste, informar } from './helpers/contraste.js'
import { cerrarGuiaDemo } from './helpers/demo.js'

const SHOTS = process.env.MOBOS_CAPTURAS || 'test-results/rediseno'
const TEMAS = [['claro', 'light'], ['oscuro', 'dark']]
const VISTAS = [[1280, 720], [390, 844]]
const RAICES = ['[data-testid="servicio-garantias-tablero"]']
const ETAPAS_SERVICIO = ['RECIBIDO', 'DIAGNOSTICO', 'CON_TECNICO', 'ESPERANDO_REPUESTO', 'REPARADO', 'LISTO', 'ENTREGADO', 'CANCELADO']
const ETAPAS_GARANTIA = ['RECEIVED', 'DIAGNOSIS', 'READY', 'DELIVERED']

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
  await cerrarGuiaDemo(page)
}

async function abrirTablero(page) {
  await page.goto('/servicio', { waitUntil: 'domcontentloaded' })
  await page.getByTestId('servicio-garantias').getByRole('button', { name: 'Tablero', exact: true }).click()
  await page.getByTestId('servicio-garantias-tablero').waitFor({ timeout: 20000 })
  await page.getByTestId('tablero-tarjeta').first().waitFor({ timeout: 20000 })
}

const columna = (page, etapa) => page.locator(`[data-testid="tablero-etapa"][data-etapa="${etapa}"]`)
const tarjetas = (page, etapa) => columna(page, etapa).getByTestId('tablero-tarjeta')
const contador = async (page, etapa) => Number(await columna(page, etapa).getByTestId('tablero-contador').innerText())

async function contarPorEtapa(page, etapas) {
  for (const etapa of etapas) {
    expect(await contador(page, etapa), `contador de ${etapa}`).toBe(await tarjetas(page, etapa).count())
  }
}

const sinScrollHorizontal = async (page, contexto) => {
  const desborde = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(desborde, `scroll horizontal de página (${contexto})`).toBeLessThanOrEqual(0)
}

async function avanzarPrimeraDeRecibido(page, tema, vista) {
  const enRecibido = await tarjetas(page, 'RECIBIDO').count()
  const enDiagnostico = await tarjetas(page, 'DIAGNOSTICO').count()
  const primera = tarjetas(page, 'RECIBIDO').first()
  const codigo = await primera.getAttribute('data-codigo')
  expect(enRecibido, 'el seed de demo tiene una orden recibida').toBeGreaterThan(0)
  expect(codigo, 'la tarjeta de demo trae su código').toBeTruthy()
  await primera.getByTestId('tablero-avanzar').click()
  // La misma orden aparece en Diagnóstico y Recibido queda con una menos: se
  // espera el re-render (el avance es asíncrono) y se identifica por código.
  await expect(columna(page, 'DIAGNOSTICO').locator(`[data-codigo="${codigo}"]`)).toHaveCount(1)
  await expect(tarjetas(page, 'RECIBIDO')).toHaveCount(enRecibido - 1)
  expect(await contador(page, 'DIAGNOSTICO'), 'entra a Diagnóstico').toBe(enDiagnostico + 1)
  await page.screenshot({ path: `${SHOTS}/c241f4f-tablero-avance-${tema}-${vista}.png` })
  await contarPorEtapa(page, ETAPAS_SERVICIO)
}

for (const [tema, modo] of TEMAS) {
  for (const [ancho, alto] of VISTAS) {
    const vista = ancho <= 480 ? 'mobile' : 'desktop'
    test(`tablero por etapas ${vista} ${tema}: contadores, avance y AA (#215)`, async ({ page }) => {
      await preparar(page, modo, true)
      await page.setViewportSize({ width: ancho, height: alto })
      await abrirDemo(page)
      await abrirTablero(page)

      // Tablero de órdenes: contadores por etapa y captura.
      await contarPorEtapa(page, ETAPAS_SERVICIO)
      const ordenes = await auditarContraste(page, [], RAICES)
      informar(`c241f4f-tablero-ordenes-${vista}-${tema}`, ordenes)
      await page.screenshot({ path: `${SHOTS}/c241f4f-tablero-ordenes-${tema}-${vista}.png` })
      await sinScrollHorizontal(page, `tablero de órdenes ${tema} ${vista}`)

      // Avance de etapa desde la tarjeta (demo: vive en este navegador).
      await avanzarPrimeraDeRecibido(page, tema, vista)

      // Tablero de garantías: 4 etapas con sus contadores.
      await page.getByTestId('servicio-garantias-tablero').getByRole('button', { name: 'Garantías', exact: true }).click()
      await expect(page.getByTestId('tablero-tarjeta').first()).toBeVisible()
      await contarPorEtapa(page, ETAPAS_GARANTIA)
      const garantias = await auditarContraste(page, [], RAICES)
      informar(`c241f4f-tablero-garantias-${vista}-${tema}`, garantias)
      await page.screenshot({ path: `${SHOTS}/c241f4f-tablero-garantias-${tema}-${vista}.png` })
      await sinScrollHorizontal(page, `tablero de garantías ${tema} ${vista}`)

      expect(ordenes.totalBajosContenido, `AA del tablero de órdenes (${tema} ${vista})`).toBe(0)
      expect(garantias.totalBajosContenido, `AA del tablero de garantías (${tema} ${vista})`).toBe(0)
    })
  }
}

// Con el flag apagado el tablero sigue funcionando con el tema anterior: deja
// la captura «antes» y no exige AA (el tema clásico tiene bajos conocidos).
for (const [ancho, alto] of VISTAS) {
  const vista = ancho <= 480 ? 'mobile' : 'desktop'
  test(`tablero por etapas ${vista} claro: tema anterior sin v2 (#215)`, async ({ page }) => {
    await preparar(page, 'light', false)
    await page.setViewportSize({ width: ancho, height: alto })
    await abrirDemo(page)
    await abrirTablero(page)

    await contarPorEtapa(page, ETAPAS_SERVICIO)
    const ordenes = await auditarContraste(page, [], RAICES)
    informar(`c241f4f-tablero-ordenes-clasico-${vista}`, ordenes)
    await page.screenshot({ path: `${SHOTS}/c241f4f-tablero-ordenes-clasico-${vista}.png` })
    await sinScrollHorizontal(page, `tablero clásico ${vista}`)

    await page.getByTestId('servicio-garantias-tablero').getByRole('button', { name: 'Garantías', exact: true }).click()
    await expect(page.getByTestId('tablero-tarjeta').first()).toBeVisible()
    await contarPorEtapa(page, ETAPAS_GARANTIA)
    await page.screenshot({ path: `${SHOTS}/c241f4f-tablero-garantias-clasico-${vista}.png` })
    await sinScrollHorizontal(page, `tablero de garantías clásico ${vista}`)
  })
}
