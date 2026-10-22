import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { openShellDestination } from '../helpers/shell-navigation.js'
import { entrarDemoComo } from '../helpers/demo.js'

// Verificación de stock («¿está físicamente?») · Stock › Control › Verificación.
// Demo frontend-only: el inventario y las sesiones salen del store demo.
const out = process.env.MOBOS_VERIF_OUT || '/tmp/mobos-verificacion'

async function enterDemo(page, role = 'Dueño') {
  await page.route('**/api/**', route =>
    !new URL(route.request().url()).pathname.startsWith('/api/')
      ? route.continue()
      : route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Frontend-only harness"}' }),
  )
  await page.route(/https:\/\//, route => route.abort())
  await page.addInitScript(() => sessionStorage.setItem('mobos:demo-guia-vista', '1'))
  await page.goto('/demo', { waitUntil: 'domcontentloaded' })
  await entrarDemoComo(page, role)
  await expect(page.getByTestId('shell')).toBeVisible()
}

async function abrirVerificacion(page) {
  await openShellDestination(page, 'Control')
  await page.getByTestId('subtabs-inventario').getByRole('tab', { name: /^Verificación/ }).click()
  await expect(page.getByTestId('verificacion-tab')).toBeVisible()
}

const sinScrollHorizontal = async (page) => {
  const sobra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(sobra, 'sin scroll horizontal').toBeLessThanOrEqual(0)
}

for (const [ancho, alto] of [[390, 844], [1440, 900]]) {
  test(`Verificación ${ancho} · iniciar, escanear, tildar, inesperada y terminar con historial`, async ({ page }) => {
    await mkdir(out, { recursive: true })
    await page.setViewportSize({ width: ancho, height: alto })
    await enterDemo(page)
    await abrirVerificacion(page)
    // La demo trae verificaciones previas en el historial: la nueva suma una más.
    const previas = await page.getByTestId('verif-historial-fila').count()
    await page.getByTestId('verif-iniciar').click()
    await expect(page.getByTestId('verif-sesion')).toBeVisible()
    const contador = page.getByTestId('verif-contador')
    await expect(contador).toHaveText(/^0\/\d+$/)
    const total = Number((await contador.innerText()).split('/')[1])
    expect(total).toBeGreaterThan(2)

    // 1) Pendientes: tildar la primera fila verifica esa unidad.
    await page.getByTestId('verif-tildar').first().click()
    await expect(contador).toHaveText(new RegExp(`^1/${total}$`))
    await expect(page.getByTestId('verif-estado')).toContainText('verificado')

    // 2) Escanear el IMEI de otra pendiente con el lector (tipeo + Enter).
    const serial = await page.getByTestId('verif-lista').getByTestId('verif-fila').first().getAttribute('data-serial')
    await page.getByTestId('verif-entrada').fill(serial)
    await page.getByTestId('verif-entrada').press('Enter')
    await expect(contador).toHaveText(new RegExp(`^2/${total}$`))
    // El mismo IMEI dos veces avisa y no suma.
    await page.getByTestId('verif-entrada').fill(serial)
    await page.getByTestId('verif-entrada').press('Enter')
    await expect(page.getByTestId('verif-estado')).toContainText('ya estaba escaneado')
    await expect(contador).toHaveText(new RegExp(`^2/${total}$`))

    // 3) Un código ajeno no se carga; un IMEI que no figura queda como inesperado.
    await page.getByTestId('verif-entrada').fill('https://ejemplo.com/x?y=1')
    await page.getByTestId('verif-entrada').press('Enter')
    await expect(page.getByTestId('verif-estado')).toContainText('IMEI ni un producto')
    await page.getByTestId('verif-entrada').fill('359999999999999')
    await page.getByTestId('verif-entrada').press('Enter')
    await expect(page.getByTestId('verif-estado')).toContainText('inesperada')
    await page.getByTestId('verif-vista-inesperadas').click()
    await expect(page.getByTestId('verif-fila')).toHaveCount(1)
    await page.getByTestId('verif-vista-verificadas').click()
    await expect(page.getByTestId('verif-fila')).toHaveCount(2)
    await sinScrollHorizontal(page)
    if (ancho === 390) await page.screenshot({ path: `${out}/verificacion-390.png` })

    // 4) Terminar guarda el resumen en el historial.
    await page.getByTestId('verif-terminar').click()
    await page.getByRole('button', { name: 'Terminar y guardar' }).click()
    await expect(page.getByTestId('verif-historial-fila')).toHaveCount(previas + 1)
    const fila = page.getByTestId('verif-historial-fila').first()
    await expect(fila).toContainText('Terminada')
    await expect(fila).toContainText(`2/${total} verificadas`)
    await expect(fila).toContainText('1 inesperadas')
    await sinScrollHorizontal(page)
    if (ancho === 1440) await page.screenshot({ path: `${out}/verificacion-1440.png` })
  })
}

test('Planilla · el check de la fila se puede deshacer durante el primer minuto', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await enterDemo(page)
  await openShellDestination(page, 'Unidades')
  await expect(page.locator('main[aria-busy="true"]')).toHaveCount(0)
  await page.getByTestId('vista-unidades-planilla').click()
  await expect(page.getByTestId('planilla-unidades')).toBeVisible()
  const chip = page.getByTestId('filtro-sucursal-abrir')
  if (await chip.count()) { await chip.click(); await page.getByTestId('filtro-sucursal-todos').click() }
  const sin = page.locator('[data-testid="planilla-verificado"][data-verificada="false"]').first()
  await sin.getByTestId('planilla-verificar').click()
  const hecha = page.locator('[data-testid="planilla-verificado"]').filter({ has: page.getByTestId('planilla-deshacer') }).first()
  await expect(hecha).toHaveAttribute('data-verificada', 'true')
  await hecha.getByTestId('planilla-deshacer').click()
  await expect(page.getByTestId('planilla-deshacer')).toHaveCount(0)
})
