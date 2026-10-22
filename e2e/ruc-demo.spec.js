// #498: demo consulta GET público OwnData (mock QA), sin escrituras de negocio.
import { test, expect } from '@playwright/test'
import { silenciarAvisoMetricas } from './helpers/demo.js'
import { mockRucPublic, rucPublicPayload } from './helpers/ruc-public.js'

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

  // La respuesta pública se aplica directo: sin tarjeta ni botones de confirmación.
  await expect(page.getByRole('button', { name: 'Usar estos datos' })).toHaveCount(0)
  await expect(page.getByText('La razón social se aplica solo si la confirmás.')).toHaveCount(0)
  // #350 guarda la ficha durante la sesión y cierra el editor al aplicar.
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
  await expect(raiz.getByText(/Datos del RUC cargados|datos de ejemplo cargados/)).toBeVisible()
  await expect(raiz.getByText('Simulada en demo')).toHaveCount(0)
  await expect(raiz.getByRole('button', { name: 'Usar estos datos' })).toHaveCount(0)
  // Se aplica directo la razón social oficial y el documento.
  await expect(nombre).toHaveValue('COMERCIAL QA 80012345 S.A.')
  // Deshacer restaura lo que había cargado.
  await raiz.getByRole('button', { name: 'Deshacer' }).click()
  await expect(nombre).toHaveValue('EMPRESA CARGADA A MANO')
  expect(api.calls.length).toBeGreaterThan(0)
  api.assertClean()
})

// Demo: una CI sin guion también consulta OwnData público y se aplica directo
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
  await expect(raiz.getByText(/Datos del RUC cargados|datos de ejemplo cargados/)).toBeVisible()
  await expect(raiz.getByText('Simulada en demo')).toHaveCount(0)
  await expect(raiz.getByRole('button', { name: 'Usar estos datos' })).toHaveCount(0)
  // La razón social queda como nombre fiscal del formulario y el RUC se completa con su DV.
  await expect(ruc).toHaveValue('1234567-9')

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

test('demo: RUC 5215244 consulta OwnData real; el ejemplo solo aparece si la API no responde', async ({ page }) => {
  const api = await mockRucPublic(page, {
    respond: ({ query, call }) => call === 1 ? { status: 200, json: rucPublicPayload(query, 'RAZON REAL DE LA API S.A.') } : { abort: true },
  })
  await page.goto('/demo')
  await page.getByRole('button', { name: /Entrar como Dueño/ }).click()
  await cerrarGuia(page)
  await page.goto('/configuracion/negocio')
  await page.getByTestId('organizacion-secciones').getByRole('tab', { name: 'Datos fiscales', exact: true }).click()
  await page.getByRole('button', { name: 'Agregar empresa' }).click()
  const ruc = page.locator('#priv-ruc')
  const nombre = page.locator('#priv-legal-name')
  await ruc.fill('5215244-8')
  const raiz = ruc.locator('xpath=ancestor::*[contains(@class,"mobos-ruc-field")][1]')
  await raiz.getByRole('button', { name: /Extraer los datos del RUC|Consultando/ }).click()
  await expect(raiz.getByText('Datos del RUC cargados')).toBeVisible()
  await expect(nombre).toHaveValue('RAZON REAL DE LA API S.A.')
  expect(api.calls).toEqual(['5215244-8'])
  // Segunda consulta: la API no responde -> ejemplo ficticio, dicho claro.
  await ruc.fill('5215244')
  await ruc.fill('5215244-8')
  await raiz.getByRole('button', { name: /Extraer los datos del RUC|Consultando/ }).click()
  await expect(raiz.getByText('OwnData no respondió: datos de ejemplo cargados')).toBeVisible()
  await expect(nombre).toHaveValue('DISTRIBUIDORA AURORA S.A.')
  expect(api.calls).toEqual(['5215244-8', '5215244-8'])
})
