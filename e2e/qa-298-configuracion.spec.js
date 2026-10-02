// #298 · Configuración: una sola navegación con texto y edición bajo demanda.
//
// - El riel de los 7 grupos ya no se colapsa a solo iconos: siempre muestra el
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

const SALIDA = process.env.MOBOS_298_CAPTURAS || ''
const NAV = '[data-testid="config-grupos"]'
const TOGGLE = '[data-testid="config-grupos-toggle"]'
const ETIQUETAS = ['Mi cuenta', 'Organización', 'Equipo y acceso', 'Comercial', 'Seguridad y auditoría', 'Dispositivos', 'Sistema']

async function capturar(page, nombre) {
  if (!SALIDA) return
  mkdirSync(SALIDA, { recursive: true })
  await page.screenshot({ path: join(SALIDA, `${nombre}.png`), fullPage: true })
}

async function abrirEdicion(page) {
  await page.goto('/configuracion/organizacion')
  await page.getByTestId('datos-tienda-editar').click()
  await expect(page.getByTestId('datos-tienda-form')).toBeVisible()
  await expect(page.locator('#edit-nombre')).not.toHaveValue('', { timeout: 20_000 })
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
  await page.goto('/configuracion/organizacion')
  const nav = page.locator(NAV)
  await expect(nav).toBeVisible({ timeout: 20_000 })

  // Sin toggle de colapso y con los siete rótulos a la vista.
  await expect(page.locator(TOGGLE)).toHaveCount(0)
  for (const etiqueta of ETIQUETAS) await expect(nav.getByText(etiqueta, { exact: true })).toBeVisible()

  // Deep link intacto y navegación entre secciones.
  await page.goto('/configuracion/seguridad')
  await expect(page.locator(NAV).getByRole('tab', { name: 'Seguridad y auditoría' })).toHaveAttribute('aria-selected', 'true')
  await page.locator(NAV).getByRole('tab', { name: 'Organización' }).click()
  await expect(page).toHaveURL(/\/configuracion\/organizacion$/)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true)
  await capturar(page, '01-navegacion-escritorio')

  // Mobile: tira horizontal, rótulos visibles y sin desborde.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()
  for (const etiqueta of ['Mi cuenta', 'Organización', 'Seguridad y auditoría']) {
    await expect(page.locator(NAV).getByText(etiqueta, { exact: true })).toBeVisible()
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true)
  await capturar(page, '02-navegacion-mobile')
})

test('#298 · Datos de la tienda: una sola tarjeta con Editar y sin resumen duplicado', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/configuracion/organizacion')
  await expect(page.getByRole('heading', { name: 'Datos de la tienda', exact: true })).toHaveCount(1)
  await expect(page.getByTestId('datos-tienda-lectura')).toBeVisible()
  await expect(page.locator('#edit-nombre')).toHaveCount(0)
  await expect(page.getByTestId('datos-tienda-form')).toHaveCount(0)
  await expect(page.getByTestId('datos-tienda-barra')).toHaveCount(0)
  await capturar(page, '03-datos-lectura')

  await page.getByTestId('datos-tienda-editar').click()
  // La edición reemplaza la tarjeta: no quedan los datos duplicados al lado.
  await expect(page.getByTestId('datos-tienda-form')).toBeVisible()
  await expect(page.getByTestId('datos-tienda-lectura')).toHaveCount(0)

  // Formulario en 2 columnas; la dirección ocupa el ancho completo.
  const nombre = await page.locator('#edit-nombre').boundingBox()
  const direccion = await page.locator('#edit-direccion').boundingBox()
  expect(direccion.width).toBeGreaterThan(nombre.width * 1.6)
  expect(direccion.y).toBeGreaterThan(nombre.y + 10)
  // Sin diferencias no hay barra de guardado.
  await expect(page.getByTestId('datos-tienda-barra')).toHaveCount(0)
  await capturar(page, '04-datos-edicion')

  // Tocar un campo crea el cambio: la barra aparece; revertirlo la esconde.
  const original = await page.locator('#edit-direccion').inputValue()
  await page.locator('#edit-direccion').fill(`${original} QA 298`)
  await expect(page.getByTestId('datos-tienda-barra')).toContainText('Guardar cambios')
  await capturar(page, '05-datos-con-cambios')
  await page.locator('#edit-direccion').fill(original)
  await expect(page.getByTestId('datos-tienda-barra')).toHaveCount(0)

  // Cancelar vuelve a la tarjeta de lectura.
  await page.getByRole('button', { name: 'Cancelar' }).click()
  await expect(page.getByTestId('datos-tienda-lectura')).toBeVisible()
  await expect(page.getByTestId('datos-tienda-form')).toHaveCount(0)
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
    await page.locator('#edit-nombre').press('Enter')
    await page.waitForTimeout(600)
    expect(updates.filter((cuerpo) => cuerpo.includes('updateProfile'))).toHaveLength(0)

    await page.locator('#edit-direccion').fill(nueva)
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await confirmarPasswordSiPide(page)
    await expect(page.getByText('Datos de la tienda actualizados.')).toBeVisible({ timeout: 20_000 })
    // La tarjeta vuelve a lectura con el dato nuevo.
    await expect(page.getByTestId('datos-tienda-lectura').getByText(nueva, { exact: true })).toBeVisible()
    await capturar(page, '06-datos-guardado')
    // Al menos un envío con el cambio (con reautenticación puede haber un
    // primer intento rechazado y el reintento).
    expect(updates.filter((cuerpo) => cuerpo.includes('updateProfile')).length).toBeGreaterThanOrEqual(1)

    await page.reload()
    await expect(page.getByTestId('datos-tienda-lectura').getByText(nueva, { exact: true })).toBeVisible({ timeout: 20_000 })

    // Restaura el valor compartido por la suite.
    await page.getByTestId('datos-tienda-editar').click()
    await page.locator('#edit-direccion').fill(original)
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await confirmarPasswordSiPide(page)
    await expect(page.getByTestId('datos-tienda-lectura')).toBeVisible({ timeout: 20_000 })
    if (original) await expect(page.getByTestId('datos-tienda-lectura').getByText(original, { exact: true })).toBeVisible()
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
