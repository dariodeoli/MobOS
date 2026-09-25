// #234: en la demo pública el extractor de RUC funciona sin llamar al API:
// resuelve con un resultado ficticio marcado como simulado (mismo patrón que el
// IMEI, #219) y los datos se aplican solo al confirmar ("Usar estos datos").
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const API_PORT = process.env.MOBOS_E2E_API_PORT || '3001'
const esLlamadaApi = (url) => url.includes(`localhost:${API_PORT}`) || url.includes('api.moboss.online')
const DIR = join('test-results', 'qa-234')
mkdirSync(DIR, { recursive: true })

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

test('demo: el extractor de RUC simula el resultado y espera confirmación', async ({ page }) => {
  const llamadas = []
  page.on('request', (req) => { if (esLlamadaApi(req.url())) llamadas.push(req.url()) })

  await page.goto('/demo')
  await page.getByRole('button', { name: /Entrar como Vendedor/ }).click()
  await expect(page).toHaveURL(/\/pos$/)
  const guia = page.getByRole('dialog', { name: 'Cómo funciona la demo' })
  if (await guia.count()) await expect(guia.getByText('RUC simulado')).toBeVisible()
  await cerrarGuia(page)
  await expect(page.getByRole('heading', { name: 'Nueva venta' })).toBeVisible()

  const cliente = page.getByLabel('Nombre, teléfono, CI o RUC del cliente')
  await cliente.fill('Cliente Demo QA234')
  await page.getByText('Datos de contacto, RUC/CI y direcciones').click()
  const ruc = page.getByLabel('CI o RUC del cliente', { exact: true })
  await ruc.fill('80012345-6')
  const raiz = ruc.locator('xpath=../..')
  const boton = raiz.getByRole('button', { name: /Extraer los datos del RUC|Consultando/ })
  await expect(boton).toBeVisible()
  await expect(boton).toBeEnabled()
  await boton.click()

  // Mismo recorrido que la consulta real: "Consultando…" con spinner y después
  // el resultado, acá ficticio y marcado como simulado.
  await expect(raiz.getByText('Consultando…')).toBeVisible()
  await expect(raiz.getByText('Simulada en demo')).toBeVisible()
  const nombreSimulado = (await raiz.locator('b').first().innerText()).trim()
  expect(nombreSimulado).toMatch(/S\.A\.|S\.R\.L\.|LTDA\./)
  await raiz.screenshot({ path: join(DIR, '234-demo-pos-simulado-despues.png') })

  // Sin confirmación no se pisa nada.
  await expect(cliente).toHaveValue('Cliente Demo QA234')
  await expect(ruc).toHaveValue('80012345-6')

  // Con "Usar estos datos" entra la razón social simulada (el RUC ya estaba).
  await raiz.getByRole('button', { name: 'Usar estos datos' }).click()
  await expect(raiz.getByText('Simulada en demo')).toBeHidden()
  await expect(cliente).toHaveValue(nombreSimulado)
  await expect(ruc).toHaveValue('80012345-6')

  expect(llamadas, `llamadas al API dentro de la demo: ${llamadas.join(', ')}`).toEqual([])
})

test('demo: un RUC inválido se rechaza con el mensaje del proveedor', async ({ page }) => {
  await page.goto('/demo')
  await page.getByRole('button', { name: /Entrar como Vendedor/ }).click()
  await cerrarGuia(page)
  await expect(page.getByRole('heading', { name: 'Nueva venta' })).toBeVisible()
  await page.getByText('Datos de contacto, RUC/CI y direcciones').click()
  const ruc = page.getByLabel('CI o RUC del cliente', { exact: true })
  await ruc.fill('123')
  const raiz = ruc.locator('xpath=../..')
  await raiz.getByRole('button', { name: 'Extraer los datos del RUC' }).click()
  await expect(raiz.getByRole('alert')).toHaveText(/RUC/)
})

// #234 · seguimiento: la empresa privada (Config → Negocio) también simula en
// demo y aplica la razón social solo al confirmar.
test('demo: la empresa privada extrae simulada y no pisa sin confirmar', async ({ page }) => {
  const llamadas = []
  page.on('request', (req) => { if (esLlamadaApi(req.url())) llamadas.push(req.url()) })

  await page.goto('/demo')
  await page.getByRole('button', { name: /Entrar como Dueño/ }).click()
  await cerrarGuia(page)
  await page.goto('/configuracion/negocio')
  await expect(page.getByRole('heading', { name: 'Empresas/personas jurídicas (privado)' })).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: 'Agregar empresa' }).click()
  const nombre = page.locator('#priv-legal-name')
  await nombre.fill('EMPRESA CARGADA A MANO')
  const ruc = page.locator('#priv-ruc')
  await ruc.fill('80012345-6')
  const raiz = ruc.locator('xpath=../..')
  await raiz.getByRole('button', { name: /Extraer los datos del RUC|Consultando/ }).click()
  await expect(raiz.getByText('Simulada en demo')).toBeVisible()
  const razonSimulada = (await raiz.locator('b').first().innerText()).trim()
  expect(razonSimulada).toMatch(/S\.A\.|S\.R\.L\.|LTDA\./)
  await raiz.screenshot({ path: join(DIR, '234-demo-privados-empresa-despues.png') })

  // Sin confirmación el nombre cargado no se toca.
  await expect(nombre).toHaveValue('EMPRESA CARGADA A MANO')
  await raiz.getByRole('button', { name: 'Usar estos datos' }).click()
  await expect(nombre).toHaveValue(razonSimulada)
  expect(llamadas, `llamadas al API dentro de la demo: ${llamadas.join(', ')}`).toEqual([])
})
