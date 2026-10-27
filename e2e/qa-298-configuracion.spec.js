// #298 · Configuración: una sola navegación con texto y edición bajo demanda.
//
// - El riel de los 9 grupos ya no se colapsa a solo iconos: siempre muestra el
//   rótulo (escritorio y mobile), con el deep link intacto.
// - «Datos de la tienda» es una única tarjeta: en lectura muestra los datos y
//   «Editar»; la edición reemplaza la misma tarjeta (2 columnas, dirección a
//   ancho completo) y la barra «Guardar cambios» aparece solo con cambios.
//
// Capturas: MOBOS_298_CAPTURAS=docs/qa/298-configuracion \
//   npx playwright test e2e/qa-298-configuracion.spec.js
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { SEED } from './helpers/seed-data.js'
import { selectConfigSection } from './helpers/shell-navigation.js'

const SALIDA = process.env.MOBOS_298_CAPTURAS || ''
const NAV = '[data-testid="config-grupos"]'
const TOGGLE = '[data-testid="config-grupos-toggle"]'
const ETIQUETAS = ['Negocio', 'Módulos', 'Equipo y acceso', 'Ventas y cobros', 'Impresión y documentos', 'Mensajes y avisos', 'Seguridad', 'Integraciones y sistema', 'Mi cuenta']

async function capturar(page, nombre) {
  if (!SALIDA) return
  mkdirSync(SALIDA, { recursive: true })
  await page.screenshot({ path: join(SALIDA, `${nombre}.png`), fullPage: true })
}

// #422: Datos de la tienda son filas; «Dirección» abre el formulario en una ventana.
async function abrirEdicion(page) {
  await page.goto('/configuracion/negocio')
  await page.getByTestId('fila-direccion').click()
  await expect(page.getByTestId('datos-tienda-form')).toBeVisible()
  await expect(page.locator('#edit-direccion')).toBeVisible()
}

// La sesión del arnés puede tener vencida la ventana de reautenticación: si el
// panel aparece, se verifica la contraseña y el guardado sigue solo.
async function confirmarPasswordSiPide(page) {
  const panel = page.getByTestId('datos-tienda-reauth')
  const aparece = await panel.waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false)
  if (!aparece) return
  await panel.getByLabel('Contraseña para guardar los cambios').fill(SEED.company.password)
  await panel.getByRole('button', { name: 'Verificar y guardar' }).click()
}

test('#298 · una sola navegación de Configuración, siempre con texto', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/configuracion/negocio')
  const nav = page.locator(NAV)
  await expect(nav).toBeVisible({ timeout: 20_000 })

  // Sin toggle de colapso y con los nueve rótulos como pestañas de la
  // navegación de secciones (SectionTabs: siempre con texto).
  await expect(page.locator(TOGGLE)).toHaveCount(0)
  const tabs = nav.locator('[data-tab-id]')
  await expect(tabs.first()).toBeVisible()
  expect(await tabs.allTextContents()).toEqual(ETIQUETAS)

  // Deep link intacto y navegación entre secciones.
  await page.goto('/configuracion/seguridad')
  await expect(page.locator(NAV).locator('[data-tab-id="seguridad"]')).toHaveAttribute('aria-current', 'page')
  await selectConfigSection(page, 'Negocio')
  await expect(page).toHaveURL(/\/configuracion\/negocio$/)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true)
  await capturar(page, '01-navegacion-escritorio')

  // Mobile: la misma navegación como tira de pestañas, con el rótulo actual y sin desborde.
  // #410: en celular /configuracion es la lista de las nueve secciones con rótulo.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/configuracion')
  await expect(page.locator(NAV).locator('[data-tab-id]').first()).toBeVisible()
  await expect(page.locator(NAV).locator('[data-tab-id]')).toHaveCount(ETIQUETAS.length)
  await expect(page.locator(NAV).locator('[data-tab-id="negocio"]')).toHaveAttribute('aria-label', 'Negocio')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true)
  await capturar(page, '02-navegacion-mobile')
})

