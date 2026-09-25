// Configuración · guardado transversal (#162 · lote F): «Guardar» persiste en
// Negocio y Seguridad con estado Guardado/Error, Enter para guardar y la
// reautenticación resuelta en el lugar (el API pide la contraseña para las
// acciones sensibles). También cubre los anchos de «Datos de la tienda».
//
// Cada caso entra como dueño desde /login: así la ventana de reautenticación
// está vencida y el pedido de contraseña es determinista (la sesión del
// storageState la comparten todas las specs).
//
// Capturas: `QA_GUARDADO_CAPTURAS` (default test-results/qa-config-guardado) y
// `QA_GUARDADO_FASE` (antes/despues) — se versionan en docs/qa/config-guardado/.
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { SEED } from './helpers/seed-data.js'
import { loginCompany } from './helpers/login.js'

const DIR = process.env.QA_GUARDADO_CAPTURAS || join('test-results', 'qa-config-guardado')
mkdirSync(DIR, { recursive: true })

const capturar = (objetivo, nombre) => objetivo.screenshot({ path: join(DIR, `config-guardado-${nombre}${process.env.QA_GUARDADO_FASE ? `-${process.env.QA_GUARDADO_FASE}` : ''}.png`) })

async function entrarComoDueno(page) {
  // El storageState del arnés ya tiene una sesión: se limpia para entrar de
  // nuevo y que la ventana de reautenticación esté vencida.
  await page.context().clearCookies()
  await loginCompany(page)
  await page.locator('#seller-pin').pressSequentially(SEED.admin.pin)
  await expect(page).toHaveURL(/\/resumen$/)
}

async function abrirNegocio(page) {
  await entrarComoDueno(page)
  await page.goto('/configuracion/negocio')
  await expect(page.locator('#cuenta-form')).toBeVisible()
  // El formulario se hidrata con la cuenta: se espera a que llegue (el monto de
  // gasto solo existe cuando `GET /api/account` respondió).
  await expect(page.locator('#limite-gasto')).not.toHaveValue('', { timeout: 20_000 })
  await expect(page.locator('#edit-nombre')).not.toHaveValue('', { timeout: 20_000 })
}

// Acción sensible sin reautenticación vigente: el formulario pide la contraseña
// ahí mismo y, al verificarla, el guardado sigue solo.
async function confirmarPassword(page, id) {
  const panel = page.getByTestId(`${id}-reauth`)
  await expect(panel).toBeVisible({ timeout: 20_000 })
  await panel.scrollIntoViewIfNeeded()
  await capturar(page, `reauth-${id}`)
  await panel.getByLabel('Contraseña para guardar los cambios').fill(SEED.company.password)
  await panel.getByRole('button', { name: 'Verificar y guardar' }).click()
}

test('Datos de la tienda: Guardar persiste y la ficha lo refleja', async ({ page }) => {
  await abrirNegocio(page)
  const form = page.locator('#cuenta-form')
  const original = {
    direccion: await page.locator('#edit-direccion').inputValue(),
    ruc: await page.locator('#edit-ruc').inputValue(),
    telefono: await form.getByLabel('Teléfono').inputValue(),
  }
  await capturar(form, 'datos-tienda')
  await page.locator('#edit-direccion').fill('Av. Mcal. López 1234, Asunción')
  await page.locator('#edit-ruc').fill('80012345-6')
  await form.getByLabel('Teléfono').fill('981 000 111')
  const telefono = await form.getByLabel('Teléfono').inputValue()
  // Enter guarda: el pie de acciones es el submit del formulario.
  await page.locator('#edit-direccion').press('Enter')
  await page.waitForTimeout(700)
  await capturar(page, 'datos-tienda-enter')
  await confirmarPassword(page, 'datos-tienda')
  await expect(page.getByTestId('datos-tienda-estado')).toContainText('Guardado', { timeout: 15_000 })
  await capturar(form, 'datos-tienda-guardado')
  await page.reload()
  await expect(page.locator('#edit-ruc')).toHaveValue('80012345-6', { timeout: 20_000 })
  await expect(page.locator('#edit-direccion')).toHaveValue('Av. Mcal. López 1234, Asunción')
  await expect(form.getByLabel('Teléfono')).toHaveValue(telefono)
  // La ficha de identidad (panel izquierdo) muestra lo guardado.
  await expect(page.getByText('80012345-6').first()).toBeVisible()
  // Restaura los valores originales (la tienda la comparte toda la suite).
  await page.locator('#edit-direccion').fill(original.direccion)
  await page.locator('#edit-ruc').fill(original.ruc)
  await form.getByLabel('Teléfono').fill(original.telefono)
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByTestId('datos-tienda-estado')).toContainText('Guardado', { timeout: 15_000 })
})

test('Identificador de pedidos: Enter guarda y el error queda en la sección', async ({ page }) => {
  await abrirNegocio(page)
  const prefijo = page.getByLabel('Prefijo de pedidos')
  const original = await prefijo.inputValue()
  // Mismos valores: valida el guardado sin tocar la numeración de la suite.
  await prefijo.press('Enter')
  await page.waitForTimeout(700)
  await capturar(page, 'numeracion-enter')
  await confirmarPassword(page, 'numeracion')
  await expect(page.getByTestId('numeracion-estado')).toContainText('Guardado', { timeout: 15_000 })
  await capturar(page, 'numeracion-guardado')
  // Un prefijo inválido no se guarda y lo explica en la sección.
  await prefijo.fill('X')
  await prefijo.press('Enter')
  await expect(page.getByTestId('numeracion-estado')).toContainText(/2 o 3 letras/i, { timeout: 15_000 })
  await capturar(page, 'numeracion-error')
  await prefijo.fill(original)
})

test('Mi identidad: guardar el nombre avisa Guardado en el formulario', async ({ page }) => {
  await entrarComoDueno(page)
  await page.goto('/configuracion/identidad')
  const campo = page.locator('#identidad-nombre')
  await expect(campo).not.toHaveValue('', { timeout: 20_000 })
  await campo.press('Enter')
  await page.waitForTimeout(500)
  await capturar(page, 'identidad')
  await expect(page.getByTestId('identidad-estado')).toContainText('Guardado', { timeout: 15_000 })
})

test('Seguridad: descargar los datos pide la contraseña y reintenta la descarga', async ({ page }) => {
  await entrarComoDueno(page)
  await page.goto('/configuracion/seguridad')
  const boton = page.getByRole('button', { name: 'Descargar mis datos' })
  await expect(boton).toBeVisible({ timeout: 20_000 })
  const descarga = page.waitForEvent('download')
  await boton.click()
  await confirmarPassword(page, 'exportar')
  await descarga
  await expect(page.getByTestId('exportar-estado')).toContainText(/Descargado|Guardado/i, { timeout: 15_000 })
})

test('Sucursales: editar y guardar avisa Guardado', async ({ page }) => {
  await entrarComoDueno(page)
  await page.goto('/configuracion/sucursales')
  await expect(page.getByRole('heading', { name: 'Sucursales' })).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: 'Editar' }).first().click()
  const panel = page.locator('#sucursal-form')
  await expect(panel.getByRole('heading', { name: 'Editar sucursal' })).toBeVisible()
  await capturar(panel, 'sucursal')
  await panel.getByLabel('Nombre').press('Enter')
  await expect(page.getByTestId('sucursal-estado')).toContainText('Guardado', { timeout: 15_000 })
  await capturar(panel, 'sucursal-guardado')
})
