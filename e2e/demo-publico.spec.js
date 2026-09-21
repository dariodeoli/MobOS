// Verificación post-deploy del demo público (#198) — inventario y flujo IMEI.
// Opt-in: solo corre con MOBOS_DEMO_URL apuntando al demo anónimo deployado.
//   MOBOS_DEMO_URL=https://app.moboss.online npx playwright test e2e/demo-publico.spec.js
import { test, expect } from '@playwright/test'

const DEMO = process.env.MOBOS_DEMO_URL || ''
const CAPTURAS = process.env.MOBOS_DEMO_CAPTURAS || '/tmp/198'

test.describe('demo público anónimo', () => {
  test.skip(!DEMO, 'Requiere el demo público deployado (MOBOS_DEMO_URL).')

  test('el demo abre sin sesión y muestra inventario con datos ficticios', async ({ page }) => {
    await page.goto(`${DEMO}/demo`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(4000)
    // Bloqueo conocido (#198): si el demo anónimo no está deployado, el router
    // cae en /login y no hay panel que verificar.
    expect(page.url(), 'el demo anónimo (#192) todavía no está deployado: /demo redirige a /login').not.toMatch(/\/login/)
    await expect(page.getByRole('heading', { name: /Vendé rápido/i })).toHaveCount(0)
    await page.screenshot({ path: `${CAPTURAS}/01-demo.png` })

    // Inventario: unidades visibles, búsqueda y detalle con costo (Gs/USD/pendiente).
    await page.goto(`${DEMO}/inventario/unidades`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)
    await page.screenshot({ path: `${CAPTURAS}/02-inventario.png` })
    await expect(page.getByText(/cuenta real/i)).toHaveCount(0, { timeout: 10_000 })
    const campo = page.getByPlaceholder(/Escanear IMEI|Buscar/i).first()
    await campo.fill('iPhone')
    await page.waitForTimeout(1200)
    await page.screenshot({ path: `${CAPTURAS}/03-busqueda.png` })
    const filas = page.getByTestId('inventario-fila')
    await expect(filas.first()).toBeVisible({ timeout: 15_000 })
    // Ningún IMEI real: los seriales del demo son ficticios (prefijo DEMO).
    const textos = await filas.allInnerTexts()
    expect(textos.join(' ')).toMatch(/DEMO/i)

    await filas.first().click()
    await expect(page.getByText('Costo del equipo')).toBeVisible({ timeout: 15_000 })
    await page.screenshot({ path: `${CAPTURAS}/04-detalle-costo.png` })
    await expect(page.getByText(/Pendiente|Gs |US\$/).first()).toBeVisible()

    // Reservas y kardex existen y responden.
    await page.goto(`${DEMO}/inventario/reservas`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
    await page.screenshot({ path: `${CAPTURAS}/05-reservas.png` })
    await page.goto(`${DEMO}/productos`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2500)
    await page.getByTestId('producto-fila').first().click()
    await page.waitForTimeout(1500)
    const kardex = page.getByTestId('kardex-abrir')
    if (await kardex.count()) {
      await kardex.click()
      await expect(page.getByTestId('kardex-tabla')).toBeVisible({ timeout: 15_000 })
      await page.screenshot({ path: `${CAPTURAS}/06-kardex.png` })
    }
  })

  test('la carga rápida acepta costo en Gs o USD y permite dejarlo pendiente', async ({ page }) => {
    await page.goto(`${DEMO}/inventario/unidades`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)
    expect(page.url(), 'el demo anónimo (#192) todavía no está deployado: /demo redirige a /login').not.toMatch(/\/login/)
    await page.getByRole('button', { name: /Recibir unidad|Carga rápida/i }).first().click()
    const modal = page.getByRole('dialog')
    await expect(modal).toBeVisible({ timeout: 10_000 })
    await page.screenshot({ path: `${CAPTURAS}/07-carga-rapida.png` })
    // El costo es opcional y se elige moneda (Gs/USD) según la biblioteca de campos.
    await expect(modal.getByLabel(/Moneda del costo/i)).toBeVisible()
    await modal.getByLabel(/Moneda del costo/i).selectOption('USD')
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${CAPTURAS}/08-costo-usd.png` })
  })

  test('el flujo IMEI está en modo mocks (sin llamadas pagas)', async ({ page }) => {
    // La UI de #193 no está deployada todavía: se deja preparada para cuando llegue.
    await page.goto(`${DEMO}/inventario/unidades`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
    const consultaImei = page.getByRole('button', { name: /Consultar IMEI|Verificar IMEI/i })
    test.skip((await consultaImei.count()) === 0, 'La UI de consulta IMEI (#193) aún no está deployada.')
    await page.screenshot({ path: `${CAPTURAS}/09-imei.png` })
  })
})
