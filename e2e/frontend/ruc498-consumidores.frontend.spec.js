import { test, expect } from '@playwright/test'
import { mockRucPublic } from '../helpers/ruc-public.js'

async function demo(page, width) {
  const errors = []
  const api = await mockRucPublic(page)
  await page.setViewportSize({ width, height: 900 })
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(dark => {
    sessionStorage.setItem('mobos:demo-guia-vista', '1')
    localStorage.setItem('mobos:theme', dark ? 'dark' : 'light')
  }, width === 1440)
  await page.goto('/demo')
  await page.getByRole('button', { name: 'Entrar como Dueño', exact: true }).click()
  await expect(page.getByTestId('shell')).toBeVisible()
  expect(await page.locator('html').evaluate(el => el.classList.contains('dark'))).toBe(width === 1440)
  return () => {
    api.assertClean()
    expect(api.calls.length).toBeGreaterThan(0)
    expect(errors, 'sin errores React').toEqual([])
  }
}

async function extraer(page, field, name) {
  const before = await name.inputValue()
  await field.fill('80012345-0')
  const root = field.locator('xpath=ancestor::*[contains(@class,"mobos-ruc-field")][1]')
  await root.getByRole('button', { name: 'Extraer los datos del RUC', exact: true }).click()
  await expect(root.getByRole('button', { name: 'Usar estos datos', exact: true })).toBeVisible()
  await expect(root.getByText('Simulada en demo', { exact: true })).toHaveCount(0)
  await expect(name, 'preview no cambia campo').toHaveValue(before)
  const official = await root.locator('b').first().innerText()
  await root.getByRole('button', { name: 'Usar estos datos', exact: true }).click()
  await expect(name).toHaveValue(official)
  await expect(field).toHaveValue('80012345-0')
  return official
}

for (const width of [390, 1440]) {
  test(`#498 proveedor extrae, guarda y reabre en demo ${width}`, async ({ page }) => {
    const verifyApi = await demo(page, width)
    await page.goto('/compras')
    await page.getByRole('button', { name: 'Proveedores', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Proveedores', exact: true })
    const row = dialog.getByTestId('proveedor-fila').first()
    await row.getByRole('button', { name: /^Editar / }).click()
    const form = dialog.locator('form')
    const name = form.locator('input[required]').first()
    const official = await extraer(page, form.getByRole('textbox', { name: 'RUC del proveedor', exact: true }), name)
    await form.getByRole('button', { name: 'Guardar proveedor', exact: true }).click()
    await expect(form).toHaveCount(0)
    const saved = dialog.getByTestId('proveedor-fila').filter({ hasText: official })
    await expect(saved).toHaveCount(1)
    await saved.getByRole('button', { name: `Editar ${official}`, exact: true }).click()
    await expect(name).toHaveValue(official)
    await expect(form.getByRole('textbox', { name: 'RUC del proveedor', exact: true })).toHaveValue('80012345-0')
    verifyApi()
  })

  test(`#498 cuenta extrae, guarda y reabre en demo ${width}`, async ({ page }) => {
    const verifyApi = await demo(page, width)
    await page.goto('/finanzas/bancos')
    const row = page.getByTestId('cuenta-fila').filter({ hasText: 'Transferencia' }).first()
    await expect(row).toBeVisible()
    const edit = row.getByRole('button', { name: /^Editar / })
    const editName = await edit.getAttribute('aria-label')
    await edit.click()
    const form = page.getByTestId('cuenta-form')
    const official = await extraer(page, form.locator('#pa-document'), form.locator('#pa-holder'))
    await form.getByRole('button', { name: 'Guardar cuenta', exact: true }).click()
    await expect(form).toHaveCount(0)
    await page.getByRole('button', { name: editName, exact: true }).click()
    await expect(form.locator('#pa-holder')).toHaveValue(official)
    await expect(form.locator('#pa-document')).toHaveValue('80012345-0')
    verifyApi()
  })

  test(`#498 empresa privada extrae, guarda y reabre en demo ${width}`, async ({ page }) => {
    const verifyApi = await demo(page, width)
    await page.goto('/configuracion/negocio')
    await page.getByTestId('organizacion-secciones').getByRole('tab', { name: 'Datos fiscales', exact: true }).click()
    await page.getByRole('button', { name: 'Agregar empresa', exact: true }).click()
    const name = page.locator('#priv-legal-name')
    await name.fill('Nombre manual sin aplicar')
    const official = await extraer(page, page.locator('#priv-ruc'), name)
    await page.getByRole('button', { name: 'Guardar empresa', exact: true }).click()
    await expect(name).toHaveCount(0)
    await page.getByRole('button', { name: `Editar ${official}`, exact: true }).click()
    await expect(name).toHaveValue(official)
    await expect(page.locator('#priv-ruc')).toHaveValue('80012345-0')
    verifyApi()
  })
}
