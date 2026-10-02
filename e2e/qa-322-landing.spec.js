// QA #322 — Landing: recorrido móvil, sin repeticiones y con capturas reales.
//
// El primer test genera las capturas reales del producto (demo) que usa la
// landing en el hero y en la sección del portal: quedan versionadas en
// public/landing/ y su copia de evidencia en docs/qa/322-landing/. Después se
// verifica el criterio del issue: menú móvil, pie legal, CTAs diferenciados,
// targets ≥ 44 px, sin desborde y sin títulos repetidos.
import { test, expect } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { cerrarGuiaDemo } from './helpers/demo.js'

const SHOTS = process.env.MOBOS_CAPTURAS || join('docs', 'qa', '322-landing')
const PUBLICO = 'public/landing'
mkdirSync(SHOTS, { recursive: true })
mkdirSync(PUBLICO, { recursive: true })

const MOBILE = { width: 390, height: 844 }
const DESKTOP = { width: 1440, height: 900 }

async function tema(page, valor) {
  await page.evaluate((v) => { try { localStorage.setItem('mobos:theme', v) } catch { /* sin storage */ } }, valor)
}

// Medición compacta (#249): scroll horizontal, elementos cortados y targets
// con área efectiva < 44 px.
async function medir(page) {
  return page.evaluate(() => {
    const vw = window.innerWidth
    const visible = (el) => el.offsetParent !== null && el.getClientRects().length > 0 && !el.closest('[aria-hidden="true"]')
    const enScrollable = (el) => {
      for (let n = el.parentElement; n; n = n.parentElement) {
        const overflow = getComputedStyle(n).overflowX
        if (overflow === 'auto' || overflow === 'scroll') return true
      }
      return false
    }
    const overflowH = Math.max(0, document.documentElement.scrollWidth - vw)
    const cortados = []
    for (const el of document.querySelectorAll('button, a, input, h1, h2, h3, img, [data-testid]')) {
      if (!visible(el) || enScrollable(el)) continue
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) continue
      if (rect.left < -1 || rect.right > vw + 1) cortados.push({ que: el.tagName.toLowerCase(), texto: (el.textContent || '').trim().slice(0, 30) })
    }
    const areaTactil = (el) => {
      const rect = el.getBoundingClientRect()
      let ancho = rect.width
      let alto = rect.height
      const after = getComputedStyle(el, '::after')
      if (after && after.content && after.content !== 'none' && after.position === 'absolute') {
        const a = parseFloat(after.width)
        const h = parseFloat(after.height)
        if (Number.isFinite(a)) ancho = Math.max(ancho, a)
        if (Number.isFinite(h)) alto = Math.max(alto, h)
      }
      return { ancho, alto }
    }
    const chicos = []
    for (const el of document.querySelectorAll('a[href], button:not([disabled]), [role="button"]')) {
      if (!visible(el) || el.closest('.sr-only')) continue
      if (enScrollable(el)) continue
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) continue
      const area = areaTactil(el)
      if (area.alto < 44 || area.ancho < 44) chicos.push({ texto: (el.textContent || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40), ancho: Math.round(area.ancho), alto: Math.round(area.alto) })
    }
    return { overflowH, cortados: cortados.slice(0, 8), chicos: chicos.slice(0, 12) }
  })
}

test.describe('capturas reales del producto', () => {
  test.use({ storageState: undefined })

  test('genera la captura del panel y del portal desde la demo', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/demo')
    await page.getByRole('button', { name: /Entrar como Dueño/ }).click()
    await page.waitForURL((url) => !url.pathname.startsWith('/demo'))
    await cerrarGuiaDemo(page)
    await expect(page.getByTestId('shell')).toBeVisible({ timeout: 20_000 })
    await page.waitForTimeout(500)
    await page.screenshot({ path: join(PUBLICO, 'panel.png') })
    await page.screenshot({ path: join(SHOTS, 'captura-panel-demo.png') })

    // Portal del cliente de la demo (la página pública real, en móvil).
    await page.setViewportSize(MOBILE)
    await page.goto('/cuenta/demo-demo-cliente-lucia-rapido')
    await expect(page.getByTestId('portal-cotizaciones')).toBeVisible({ timeout: 20_000 })
    await page.waitForTimeout(400)
    await page.screenshot({ path: join(PUBLICO, 'portal.png') })
    await page.screenshot({ path: join(SHOTS, 'captura-portal-demo.png') })
  })
})

