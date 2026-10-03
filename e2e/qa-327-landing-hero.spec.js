// QA #327 — Landing móvil: el aire entre el header sticky y la pill del hero.
//
// Dario: «reducir el aire entre el header y la pill “Operación completa para
// tiendas móviles” en mobile/tablet». Este spec mide el espacio real (borde
// inferior del header → borde superior de la pill) en 360/390/414/768, captura
// el hero en claro y oscuro y comprueba que el salto al ancla `#inicio` no deje
// la pill tapada por el header sticky.
//
// Evidencia: `docs/qa/327-landing-padding/{antes,despues}` (con `MOBOS_CAPTURAS`).
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const SHOTS = process.env.MOBOS_CAPTURAS || join('docs', 'qa', '327-landing-padding')
const ANCHOS = [360, 390, 414, 768]
const ALTO = 844
// Aire aceptado arriba de la pill: ni pegado al header ni con el hueco viejo.
const AIRE_MINIMO = 8
const AIRE_MAXIMO = 40

async function tema(page, valor) {
  await page.evaluate((v) => { try { localStorage.setItem('mobos:theme', v) } catch { /* sin storage */ } }, valor)
}

// Espacio entre el header sticky y la pill del hero, en píxeles redondeados.
async function aireDeLaPill(page) {
  return page.evaluate(() => {
    const header = document.querySelector('header')
    const pill = document.querySelector('#inicio p')
    if (!header || !pill) return null
    const h = header.getBoundingClientRect()
    const p = pill.getBoundingClientRect()
    return { aire: Math.round(p.top - h.bottom), header: Math.round(h.height), pill: Math.round(p.top) }
  })
}

test('la pill del hero queda cerca del header sticky en mobile y tablet', async ({ page }) => {
  mkdirSync(SHOTS, { recursive: true })
  for (const ancho of ANCHOS) {
    await page.setViewportSize({ width: ancho, height: ALTO })
    await page.goto('/landing-preview')
    await expect(page.locator('#inicio p').first()).toBeVisible()
    const medicion = await aireDeLaPill(page)
    console.log(`[327:${ancho}] aire=${medicion.aire}px (header ${medicion.header}px, pill a ${medicion.pill}px)`)
    expect(medicion.aire, `la pill no puede quedar pegada al header (${ancho}px)`).toBeGreaterThanOrEqual(AIRE_MINIMO)
    expect(medicion.aire, `el aire arriba de la pill en ${ancho}px`).toBeLessThanOrEqual(AIRE_MAXIMO)
  }
})

test('el hero se captura en claro y oscuro sin que el header tape la pill', async ({ page }) => {
  mkdirSync(SHOTS, { recursive: true })
  await page.setViewportSize({ width: 390, height: ALTO })
  for (const [nombre, valor] of [['claro', 'light'], ['oscuro', 'dark']]) {
    await page.goto('/landing-preview')
    await tema(page, valor)
    await page.reload()
    await page.evaluate(() => window.scrollTo(0, 0))
    await expect(page.locator('#inicio p').first()).toBeVisible()
    await page.screenshot({ path: join(SHOTS, `hero-${nombre}-390.png`) })

    // El enlace del logo salta a `#inicio`: la pill tiene que quedar debajo del
    // header sticky (scroll-margin del hero), no tapada por él.
    await page.evaluate(() => window.scrollTo(0, 1400))
    await page.getByRole('link', { name: 'MobOS' }).first().click()
    await page.waitForFunction(() => location.hash === '#inicio', null, { timeout: 5000 })
    // El scroll suave del ancla tiene que asentarse antes de medir.
    await expect.poll(async () => {
      const uno = await page.evaluate(() => Math.round(window.scrollY))
      await page.waitForTimeout(250)
      const dos = await page.evaluate(() => Math.round(window.scrollY))
      return uno === dos
    }, { timeout: 6000, intervals: [300, 300, 500] }).toBe(true)
    const trasSalto = await aireDeLaPill(page)
    expect(trasSalto.aire, `el header sticky tapa la pill (${nombre})`).toBeGreaterThanOrEqual(0)
    await page.screenshot({ path: join(SHOTS, `hero-ancla-${nombre}-390.png`) })
  }
})
