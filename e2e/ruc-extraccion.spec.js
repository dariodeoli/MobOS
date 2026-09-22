// #234 — Extractor de RUC dentro del input: capturas antes/después y contrato
// visible en los seis lugares con RUC (POS cliente y titular, CRM nuevo cliente
// e identidad fiscal, Compras proveedor y Config negocio). Las capturas quedan
// en docs/qa/234 y se distinguen con QA234_FASE=antes|despues (por defecto
// despues). En "antes" solo se capturan las pantallas: el contrato nuevo se
// verifica en "despues", así la misma spec sirve para las dos fotos.
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { SEED } from './helpers/seed-data.js'

const API = SEED.api
const FASE = process.env.QA234_FASE === 'antes' ? 'antes' : 'despues'
// Las evidencias versionadas viven en docs/qa/234 (commiteadas por el slot);
// la corrida escribe en test-results/ (ignorado) para no ensuciar el árbol.
const DIR = join('test-results', 'qa-234')
mkdirSync(DIR, { recursive: true })

const capturar = (raiz, nombre) => raiz.screenshot({ path: join(DIR, `234-${nombre}-${FASE}.png`) })
const extraer = (raiz) => raiz.getByRole('button', { name: /Extraer los datos del RUC|Consultando/ })

// El botón vive adentro del campo: habilitado con RUC, con tooltip.
async function verificarExtractor(raiz) {
  if (FASE === 'antes') return
  const boton = extraer(raiz)
  await expect(boton).toBeVisible()
  await expect(boton).toBeEnabled()
  await expect(boton).toHaveAttribute('title', /Extraer los datos del RUC/)
}

test('POS: RUC del cliente con el extractor dentro del input', async ({ page }) => {
  await page.goto('/pos')
  await expect(page.getByRole('heading', { name: 'Nueva venta' })).toBeVisible()
  await page.getByText('Datos de contacto, RUC/CI y direcciones').click()
  const cliente = page.getByLabel('CI o RUC del cliente', { exact: true })
  await cliente.fill('80012345-6')
  const raiz = cliente.locator('xpath=../..')
  await capturar(raiz, 'pos-cliente')
  await verificarExtractor(raiz)
  if (FASE === 'despues') {
    // Vacío: el mismo botón queda deshabilitado.
    await cliente.fill('')
    await expect(extraer(raiz)).toBeDisabled()
  }
})

test('POS: RUC del titular de factura', async ({ page }) => {
  await page.goto('/pos')
  await expect(page.getByRole('heading', { name: 'Nueva venta' })).toBeVisible()
  await page.getByText('Datos de contacto, RUC/CI y direcciones').click()
  await page.getByLabel(/Facturar a otro titular/).check()
  const titular = page.getByLabel('RUC del titular de factura')
  await titular.fill('80098765-4')
  const raiz = titular.locator('xpath=../..')
  await capturar(raiz, 'pos-titular')
  await verificarExtractor(raiz)
})

test('CRM: RUC o CI del nuevo cliente', async ({ page }) => {
  await page.goto('/clientes')
  await expect(page.getByRole('heading', { name: 'Clientes' })).toBeVisible()
  await page.getByRole('button', { name: '+ Crear cliente' }).click()
  const ruc = page.locator('#cliente-documento')
  await ruc.fill('80012345-6')
  const raiz = ruc.locator('xpath=../..')
  await capturar(raiz, 'crm-nuevo-cliente')
  await verificarExtractor(raiz)
})

test('CRM: identidad fiscal de una ficha', async ({ page }) => {
  await page.goto('/clientes')
  await expect(page.getByRole('heading', { name: 'Clientes' })).toBeVisible()
  // La tabla nueva (#236) abre la ficha al hacer clic en la fila.
  const fila = page.getByTestId('cliente-fila').first()
  await expect(fila).toBeVisible()
  await fila.click()
  const ficha = page.getByRole('dialog', { name: /^Cliente: / })
  await expect(ficha).toBeVisible()
  await ficha.getByRole('tab', { name: /^Datos/ }).click()
  await ficha.getByRole('button', { name: 'Agregar identidad' }).click()
  const ruc = page.locator('#profile-identity-document')
  await ruc.fill('80012345-6')
  const raiz = ruc.locator('xpath=../..')
  await capturar(raiz, 'crm-identidad-fiscal')
  await verificarExtractor(raiz)
})

test('Compras: RUC del proveedor', async ({ page }) => {
  const nombre = `Proveedor QA234 ${Date.now().toString(36).toUpperCase()}`
  await page.goto('/compras')
  await expect(page.getByRole('heading', { name: 'Compras' })).toBeVisible()
  await page.evaluate(async ({ api, nombre }) => {
    const respuesta = await fetch(`${api}/api/suppliers`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nombre, document: '80012345-6' }),
    })
    if (!respuesta.ok) throw new Error(`No se pudo crear el proveedor: ${respuesta.status}`)
  }, { api: API, nombre })
  // La pantalla carga su lista de proveedores al montar: se recarga para que el
  // alta recién creada aparezca en el modal.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Compras' })).toBeVisible()
  await page.getByRole('button', { name: 'Proveedores' }).click()
  const modal = page.getByRole('dialog', { name: 'Proveedores' })
  await modal.getByTestId('proveedor-fila').filter({ hasText: nombre }).getByRole('button', { name: `Editar ${nombre}` }).click()
  // El campo de RUC del proveedor se ubica por su placeholder: la etiqueta
  // accesible se agregó en #234, así la misma spec sirve para el antes.
  const ruc = modal.locator('form').getByPlaceholder('80012345-6')
  await ruc.fill('80012345-6')
  const raiz = ruc.locator('xpath=../..')
  await capturar(raiz, 'compras-proveedor')
  await verificarExtractor(raiz)
})

test('Config: RUC del negocio', async ({ page }) => {
  await page.goto('/configuracion/negocio')
  await expect(page.locator('h1')).toHaveText('Negocio')
  // El negocio carga async y rellena el formulario: si se llena antes, la
  // carga pisa el valor. Se espera a que el nombre cargado esté presente.
  await expect(page.locator('#edit-nombre')).not.toHaveValue('', { timeout: 20000 })
  const ruc = page.locator('#edit-ruc')
  const raiz = ruc.locator('xpath=../..')
  const extraer = raiz.getByRole('button', { name: /Extraer los datos del RUC|Consultando/ })
  // La carga del negocio puede rellenar el formulario después del primer
  // tipeo: se reintenta hasta que el extractor quede habilitado con el RUC.
  await expect.poll(async () => {
    await ruc.fill('')
    await ruc.pressSequentially('80012345-6')
    return extraer.isEnabled()
  }, { timeout: 20000, intervals: [300, 700, 1500] }).toBe(true)
  // Deja asentar cualquier carga tardía antes de capturar y verificar.
  await page.waitForTimeout(1500)
  await capturar(raiz, 'config-negocio')
  await verificarExtractor(raiz)
})
