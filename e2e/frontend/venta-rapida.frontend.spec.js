import { test, expect } from '@playwright/test'

async function capture620(page, name) {
  if (process.env.CAPTURE_620) await page.screenshot({ path: `${process.env.CAPTURE_620}/${name}.png`, fullPage: false })
}

async function enterDemo(page) {
  await page.route('**/api/**', route =>
    !new URL(route.request().url()).pathname.startsWith('/api/')
      ? route.continue()
      : route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: '{"error":"Frontend-only harness"}',
        }),
  )
  await page.route(/https:\/\//, route => route.abort())
  await page.addInitScript(() => {
    sessionStorage.setItem('mobos:demo-guia-vista', '1')
    localStorage.setItem('mobos:aviso-metricas', '1')
  })
  await page.goto('/demo', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Entrar como Dueño', exact: true }).click()
  await expect(page.getByTestId('shell')).toBeVisible()
  const nav = page.viewportSize().width < 1024
    ? page.getByTestId('shell-bottom-nav')
    : page.getByTestId('shell-lateral')
  await nav.getByRole('button', { name: 'Vender', exact: true }).click()
  await expect(page.getByTestId('pos-bloque-productos')).toBeVisible()
}

async function agregarLineasDistintas(page, cantidad) {
  let candidatos = page.locator('.pos-product-card')
  for (let intento = 0; intento < 3; intento += 1) {
    const disponibles = (await candidatos.allTextContents()).filter(text => !/desde/i.test(text)).length
    if (disponibles >= cantidad) break
    const mas = page.getByRole('button', { name: 'Ver más productos', exact: true })
    if (await mas.count() && await mas.isVisible()) await mas.click()
    else break
  }
  candidatos = page.locator('.pos-product-card')
  const total = await candidatos.count()
  let agregados = 0
  for (let i = 0; i < total && agregados < cantidad; i += 1) {
    const card = candidatos.nth(i)
    const texto = await card.innerText()
    if (/desde/i.test(texto)) continue
    await card.click()
    agregados += 1
  }
  expect(agregados, `productos simples disponibles para ${cantidad} líneas`).toBe(cantidad)
}

test('venta rápida: Enter confirma cliente, enfoca productos y cobra con F2', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await enterDemo(page)

  const card = page.locator('.pos-product-card').first()
  const style = await card.evaluate(element => ({ padding: getComputedStyle(element).paddingTop, width: element.getBoundingClientRect().width }))
  expect(style.padding).toBe('12px')
  expect(style.width).toBeGreaterThanOrEqual(180)
  await expect(card.getByTestId('foto-producto')).toHaveCSS('width', '64px')

  const cliente = page.getByPlaceholder('Buscar cliente o escribir un nombre nuevo')
  await cliente.fill('Mar')
  await expect(page.getByTestId('pos-bloque-cliente').getByRole('button').first()).toBeVisible()
  await cliente.press('Enter')
  await expect(page.getByTestId('cliente-elegido-nombre')).toContainText('María')

  const productos = page.locator('#pos-busqueda-producto input')
  await expect(productos).toBeFocused()
  const [searchBox, catalogBox] = await Promise.all([productos.boundingBox(), page.getByTestId('pos-bloque-productos').boundingBox()])
  expect(searchBox.width).toBeGreaterThan(catalogBox.width * 0.85)
  await productos.fill('Funda MagSafe')
  await productos.press('Enter')
  await expect(page.getByTestId('pos-bloque-carrito')).toContainText('1 producto')

  await page.getByRole('button', { name: 'Agregar otro', exact: true }).click()
  await expect(productos).toBeFocused()
  await productos.fill('Cable USB-C')
  await productos.press('Enter')
  await expect(page.getByTestId('pos-bloque-carrito')).toContainText('2 productos')

  await page.keyboard.press('F2')
  await expect(page.getByTestId('pos-cobro')).toBeVisible()
  await expect(page.getByTestId('pos-cobro-header')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440)
})

