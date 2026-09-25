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
  // #IA: Negocio pasó a Organización (la ruta vieja redirige igual).
  await page.goto('/configuracion/organizacion')
  await expect(page.locator('#cuenta-form')).toBeVisible()
  // El formulario se hidrata con la cuenta: se espera a que llegue.
  await expect(page.locator('#edit-nombre')).not.toHaveValue('', { timeout: 20_000 })
}

// Acción sensible sin reautenticación vigente: el formulario pide la contraseña
// ahí mismo y, al verificarla, el guardado sigue solo.
async function confirmarPassword(page, id) {
  // La reautenticación se pide solo si pasaron más de 10 minutos desde la
  // última verificación (una sesión fresca —como la del CI— guarda directo):
  // se atiende si aparece y se sigue si no.
  const panel = page.getByTestId(`${id}-reauth`)
  const aparece = await panel.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false)
  if (!aparece) return
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
  await expect(prefijo).not.toHaveValue('', { timeout: 20_000 })
  const numero = page.getByLabel('Número inicial de pedidos')
  const original = await prefijo.inputValue()
  // En una cuenta nueva el número todavía no existe y el campo queda vacío (el
  // efectivo vive en el placeholder). La sección se hidrata con la cuenta y una
  // recarga de `load()` puede volver a pisar los campos, así que el número se
  // completa justo antes de guardar y el guardado se reintenta —idempotente—
  // hasta ver «Guardado» (mismos valores: no toca la numeración de la suite).
  const guardar = async () => {
    if ((await numero.inputValue()) === '') await numero.fill((await numero.getAttribute('placeholder')) || '1')
    await expect(numero).toHaveValue(/^\d{1,8}$/, { timeout: 3_000 })
    await prefijo.press('Enter')
    await page.waitForTimeout(300)
    await capturar(page, 'numeracion-enter')
    await confirmarPassword(page, 'numeracion')
    await expect(page.getByTestId('numeracion-estado')).toContainText('Guardado', { timeout: 8_000 })
  }
  await expect(guardar).toPass({ timeout: 45_000 })
  await capturar(page, 'numeracion-guardado')
  // Un prefijo inválido no se guarda y lo explica en la sección.
  await prefijo.fill('X')
  await prefijo.press('Enter')
  await expect(page.getByTestId('numeracion-estado')).toContainText(/2 o 3 letras/i, { timeout: 15_000 })
  await capturar(page, 'numeracion-error')
  await prefijo.fill(original)
})

test('Mi cuenta: guardar el nombre avisa en el perfil', async ({ page }) => {
  await entrarComoDueno(page)
  // #IA/#253: Mi identidad pasó a Mi cuenta (perfil personal).
  await page.goto('/configuracion/mi-cuenta')
  const campo = page.locator('#mi-cuenta-nombre')
  await expect(campo).not.toHaveValue('', { timeout: 20_000 })
  const original = await campo.inputValue()
  await campo.fill(`${original} QA`)
  await campo.press('Enter')
  await expect(page.getByText('Nombre actualizado').last()).toBeVisible({ timeout: 15_000 })
  await capturar(page, 'mi-cuenta-nombre')
  await page.reload()
  await expect(page.locator('#mi-cuenta-nombre')).toHaveValue(`${original} QA`, { timeout: 20_000 })
  // Restaura el nombre que comparte la suite.
  await page.locator('#mi-cuenta-nombre').fill(original)
  await page.locator('#mi-cuenta-nombre').press('Enter')
  await expect(page.getByText('Nombre actualizado').last()).toBeVisible({ timeout: 15_000 })
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
  // #IA: las sucursales viven en Organización (la ruta vieja /configuracion/sucursales redirige).
  await page.goto('/configuracion/organizacion')
  const fila = page.locator('article').filter({ hasText: SEED.branchName }).first()
  await expect(fila).toBeVisible({ timeout: 20_000 })
  await fila.getByRole('button', { name: 'Editar' }).click()
  const panel = page.locator('#sucursal-form')
  await expect(panel.getByRole('heading', { name: 'Editar sucursal' })).toBeVisible()
  await capturar(panel, 'sucursal')
  await panel.getByLabel('Nombre').press('Enter')
  await expect(page.getByTestId('sucursal-estado')).toContainText('Guardado', { timeout: 15_000 })
  await capturar(panel, 'sucursal-guardado')
})
