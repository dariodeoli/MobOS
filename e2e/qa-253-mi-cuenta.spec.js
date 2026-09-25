// #253 → Mi cuenta: la superficie personal de cualquier rol (perfil/foto,
// nombre y correo, preferencias del dispositivo y sesiones propias), accesible
// desde el avatar (`/mi-perfil`, ruta del lead PLT). El dueño la ve además
// como pestaña de Configuración (IA de 7 grupos); el resto del equipo entra
// directo, sin permisos de administración.
import { test, expect } from '@playwright/test'

const SHOTS = process.env.MOBOS_CAPTURAS || 'test-results/QA-253-mi-cuenta'

test('el dueño abre Mi cuenta desde el avatar y ve perfil, preferencias y sesiones', async ({ page }) => {
  test.skip(test.info().project.name !== 'admin', 'Flujo del dueño.')

  await page.goto('/clientes')
  await page.getByTestId('shell-mi-perfil').click()
  await expect(page).toHaveURL(/\/mi-perfil$/)

  await expect(page.getByTestId('mi-cuenta-perfil')).toBeVisible({ timeout: 20000 })
  await expect(page.getByTestId('mi-cuenta-perfil').getByText('Correo de la cuenta')).toBeVisible()
  await expect(page.getByTestId('mi-cuenta-perfil').getByText('ID de usuario')).toBeVisible()

  // Preferencias del dispositivo: se aplican y persisten en este navegador.
  const bloqueo = page.locator('#pref-bloqueo')
  await expect(bloqueo).toBeVisible()
  await bloqueo.selectOption('15')
  await page.reload()
  await expect(page.locator('#pref-bloqueo')).toHaveValue('15')
  await page.locator('#pref-bloqueo').selectOption('10')

  // Sesiones personales con la actual marcada.
  const sesiones = page.getByTestId('mi-cuenta-sesiones')
  await expect(sesiones).toBeVisible()
  await expect(sesiones.getByText('Sesión actual')).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/02-despues-mi-cuenta.png`, fullPage: true })

  // La pestaña del dueño en Configuración muestra el mismo contenido y la
  // ruta vieja de identidad cae en el perfil personal.
  await page.goto('/configuracion/mi-cuenta')
  await expect(page.getByTestId('mi-cuenta-perfil')).toBeVisible()
  await page.goto('/configuracion/identidad')
  await expect(page).toHaveURL(/\/mi-perfil$/)
  await expect(page.getByTestId('mi-cuenta-perfil')).toBeVisible()
})

test('el vendedor entra a su perfil personal desde el avatar', async ({ page }) => {
  test.skip(test.info().project.name !== 'seller', 'Flujo del vendedor.')

  await page.goto('/clientes')
  await page.getByTestId('shell-mi-perfil').click()
  await expect(page).toHaveURL(/\/mi-perfil$/)

  const perfil = page.getByTestId('mi-cuenta-perfil')
  await expect(perfil).toBeVisible({ timeout: 20000 })
  await expect(perfil.getByText('Tu perfil')).toBeVisible()
  await expect(page.locator('#pref-bloqueo')).toBeVisible()
  const sesiones = page.getByTestId('mi-cuenta-sesiones')
  await expect(sesiones.getByText('Sesión actual')).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/03-vendedor-mi-cuenta.png`, fullPage: true })
})

test('demo: Mi cuenta se arma con los datos de la pestaña', async ({ browser }) => {
  test.skip(test.info().project.name !== 'admin', 'Demo del dueño.')
  const contexto = await browser.newContext({ viewport: { width: 1280, height: 1000 } })
  const page = await contexto.newPage()

  await page.goto('/demo')
  await page.waitForTimeout(1200)
  await page.getByRole('button', { name: /Dueño/ }).first().click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 60000 })
  await page.waitForTimeout(900)
  await page.keyboard.press('Escape')
  const cerrarGuia = page.getByRole('button', { name: 'Cerrar', exact: true })
  if (await cerrarGuia.count()) await cerrarGuia.first().click().catch(() => {})
  await page.waitForTimeout(300)
  await page.getByTestId('shell-mi-perfil').click()
  await expect(page.getByTestId('mi-cuenta-perfil')).toBeVisible({ timeout: 20000 })
  await expect(page.getByTestId('mi-cuenta-perfil').getByText('Hernán Acosta')).toBeVisible()
  await expect(page.getByTestId('mi-cuenta-sesiones').getByText('Sesión actual')).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/05-demo-mi-cuenta.png`, fullPage: true })
  await contexto.close()
})

test('mobile: Mi cuenta entra desde el menú lateral', async ({ browser }) => {
  test.skip(test.info().project.name !== 'admin', 'Captura mobile del dueño.')
  const contexto = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: 'e2e/.auth/admin.json' })
  const page = await contexto.newPage()

  await page.goto('/clientes')
  await page.getByRole('button', { name: 'Menú' }).first().click()
  await page.getByRole('dialog').getByTestId('shell-mi-perfil').click()
  await expect(page.getByTestId('mi-cuenta-perfil')).toBeVisible({ timeout: 20000 })
  await page.screenshot({ path: `${SHOTS}/04-mobile-mi-cuenta.png`, fullPage: true })
  await contexto.close()
})
