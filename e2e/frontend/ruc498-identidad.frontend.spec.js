import { test, expect } from '@playwright/test'
import { mockRucPublic } from '../helpers/ruc-public.js'
import { esperarAnimaciones } from '../helpers/animaciones.js'

async function enter(page, width, dark, mockOptions) {
  await page.setViewportSize({ width, height: 844 })
  const api = await mockRucPublic(page, mockOptions)
  await page.addInitScript(() => {
    sessionStorage.setItem('mobos:demo-guia-vista', '1')
    sessionStorage.setItem('mobos:demo-session', 'active')
    sessionStorage.setItem('mobos:demo-session:role', 'ADMIN')
  })
  await page.goto(`/e2e/fixtures/ruc498-identidad.html?tema=${dark ? 'dark' : 'light'}`)
  await expect(page.getByRole('button', { name: 'Abrir ficha fiscal' })).toBeVisible()
  expect(await page.locator('html').evaluate(el => el.classList.contains('dark'))).toBe(dark)
  return () => api.assertClean()
}
async function extract(scope, label, doc) {
  await scope.getByRole('textbox', { name: label, exact: true }).fill(doc)
  await scope.getByRole('button', { name: /Extraer/ }).click()
  await expect(scope.getByText(/Datos del RUC cargados|datos de ejemplo cargados/)).toBeVisible()
}
for (const [width, dark] of [[390, false], [1440, true]]) {
  test(`498 ficha aplicar guardar cerrar y reabrir ${width}`, async ({ page }) => {
    const verifyApi = await enter(page, width, dark)
    await page.getByRole('button', { name: 'Abrir ficha fiscal' }).click()
    let profile = page.getByRole('dialog', { name: 'Cliente: Cliente ficticio 498', exact: true })
    await profile.getByRole('button', { name: 'Agregar identidad', exact: true }).click()
    let editor = page.getByRole('dialog', { name: 'Agregar identidad', exact: true })
    await extract(editor, 'RUC / documento', '1234567')
    await expect(editor.getByText(/Datos del RUC cargados|datos de ejemplo cargados/)).toBeVisible()
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
    await esperarAnimaciones(page)
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
    verifyApi()
  })
  test(`498 POS y titular preservan fiscal y serialización ${width}`, async ({ page }) => {
    const verifyApi = await enter(page, width, dark)
    await page.getByText('Datos de contacto, RUC/CI y direcciones', { exact: true }).click()
    await extract(page.locator('section[aria-label="Identidad"]'), 'CI o RUC del cliente', '1234567')
    const state = () => page.getByTestId('estado-fiscal').textContent().then(JSON.parse)
    await expect(page.getByText(/Datos del RUC cargados|datos de ejemplo cargados/)).toBeVisible()
    const accepted = (await state()).value
    expect(accepted.name).toBe(accepted.nameOfficial)
    expect(accepted.identityKind).toBe('')
    await page.getByRole('checkbox', { name: /Facturar a otro titular/ }).check()
    const billing = page.locator('section[aria-label="Facturación"]')
    await extract(billing, 'RUC del titular de factura', '123456789')
    await expect(billing.getByText(/Datos del RUC cargados|datos de ejemplo cargados/)).toBeVisible()
    const saved = await state()
    expect(saved.billing.name).toBe(saved.billing.nameOfficial)
    expect(saved.payload).toEqual({ name: saved.billing.nameOfficial, document: saved.billing.document })
    await billing.getByRole('textbox', { name: 'Nombre del titular de factura' }).fill('Otro titular')
    expect((await state()).billing.nameOfficial).toBeUndefined()
    verifyApi()
  })
}