test('#298 · Datos de la tienda: filas que abren su formulario y sin resumen duplicado', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/configuracion/negocio')
  await expect(page.getByRole('heading', { name: 'Datos de la tienda', exact: true })).toHaveCount(1)
  for (const fila of ['fila-comercial', 'fila-contacto', 'fila-direccion']) await expect(page.getByTestId(fila)).toBeVisible()
  await expect(page.locator('#edit-nombre')).toHaveCount(0)
  await expect(page.getByTestId('datos-tienda-form')).toHaveCount(0)
  await expect(page.getByTestId('datos-tienda-barra')).toHaveCount(0)
  await capturar(page, '03-datos-lectura')

  await page.getByTestId('fila-direccion').click()
  // El formulario vive en la ventana: los datos no quedan duplicados al lado.
  await expect(page.getByTestId('datos-tienda-form')).toBeVisible()
  await expect(page.getByTestId('cuenta-form-ventana')).toBeVisible()
  await expect(page.locator('#edit-direccion')).toBeVisible()
  // La ventana tiene siempre el mismo pie; sin diferencias «Guardar cambios» está deshabilitado.
  const pie = page.getByTestId('datos-tienda-pie')
  const guardar = pie.getByRole('button', { name: 'Guardar cambios' })
  await expect(guardar).toBeDisabled()
  await capturar(page, '04-datos-edicion')

  // Tocar un campo crea el cambio y habilita guardar; revertirlo lo vuelve a deshabilitar.
  const original = await page.locator('#edit-direccion').inputValue()
  await page.locator('#edit-direccion').fill(`${original} QA 298`)
  await expect(guardar).toBeEnabled()
  await expect(pie).toContainText('Tenés cambios sin guardar.')
  await capturar(page, '05-datos-con-cambios')
  await page.locator('#edit-direccion').fill(original)
  await expect(guardar).toBeDisabled()

  // Cancelar cierra la ventana y deja las filas.
  await page.getByRole('button', { name: 'Cancelar' }).click()
  await expect(page.getByTestId('cuenta-form-ventana')).toHaveCount(0)
  await expect(page.getByTestId('fila-direccion')).toBeVisible()
})

test('#298 · «Guardar cambios» solo se envía con diferencias y persiste', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  const updates = []
  page.on('request', (peticion) => {
    if (peticion.method() === 'PATCH' && peticion.url().includes('/api/account')) updates.push(peticion.postData() || '')
  })

  await abrirEdicion(page)
  const original = await page.locator('#edit-direccion').inputValue()
  const nueva = original === 'Av. QA 298' ? 'Av. QA 298 bis' : 'Av. QA 298'
  try {
    // Enter sin cambios: no viaja ningún guardado.
    await page.locator('#edit-direccion').press('Enter')
    await page.waitForTimeout(600)
    expect(updates.filter((cuerpo) => cuerpo.includes('updateProfile'))).toHaveLength(0)

    await page.locator('#edit-direccion').fill(nueva)
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await confirmarPasswordSiPide(page)
    await expect(page.getByText('Datos de la tienda actualizados.')).toBeVisible({ timeout: 20_000 })
    // La ventana se cierra y la fila muestra el dato nuevo.
    await expect(page.getByTestId('cuenta-form-ventana')).toHaveCount(0)
    await expect(page.getByTestId('fila-direccion')).toContainText(nueva)
    await capturar(page, '06-datos-guardado')
    // Al menos un envío con el cambio (con reautenticación puede haber un
    // primer intento rechazado y el reintento).
    expect(updates.filter((cuerpo) => cuerpo.includes('updateProfile')).length).toBeGreaterThanOrEqual(1)

    await page.reload()
    await expect(page.getByTestId('fila-direccion')).toContainText(nueva, { timeout: 20_000 })

    // Restaura el valor compartido por la suite.
    await page.getByTestId('fila-direccion').click()
    await page.locator('#edit-direccion').fill(original)
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await confirmarPasswordSiPide(page)
    await expect(page.getByTestId('cuenta-form-ventana')).toHaveCount(0, { timeout: 20_000 })
    if (original) await expect(page.getByTestId('fila-direccion')).toContainText(original)
  } finally {
    // Red de seguridad: si el test falló a mitad, restaura por API.
    await page.evaluate(async ({ api, original }) => {
      await fetch(`${api}/api/account`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'updateProfile', address: original }),
      }).catch(() => {})
    }, { api: SEED.api, original })
  }
})
