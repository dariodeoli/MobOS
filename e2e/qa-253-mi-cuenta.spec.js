// #253 → Mi cuenta: la superficie personal de cualquier rol (perfil/foto,
// nombre y correo, preferencias del dispositivo y sesiones propias), accesible
// desde el avatar. El dueño la ve además como pestaña de Configuración; el
// resto del equipo entra a /mi-cuenta (sin permisos de administración).
import { test, expect } from '@playwright/test'
import { pngSolido } from './helpers/png.js'

const SHOTS = process.env.MOBOS_CAPTURAS || 'test-results/QA-253-mi-cuenta'

// Sube una foto sólida por el camino real (adjunto → recorte → POST).
async function subirFoto(page, rgb) {
  await page.locator('[data-testid="mi-cuenta-perfil"] input[type="file"]').setInputFiles({
    name: 'foto.png',
    mimeType: 'image/png',
    buffer: pngSolido({ rgb }),
  })
  const usar = page.getByRole('button', { name: 'Usar esta foto' })
  await expect(usar).toBeEnabled({ timeout: 20000 })
  await usar.click()
}

test('el dueño abre Mi cuenta desde el avatar y ve perfil, preferencias y sesiones', async ({ page }) => {
  test.skip(test.info().project.name !== 'admin', 'Flujo del dueño.')

  await page.goto('/clientes')
  await page.getByTestId('shell-perfil').click()
  await expect(page).toHaveURL(/\/configuracion\/mi-cuenta/)

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

  // Deep link personal: para el dueño canoniza a su pestaña de Configuración.
  await page.goto('/mi-cuenta')
  await expect(page).toHaveURL(/\/configuracion\/mi-cuenta/)
  await expect(page.getByTestId('mi-cuenta-perfil')).toBeVisible()
})

test('el vendedor entra a su perfil personal desde el avatar', async ({ page }) => {
  test.skip(test.info().project.name !== 'seller', 'Flujo del vendedor.')

  await page.goto('/clientes')
  await page.getByTestId('shell-perfil').click()
  await expect(page).toHaveURL(/\/mi-cuenta$/)

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
  await page.getByTestId('shell-perfil').click()
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
  await page.getByRole('dialog').getByTestId('shell-perfil').click()
  await expect(page.getByTestId('mi-cuenta-perfil')).toBeVisible({ timeout: 20000 })
  await page.screenshot({ path: `${SHOTS}/04-mobile-mi-cuenta.png`, fullPage: true })
  await contexto.close()
})

// #271: la foto vieja se veía en TODA la app después de cambiarla o quitarla
// (caché por usuario sin invalidación + caché HTTP de URL fija). El chip del
// shell es otro avatar montado: se registra cada foto que pinta para comprobar
// que la anterior no reaparece mientras resuelve la nueva.
test('cambiar o quitar la foto actualiza todos los avatares sin recargar', async ({ page }) => {
  test.skip(test.info().project.name !== 'admin', 'Flujo del dueño.')

  await page.goto('/configuracion/mi-cuenta')
  const perfil = page.getByTestId('mi-cuenta-perfil')
  await expect(perfil).toBeVisible({ timeout: 20000 })
  const preview = perfil.locator('img[alt="Mi foto"]')

  await page.evaluate(() => {
    const raiz = [...document.querySelectorAll('[data-testid="shell-perfil"]')].find((el) => el.offsetParent !== null)
    window.__fotosChip = []
    const registrar = () => {
      const img = raiz?.querySelector('img')
      window.__fotosChip.push(img?.getAttribute('src') || '(iniciales)')
    }
    registrar()
    if (raiz) new MutationObserver(registrar).observe(raiz, { subtree: true, childList: true, attributes: true, attributeFilter: ['src'] })
  })
  const chip = page.getByTestId('shell-perfil').filter({ visible: true }).locator('img')

  await subirFoto(page, [220, 38, 38])
  await expect(preview).toBeVisible({ timeout: 20000 })
  const fotoRoja = String(await preview.getAttribute('src'))
  expect(fotoRoja).toMatch(/^data:image\//)
  await expect(chip).toHaveAttribute('src', fotoRoja, { timeout: 20000 })
  await page.screenshot({ path: `${SHOTS}/06-271-foto-subida.png` })

  // Reemplazo: no puede pintarse la roja mientras resuelve la azul.
  await page.evaluate(() => { window.__fotosChip = [] })
  await subirFoto(page, [37, 99, 235])
  await expect(preview).not.toHaveAttribute('src', fotoRoja, { timeout: 20000 })
  const fotoAzul = String(await preview.getAttribute('src'))
  await expect(chip).toHaveAttribute('src', fotoAzul, { timeout: 20000 })
  const vistas = await page.evaluate(() => window.__fotosChip)
  const desdeElCambio = vistas.slice(vistas.findIndex((vista) => vista !== fotoRoja))
  expect(desdeElCambio, `fotos pintadas: ${vistas.join(' | ')}`).not.toContain(fotoRoja)
  expect(vistas.at(-1)).toBe(fotoAzul)
  await page.screenshot({ path: `${SHOTS}/07-271-foto-reemplazada.png` })

  // Quitar: todos los avatares vuelven al placeholder neutro.
  await page.getByRole('button', { name: 'Quitar', exact: true }).click()
  await expect(preview).toHaveCount(0, { timeout: 20000 })
  await expect(page.getByTestId('shell-perfil').filter({ visible: true }).locator('img[src^="data:image"]')).toHaveCount(0, { timeout: 20000 })
  await page.screenshot({ path: `${SHOTS}/08-271-foto-quitada.png` })
})