test('venta rápida vacía mantiene el cobro progresivo junto al catálogo', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await enterDemo(page)
  await expect(page.getByTestId('pos-cobro')).toHaveCount(0)
  await expect(page.getByTestId('pos-cobro-header')).toHaveCount(0)
  await expect(page.getByTestId('pos-cobro-cta')).toHaveCount(0)
  await expect(page.locator('#pos-busqueda-producto input')).toBeVisible()
})

test('venta rápida: las variantes se pueden recorrer con flechas y confirmar con Enter', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await enterDemo(page)
  const cards = page.locator('.pos-product-card')
  const familias = await cards.allTextContents()
  const indice = familias.findIndex(text => /desde/i.test(text))
  expect(indice, `familia con variantes visible: ${familias.join(' | ')}`).toBeGreaterThanOrEqual(0)
  await cards.nth(indice).click()
  const selector = page.getByTestId('selector-variante')
  await expect(selector).toBeVisible()
  const opciones = selector.getByTestId('variante-opcion')
  await expect(opciones).toHaveCount(2)
  await expect(opciones.first()).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(opciones.nth(1)).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(selector).toBeHidden()
  await expect(page.getByTestId('pos-bloque-carrito')).toContainText('1 producto')
})

for (const width of [1280, 768, 430, 393, 360]) {
  test(`venta rápida conserva layout y acciones accesibles a ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 1024 ? 844 : 900 })
    await enterDemo(page)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    if (width < 640) {
      await expect(page.getByTestId('pos-movil')).toBeVisible()
      const search = page.getByPlaceholder('Buscar producto…')
      await expect(search).toBeVisible()
      const searchBox = await search.boundingBox()
      expect(searchBox.height).toBeGreaterThanOrEqual(44)
    } else {
      await expect(page.getByTestId('pos-bloque-productos')).toBeVisible()
      await expect(page.getByTestId('pos-bloque-carrito')).toBeVisible()
    }
  })
}

test('venta rápida conserva objetivos táctiles y no desborda en celular', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await enterDemo(page)
  await expect(page.getByTestId('pos-movil')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  const search = page.getByPlaceholder('Buscar producto…')
  const box = await search.boundingBox()
  expect(box.width).toBeGreaterThanOrEqual(44)
  expect(box.height).toBeGreaterThanOrEqual(44)
})

test('cobro: título y acciones de pagos mantienen separación en desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 })
  await enterDemo(page)
  const firstCard = await page.locator('.pos-product-card').first().boundingBox()
  expect(firstCard.width).toBeGreaterThanOrEqual(160)
  await page.locator('.pos-product-card', { hasText: 'Funda MagSafe' }).first().click()
  await page.getByTestId('carrito-listo').click()
  const cobro = page.getByTestId('pos-cobro')
  await expect(cobro).toBeVisible()
  const titulo = cobro.getByText('Pagos de esta venta', { exact: true })
  const agregar = cobro.getByRole('button', { name: '+ Agregar pago', exact: true })
  const gift = cobro.getByRole('button', { name: '+ Canjear gift card', exact: true })
  const [t, a, g] = await Promise.all([titulo.boundingBox(), agregar.boundingBox(), gift.boundingBox()])
  const overlap = (one, two) => one.x < two.x + two.width && two.x < one.x + one.width && one.y < two.y + two.height && two.y < one.y + one.height
  expect(overlap(t, a)).toBe(false)
  expect(overlap(t, g)).toBe(false)
})

test('venta rápida: cliente editable, cinco líneas y dos pagos sin scroll interno', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await enterDemo(page)
  const cliente = page.getByPlaceholder('Buscar cliente o escribir un nombre nuevo')
  await cliente.fill('María González')
  await expect(page.getByTestId('cliente-elegido')).toBeVisible()
  await page.getByRole('button', { name: 'Editar datos del cliente', exact: true }).click()
  await expect(page.getByTestId('confirmar-cliente')).toBeVisible()
  const editor = page.getByRole('dialog', { name: 'Datos del cliente', exact: true })
  await expect(editor).toHaveAttribute('aria-modal', 'true')
  await capture620(page, 'customer-modal-existing-1440x900')
  await page.keyboard.press('Tab')
  await expect(page.locator(':focus')).toBeVisible()
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Escape')
  await expect(editor).toBeHidden()
  await page.getByRole('button', { name: 'Editar datos del cliente', exact: true }).click()
  await expect(editor).toBeVisible()
  await page.getByLabel('Teléfono del cliente', { exact: true }).press('Enter')
  await expect(editor).toBeHidden()
  const cartDuringEdit = await page.getByTestId('pos-bloque-carrito').boundingBox()
  expect(cartDuringEdit.y).toBeLessThan(900)
  expect(cartDuringEdit.y + cartDuringEdit.height).toBeGreaterThan(0)
  await expect(page.getByTestId('cliente-elegido')).toBeVisible()
  const cartCenter = await page.getByTestId('pos-bloque-carrito').boundingBox()
  expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('[data-testid="pos-bloque-carrito"]') !== null, { x: cartCenter.x + cartCenter.width / 2, y: cartCenter.y + Math.min(cartCenter.height / 2, 20) })).toBe(true)

  for (const nombre of ['Funda MagSafe', 'Funda Silicona Negra', 'Cargador USB-C 20W', 'AirPods Pro 2 USB-C', 'iPhone 15 128GB']) {
    await page.locator('.pos-product-card', { hasText: nombre }).first().click()
  }
  await expect(page.getByTestId('pos-bloque-carrito')).toContainText('5 productos')
  await capture620(page, 'ticket-5-lines-no-modal-1440x900')
  await page.getByRole('button', { name: 'Editar datos del cliente', exact: true }).click()
  await expect(page.getByTestId('confirmar-cliente')).toBeVisible()
  await page.getByTestId('confirmar-cliente').click()
  await page.getByTestId('carrito-listo').click()
  const cobro = page.getByTestId('pos-cobro')
  await expect(cobro).toBeVisible()
  await cobro.getByRole('button', { name: '+ Agregar pago', exact: true }).click()
  const pago = cobro.getByTestId('pago-fila-0')
  await pago.getByLabel('Cuenta de cobro', { exact: true }).click()
  await page.getByRole('listbox').getByRole('option').first().click()
  const monto = pago.getByLabel('Monto original', { exact: true })
  await monto.fill('999999999')
  await expect(cobro.getByTestId('motivos-bloqueo')).toContainText('pagos superan el total')
  await capture620(page, 'checkout-payment-over-total-1440x900')
  await monto.fill('100000')
  await monto.press('Enter')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('pos-cobro')).toBeVisible()
  await cobro.getByRole('button', { name: '+ Agregar otro pago', exact: true }).click()
  const segundoPago = cobro.getByTestId('pago-fila-1')
  await expect(segundoPago).toBeVisible()
  await segundoPago.getByLabel('Cuenta de cobro', { exact: true }).click()
  const cuentasSegundoPago = page.getByRole('listbox').getByRole('option')
  await expect(cuentasSegundoPago).toHaveCount(9)
  await cuentasSegundoPago.nth(2).click()
  const resumenCuentas = await cobro.locator('[data-testid^="pago-fila-"]').allTextContents()
  expect(resumenCuentas[0]).not.toBe(resumenCuentas[1])
  const estilos = await page.evaluate(() => ({
    carrito: getComputedStyle(document.querySelector('[data-testid="pos-carrito-cuerpo"]')).overflowY,
    pagos: getComputedStyle(document.querySelector('[data-testid="pos-pagos-lista"]')).overflowY,
  }))
  expect(estilos.carrito).toBe('visible')
  expect(estilos.pagos).toBe('visible')
})

test('venta rápida: cliente nuevo edita en modal y cierra con Enter', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await enterDemo(page)
  await page.getByText('Datos de contacto, RUC/CI y direcciones', { exact: true }).click()
  const editor = page.getByRole('dialog', { name: 'Datos del cliente', exact: true })
  await expect(editor).toBeVisible()
  await editor.getByTestId('confirmar-cliente').click()
  await expect(editor.getByRole('alert')).toContainText('Ingresá el nombre')
  await editor.getByLabel('Nombre del cliente en ficha', { exact: true }).fill('Cliente Nuevo QA')
  await capture620(page, 'customer-modal-new-1440x900')
  await editor.getByLabel('Teléfono del cliente', { exact: true }).fill('0981123456')
  await editor.getByLabel('Teléfono del cliente', { exact: true }).press('Enter')
  await expect(editor).toBeHidden()
  await expect(page.getByPlaceholder('Buscar cliente o escribir un nombre nuevo')).toHaveValue('Cliente Nuevo QA')
})

for (const escenario of [
  { cantidad: 1, width: 1440 },
  { cantidad: 5, width: 1024 },
  { cantidad: 10, width: 768 },
]) {
  test(`venta rápida: ticket de ${escenario.cantidad} líneas en ${escenario.width}px`, async ({ page }) => {
    await page.setViewportSize({ width: escenario.width, height: 900 })
    await enterDemo(page)
    await agregarLineasDistintas(page, escenario.cantidad)
    await expect(page.getByTestId('pos-bloque-carrito')).toContainText(`${escenario.cantidad} producto`)
    if (escenario.cantidad === 10) await capture620(page, 'ticket-10-lines-768x900')
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(escenario.width)
    await expect(page.getByTestId('carrito-total')).toBeVisible()
  })
}

for (const width of [1440, 390]) {
  test(`venta rápida: tema claro/oscuro mantiene objetivos a ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.emulateMedia({ colorScheme: width < 640 ? 'dark' : 'light' })
    await enterDemo(page)
    if (width >= 640) {
      const toggle = page.getByRole('button', { name: /Cambiar a tema (oscuro|claro)/ }).first()
      await toggle.click()
      await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(true)
      await page.waitForTimeout(300)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    if (width >= 640) {
      const contrast = await page.locator('.pos-product-card').first().evaluate(element => {
        const parse = value => value.match(/\d+(?:\.\d+)?/g)?.slice(0, 3).map(Number) ?? [0, 0, 0]
        const luminance = value => parse(value).map(channel => channel / 255).map(channel =>
          channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
        ).reduce((total, channel, index) => total + channel * [0.2126, 0.7152, 0.0722][index], 0)
        const ratio = (foreground, background) => {
          const [a, b] = [luminance(foreground), luminance(background)].sort((x, y) => y - x)
          return (a + 0.05) / (b + 0.05)
        }
        const card = getComputedStyle(element)
        const name = getComputedStyle(element.querySelector('.pos-product-name'))
        const search = document.querySelector('#pos-busqueda-producto input')
        const searchStyle = getComputedStyle(search)
        const placeholder = getComputedStyle(search, '::placeholder')
        return {
          name: ratio(name.color, card.backgroundColor),
          placeholder: ratio(placeholder.color, searchStyle.backgroundColor),
          border: ratio(card.borderColor, card.backgroundColor),
        }
      })
      expect(contrast.name).toBeGreaterThanOrEqual(4.5)
      expect(contrast.placeholder).toBeGreaterThanOrEqual(4.5)
      expect(contrast.border).toBeGreaterThanOrEqual(3)
    }
    await capture620(page, `theme-${width}px`)
    if (width >= 640) {
      await page.getByRole('button', { name: /Cambiar a tema claro/ }).first().click()
      await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(false)
    }
  })
}

test('venta rápida: divisor queda alineado al borde real de las columnas', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await enterDemo(page)
  const divisor = page.getByTestId('pos-divisor')
  const layout = page.getByTestId('pos-layout')
  const izquierda = page.locator('.pos-col-izq')
  const before = await Promise.all([divisor.boundingBox(), izquierda.boundingBox(), layout.evaluate(element => Number.parseFloat(getComputedStyle(element).columnGap))])
  expect(Math.abs((before[0].x + before[0].width / 2) - (before[1].x + before[1].width + before[2] / 2))).toBeLessThanOrEqual(2)
  await divisor.focus()
  await page.keyboard.press('ArrowRight')
  const after = await Promise.all([divisor.boundingBox(), izquierda.boundingBox()])
  expect(after[0].x + after[0].width / 2).toBeGreaterThan(before[0].x + before[0].width / 2)
})