test('498 descartar/cancelar no guarda y cambiar ficha invalida consulta pendiente', async ({ page }) => {
  let release
  const pending = new Promise(resolve => { release = resolve })
  let calls = 0
  const verifyApi = await enter(page, 390, false, { respond: async () => { if (++calls === 2) await pending; return null } })
  await page.getByRole('button', { name: 'Abrir ficha fiscal' }).click()
  const profile = page.getByRole('dialog', { name: 'Cliente: Cliente ficticio 498', exact: true })
  await profile.getByRole('button', { name: 'Agregar identidad', exact: true }).click()
  const editor = page.getByRole('dialog', { name: 'Agregar identidad', exact: true })
  await extract(editor, 'RUC / documento', '1234567')
  await editor.getByRole('button', { name: 'Deshacer' }).click()
  await expect(editor.getByLabel('Razón social', { exact: true })).toHaveValue('')
  await expect(editor.getByRole('button', { name: 'Guardar', exact: true })).toBeDisabled()
  await editor.getByRole('button', { name: 'Cancelar', exact: true }).click()
  await expect(profile.getByTestId('perfil-facturacion-fila')).toHaveCount(0)
  await profile.getByRole('button', { name: 'Agregar identidad', exact: true }).click()
  await editor.getByRole('textbox', { name: 'RUC / documento', exact: true }).fill('1234567')
  await editor.getByRole('button', { name: /Extraer/ }).click()
  await expect.poll(() => calls).toBe(2)
  // Modela el cambio de customer prop del host, sin interacción con el modal viejo.
  await page.evaluate(() => window.dispatchEvent(new Event('qa-cambiar-cliente')))
  await expect(editor).toHaveCount(0)
  await expect(page.getByRole('dialog', { name: 'Cliente: Otra ficha', exact: true })).toBeVisible()
  release()
  await page.waitForLoadState('networkidle')
  await expect(editor).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Usar estos datos' })).toHaveCount(0)
  verifyApi()
})

for (const [width, height, visibleHeight, dark, bodyOnly] of [[375, 667, 340, false, false], [390, 844, 400, true, false], [390, 844, 400, false, true]]) {
  test(`498 teclado reduce solo viewport visual y body, modal anidado ${width}${bodyOnly ? ' body-only' : ''}`, async ({ page }) => {
    await page.addInitScript(bodyOnly => {
      const viewport = new EventTarget()
      Object.assign(viewport, { height: innerHeight, width: innerWidth, offsetTop: 0, offsetLeft: 0, scale: 1 })
      Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport })
      window.qaKeyboardViewport = (height) => {
        if (!bodyOnly) viewport.height = height
        document.body.style.height = `${height}px`
        if (!bodyOnly) viewport.dispatchEvent(new Event('resize'))
      }
    }, bodyOnly)
    const verifyApi = await enter(page, width, dark)
    await page.setViewportSize({ width, height })
    await page.evaluate(() => document.documentElement.classList.add('app-ios'))
    await page.getByRole('button', { name: 'Abrir ficha fiscal' }).click()
    const profile = page.getByRole('dialog', { name: 'Cliente: Cliente ficticio 498', exact: true })
    await profile.getByRole('button', { name: 'Agregar identidad', exact: true }).click()
    const editor = page.getByRole('dialog', { name: 'Agregar identidad', exact: true })
    const ruc = editor.getByRole('textbox', { name: 'RUC / documento', exact: true })
    const dialogsBeforeKeyboard = await page.locator('[role=dialog]').count()
    await expect(editor).toHaveAttribute('data-teclado-visible', 'false')
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
    // Los dos Modal siguen montados; el teclado no agrega otro diálogo.
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
    await expect(editor.getByText(/Datos del RUC cargados/)).toBeVisible()
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
    verifyApi()
  })
}