test('la landing se recorre en móvil con menú, sin repeticiones y con pie legal', async ({ page }) => {
  test.slow()
  const registro = []

  // Desktop: nav visible y CTAs diferenciados.
  await page.setViewportSize(DESKTOP)
  await page.goto('/landing-preview')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('link', { name: /Probar la demo/ }).first()).toHaveAttribute('href', /\/demo$/)
  await expect(page.getByRole('link', { name: 'Crear mi tienda' }).first()).toHaveAttribute('href', /\/login$/)
  await page.screenshot({ path: join(SHOTS, 'landing-desktop.png') })

  // Móvil: menú que abre, navega y cierra; targets ≥ 44; sin desborde.
  await page.setViewportSize(MOBILE)
  await tema(page, 'light')
  await page.goto('/landing-preview')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  const menu = page.getByRole('button', { name: 'Abrir menú' })
  await expect(menu).toBeVisible()
  await menu.click()
  const panel = page.locator('#menu-movil')
  await expect(panel).toBeVisible()
  await expect(panel.getByRole('link', { name: 'Verificación IMEI' })).toBeVisible()
  await page.screenshot({ path: join(SHOTS, 'landing-menu-mobile.png') })
  await panel.getByRole('link', { name: 'Vender', exact: true }).click()
  await expect(panel).toHaveCount(0)

  const medicion = await medir(page)
  const alto = await page.evaluate(() => document.body.scrollHeight)
  registro.push({ estado: 'mobile', alto, ...medicion })
  console.log(`[322:landing-mobile] alto=${alto}px scroll=${medicion.overflowH} cortados=${medicion.cortados.length} chicos=${medicion.chicos.length}`)
  expect(medicion.overflowH, 'sin scroll horizontal').toBe(0)
  expect(medicion.cortados, `sin elementos cortados · ${JSON.stringify(medicion.cortados)}`).toHaveLength(0)
  expect(medicion.chicos, `targets ≥ 44 en mobile · ${JSON.stringify(medicion.chicos)}`).toHaveLength(0)
  // La auditoría reportó ~15.000 px; el recorrido reordenado debe quedar bien
  // por debajo de ese largo en mobile (medido en la corrida).
  expect(alto, 'la landing se acorta').toBeLessThan(11500)
  await page.screenshot({ path: join(SHOTS, 'landing-mobile.png') })
  await page.screenshot({ path: join(SHOTS, 'landing-mobile-completa.png'), fullPage: true })

  // Oscuro.
  await tema(page, 'dark')
  await page.goto('/landing-preview')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await page.screenshot({ path: join(SHOTS, 'landing-mobile-oscuro.png') })
  await tema(page, 'light')

  // Sin títulos repetidos y sin jerga interna.
  const repetidos = await page.evaluate(() => {
    const vistos = {}
    const repetidos = []
    for (const h of document.querySelectorAll('h2')) {
      const texto = (h.textContent || '').trim()
      if (!texto) continue
      if (vistos[texto]) repetidos.push(texto)
      vistos[texto] = true
    }
    return repetidos
  })
  expect(repetidos, 'sin h2 repetidos').toEqual([])
  const texto = await page.locator('body').innerText()
  for (const termino of ['idempotente', 'modo mock', 'Fase 1', 'mock']) {
    expect(texto.toLowerCase()).not.toContain(termino.toLowerCase())
  }

  // Pie legal: Soporte, Estado, Privacidad y Términos.
  const pie = page.locator('footer.mobos-footer')
  await expect(pie.getByRole('link', { name: 'Soporte' })).toHaveAttribute('href', /^mailto:soporte@moboss\.online/)
  await expect(pie.getByRole('link', { name: 'Estado' })).toHaveAttribute('href', '/status')
  await expect(pie.getByRole('link', { name: 'Privacidad' })).toHaveAttribute('href', '/privacidad')
  await expect(pie.getByRole('link', { name: 'Términos' })).toHaveAttribute('href', '/terminos')

  writeFileSync(join(SHOTS, 'auditoria-322.json'), `${JSON.stringify(registro, null, 2)}\n`)
})

test('Privacidad y Términos se abren y vuelven a la landing', async ({ page }) => {
  await page.setViewportSize(MOBILE)
  await page.goto('/privacidad')
  await expect(page.getByRole('heading', { level: 1, name: 'Privacidad' })).toBeVisible()
  await expect(page.locator('footer.mobos-footer')).toHaveCount(1)
  await page.screenshot({ path: join(SHOTS, 'privacidad-mobile.png') })
  await page.goto('/terminos')
  await expect(page.getByRole('heading', { level: 1, name: 'Términos' })).toBeVisible()
  await page.screenshot({ path: join(SHOTS, 'terminos-mobile.png') })
})
