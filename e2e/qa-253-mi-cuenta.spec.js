// #253 → Mi cuenta: la superficie personal de cualquier rol (perfil/foto,
// nombre y correo, preferencias del dispositivo y sesiones propias), accesible
// desde el avatar. El dueño la ve además como pestaña de Configuración; el
// resto del equipo entra a /mi-cuenta (sin permisos de administración).
import { test, expect } from '@playwright/test'
import { pngSolido } from './helpers/png.js'

const SHOTS = process.env.MOBOS_CAPTURAS || 'test-results/QA-253-mi-cuenta'
const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`

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
  // La foto puede existir de una corrida anterior: se espera el cambio real.
  const previa = (await preview.count()) ? String(await preview.getAttribute('src')) : ''
  if (previa) await expect(preview).not.toHaveAttribute('src', previa, { timeout: 20000 })
  await expect(preview).toHaveAttribute('src', /^data:image\//, { timeout: 20000 })
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
  expect(vistas.at(-1), `fotos pintadas: ${vistas.length} ${vistas.map((vista) => vista.slice(0, 24)).join(' | ')}`).toBe(fotoAzul)
  await page.screenshot({ path: `${SHOTS}/07-271-foto-reemplazada.png` })

  // Quitar: todos los avatares vuelven al placeholder neutro.
  await page.getByRole('button', { name: 'Quitar', exact: true }).click()
  await expect(preview).toHaveCount(0, { timeout: 20000 })
  await expect(page.getByTestId('shell-perfil').filter({ visible: true }).locator('img[src^="data:image"]')).toHaveCount(0, { timeout: 20000 })
  await page.screenshot({ path: `${SHOTS}/08-271-foto-quitada.png` })
})

// #271 (reporte de Dario): al recargar la pantalla de bloqueo se veía la foto
// anterior por ~1 segundo. La identidad de la empresa vive en el espejo local
// (`owncoding_hub_company_context.profile.picture`, la foto de Google) y el
// avatar la pintaba mientras la foto subida resolvía. Esta prueba deja una foto
// de Google vieja en ese espejo y verifica que al recargar el bloqueo **nunca**
// se pinte: placeholder neutro y después la foto actual.
test('al recargar el bloqueo no se pinta la foto anterior', async ({ page }) => {
  test.skip(test.info().project.name !== 'admin', 'Flujo del dueño.')

  await page.goto('/configuracion/mi-cuenta')
  const perfil = page.getByTestId('mi-cuenta-perfil')
  await expect(perfil).toBeVisible({ timeout: 20000 })
  const preview = perfil.locator('img[alt="Mi foto"]')
  const previa = (await preview.count()) ? await preview.getAttribute('src') : ''

  await subirFoto(page, [16, 185, 129])
  // La foto puede existir de una corrida anterior: se espera el cambio real.
  if (previa) await expect(preview).not.toHaveAttribute('src', previa, { timeout: 20000 })
  await expect(preview).toHaveAttribute('src', /^data:image\//, { timeout: 20000 })
  const foto = String(await preview.getAttribute('src'))
  expect(foto).toMatch(/^data:image\//)

  await page.evaluate(() => {
    const CLAVE = 'owncoding_hub_company_context'
    const contexto = JSON.parse(localStorage.getItem(CLAVE) || '{}')
    contexto.profile = { ...(contexto.profile || { name: 'Administrador' }), picture: 'https://foto-vieja.invalid/ana.png' }
    localStorage.setItem(CLAVE, JSON.stringify(contexto))
  })

  // Registra cada foto que un avatar llega a pintar, desde el primer render del
  // documento que sigue (la recarga): el sondeo arranca antes que el bundle y no
  // se pierde el primer pintado.
  await page.addInitScript(() => {
    window.__fotosPintadas = []
    const registrar = () => {
      document.querySelectorAll('img[alt^="Foto de"]').forEach((img) => {
        const src = img.getAttribute('src') || ''
        if (src && !window.__fotosPintadas.includes(src)) window.__fotosPintadas.push(src)
      })
    }
    registrar()
    const observar = () => {
      registrar()
      if (!window.__observandoFotos && document.documentElement) {
        window.__observandoFotos = true
        new MutationObserver(registrar).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['src'] })
      }
    }
    observar()
    const timer = setInterval(observar, 10)
    setTimeout(() => clearInterval(timer), 15000)
    document.addEventListener('DOMContentLoaded', observar)
  })

  await page.getByTestId('shell-bloquear').click()
  await expect(page.getByTestId('pantalla-bloqueada')).toBeVisible()
  await page.reload()

  const bloqueo = page.getByTestId('pantalla-bloqueada')
  await expect(bloqueo).toBeVisible({ timeout: 20000 })
  await expect(bloqueo.locator('img[alt^="Foto de"]')).toHaveAttribute('src', foto, { timeout: 20000 })
  await page.screenshot({ path: `${SHOTS}/09-271-bloqueo-recarga.png` })

  const pintadas = await page.evaluate(() => window.__fotosPintadas)
  expect(pintadas, `fotos pintadas: ${pintadas.join(' | ')}`).not.toContain('foto-vieja.invalid')
  expect(pintadas, `fotos pintadas: ${pintadas.join(' | ')}`).toContain(foto)
  expect(pintadas.filter((src) => src.startsWith('http')), `se pintaron fotos externas: ${pintadas.join(' | ')}`).toEqual([])

  // Limpieza: la foto de la prueba no queda en la base.
  await page.evaluate(async (api) => {
    const me = await (await fetch(`${api}/api/auth/me`, { credentials: 'include' })).json()
    const id = me?.user?.id
    if (id) await fetch(`${api}/api/users/${encodeURIComponent(id)}/avatar`, { method: 'DELETE', credentials: 'include' })
  }, API)
})
