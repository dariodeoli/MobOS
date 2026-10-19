// Local public-landing acceptance only: no backend harness or outbound requests.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'
import { writeFileSync } from 'node:fs'
const origin = 'http://127.0.0.1:5279'
test('commercial landing: responsive presentation and public contracts', async () => {
  const browser = await chromium.launch({ headless: true })
  const measurements = []
  try {
    for (const width of [320, 360, 390, 768, 1440])
      for (const theme of ['light', 'dark']) {
        const context = await browser.newContext({
          viewport: { width, height: 900 },
          colorScheme: theme,
          serviceWorkers: 'block',
          reducedMotion: 'reduce',
        })
        const forbidden = []
        await context.route('**/*', route => {
          const url = new URL(route.request().url())
          if (url.origin !== origin || url.pathname.startsWith('/api')) {
            forbidden.push(url.origin === origin ? url.pathname : url.hostname)
            return route.abort()
          }
          return route.continue()
        })
        await context.addInitScript(t => localStorage.setItem('mobos:theme', t), theme)
        const page = await context.newPage()
        await page.goto(`${origin}/landing-preview`)
        await page.getByRole('heading', { level: 1 }).waitFor()
        const preview = page.locator('#inicio .commercial-preview')
        assert.equal(await preview.count(), 1, 'hero uses the presentation-only commercial preview')
        assert.equal(await preview.locator('figcaption').count(), 0)
        const showcase = page.getByTestId('landing-showcase')
        assert.equal(await showcase.locator('.landing-showcase-card').count(), 14)
        for (const id of ['pos', 'caja', 'stock', 'taller', 'clientes', 'portal', 'modulos', 'impresion', 'analytics', 'delivery', 'mensajes', 'imei', 'permisos', 'facturacion'])
          assert.equal(await page.getByTestId(`showcase-${id}`).count(), 1, `showcase ${id} is present`)
        assert.match(await showcase.innerText(), /Datos ficticios/)
        assert.match(await page.getByTestId('showcase-facturacion').innerText(), /En preparación/i)
        assert.match(await page.getByTestId('showcase-delivery').innerText(), /sin mapa externo/)
        assert.match(await page.getByTestId('showcase-mensajes').innerText(), /no enviado/)
        assert.equal(
          await preview.locator('button,a,input,[role="button"]').count(),
          0,
          'illustration must not imply app interaction',
        )
        const imeiMuestra = await preview.locator('.preview-serial').innerText()
        assert.doesNotMatch(imeiMuestra, /000000000000000/)
        assert.match(imeiMuestra, /•••••••••••3809/)
        assert.match(imeiMuestra, /Sin reportes · ejemplo simulado/)
        assert.match(imeiMuestra, /Fuente de ejemplo \(simulada\)/)
        for (const label of [
          'Venta registrada',
          'iPhone 15',
          'Batería',
          'Transferencia',
          'Saldo pendiente',
        ])
          assert.ok((await preview.innerText()).includes(label))
        for (const name of ['Probar la demo (sin registro)', 'Crear mi tienda']) {
          assert.equal(
            await page.getByRole('link', { name, exact: true }).first().getAttribute('href'),
            `https://app.moboss.online/${name.startsWith('Probar') ? 'demo' : 'login'}`,
          )
        }
        const copy = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
        for (const removedCopy of [
          'Vista ilustrativa · datos de ejemplo',
          'Hoy MobOS es gratis.',
          'Sin tarjeta, sin permanencia',
          'Acceso con correo o Google',
        ])
          assert.ok(!copy.includes(removedCopy), `landing omits removed copy: ${removedCopy}`)
        assert.ok(!/USD|por mes|Planes pendientes|30 días|50 %|cupón|checkout/.test(copy))
        assert.equal(
          await page.getByRole('link', { name: 'Ver el portal de la demo' }).getAttribute('href'),
          'https://app.moboss.online/cuenta/demo-demo-cliente-lucia-rapido',
        )
        assert.ok(copy.includes('sin consultar al proveedor'))
        assert.ok(copy.includes('No verificado'))
        assert.ok(!/Captura real|clientes confían|% más/.test(copy))
        for (const path of ['/status', '/privacidad', '/terminos'])
          assert.equal(await page.locator(`footer a[href="${path}"]`).count(), 1)
        for (const anchor of ['vender', 'controlar', 'cerrar', 'imei', 'precio', 'demo'])
          assert.equal(await page.locator(`#${anchor}`).count(), 1)
        // Keyboard activation, not mouse-only click handlers.
        const toggle = page.getByRole('button', {
          name: theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro',
        })
        await toggle.focus()
        await page.keyboard.press('Enter')
        assert.equal(
          await page.locator('html').evaluate(el => el.classList.contains('dark')),
          theme !== 'dark',
        )
        await page
          .getByRole('button', {
            name: theme === 'dark' ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro',
          })
          .press('Enter')
        const faq = page.getByRole('button', { name: '¿Cómo se verifica un IMEI?' })
        await faq.focus()
        await page.keyboard.press('Space')
        assert.equal(await faq.getAttribute('aria-expanded'), 'true')
        assert.ok((await page.locator('#faq-respuesta-1').innerText()).includes('No verificado'))
        if (width < 1024) {
          const menu = page.getByRole('button', { name: 'Abrir menú' })
          await menu.focus()
          await page.keyboard.press('Enter')
          assert.equal(
            await page.getByRole('button', { name: 'Cerrar menú' }).getAttribute('aria-expanded'),
            'true',
          )
          await page
            .locator('#menu-movil')
            .getByRole('link', { name: 'Vender', exact: true })
            .press('Enter')
          assert.equal(await page.locator('#menu-movil').count(), 0)
          assert.equal(new URL(page.url()).hash, '#vender')
        }
        await page.evaluate(() => window.scrollTo(0, 0))
        // Exercise the existing visual IMEI demo without provider access or charges.
        await page.getByRole('button', { name: 'Ver caso pendiente', exact: true }).press('Enter')
        await page.getByText('Demostración visual con datos ficticios:', { exact: false }).waitFor()
        assert.ok(
          (await page.locator('#imei').innerText()).includes(
            'no se consulta al proveedor ni se cobra',
          ),
        )
        assert.ok((await page.locator('#imei').innerText()).includes('No verificado'))
        await page.evaluate(() => window.scrollTo(0, 0))
        const geometry = await page.evaluate(() => {
          const header = document.querySelector('header').getBoundingClientRect()
          const eyebrow = document.querySelector('.landing-eyebrow').getBoundingClientRect()
          const bad = [...document.querySelectorAll('.commercial-preview *, .landing-showcase *, h1,h2,h3')]
            .filter(el => {
              const r = el.getBoundingClientRect()
              return (
                r.width &&
                (r.left < -1 || r.right > innerWidth + 1 || el.scrollWidth > el.clientWidth + 1)
              )
            })
            .map(el => el.className || el.tagName)
          const controls = [...document.querySelectorAll('a[href],button,input')]
            .filter(el => el.getClientRects().length && !el.closest('.sr-only'))
            .filter(el => {
              const r = el.getBoundingClientRect()
              return r.width < 44 || r.height < 44
            })
            .map(el => el.textContent || el.getAttribute('aria-label'))
          return {
            gap: eyebrow.top - header.bottom,
            overflow: document.documentElement.scrollWidth - innerWidth,
            bad,
            controls,
          }
        })
        assert.equal(geometry.gap, width >= 1024 ? 40 : 32)
        assert.equal(geometry.overflow, 0)
        assert.deepEqual(geometry.bad, [])
        assert.deepEqual(geometry.controls, [])
        // Confirm the nested preview is not masking clipped monetary cells.
        const fixture = await preview.innerText()
        for (const amount of ['Gs 5.280.000', 'Gs 4.000.000', 'Gs 1.280.000'])
          assert.ok(fixture.includes(amount))
        measurements.push({ width, theme, ...geometry, blockedRequests: forbidden })
        assert.ok(
          !forbidden.some(s => s.startsWith('/api') || s === 'api.moboss.online'),
          'no API attempt',
        )
        await page.screenshot({
          path: `/tmp/mobos-commercial-shots/after-${width}-${theme}.png`,
          fullPage: true,
        })
        // Stress money layout without changing the fictitious narrative fixture.
        await page
          .locator('.commercial-preview [data-money]')
          .evaluateAll(els => els.forEach(el => (el.textContent = 'Gs 100.000.000')))
        assert.deepEqual(
          await page.locator('.commercial-preview [data-money]').evaluateAll(els =>
            els
              .filter(el => {
                const r = el.getBoundingClientRect()
                const parent = el.parentElement.getBoundingClientRect()
                return (
                  el.scrollWidth > el.clientWidth + 1 ||
                  r.left < parent.left - 1 ||
                  r.right > parent.right + 1
                )
              })
              .map(el => el.textContent),
          ),
          [],
        )
        await context.close()
      }
    writeFileSync(
      '/tmp/mobos-commercial-shots/geometry.json',
      JSON.stringify(measurements, null, 2),
    )
  } finally {
    await browser.close()
  }
})
