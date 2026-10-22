import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { openShellDestination } from '../helpers/shell-navigation.js'

// #433 · Políticas públicas de la empresa. Frontend solo: la API se simula.
//  - Configuración › Organización › Políticas: filas con «›», estado, plantilla
//    y publicar.
//  - Página pública /<empresa>/politicas (índice y detalle) a 390 y 1440, sin
//    scroll horizontal, objetivos de 44 px y sin renderizar HTML del texto.
const out = process.env.MOBOS_QA_OUT || '/tmp/mobos-politicas'
const SHOTS = process.env.MOBOS_QA_SHOTS === '1'

const company = { name: 'Celulares Don Pepe', slug: 'don-pepe', phone: '0981123456', email: 'hola@donpepe.test', address: 'Av. Mariscal López 1234', city: 'Asunción', department: 'Central', logo: false }
const textoGarantia = '# Garantía de los equipos\n- Equipos **nuevos**: 12 meses por defectos de fábrica.\n- Equipos semi-nuevos: 3 meses.\n\n# Qué no cubre\n- Golpes, caídas y humedad.\n\n<script>window.__inyectado = true</script><img src=x onerror="window.__inyectado = true">'

const indice = { company, policies: [{ type: 'garantia', label: 'Garantía', updatedAt: '2026-10-14T15:00:00.000Z' }, { type: 'cambios', label: 'Cambios y devoluciones', updatedAt: null }] }
const detalle = { company, policy: { type: 'garantia', label: 'Garantía', content: textoGarantia, updatedAt: '2026-10-14T15:00:00.000Z' }, others: [{ type: 'cambios', label: 'Cambios y devoluciones' }] }

async function simularPublica(page) {
  page.on('pageerror', e => { throw e })
  await page.route('**/api/**', route => {
    const { pathname } = new URL(route.request().url())
    if (!pathname.startsWith('/api/')) return route.continue()
    const ok = body => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    if (pathname === '/api/public/policies/don-pepe') return ok(indice)
    if (pathname === '/api/public/policies/don-pepe/garantia') return ok(detalle)
    if (pathname.startsWith('/api/public/policies/')) return route.fulfill({ status: 404, contentType: 'application/json', body: '{"message":"Política no encontrada."}' })
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"Frontend-only harness"}' })
  })
  await page.route(/https:\/\//, route => route.abort())
}

function medir(page) {
  return page.evaluate(() => {
    const visible = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).display !== 'none' }
    const pequenos = []
    for (const el of document.querySelectorAll('main a[href]')) {
      if (!visible(el) || el.closest('p') && !el.dataset.testid) continue
      const r = el.getBoundingClientRect()
      if (r.height < 43.5) pequenos.push(`${(el.textContent || '').trim().slice(0, 30)} ${Math.round(r.height)}px`)
    }
    return { desborde: document.documentElement.scrollWidth - document.documentElement.clientWidth, pequenos }
  })
}

for (const [ancho, alto] of [[360, 740], [390, 844], [1440, 900]]) {
  for (const esquema of ['light', 'dark']) {
    test(`página pública de políticas ${ancho}px ${esquema}: índice y detalle sin desborde ni HTML inyectado`, async ({ page }) => {
      await page.setViewportSize({ width: ancho, height: alto })
      await page.emulateMedia({ colorScheme: esquema })
      await simularPublica(page)

      await page.goto('/don-pepe/politicas', { waitUntil: 'domcontentloaded' })
      await expect(page.getByTestId('politicas-titulo')).toHaveText('Nuestras políticas')
      await expect(page.getByTestId('cabecera-tienda')).toContainText('Celulares Don Pepe')
      const enlaces = page.getByTestId('politicas-indice').getByRole('link')
      await expect(enlaces).toHaveCount(2)
      let m = await medir(page)
      expect(m.desborde, 'sin scroll horizontal (índice)').toBeLessThanOrEqual(0)
      if (ancho < 1024) expect(m.pequenos, 'objetivos >= 44px (índice)').toEqual([])
      if (SHOTS && esquema === 'light') { await mkdir(out, { recursive: true }); await page.screenshot({ path: `${out}/politicas-indice-${ancho}.png`, fullPage: true }) }

      await enlaces.first().click()
      await expect(page).toHaveURL(/\/don-pepe\/politicas\/garantia$/)
      await expect(page.getByTestId('politicas-titulo')).toHaveText('Garantía')
      const texto = page.getByTestId('politica-texto')
      await expect(texto.getByRole('heading', { name: 'Garantía de los equipos' })).toBeVisible()
      await expect(texto.getByRole('listitem')).toHaveCount(3)
      await expect(texto.locator('strong')).toHaveText('nuevos')
      // El HTML escrito en el texto se descarta: no hay scripts ni imágenes en el contenido.
      await expect(texto.locator('script, img')).toHaveCount(0)
      expect(await page.evaluate(() => window.__inyectado)).toBeUndefined()
      await expect(page.getByTestId('boton-whatsapp')).toHaveAttribute('href', /^https:\/\/wa\.me\/595981123456/)
      m = await medir(page)
      expect(m.desborde, 'sin scroll horizontal (detalle)').toBeLessThanOrEqual(0)
      if (ancho < 1024) expect(m.pequenos, 'objetivos >= 44px (detalle)').toEqual([])
      if (SHOTS && esquema === 'light') await page.screenshot({ path: `${out}/politicas-garantia-${ancho}.png`, fullPage: true })
    })
  }
}

test('un borrador o una política inexistente muestra el error sin revelar nada', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await simularPublica(page)
  await page.goto('/don-pepe/politicas/envios', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('politicas-error')).toContainText('Política no encontrada')
})

async function entrarDemo(page) {
  // La demo no llama al API real: las políticas viven en el navegador.
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

for (const [ancho, alto] of [[360, 740], [390, 844], [1440, 900]]) {
  test(`Configuración › Políticas ${ancho}px: filas con «›», estado, plantilla y publicar`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: alto })
    await entrarDemo(page)
    await page.goto('/configuracion/negocio', { waitUntil: 'domcontentloaded' })
    await page.getByRole('tablist', { name: 'Secciones de Negocio' }).getByRole('tab', { name: 'Políticas' }).click()
    const lista = page.getByTestId('politicas-lista')
    await expect(lista.locator('[data-politica]')).toHaveCount(6)
    await expect(lista.locator('[data-politica="cambios"]')).toContainText('Sin texto')
    await expect(lista.locator('[data-politica="cambios"]')).toContainText('›')
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 'sin scroll horizontal').toBeLessThanOrEqual(0)
    if (SHOTS) { await mkdir(out, { recursive: true }); await page.screenshot({ path: `${out}/config-politicas-${ancho}.png` }) }

    await lista.locator('[data-politica="cambios"]').click()
    const editor = page.getByTestId('politica-editor')
    await expect(editor).toBeVisible()
    await editor.getByTestId('politica-plantilla').click()
    await expect(editor.getByRole('textbox')).toHaveValue(/7 días corridos/)
    await expect(page.getByTestId('politica-contador')).toContainText('/ 8000')
    await editor.getByRole('switch', { name: 'Publicar política' }).check()
    await editor.getByRole('button', { name: 'Guardar' }).click()
    await expect(page.getByTestId('politica-editor')).toHaveCount(0)
    await expect(lista.locator('[data-politica="cambios"]')).toContainText('Publicada')
    if (SHOTS) await page.screenshot({ path: `${out}/config-politicas-publicada-${ancho}.png` })
  })
}
