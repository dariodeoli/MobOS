import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

// Bloques compartidos del rediseño (unidad 1B · docs/PANTALLAS.md): Toolbar,
// ListaDensa responsiva, FieldRow, StatusChip y Stat compact en la página DEV
// `/bloques-preview` a 375 y 1280, claro y oscuro. Frontend-only (sin backend).
const out = process.env.MOBOS_QA_OUT || '/tmp/mobos-blocks-qa'

async function abrir(page, width, dark) {
  await page.setViewportSize({ width, height: 900 })
  await page.emulateMedia({ colorScheme: dark ? 'dark' : 'light' })
  await page.addInitScript((oscuro) => { try { localStorage.setItem('mobos:theme', oscuro ? 'dark' : 'light') } catch { /* sin storage */ } document.documentElement.classList.toggle('dark', oscuro) }, dark)
  await page.goto('/bloques-preview', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('bloques-preview')).toBeVisible()
  await page.evaluate((oscuro) => document.documentElement.classList.toggle('dark', oscuro), dark)
}

const inter = (a, b) => a.x < b.x + b.width - 1 && b.x < a.x + a.width - 1 && a.y < b.y + b.height - 1 && b.y < a.y + a.height - 1

async function medir(page) {
  return page.evaluate(() => {
    const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' }
    const rect = (el) => { const r = el.getBoundingClientRect(); return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height } }
    const interactivos = [...document.querySelectorAll('main button, main input, main select, main [role="button"], main a[href]')].filter(visible)
    const tamanos = interactivos.map((el) => ({ n: (el.getAttribute('aria-label') || el.textContent || el.id || el.tagName).trim().slice(0, 30), ...rect(el), alto: el.getBoundingClientRect().height, ancho: el.getBoundingClientRect().width }))
    const cortados = [...document.querySelectorAll('main .tabular-nums')].filter(visible).filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent.trim())
    // Contraste: color del texto contra el fondo compuesto de sus ancestros.
    const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return [0, 0, 0, 0]; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p[3] ?? 1] }
    const fondo = (el) => { const capas = []; for (let n = el; n; n = n.parentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (c[3] > 0) capas.push(c); if (c[3] === 1) break } let base = [255, 255, 255]; for (const c of capas.reverse()) base = base.map((v, i) => c[i] * c[3] + v * (1 - c[3])); return base }
    const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05) }
    const chips = [...document.querySelectorAll('[data-testid="prev-chips"] [data-tono], [data-testid="prev-lista"] [data-tono]')].filter(visible).map((el) => {
      const texto = el.querySelector('span') || el
      return { t: el.textContent.trim(), tono: el.dataset.tono, ratio: ratio(parse(getComputedStyle(texto).color).slice(0, 3), fondo(el)), ancho: el.getBoundingClientRect().width, padre: el.parentElement.getBoundingClientRect().width }
    })
    return {
      ancho: innerWidth, scroll: document.documentElement.scrollWidth, tamanos, cortados, chips,
      tabla: !!document.querySelector('[data-testid="prev-lista"][role="table"]'),
      filas: document.querySelectorAll('[data-testid="prev-lista"] [data-fila]').length,
      listaScroll: (() => { const l = document.querySelector('[data-testid="prev-lista"]'); return l ? [l.scrollWidth, l.clientWidth] : null })(),
    }
  })
}

for (const width of [375, 1280]) {
  for (const dark of [false, true]) {
    test(`bloques compartidos a ${width}px ${dark ? 'oscuro' : 'claro'}`, async ({ page }) => {
      await abrir(page, width, dark)
      const m = await medir(page)

      // Sin scroll horizontal (página y lista).
      expect(m.scroll, 'scroll horizontal de la página').toBeLessThanOrEqual(m.ancho)
      expect(m.listaScroll[0], 'scroll horizontal de la lista').toBeLessThanOrEqual(m.listaScroll[1] + 1)

      // ResponsiveList: tabla ≥ md, tarjetas < md, una sola versión en el DOM.
      expect(m.tabla).toBe(width >= 768)
      expect(m.filas).toBe(5)
      if (width >= 768) await expect(page.getByRole('columnheader', { name: 'Monto' })).toBeVisible()
      else await expect(page.getByRole('columnheader')).toHaveCount(0)

      // Importes completos y chips legibles.
      expect(m.cortados, 'importes cortados').toEqual([])
      await expect(page.getByText(/12\.500\.000/).first()).toBeVisible()
      expect(m.chips.length).toBeGreaterThan(5)
      for (const chip of m.chips) {
        expect(chip.ratio, `contraste de «${chip.t}» (${chip.tono})`).toBeGreaterThanOrEqual(4.5)
        expect(chip.ancho, `«${chip.t}» w-fit`).toBeLessThan(chip.padre - 1)
      }

      // < lg: objetivos de 44px (en la tabla de escritorio no aplica).
      if (width < 1024) {
        for (const t of m.tamanos) {
          expect(t.alto, `alto de «${t.n}»`).toBeGreaterThanOrEqual(43.5)
          expect(t.ancho, `ancho de «${t.n}»`).toBeGreaterThanOrEqual(43.5)
        }
      }
      // Sin solapes entre interactivos.
      for (let i = 0; i < m.tamanos.length; i++) for (let j = i + 1; j < m.tamanos.length; j++) {
        expect(inter(m.tamanos[i], m.tamanos[j]), `«${m.tamanos[i].n}» solapa «${m.tamanos[j].n}»`).toBe(false)
      }

      // FieldRow: una caja con un solo borde y 44px; el input no pinta el suyo.
      const fila = page.getByTestId('prev-telefono').locator('[data-slot="fieldrow"]')
      expect((await fila.boundingBox()).height).toBeGreaterThanOrEqual(43.5)
      expect(await page.locator('#prev-tel').evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe('0px')
      await expect(page.getByTestId('prev-telefono').getByText('+595', { exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Consultar RUC' })).toBeVisible()

      // FieldRow conserva el recorrido de teclado y relaciona errores con su control.
      await page.locator('#prev-tel').focus()
      await page.keyboard.press('Tab')
      await expect(page.locator('#prev-ruc-in')).toBeFocused()
      const campoError = page.getByTestId('prev-error')
      const controlError = page.locator('#prev-error-input')
      await controlError.fill('Cambio que debe conservarse')
      await page.getByRole('button', { name: 'Alternar error de ejemplo' }).click()
      await expect(controlError).toHaveAttribute('aria-invalid', 'true')
      await expect(controlError).toHaveAttribute('aria-describedby', 'prev-error-input-ayuda')
      await expect(campoError.getByRole('alert')).toBeVisible()
      await expect(controlError).toHaveValue('Cambio que debe conservarse')
      await controlError.focus()
      await expect.poll(() => campoError.locator('[data-slot="fieldrow"]').evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe('none')
      await controlError.press('Tab')
      await expect(campoError.getByRole('button', { name: 'Alternar error de ejemplo' })).toBeFocused()

      // Toolbar: shim conserva testid y el principal vive en la barra.
      await expect(page.getByTestId('barra-inventario')).toBeVisible()
      await expect(page.getByTestId('prev-toolbar').getByRole('button', { name: 'Nuevo pedido' })).toBeVisible()

      // Paginación del pie a 44px.
      const sig = page.getByRole('button', { name: 'Siguiente' })
      expect((await sig.boundingBox()).height).toBeGreaterThanOrEqual(43.5)

      if (!dark) {
        await mkdir(out, { recursive: true })
        await page.screenshot({ path: `${out}/bloques-${width}.png`, fullPage: true })
      }
    })
  }
}
