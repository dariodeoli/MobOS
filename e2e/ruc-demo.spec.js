// #498: demo consulta GET público OwnData (mock QA), sin escrituras de negocio.
import { test, expect } from '@playwright/test'
import { silenciarAvisoMetricas } from './helpers/demo.js'
import { mockRucPublic } from './helpers/ruc-public.js'

test.beforeEach(({ page }) => silenciarAvisoMetricas(page))

// La guía "Cómo funciona la demo" se abre sola en la primera visita y tapa la
// pantalla: se espera a que aparezca (no siempre está al primer render) y se
// cierra antes de tocar el panel.
async function cerrarGuia(page) {
  const guia = page.getByRole('dialog', { name: 'Cómo funciona la demo' })
  const aparecio = await guia.waitFor({ state: 'visible', timeout: 4000 }).then(() => true).catch(() => false)
  if (!aparecio) return
  await guia.getByRole('button', { name: 'Cerrar' }).click()
  await expect(guia).toBeHidden()
}

test('demo: el extractor de RUC consulta OwnData público y espera confirmación', async ({ page }) => {
  const api = await mockRucPublic(page)

  await page.goto('/demo')
  await page.getByRole('button', { name: /Entrar como Vendedor/ }).click()
  await expect(page).toHaveURL(/\/pos$/)
  await page.getByRole('button', { name: 'Cómo funciona', exact: true }).click()
  const guide = page.getByRole('dialog', { name: 'Cómo funciona la demo', exact: true })
  await expect(guide.getByText('Consulta real de RUC', { exact: true })).toBeVisible()
  await expect(guide.getByText(/El extractor consulta datos reales en OwnData/)).toBeVisible()
  await expect(guide.getByText('RUC simulado', { exact: true })).toHaveCount(0)
  await cerrarGuia(page)
  await expect(page.getByRole('heading', { name: 'Vender', exact: true, level: 1 })).toBeVisible()

  const cliente = page.getByLabel('Nombre, teléfono, CI o RUC del cliente')
  await cliente.fill('Cliente Demo QA234')
  await page.getByText('Datos de contacto, RUC/CI y direcciones').click()
  const editor = page.getByRole('dialog', { name: 'Datos del cliente', exact: true })
  await expect(editor).toBeVisible()
  const ruc = editor.getByLabel('CI o RUC del cliente', { exact: true })
  await ruc.fill('80012345-0')
  await expect(ruc).toHaveValue('80012345-0')
  const raiz = ruc.locator('xpath=ancestor::*[contains(@class,"mobos-ruc-field")][1]')
  const boton = raiz.getByRole('button', { name: /Extraer los datos del RUC|Consultando/ })
  await expect(boton).toBeVisible()
  await expect(boton).toBeEnabled()
  await boton.click()

  // La respuesta mínima pública se admite, pero exige consentimiento.
  await expect(raiz.getByRole('button', { name: 'Usar estos datos' })).toBeVisible()
  await expect(raiz.getByText('Simulada en demo')).toHaveCount(0)
  const nombreOficial = (await raiz.locator('b').first().innerText()).trim()
  expect(nombreOficial).toBe('COMERCIAL QA 80012345 S.A.')

  // Sin confirmación no se pisa nada.
  await expect(cliente).toHaveValue('Cliente Demo QA234')
  await expect(ruc).toHaveValue('80012345-0')

  // El consentimiento guarda la identidad fiscal y conserva el nombre visible.
  await raiz.getByRole('button', { name: 'Usar estos datos' }).click()
  await expect(raiz.getByText('Simulada en demo')).toBeHidden()
  // #350 guarda la ficha durante la sesión y cierra el editor al consentir.
  await expect(editor).toBeHidden()
  await expect(page.getByTestId('cliente-elegido-nombre')).toHaveText('Cliente Demo QA234')
  await expect(page.getByTestId('cliente-elegido')).toContainText('80012345-0')
  await page.getByRole('button', { name: 'Editar datos del cliente', exact: true }).click()
  await expect(editor.getByLabel('Nombre del cliente en ficha', { exact: true })).toHaveValue('Cliente Demo QA234')
  await expect(ruc).toHaveValue('80012345-0')

  expect(api.calls.length).toBeGreaterThan(0)
  api.assertClean()
})

test('demo: DV inválido se rechaza antes de consultar OwnData', async ({ page }) => {
  const api = await mockRucPublic(page)
  await page.goto('/demo')
  await page.getByRole('button', { name: /Entrar como Vendedor/ }).click()
  await cerrarGuia(page)
  await expect(page.getByRole('heading', { name: 'Vender', exact: true, level: 1 })).toBeVisible()
  await page.getByText('Datos de contacto, RUC/CI y direcciones').click()
  const editor = page.getByRole('dialog', { name: 'Datos del cliente', exact: true })
  await expect(editor).toBeVisible()
  const ruc = editor.getByLabel('CI o RUC del cliente', { exact: true })
  // Un guion con dígito verificador incorrecto (el válido de 80012345 es 0) se
  // rechaza con el aviso del campo, sin consultar a nadie.
  await ruc.fill('80012345-6')
  await expect(ruc).toHaveValue('80012345-6')
  const raiz = ruc.locator('xpath=ancestor::*[contains(@class,"mobos-ruc-field")][1]')
  await raiz.getByRole('button', { name: 'Extraer los datos del RUC' }).click()
  await expect(raiz.getByRole('alert')).toHaveText(/RUC/)
  expect(api.calls).toEqual([])
  api.assertClean()
})

