import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { openShellDestination, selectAnalysisSection } from '../helpers/shell-navigation.js'
import { measureLayout } from './helpers/layoutContract.js'

// #376: kit de gráficos en Inicio y Análisis, medido en la demo (sin backend)
// a 375/1280/1440 en claro y oscuro: sin scroll horizontal, importes completos,
// gráficos accesibles (aria-label + tabla de respaldo), teclado y movimiento
// reducido.
const out = process.env.MOBOS_QA_OUT || '/tmp/mobos-graficos-qa'
const WIDTHS = [
  [375, 812],
  [1280, 900],
  [1440, 900],
]

async function enterDemo(page) {
  await page.route('**/api/**', route =>
    !new URL(route.request().url()).pathname.startsWith('/api/')
      ? route.continue()
      : route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Frontend-only harness"}' }),
  )
  await page.route(/https:\/\//, route => route.abort())
  await page.addInitScript(() => sessionStorage.setItem('mobos:demo-guia-vista', '1'))
  await page.goto('/demo', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Entrar como Dueño', exact: true }).click()
  await expect(page.getByTestId('shell')).toBeVisible()
}

async function setDark(page) {
  const mobile = page.viewportSize().width < 1024
  await page.getByTestId(mobile ? 'shell-perfil-mobile' : 'shell-perfil').click()
  await page
    .getByRole('dialog', { name: 'Perfil y preferencias' })
    .getByRole('button', { name: 'Cambiar a tema oscuro', exact: true })
    .click()
  await page.keyboard.press('Escape')
  await expect(page.locator('html')).toHaveClass(/dark/)
}

async function settle(page) {
  await expect(page.locator('main[aria-busy="true"]')).toHaveCount(0)
  await expect(page.locator('main').first()).toContainText(/\S/)
  await page.waitForTimeout(900)
}

// QA-A completo del contenido (objetivos, contraste, importes, cruces). Los
// botones «Ver inventario» de Stock bajo viven en el desplegable cerrado y su
// caja mide 0 sobre «Pagos» de la lista: ruido previo a este cambio.
async function contrato(page, label) {
  const m = await measureLayout(page)
  expect(m.hscroll, `${label}: scroll horizontal`).toBe(false)
  if (m.mobile) expect(m.chromeBottom, `${label}: cromo fijo`).toBeLessThanOrEqual(64)
  expect(m.small, `${label}: objetivos < 44px`).toEqual([])
  expect(m.overlaps.filter(o => !String(o.what).includes('Ver inventario')), `${label}: cruces`).toEqual([])
  expect(m.cutAmounts, `${label}: importes cortados`).toEqual([])
  expect(m.lowContrast, `${label}: contraste < 4.5`).toEqual([])
}

async function noHScroll(page, label) {
  const sobra = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(sobra, `${label}: scroll horizontal`).toBeLessThanOrEqual(0)
}

for (const [width, height] of WIDTHS) {
  for (const dark of [false, true]) {
    const etiqueta = `${width}px ${dark ? 'dark' : 'light'}`

    test(`Inicio con gráficos ${etiqueta}`, async ({ page }) => {
      test.setTimeout(120_000)
      await page.setViewportSize({ width: 375, height: 812 })
      await enterDemo(page)
      if (dark) await setDark(page)
      await page.setViewportSize({ width, height })
      await settle(page)

      // Gráfico de ventas: role=img con resumen, tabla de respaldo y 14 días.
      const area = page.getByTestId('grafico-area')
      await expect(area).toBeVisible()
      const img = area.locator('[role="img"]')
      await expect(img).toHaveAttribute('aria-label', /Ventas por día.*total Gs/)
      expect(await area.locator('table.sr-only tbody tr').count()).toBe(14)

      // Teclado: el foco abre el tooltip con importes completos.
      await img.focus()
      await expect(page.getByTestId('grafico-tooltip')).toContainText(/Gs/)
      await page.keyboard.press('ArrowLeft')
      await expect(page.getByTestId('grafico-tooltip')).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(page.getByTestId('grafico-tooltip')).toHaveCount(0)

      // 30 días: la tabla de respaldo acompaña la ventana.
      await page.getByRole('button', { name: '30 días', exact: true }).click()
      await expect.poll(() => area.locator('table.sr-only tbody tr').count()).toBe(30)

      // Indicadores: 4 + 2 con tendencia y chips con base de comparación.
      expect(await page.getByTestId('sparkline').count()).toBeGreaterThanOrEqual(5)
      await expect(page.getByTestId('indicador-ticket')).toBeVisible()
      await expect(page.getByTestId('indicador-unidades')).toBeVisible()

      // Medios de pago con nombre, no solo la sigla/logo.
      const dona = page.getByTestId('grafico-dona')
      if (await dona.count()) {
        await expect(dona.locator('[role="img"]')).toHaveAttribute('aria-label', /Medios de pago:.*Gs/)
        await expect(dona).not.toContainText('DINERO')
      }
      await expect(page.getByTestId('inicio-top-productos')).toBeVisible()

      await noHScroll(page, `Inicio ${etiqueta}`)
      await contrato(page, `Inicio ${etiqueta}`)

      await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0) })
      await mkdir(out, { recursive: true })
      await page.screenshot({ path: `${out}/${width}-inicio-graficos${dark ? '-dark' : ''}.png`, fullPage: true })
    })

    test(`Análisis > Reportes con gráficos ${etiqueta}`, async ({ page }) => {
      test.setTimeout(120_000)
      await page.setViewportSize({ width: 375, height: 812 })
      await enterDemo(page)
      if (dark) await setDark(page)
      await page.setViewportSize({ width, height })
      await openShellDestination(page, 'Análisis')
      await selectAnalysisSection(page, 'Reportes')
      await settle(page)
      await expect(page.getByTestId('reportes-grafico-dias')).toBeVisible()
      await expect(page.getByTestId('reportes-grafico-dias').locator('[role="img"]')).toHaveAttribute('aria-label', /Ventas por día/)
      await expect(page.getByTestId('reportes-grafico-grupos')).toBeVisible()
      await noHScroll(page, `Reportes ${etiqueta}`)
      await contrato(page, `Reportes ${etiqueta}`)
    })
  }
}

test('movimiento reducido: los gráficos no animan su entrada', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1280, height: 900 })
  await enterDemo(page)
  await settle(page)
  const nombres = await page.evaluate(() =>
    [...document.querySelectorAll('.graf-entra-linea, .graf-entra-area, .graf-entra-barra, .graf-entra-sector')].map(el => getComputedStyle(el).animationName),
  )
  expect(nombres.length).toBeGreaterThan(0)
  expect(new Set(nombres)).toEqual(new Set(['none']))
})

test('con movimiento normal la línea sí se dibuja con animación', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.setViewportSize({ width: 1280, height: 900 })
  await enterDemo(page)
  await settle(page)
  const nombre = await page.locator('.graf-entra-linea').first().evaluate(el => getComputedStyle(el).animationName)
  expect(nombre).toBe('graf-dibuja')
})
