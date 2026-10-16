import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { lockShell } from '../helpers/shell-navigation.js'

// PIN en celdas iguales (PinSegmentado): la pantalla de bloqueo y la entrada demo
// no superponen elementos, las 4 celdas son iguales y quedan centradas, el aviso
// demo queda debajo del código y todo entra sobre el teclado de iOS (SE 375x667
// con ~290 px de teclado). Demo frontend-only.
const out = process.env.MOBOS_QA_OUT || '/tmp/mobos-ios-ui'

async function entrarDemo(page, width, height) {
  await page.setViewportSize({ width, height })
  await page.route('**/api/**', (route) => !new URL(route.request().url()).pathname.startsWith('/api/') ? route.continue() : route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Frontend-only harness"}' }))
  await page.route(/https:\/\//, (route) => route.abort())
  await page.addInitScript(() => sessionStorage.setItem('mobos:demo-guia-vista', '1'))
  await page.goto('/demo', { waitUntil: 'domcontentloaded' })
}

// Cajas de los elementos visibles que no deben pisarse.
async function sinSolapes(page, selectores) {
  return page.evaluate((sels) => {
    const cajas = []
    for (const sel of sels) {
      for (const el of document.querySelectorAll(sel)) {
        const r = el.getBoundingClientRect()
        if (r.width > 0 && r.height > 0) cajas.push({ sel, top: r.top, bottom: r.bottom, left: r.left, right: r.right })
      }
    }
    const solapes = []
    for (let i = 0; i < cajas.length; i += 1) {
      for (let j = i + 1; j < cajas.length; j += 1) {
        const a = cajas[i]; const b = cajas[j]
        if (a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5) solapes.push(`${a.sel} x ${b.sel}`)
      }
    }
    return solapes
  }, selectores)
}

for (const [width, height] of [[375, 667], [390, 844]]) {
  test(`bloqueo ${width}x${height}: PIN en 4 celdas iguales, sin solapes y sobre el teclado`, async ({ page }) => {
    await mkdir(out, { recursive: true })
    await entrarDemo(page, width, height)
    await page.getByRole('button', { name: 'Entrar como Dueño', exact: true }).click()
    await expect(page.getByTestId('shell')).toBeVisible()
    await lockShell(page)
    const bloqueo = page.getByTestId('pantalla-bloqueada')
    await expect(bloqueo).toBeVisible()
    await expect(page.getByTestId('pin-celda')).toHaveCount(4)

    const celdas = await page.getByTestId('pin-celda').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { x: r.left, w: r.width } }))
    for (const c of celdas) expect(Math.abs(c.w - celdas[0].w), 'celdas de igual ancho').toBeLessThan(0.6)
    const izq = celdas[0].x
    const der = width - (celdas[3].x + celdas[3].w)
    expect(Math.abs(izq - der), 'grupo centrado').toBeLessThan(1.5)

    const solapes = await sinSolapes(page, [
      '[data-testid="pantalla-bloqueada"] h2', '[data-testid="pin-indicadores"]', '.lock-ayuda',
      '[data-testid="pantalla-bloqueada"] button',
    ])
    expect(solapes, 'elementos superpuestos').toEqual([])

    // Escribir dígitos: máscara de puntos, sin mostrar el valor.
    await page.locator('#lock-pin').pressSequentially('12')
    await expect(page.locator('.pin-seg-punto')).toHaveCount(2)
    expect(await page.locator('#lock-pin').evaluate((el) => getComputedStyle(el).opacity)).toBe('0')

    // El teclado táctil propio reemplaza al del sistema: todo cabe en la pantalla.
    const input = page.getByTestId('pin-input')
    await expect(input).toHaveAttribute('readonly', '')
    await expect(input).toHaveAttribute('inputmode', 'none')
    const pin = await page.getByTestId('pin-segmentado').boundingBox()
    expect(pin.y + pin.height, 'PIN y teclado propios visibles').toBeLessThanOrEqual(height)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

    // PIN incorrecto: rojo.
    await page.locator('#lock-pin').pressSequentially('99')
    await expect(page.getByTestId('pin-segmentado')).toHaveAttribute('data-invalido', 'true')
    await page.waitForTimeout(300)
    if (process.env.MOBOS_QA_SCREENSHOTS === '1') await page.screenshot({ path: `${out}/bloqueo-${width}.png` })
  })
}

test('entrada demo 390: el código no se superpone con el resto', async ({ page }) => {
  await entrarDemo(page, 390, 844)
  await expect(page.locator('#demo-pin')).toBeVisible()
  const solapes = await sinSolapes(page, ['[data-testid="pin-segmentado"]', '#demo-pin-status', 'label[for="demo-pin"]'])
  expect(solapes).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
