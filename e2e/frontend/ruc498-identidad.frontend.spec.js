import { test, expect } from '@playwright/test'

async function enter(page, width, dark) {
  await page.setViewportSize({ width, height: 844 })
  let rucCalls = 0
  let customerWrites = 0
  await page.route(/https:\/\//, route => route.abort())
  await page.route('**/api/**', route => {
    if (!new URL(route.request().url()).pathname.startsWith('/api/')) return route.continue()
    const path = new URL(route.request().url()).pathname
    if (path === '/api/ruc') rucCalls++
    if (path.startsWith('/api/customers') && route.request().method() !== 'GET') customerWrites++
    return route.fulfill({ status: 401, json: { error: 'Fixture local sin API real' } })
  })
  await page.addInitScript(() => {
    sessionStorage.setItem('mobos:demo-guia-vista', '1')
    sessionStorage.setItem('mobos:demo-session', 'active')
    sessionStorage.setItem('mobos:demo-session:role', 'ADMIN')
  })
  await page.goto(`/e2e/fixtures/ruc498-identidad.html?tema=${dark ? 'dark' : 'light'}`)
  await expect(page.getByRole('button', { name: 'Abrir ficha fiscal' })).toBeVisible()
  expect(await page.locator('html').evaluate(el => el.classList.contains('dark'))).toBe(dark)
  return () => { expect(rucCalls).toBe(0); expect(customerWrites).toBe(0) }
}
async function extract(scope, label, doc) {
  await scope.getByRole('textbox', { name: label, exact: true }).fill(doc)
  await scope.getByRole('button', { name: /Extraer/ }).click()
  await expect(scope.getByRole('button', { name: 'Usar estos datos' })).toBeVisible()
}
for (const [width, dark] of [[390, false], [1440, true]]) {
  test(`498 ficha aplicar guardar cerrar y reabrir ${width}`, async ({ page }) => {
    const noApi = await enter(page, width, dark)
    await page.getByRole('button', { name: 'Abrir ficha fiscal' }).click()
    let profile = page.getByRole('dialog', { name: 'Cliente: Cliente ficticio 498', exact: true })
    await profile.getByRole('button', { name: 'Agregar identidad', exact: true }).click()
    let editor = page.getByRole('dialog', { name: 'Agregar identidad', exact: true })
    await extract(editor, 'RUC / documento', '1234567')
    await expect(editor.getByLabel('Razón social', { exact: true })).toHaveValue('')
    await editor.getByRole('button', { name: 'Usar estos datos' }).click()
    const official = await editor.getByLabel('Razón social', { exact: true }).inputValue()
    expect(official.length).toBeGreaterThan(0)
    const document = await editor.getByRole('textbox', { name: 'RUC / documento', exact: true }).inputValue()
    await editor.getByRole('button', { name: 'Guardar', exact: true }).click()
    await expect(editor).toHaveCount(0)
    await expect(profile.getByTestId('perfil-facturacion-fila')).toContainText(official)
    await profile.getByRole('button', { name: 'Cerrar', exact: true }).click()
    await page.getByRole('button', { name: 'Abrir ficha fiscal' }).click()
    profile = page.getByRole('dialog', { name: 'Cliente: Cliente ficticio 498', exact: true })
    const row = profile.getByTestId('perfil-facturacion-fila')
    await expect(row).toHaveCount(1)
    await expect(row).toContainText(document)
    const editBox = await row.getByRole('button', { name: 'Editar', exact: true }).boundingBox()
    expect(editBox.width).toBeGreaterThanOrEqual(44)
    expect(editBox.height).toBeGreaterThanOrEqual(44)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await row.getByRole('button', { name: 'Editar', exact: true }).click()
    editor = page.getByRole('dialog', { name: 'Editar identidad', exact: true })
    await expect(editor.getByLabel('Razón social', { exact: true })).toHaveValue(official)
    await editor.getByLabel('Razón social', { exact: true }).fill('  RAZÓN FISCAL EXACTA S.A.  ')
    await editor.getByRole('button', { name: 'Guardar', exact: true }).click()
    await row.getByRole('button', { name: 'Editar', exact: true }).click()
    await expect(editor.getByLabel('Razón social', { exact: true })).toHaveValue('  RAZÓN FISCAL EXACTA S.A.  ')
    noApi()
  })
  test(`498 POS y titular preservan fiscal y serialización ${width}`, async ({ page }) => {
    const noApi = await enter(page, width, dark)
    await page.getByText('Datos de contacto, RUC/CI y direcciones', { exact: true }).click()
    await extract(page.locator('section[aria-label="Identidad"]'), 'CI o RUC del cliente', '1234567')
    const state = () => page.getByTestId('estado-fiscal').textContent().then(JSON.parse)
    expect((await state()).value.name).toBe('')
    await page.getByRole('button', { name: 'Usar estos datos' }).click()
    const accepted = (await state()).value
    expect(accepted.name).toBe(accepted.nameOfficial)
    expect(accepted.identityKind).toBe('')
    await page.getByRole('checkbox', { name: /Facturar a otro titular/ }).check()
    const billing = page.locator('section[aria-label="Facturación"]')
    await extract(billing, 'RUC del titular de factura', '123456789')
    await billing.getByRole('button', { name: 'Usar estos datos' }).click()
    const saved = await state()
    expect(saved.billing.name).toBe(saved.billing.nameOfficial)
    expect(saved.payload).toEqual({ name: saved.billing.nameOfficial, document: saved.billing.document })
    await billing.getByRole('textbox', { name: 'Nombre del titular de factura' }).fill('Otro titular')
    expect((await state()).billing.nameOfficial).toBeUndefined()
    noApi()
  })
}

test('498 descartar/cancelar no guarda y cambiar ficha invalida consulta pendiente', async ({ page }) => {
  const noApi = await enter(page, 390, false)
  await page.getByRole('button', { name: 'Abrir ficha fiscal' }).click()
  const profile = page.getByRole('dialog', { name: 'Cliente: Cliente ficticio 498', exact: true })
  await profile.getByRole('button', { name: 'Agregar identidad', exact: true }).click()
  const editor = page.getByRole('dialog', { name: 'Agregar identidad', exact: true })
  await extract(editor, 'RUC / documento', '1234567')
  await editor.getByRole('button', { name: 'Descartar', exact: true }).click()
  await expect(editor.getByLabel('Razón social', { exact: true })).toHaveValue('')
  await expect(editor.getByRole('button', { name: 'Guardar', exact: true })).toBeDisabled()
  await editor.getByRole('button', { name: 'Cancelar', exact: true }).click()
  await expect(profile.getByTestId('perfil-facturacion-fila')).toHaveCount(0)
  await profile.getByRole('button', { name: 'Agregar identidad', exact: true }).click()
  await editor.getByRole('textbox', { name: 'RUC / documento', exact: true }).fill('1234567')
  await page.clock.install()
  await editor.getByRole('button', { name: /Extraer/ }).click()
  // Modela el cambio de customer prop del host, sin interacción con el modal viejo.
  await page.evaluate(() => window.dispatchEvent(new Event('qa-cambiar-cliente')))
  await expect(editor).toHaveCount(0)
  await expect(page.getByRole('dialog', { name: 'Cliente: Otra ficha', exact: true })).toBeVisible()
  await page.clock.runFor(1000)
  await expect(editor).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Usar estos datos' })).toHaveCount(0)
  noApi()
})

for (const [width, height, visibleHeight, dark] of [[375, 667, 340, false], [390, 844, 400, true]]) {
  test(`498 teclado reduce solo viewport visual y body, modal anidado ${width}`, async ({ page }) => {
    await page.addInitScript(() => {
      const viewport = new EventTarget()
      Object.assign(viewport, { height: innerHeight, width: innerWidth, offsetTop: 0, offsetLeft: 0, scale: 1 })
      Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport })
      window.qaKeyboardViewport = (height) => {
        viewport.height = height
        document.body.style.height = `${height}px`
        viewport.dispatchEvent(new Event('resize'))
      }
    })
    const noApi = await enter(page, width, dark)
    await page.setViewportSize({ width, height })
    await page.evaluate(() => document.documentElement.classList.add('app-ios'))
    await page.getByRole('button', { name: 'Abrir ficha fiscal' }).click()
    const profile = page.getByRole('dialog', { name: 'Cliente: Cliente ficticio 498', exact: true })
    await profile.getByRole('button', { name: 'Agregar identidad', exact: true }).click()
    const editor = page.getByRole('dialog', { name: 'Agregar identidad', exact: true })
    const ruc = editor.getByRole('textbox', { name: 'RUC / documento', exact: true })
    const dialogsBeforeKeyboard = await page.locator('[role=dialog]').count()
    await ruc.focus()
    await page.evaluate(height => window.qaKeyboardViewport(height), visibleHeight)
    expect(await page.evaluate(() => innerHeight)).toBe(height)
    await expect(editor).toHaveAttribute('data-teclado-visible', 'true')
    const withinKeyboard = async locator => {
      await locator.scrollIntoViewIfNeeded()
      const box = await locator.boundingBox()
      expect(box.y).toBeGreaterThanOrEqual(0)
      expect(box.y + box.height).toBeLessThanOrEqual(visibleHeight)
    }
    await expect.poll(async () => {
      const box = await editor.boundingBox()
      return box.y + box.height
    }).toBeLessThanOrEqual(visibleHeight)
    // Los dos Modal existentes declaran aria-modal; el teclado no agrega otro.
    await expect(page.locator('[role=dialog]')).toHaveCount(dialogsBeforeKeyboard)
    for (let index = 0; index < 8; index++) {
      await page.keyboard.press('Tab')
      await expect(editor.locator(':focus')).toHaveCount(1)
    }
    expect(await editor.evaluate(el => [...el.querySelectorAll('*')].filter(child => ['auto', 'scroll'].includes(getComputedStyle(child).overflowY)).length)).toBe(1)
    await withinKeyboard(ruc)
    await withinKeyboard(editor.getByRole('button', { name: /Extraer/ }))
    await ruc.fill('1234567')
    await editor.getByRole('button', { name: /Extraer/ }).click()
    const accept = editor.getByRole('button', { name: 'Usar estos datos' })
    await expect(accept).toBeVisible()
    await withinKeyboard(accept)
    await accept.click()
    const save = editor.getByRole('button', { name: 'Guardar', exact: true })
    await withinKeyboard(save)
    await save.click()
    await expect(profile.getByTestId('perfil-facturacion-fila')).toHaveCount(1)
    await page.evaluate(height => window.qaKeyboardViewport(height), height)
    await profile.getByTestId('perfil-facturacion-fila').getByRole('button', { name: 'Editar', exact: true }).click()
    const reopened = page.getByRole('dialog', { name: 'Editar identidad', exact: true })
    await expect(reopened).not.toHaveAttribute('data-teclado-visible', 'true')
    await page.keyboard.press('Escape')
    await expect(reopened).toHaveCount(0)
    await expect(profile).toBeVisible()
    noApi()
  })
}
