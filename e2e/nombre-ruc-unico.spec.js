// Regla única de nombres desde RUC/CI: personas «Nombres Apellidos» sin coma,
// empresas con razón social exacta y nombre de fantasía editable.
import { test, expect } from '@playwright/test'
import { silenciarAvisoMetricas } from './helpers/demo.js'
import { mockRucPublic, rucPublicPayload } from './helpers/ruc-public.js'

test.beforeEach(({ page }) => silenciarAvisoMetricas(page))

const PERSONA = 'DE OLIVEIRA ORTIGOZA, DARIO ALFONSO'
const respondPersona = ({ query }) => ({ status: 200, json: rucPublicPayload(query, PERSONA) })

async function entrarAlPos(page) {
  await page.goto('/demo')
  await page.getByRole('button', { name: /Entrar como Vendedor/ }).click()
  await expect(page).toHaveURL(/\/pos$/)
  const guia = page.getByRole('dialog', { name: 'Cómo funciona la demo' })
  if (await guia.waitFor({ state: 'visible', timeout: 4000 }).then(() => true).catch(() => false)) {
    await guia.getByRole('button', { name: 'Cerrar' }).click()
  }
  await expect(page.getByRole('heading', { name: 'Vender', exact: true, level: 1 })).toBeVisible()
  return page.getByLabel('Nombre, teléfono, CI o RUC del cliente')
}

test('titular de facturación: RUC de persona queda «Nombres Apellidos» sin coma', async ({ page }) => {
  const api = await mockRucPublic(page, { respond: respondPersona })
  const cliente = await entrarAlPos(page)
  await cliente.fill('Cliente Demo Titular')
  await page.getByText('Datos de contacto, RUC/CI y direcciones').click()
  await page.getByLabel(/Facturar a otro titular/).check()
  const titular = page.getByLabel('RUC del titular de factura')
  await titular.fill('5215244-8')
  await titular.locator('xpath=ancestor::*[contains(@class,"mobos-ruc-field")][1]').getByRole('button', { name: /Extraer los datos del RUC/ }).click()
  const nombre = page.getByLabel('Nombre del titular de factura')
  await expect(nombre).toHaveValue('Dario Alfonso De Oliveira Ortigoza')
  expect((await nombre.inputValue()).includes(',')).toBe(false)
  api.assertClean()
})

test('crear cliente con RUC de persona: nombre «Nombres Apellidos»', async ({ page }) => {
  const api = await mockRucPublic(page, { respond: respondPersona })
  const buscador = await entrarAlPos(page)
  await buscador.fill('5215244-8')
  await buscador.press('Enter')
  const popup = page.getByRole('dialog', { name: 'Completar cliente', exact: true })
  await expect(popup).toBeVisible()
  await expect(popup.getByTestId('completar-cliente-resumen')).toContainText('Dario Alfonso De Oliveira Ortigoza')
  await expect(popup.getByTestId('completar-cliente-resumen')).not.toContainText(',')
  api.assertClean()
})

test('empresa: razón social exacta y nombre de fantasía editable', async ({ page }) => {
  const api = await mockRucPublic(page, { respond: ({ query }) => ({ status: 200, json: rucPublicPayload(query, 'ISTORE PARAGUAY S.A.') }) })
  const buscador = await entrarAlPos(page)
  await buscador.fill('80012345-0')
  const editor = page.getByRole('dialog', { name: 'Datos del cliente', exact: true })
  await expect(editor).toBeVisible({ timeout: 8000 })
  const visible = editor.getByLabel('Nombre del cliente en ficha', { exact: true })
  await expect(visible).toHaveValue('ISTORE PARAGUAY S.A.')
  await expect(editor.getByTestId('ficha-razon-social')).toContainText('ISTORE PARAGUAY S.A.')
  await visible.fill('iStore Paraguay')
  await expect(visible).toHaveValue('iStore Paraguay')
  await expect(editor.getByTestId('ficha-razon-social')).toContainText('ISTORE PARAGUAY S.A.')
  api.assertClean()
})
