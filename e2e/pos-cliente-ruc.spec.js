// Buscador de cliente del POS: CI/RUC sin ficha -> consulta OwnData (demo) -> alta prellena.
import { test, expect } from '@playwright/test'
import { silenciarAvisoMetricas } from './helpers/demo.js'
import { mockRucPublic, rucPublicPayload } from './helpers/ruc-public.js'

test.beforeEach(({ page }) => silenciarAvisoMetricas(page))

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

test('POS demo: CI sin ficha + Enter consulta una vez y abre el alta con «Nombres Apellidos»', async ({ page }) => {
  const api = await mockRucPublic(page, {
    respond: ({ query }) => ({ status: 200, json: rucPublicPayload(query, 'PEREZ GOMEZ, JUAN CARLOS') }),
  })
  const buscador = await entrarAlPos(page)
  await buscador.fill('4123456')
  await buscador.press('Enter')
  const editor = page.getByRole('dialog', { name: 'Datos del cliente', exact: true })
  await expect(editor).toBeVisible()
  await expect(editor.getByLabel('Nombre del cliente en ficha', { exact: true })).toHaveValue('Juan Carlos Perez Gomez')
  const ruc = editor.getByLabel('CI o RUC del cliente', { exact: true })
  await expect(ruc).toHaveValue(/^4123456-\d$/)
  expect(api.calls).toEqual(['4123456'])
  // Se completa el teléfono y se confirma: queda ligado a la venta.
  await editor.getByLabel('Teléfono del cliente').fill('981123456')
  await editor.getByTestId('confirmar-cliente').click()
  await expect(editor).toBeHidden()
  await expect(page.getByTestId('cliente-elegido-nombre')).toHaveText('Juan Carlos Perez Gomez')
  api.assertClean()
})

test('POS demo: razón social tal cual, y el automático consulta al terminar de escribir sin repetir', async ({ page }) => {
  const api = await mockRucPublic(page)
  const buscador = await entrarAlPos(page)
  await buscador.fill('80012345-0')
  const editor = page.getByRole('dialog', { name: 'Datos del cliente', exact: true })
  await expect(editor).toBeVisible({ timeout: 8000 })
  await expect(editor.getByLabel('Nombre del cliente en ficha', { exact: true })).toHaveValue('COMERCIAL QA 80012345 S.A.')
  await expect(editor.getByLabel('CI o RUC del cliente', { exact: true })).toHaveValue('80012345-0')
  expect(api.calls).toEqual(['80012345-0'])
  api.assertClean()
})

test('POS demo: DV inválido muestra el aviso y no consulta', async ({ page }) => {
  const api = await mockRucPublic(page)
  const buscador = await entrarAlPos(page)
  await buscador.fill('80012345-6')
  await buscador.press('Enter')
  await expect(page.getByRole('alert').filter({ hasText: 'dígito verificador' })).toBeVisible()
  await page.waitForTimeout(1500)
  expect(api.calls).toEqual([])
  api.assertClean()
})

test('POS demo 375px: botón de consulta de 44px y sin scroll horizontal', async ({ page }) => {
  await mockRucPublic(page)
  await page.setViewportSize({ width: 375, height: 800 })
  await entrarAlPos(page)
  await page.getByTestId('accion-cliente').click()
  const hoja = page.getByTestId('hoja-cliente')
  await hoja.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill('4123456')
  const boton = hoja.getByTestId('consultar-ruc-buscador')
  await expect(boton).toBeVisible()
  expect((await boton.boundingBox()).height).toBeGreaterThanOrEqual(44)
  await page.screenshot({ path: 'docs/rediseno/ruc-movil.png' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