for (const status of [429, 503]) {
  test(`498 OwnData ${status}: error honesto sin resultado ficticio y carga manual disponible`, async ({ page }) => {
    const verifyApi = await enter(page, 390, false, { respond: () => ({ status, headers: status === 429 ? { 'Retry-After': '17' } : {}, json: { message: status === 429 ? 'Cuota QA agotada.' : 'OwnData QA no disponible.', code: status === 429 ? 'demo_rate_limited' : 'ruc_unavailable' } }) })
    await page.getByRole('button', { name: 'Abrir ficha fiscal' }).click()
    const profile = page.getByRole('dialog', { name: 'Cliente: Cliente ficticio 498', exact: true })
    await profile.getByRole('button', { name: 'Agregar identidad', exact: true }).click()
    const editor = page.getByRole('dialog', { name: 'Agregar identidad', exact: true })
    await editor.getByRole('textbox', { name: 'RUC / documento', exact: true }).fill('1234567')
    await editor.getByRole('button', { name: /Extraer/ }).click()
    await expect(editor.getByRole('alert')).toContainText(status === 429 ? '17 s' : 'OwnData QA no disponible.')
    await expect(editor.getByRole('button', { name: 'Usar estos datos' })).toHaveCount(0)
    await expect(editor.getByText('Simulada en demo')).toHaveCount(0)
    await expect(editor.getByLabel('Razón social', { exact: true })).toHaveValue('')
    await editor.getByLabel('Razón social', { exact: true }).fill('RAZÓN MANUAL QA')
    await editor.getByRole('button', { name: 'Guardar', exact: true }).click()
    await expect(editor).toHaveCount(0)
    const row = profile.getByTestId('perfil-facturacion-fila')
    await expect(row).toContainText('RAZÓN MANUAL QA')
    await row.getByRole('button', { name: 'Editar', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Editar identidad', exact: true }).getByLabel('Razón social', { exact: true })).toHaveValue('RAZÓN MANUAL QA')
    verifyApi()
  })
}

test('498 respuesta pública sin evidencia verificable no admite fallback ficticio', async ({ page }) => {
  const verifyApi = await enter(page, 390, false, { respond: () => ({ status: 200, json: { result: { name: 'RESULTADO FICTICIO PROHIBIDO', simulado: true } } }) })
  await page.getByText('Datos de contacto, RUC/CI y direcciones', { exact: true }).click()
  const identity = page.locator('section[aria-label="Identidad"]')
  await identity.getByRole('textbox', { name: 'CI o RUC del cliente', exact: true }).fill('1234567')
  await identity.getByRole('button', { name: /Extraer/ }).click()
  await expect(identity.getByRole('alert')).toContainText('No se recibieron datos verificables')
  await expect(identity.getByRole('button', { name: 'Usar estos datos' })).toHaveCount(0)
  await expect(page.getByText('RESULTADO FICTICIO PROHIBIDO')).toHaveCount(0)
  const state = JSON.parse(await page.getByTestId('estado-fiscal').textContent())
  expect(state.value.name).toBe('')
  expect(state.value.nameOfficial).toBeUndefined()
  verifyApi()
})

// #499: contrato del paquete publicado, no copia del Modal compartido.
for (const [width, dark] of [[390, false], [1440, true]]) {
  test(`499 un modal activo y foco restaurado ${width}`, async ({ page }) => {
    const verifyApi = await enter(page, width, dark)
    await page.getByRole('button', { name: 'Abrir ficha fiscal' }).click()
    const profile = page.getByRole('dialog', { name: 'Cliente: Cliente ficticio 498', exact: true })
    const trigger = profile.getByRole('button', { name: 'Agregar identidad', exact: true })
    await trigger.click()
    const editor = page.getByRole('dialog', { name: 'Agregar identidad', exact: true })
    await expect(editor).toHaveAttribute('aria-modal', 'true')
    await expect(page.locator('[role="dialog"][aria-modal="true"]')).toHaveCount(1)
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press(i % 2 ? 'Shift+Tab' : 'Tab')
      expect(await editor.evaluate(el => el.contains(document.activeElement))).toBe(true)
    }
    await page.keyboard.press('Escape')
    await expect(editor).toHaveCount(0)
    await expect(profile).toHaveAttribute('aria-modal', 'true')
    await expect(trigger).toBeFocused()
    await trigger.click()
    await expect(page.locator('[role="dialog"][aria-modal="true"]')).toHaveCount(1)
    await expect(editor).toHaveAttribute('aria-modal', 'true')
    await verifyApi()
  })
}
