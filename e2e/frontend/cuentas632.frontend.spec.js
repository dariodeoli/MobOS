import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { ensureCobro } from '../helpers/ensure-cobro.js'

const names = [
  'Caja de efectivo del mostrador principal — sucursal de demostración',
  'Transferencia bancaria de operaciones comerciales internacionales — cuenta de demostración',
  'Caja en dólares estadounidenses para cobros del mostrador',
]
async function enter(page, width, dark) {
  const writes = []
  page.on('request', request => {
    const path = new URL(request.url()).pathname
    if (path.startsWith('/api/') && path !== '/api/public/track' && !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) writes.push(path)
  })
  await page.route('**/api/**', route => !new URL(route.request().url()).pathname.startsWith('/api/') ? route.continue() : route.fulfill({ status: 503, json: { error: 'Isolated frontend harness' } }))
  await page.route(/https:\/\//, route => route.abort())
  await page.setViewportSize({ width, height: 1000 })
  await page.emulateMedia({ colorScheme: dark ? 'dark' : 'light' })
  await page.addInitScript(dark => {
    sessionStorage.setItem('mobos:demo-guia-vista', '1')
    localStorage.setItem('mobos:theme', dark ? 'dark' : 'light')
  }, dark)
  await page.goto('/demo')
  await page.getByRole('button', { name: 'Entrar como Dueño', exact: true }).click()
  await expect(page.getByTestId('shell')).toBeVisible()
  await page.evaluate(async names => {
    const accounts = await import('/src/lib/paymentAccounts.js')
    const ids = ['demo-cash-pyg', 'demo-transfer-itau', 'demo-cash-usd']
    for (const [i, id] of ids.entries()) await accounts.updatePaymentAccount(id, { name: names[i] })
    const storage = await import('/src/lib/storage.js')
    const cart = await import('/src/lib/posCart.js')
    const product = storage.getProductos().find(p => /Funda/.test(p.nombre))
    const context = storage.contextoActual()
    cart.guardarCarrito(context.empresaId, context.sucursalId, context.userId, {
      customer: { name: 'Cliente ficticio 632' },
      items: [{ key: 'qa632', productoId: product.id, nombre: product.nombre, quantity: 1, precio: 180000, sobrePedido: true }],
      pagos: ids.map((accountId, i) => ({ medioPago: 'x', cuenta: 'x', accountId, originalAmount: ['20000', '15000', '10'][i], exchangeRatePyg: i === 2 ? '7300' : '', monto: ['20000', '15000', '73000'][i] })),
    })
  }, names)
  const nav = page.getByTestId(width < 1024 ? 'shell-bottom-nav' : 'shell-lateral')
  await nav.getByRole('button', { name: 'Vender', exact: true }).click()
  if (width < 768) {
    await page.getByTestId('pos-barra-carrito-abrir').click()
    await page.getByTestId('carrito-cobrar').click()
    await page.getByTestId('medio-otros').click()
  } else {
    await ensureCobro(page)
  }
  return () => expect(writes).toEqual([])
}

for (const width of [360, 390, 768, 1440]) for (const dark of [false, true]) {
  test(`632 cabeceras legibles ${width} ${dark ? 'dark' : 'light'}`, async ({ page }) => {
    const clean = await enter(page, width, dark)
    const cards = page.getByTestId('cuenta-capsula')
    await expect(cards).toHaveCount(3)
    if (process.env.DBG632) { await mkdir(process.env.DBG632, { recursive: true }); await cards.first().scrollIntoViewIfNeeded(); await page.screenshot({ path: `${process.env.DBG632}/${width}.png` }) }
    for (let i = 0; i < 3; i++) {
      const card = cards.nth(i)
      await card.scrollIntoViewIfNeeded()
      await expect(card.getByTestId('cuenta-capsula-nombre')).toHaveText(names[i])
      const geometry = await card.evaluate(el => {
        const rect = node => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height } }
        // Una fila: nombre, ⋯ (acciones), «Medio · Moneda» y el chip de estado.
        const elements = ['[data-testid="cuenta-capsula-nombre"]', 'button[aria-haspopup="menu"]', '[data-testid="cuenta-tipo"]', '[aria-pressed]'].map(s => el.querySelector(s))
        return { outer: rect(el), elements: elements.map(rect), text: { client: elements[0].clientWidth, scroll: elements[0].scrollWidth }, overflow: getComputedStyle(el).overflowY }
      })
      for (const box of geometry.elements) {
        expect(box.x).toBeGreaterThanOrEqual(geometry.outer.x)
        expect(box.right).toBeLessThanOrEqual(geometry.outer.right + 1)
      }
      for (let a = 0; a < geometry.elements.length; a++) for (let b = a + 1; b < geometry.elements.length; b++) {
        const one = geometry.elements[a], two = geometry.elements[b]
        expect(one.x < two.right && two.x < one.right && one.y < two.bottom && two.y < one.bottom, `overlap ${a}/${b}`).toBe(false)
      }
      // Táctil: 44 px. En escritorio (≥1024) la fila compacta admite 32 px.
      const minimo = width >= 1024 ? 32 : 44
      for (const index of [1, 3]) {
        expect(geometry.elements[index].width).toBeGreaterThanOrEqual(minimo)
        expect(geometry.elements[index].height).toBeGreaterThanOrEqual(minimo)
      }
      // Estas cuentas tienen nombres larguísimos a propósito (legibilidad): crecen a lo alto sin
      // recortar. La forma compacta (una fila / dos en celular) la mide cobro-simple.frontend.spec.js.
      if (width >= 1280) expect(geometry.outer.height, 'una o dos filas por pago').toBeLessThanOrEqual(150)
      if (width < 768) expect(geometry.outer.height, 'dos filas como máximo en móvil').toBeLessThanOrEqual(300)
      expect(geometry.text.scroll).toBeLessThanOrEqual(geometry.text.client + 1)
      expect(['auto', 'scroll']).not.toContain(geometry.overflow)
    }
    // Keyboard toggles payment state, keeps amount, and enters account replacement.
    const first = cards.first()
    const amount = first.getByLabel('Monto original')
    await expect(amount).toHaveValue('20.000')
    const status = first.getByTestId('pago-estado')
    await status.focus()
    await page.keyboard.press('Space')
    await expect(first.getByRole('button', { name: 'Pendiente', exact: true })).toHaveAttribute('aria-pressed', 'false')
    await expect(amount).toHaveValue('20.000')
    await page.keyboard.press('Space')
    await expect(status).toHaveAttribute('aria-pressed', 'true')
    await first.getByRole('button', { name: 'Más acciones del pago 1' }).focus()
    await page.keyboard.press('Enter')
    await page.getByTestId('cuenta-cambiar').focus()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('pago-fila-0').getByRole('combobox', { name: 'Cuenta de cobro' })).toBeVisible()
    await page.getByTestId('pago-fila-0').getByRole('combobox', { name: 'Cuenta de cobro' }).click()
    await page.getByRole('option', { name: new RegExp(names[0].slice(0, 20)) }).click()
    await expect(cards.first().getByLabel('Monto original')).toHaveValue('20.000')
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    // The footer remains reachable as payment cards grow; no compressed header.
    const submit = page.getByTestId('pos-cobro').locator('button[type=submit]').first()
    await submit.scrollIntoViewIfNeeded()
    await expect(submit).toBeInViewport()
    const out = process.env.CAPTURE_632
    if (out) { await mkdir(out, { recursive: true }); await cards.first().scrollIntoViewIfNeeded(); await page.screenshot({ path: `${out}/cuentas-${width}-${dark ? 'dark' : 'light'}.png` }) }
    clean()
  })
}