// La empresa privada consulta el mismo endpoint público y espera confirmación.
test('demo: la empresa privada consulta OwnData público y no pisa sin confirmar', async ({ page }) => {
  const api = await mockRucPublic(page)

  await page.goto('/demo')
  await page.getByRole('button', { name: /Entrar como Dueño/ }).click()
  await cerrarGuia(page)
  await page.goto('/configuracion/negocio')
  // #299: los datos privados viven en la pestaña «Datos fiscales».
  await page.getByTestId('organizacion-secciones').getByRole('tab', { name: 'Datos fiscales', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Empresas/personas jurídicas (privado)' })).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: 'Agregar empresa' }).click()
  const nombre = page.locator('#priv-legal-name')
  await nombre.fill('EMPRESA CARGADA A MANO')
  const ruc = page.locator('#priv-ruc')
  await ruc.fill('80012345-0')
  const raiz = ruc.locator('xpath=ancestor::*[contains(@class,"mobos-ruc-field")][1]')
  await raiz.getByRole('button', { name: /Extraer los datos del RUC|Consultando/ }).click()
  await expect(raiz.getByRole('button', { name: 'Usar estos datos' })).toBeVisible()
  await expect(raiz.getByText('Simulada en demo')).toHaveCount(0)
  const razonOficial = (await raiz.locator('b').first().innerText()).trim()
  expect(razonOficial).toMatch(/S\.A\.|S\.R\.L\.|LTDA\./)

  // Sin confirmación el nombre cargado no se toca.
  await expect(nombre).toHaveValue('EMPRESA CARGADA A MANO')
  await raiz.getByRole('button', { name: 'Usar estos datos' }).click()
  await expect(nombre).toHaveValue(razonOficial)
  expect(api.calls.length).toBeGreaterThan(0)
  api.assertClean()
})

// Demo: una CI sin guion también consulta OwnData público y "Usar estos datos" completa
// el formulario; la ciudad del mismo formulario sugiere ciudades de Paraguay
// (catálogo de la biblioteca, sin API) y completa el departamento.
test('demo: CI en Clientes consulta OwnData público y la ciudad autocompleta con departamento', async ({ page }) => {
  const api = await mockRucPublic(page)

  await page.goto('/demo')
  await page.getByRole('button', { name: /Entrar como Vendedor/ }).click()
  await cerrarGuia(page)
  await page.goto('/clientes')
  await page.getByRole('button', { name: '+ Crear cliente' }).click()
  const ruc = page.locator('#cliente-documento')
  await ruc.fill('1234567')
  const raiz = ruc.locator('xpath=ancestor::*[contains(@class,"mobos-ruc-field")][1]')
  await raiz.getByRole('button', { name: /Extraer los datos del RUC|Consultando/ }).click()
  await expect(raiz.getByRole('button', { name: 'Usar estos datos' })).toBeVisible()
  await expect(raiz.getByText('Simulada en demo')).toHaveCount(0)
  await expect(raiz.getByText('RUC 1234567-9')).toBeVisible()
  const nombreOficial = (await raiz.locator('b').first().innerText()).trim()
  await raiz.getByRole('button', { name: 'Usar estos datos' }).click()
  await expect(raiz.getByText('Simulada en demo')).toBeHidden()
  // La razón social queda como nombre fiscal del formulario y el RUC se completa con su DV.
  await expect(ruc).toHaveValue('1234567-9')
  expect(nombreOficial).toMatch(/S\.A\.|S\.R\.L\.|LTDA\./)

  const ciudad = page.getByPlaceholder('Ej: Asunción, Ciudad del Este…').or(page.getByPlaceholder('Ciudad')).first()
  await ciudad.fill('Ciudad del')
  const opcion = page.getByRole('option', { name: /Ciudad del Este/ })
  await expect(opcion).toBeVisible()
  await opcion.click()
  await expect(ciudad).toHaveValue('Ciudad del Este')
  await expect(page.getByText('Departamento: Alto Paraná')).toBeVisible()
  expect(api.calls.length).toBeGreaterThan(0)
  api.assertClean()
})

test('demo: RUC 5215244 usa fixture local y exige confirmación', async ({ page }) => {
  const requests = []
  page.on('request', request => {
    if (request.url().includes('/api/public/ruc')) requests.push(request.url())
  })
  await page.goto('/demo')
  await page.getByRole('button', { name: /Entrar como Dueño/ }).click()
  await cerrarGuia(page)
  await page.goto('/configuracion/negocio')
  await page.getByTestId('organizacion-secciones').getByRole('tab', { name: 'Datos fiscales', exact: true }).click()
  await page.getByRole('button', { name: 'Agregar empresa' }).click()
  const ruc = page.locator('#priv-ruc')
  const nombreManual = page.locator('#priv-legal-name')
  await nombreManual.fill('NOMBRE CARGADO A MANO')
  await ruc.fill('5215244-8')
  const raiz = ruc.locator('xpath=ancestor::*[contains(@class,"mobos-ruc-field")][1]')
  await raiz.getByRole('button', { name: /Extraer los datos del RUC|Consultando/ }).click()
  await expect(raiz.getByRole('button', { name: 'Usar estos datos' })).toBeVisible()
  await expect(raiz.getByText('Simulada en demo')).toBeVisible()
  await expect(raiz).toContainText('DISTRIBUIDORA AURORA S.A.')
  await expect(nombreManual).toHaveValue('NOMBRE CARGADO A MANO')
  await expect(requests).toEqual([])
  await raiz.getByRole('button', { name: 'Usar estos datos' }).click()
  await expect(page.locator('#priv-legal-name')).toHaveValue('DISTRIBUIDORA AURORA S.A.')
})
