import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { openShellDestination } from '../helpers/shell-navigation.js'

// #408 unidad G: llegada de mercadería. Demo frontend-only (sin backend): se
// pegan las filas de la planilla, la grilla muestra los errores con su arreglo,
// se corrigen, el resumen se actualiza y «Confirmar llegada» se habilita.
const out = process.env.MOBOS_QA_OUT || '/tmp/mobos-llegada'

const FILAS = [
  '12/10/2026',
  '15 PRO 256GB NEGRO\t356938035643809\tIMPTEC\t980\tTUPI',
  '13 128GB BLANCO\t490154203237526\tDISESTE\t450',
  'AIRPODS PRO 2\tH2WK4PLM9Q\tMAYAPY\t180',
  '15 PRO 256GB TITANIO\t3,52793E+14\tDISESTE\t990',
  '12 128GB VERDE\t490154203237518\tIMPTEC\t300\tSE MANDA A CDE',
  '07/10/2026 · VOS PEDÍS',
  '14 128GB MEDIANOCHE\tCARGAR IMEI\tDISESTE\t600\tCARGAR IMEI',
].join('\n')

async function entrar(page) {
  await page.route('**/api/**', route =>
    !new URL(route.request().url()).pathname.startsWith('/api/')
      ? route.continue()
      : route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Frontend-only harness"}' }),
  )
  await page.route(/https:\/\//, route => route.abort())
  await page.addInitScript(() => sessionStorage.setItem('mobos:demo-guia-vista', '1'))
  await page.goto('/demo', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Entrar como Dueño', exact: true }).click()
  await expect(page.getByTestId('shell')).toBeVisible()
  await openShellDestination(page, 'Recepción')
  await page.getByTestId('recepcion-nueva-llegada').click()
  await expect(page.getByTestId('llegada-lote')).toBeVisible()
  // Sin cotización de referencia (el harness no tiene backend) se carga a mano.
  await page.getByLabel('Cotización USD a guaraníes').fill('7500')
}

async function pegar(page) {
  await page.getByTestId('llegada-pegado').fill(FILAS)
  await page.getByTestId('llegada-interpretar').click()
  await expect(page.getByTestId('llegada-fila')).toHaveCount(6)
}

const sinScrollHorizontal = page => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)

test('pegar las filas muestra los errores, se corrigen, el resumen se actualiza y se confirma', async ({ page }) => {
  await mkdir(out, { recursive: true })
  await page.setViewportSize({ width: 1280, height: 900 })
  await entrar(page)
  await pegar(page)

  // Bloques por fecha como se pegaron y confirmar bloqueado por los errores.
  await expect(page.getByTestId('llegada-bloque')).toHaveCount(2)
  await expect(page.getByTestId('llegada-confirmar')).toBeDisabled()
  await expect(page.getByTestId('llegada-errores')).toHaveText('2 errores por corregir')
  await expect(page.getByTestId('llegada-resumen-aOtraSucursal')).toContainText('1')
  await expect(page.getByTestId('llegada-resumen-faltaImei')).toContainText('1')
  const filaMala = page.getByTestId('llegada-fila').filter({ has: page.getByRole('alert') })
  await expect(filaMala).toHaveCount(1)
  await expect(filaMala).toContainText('IMEI perdido por Excel')
  // Fila densa de escritorio: 36–40 px (la 2.ª no tiene hallazgos debajo).
  const alto = (await page.getByTestId('llegada-fila').nth(1).boundingBox()).height
  expect(alto).toBeGreaterThanOrEqual(36)
  expect(alto).toBeLessThanOrEqual(40)
  await page.screenshot({ path: `${out}/01-errores-escritorio.png` })

  // Arreglo 1: corregir el IMEI. El resumen baja a un error y sigue bloqueado.
  await filaMala.getByLabel(/^IMEI o serie de la fila/).fill('490154203237534')
  await filaMala.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByTestId('llegada-errores')).toHaveText('1 error por corregir')
  await expect(page.getByTestId('llegada-confirmar')).toBeDisabled()

  // Arreglo 2: elegir el producto entre los del catálogo. Sin errores se habilita.
  await filaMala.getByRole('option', { name: /iPhone 15 Pro 256GB Titanio/ }).first().click()
  await expect(page.getByTestId('llegada-errores')).toHaveText('Sin errores')
  await expect(page.getByTestId('llegada-confirmar')).toBeEnabled()
  await expect(page.getByTestId('llegada-resumen-ingresaron')).toContainText('4')

  await page.getByTestId('llegada-confirmar').click()
  await expect(page.getByTestId('llegada-confirmada')).toBeVisible()
  await expect(page.getByTestId('llegada-imprimir')).toBeVisible()
  await expect(page.getByTestId('llegada-resumen-final')).toContainText('Llegada confirmada')
  const pendientes = page.getByTestId('llegada-imei-pendientes')
  await expect(pendientes).toContainText('IMEI pendientes')
  await page.screenshot({ path: `${out}/02-confirmada-escritorio.png` })

  // El IMEI faltante se completa en su misma fila.
  await pendientes.getByLabel(/^IMEI de/).fill('352793100006001')
  await pendientes.getByRole('button', { name: 'Cargar' }).click()
  await expect(pendientes.getByRole('alert')).toBeVisible()
  await pendientes.getByLabel(/^IMEI de/).fill('490154203237542')
  await pendientes.getByRole('button', { name: 'Cargar' }).click()
  await expect(pendientes).toHaveCount(0)
})

test('«el IMEI es correcto» solo aparece con 15 dígitos terminados en 000 que pasan Luhn', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await entrar(page)
  await pegar(page)
  const filaMala = page.getByTestId('llegada-fila').filter({ has: page.getByRole('alert') })
  const campo = filaMala.getByLabel(/^IMEI o serie de la fila/)
  await campo.fill('352793000000000')
  await expect(filaMala.getByRole('button', { name: 'El IMEI es correcto' })).toHaveCount(0)
  await campo.fill('352793100006000')
  await filaMala.getByRole('button', { name: 'Guardar' }).click()
  await expect(filaMala.getByRole('button', { name: 'El IMEI es correcto' })).toBeVisible()
  await filaMala.getByRole('button', { name: 'El IMEI es correcto' }).click()
  await expect(filaMala.getByText('IMEI perdido por Excel')).toHaveCount(0)
})

test('en 390 px cada fila es una tarjeta, sin scroll horizontal y el pegado sigue funcionando', async ({ page }) => {
  await mkdir(out, { recursive: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await entrar(page)
  expect(await sinScrollHorizontal(page)).toBe(true)
  await pegar(page)
  expect(await sinScrollHorizontal(page)).toBe(true)
  await expect(page.getByTestId('llegada-confirmar')).toBeVisible()
  await expect(page.getByTestId('llegada-confirmar')).toBeDisabled()
  const caja = await page.getByTestId('llegada-confirmar').boundingBox()
  expect(caja.height).toBeGreaterThanOrEqual(44)
  await page.screenshot({ path: `${out}/03-movil.png` })
})

test('tema oscuro: la grilla y el resumen se leen', async ({ page }) => {
  await mkdir(out, { recursive: true })
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.setViewportSize({ width: 1280, height: 900 })
  await entrar(page)
  await pegar(page)
  await page.screenshot({ path: `${out}/04-oscuro.png` })
})
