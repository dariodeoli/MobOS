// Config → Negocio · Seguro y límites (#162 · #241): guardado confiable con
// Enter (submit del form), estado Guardado/Error por grupo, persistencia real
// tras recargar y sin pisar lo editado en el otro grupo.
//
// El API exige reautenticación reciente para las acciones sensibles: el grupo
// pide la contraseña en el lugar y reintenta el guardado solo. La sesión del
// harness se comparte entre specs, así que si otra spec ya la verificó hace
// menos de 10 minutos el panel no aparece y el guardado va directo.
//
// Capturas: `QA_SEGURO_CAPTURAS` (default test-results/qa-seguro-limites) y
// `QA_SEGURO_FASE` (antes/despues) — se versionan en docs/qa/seguro-limites/.
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { SEED } from './helpers/seed-data.js'

const DIR = process.env.QA_SEGURO_CAPTURAS || join('test-results', 'qa-seguro-limites')
mkdirSync(DIR, { recursive: true })

async function abrirNegocio(page) {
  await page.goto('/configuracion/negocio')
  // El formulario se hidrata con la cuenta: se espera a que llegue.
  await expect(page.locator('#limite-gasto')).not.toHaveValue('', { timeout: 20_000 })
  await page.locator('#seguro-pct').scrollIntoViewIfNeeded()
}

const capturar = (page, nombre) => page.screenshot({ path: join(DIR, `seguro-limites-${nombre}${process.env.QA_SEGURO_FASE ? `-${process.env.QA_SEGURO_FASE}` : ''}.png`) })

// Si el API pidió reautenticación, verifica la contraseña en el grupo: el
// guardado sigue solo y los cambios del usuario no se pierden. La sesión del
// harness se comparte entre specs: si otra spec ya la verificó hace menos de
// 10 minutos, el guardado va directo y el panel no aparece.
async function confirmarPasswordSiHaceFalta(page, estadoTestId) {
  const panel = page.getByTestId(estadoTestId.replace(/-estado$/, '-reauth'))
  const estado = page.getByTestId(estadoTestId)
  await expect.poll(
    async () => (await panel.isVisible()) || /Guardado/.test((await estado.textContent()) || ''),
    { timeout: 20_000 },
  ).toBe(true)
  if (!(await panel.isVisible())) return
  await panel.scrollIntoViewIfNeeded()
  await capturar(page, 'reauth')
  await panel.getByLabel('Contraseña para guardar los cambios').fill(SEED.company.password)
  await panel.getByRole('button', { name: 'Verificar y guardar' }).click()
}

test('el seguro se guarda con Enter y persiste', async ({ page }) => {
  await abrirNegocio(page)
  await page.locator('#seguro-toggle').check({ force: true })
  await page.locator('#seguro-pct').fill('25')
  await page.locator('#seguro-pct').press('Enter')
  await page.waitForTimeout(700)
  await capturar(page, 'seguro-enter')
  await confirmarPasswordSiHaceFalta(page, 'seguro-estado')
  await expect(page.getByTestId('seguro-estado')).toContainText('Guardado', { timeout: 15_000 })
  await expect(page.getByTestId('seguro-reauth')).toBeHidden()
  await page.reload()
  await expect(page.locator('#seguro-pct')).toHaveValue('25', { timeout: 20_000 })
  await expect(page.locator('#seguro-toggle')).toBeChecked()
})

test('los límites se guardan con Enter y persisten', async ({ page }) => {
  await abrirNegocio(page)
  await page.locator('#limite-bajo-lista').fill('12')
  await page.locator('#limite-fidelizacion').fill('3')
  await page.locator('#limite-mora').fill('0,5')
  await page.locator('#limite-bajo-lista').press('Enter')
  await page.waitForTimeout(700)
  await capturar(page, 'limites-enter')
  await confirmarPasswordSiHaceFalta(page, 'limites-estado')
  await expect(page.getByTestId('limites-estado')).toContainText('Guardado', { timeout: 15_000 })
  await page.reload()
  await expect(page.locator('#limite-bajo-lista')).toHaveValue('12', { timeout: 20_000 })
  await expect(page.locator('#limite-fidelizacion')).toHaveValue('3')
  await expect(page.locator('#limite-mora')).toHaveValue('0,5')
})

test('guardar un grupo no pisa lo editado en el otro', async ({ page }) => {
  await abrirNegocio(page)
  await page.locator('#seguro-toggle').check({ force: true })
  await page.locator('#seguro-pct').fill('30')
  await page.locator('#limite-bajo-lista').fill('11')
  await page.locator('#limite-bajo-lista').press('Enter')
  await confirmarPasswordSiHaceFalta(page, 'limites-estado')
  await expect(page.getByTestId('limites-estado')).toContainText('Guardado', { timeout: 15_000 })
  // Lo editado del seguro sigue ahí: el guardado del otro grupo no lo pisó.
  await expect(page.locator('#seguro-pct')).toHaveValue('30')
  await page.locator('#seguro-pct').press('Enter')
  await expect(page.getByTestId('seguro-estado')).toContainText('Guardado', { timeout: 15_000 })
  await page.reload()
  await expect(page.locator('#seguro-pct')).toHaveValue('30', { timeout: 20_000 })
  await expect(page.locator('#limite-bajo-lista')).toHaveValue('11')
})

test('un valor inválido deja el grupo en Error y no lo guarda', async ({ page }) => {
  await abrirNegocio(page)
  const previo = await page.locator('#limite-bajo-lista').inputValue()
  await page.locator('#limite-bajo-lista').fill('12,5')
  await page.locator('#limite-bajo-lista').press('Enter')
  await page.waitForTimeout(500)
  await capturar(page, 'limites-error')
  await expect(page.getByTestId('limites-estado')).toContainText(/sin decimales/i, { timeout: 15_000 })
  await expect(page.getByTestId('limites-reauth')).toBeHidden()
  await page.reload()
  await expect(page.locator('#limite-bajo-lista')).toHaveValue(previo, { timeout: 20_000 })
})

// Limpieza: la suite comparte la tienda, así que el seguro y los límites
// vuelven a los valores de la tienda (los mismos del formulario sin guardar).
test('restaura los valores de la tienda al terminar', async ({ page }) => {
  await abrirNegocio(page)
  await page.locator('#seguro-toggle').uncheck({ force: true })
  await page.locator('#limite-gasto').fill('1000000')
  await page.locator('#limite-compra').fill('5000000')
  await page.locator('#limite-bajo-lista').fill('10')
  await page.locator('#limite-fidelizacion').fill('0')
  await page.locator('#limite-mora').fill('')
  await page.locator('#limite-bajo-lista').press('Enter')
  await confirmarPasswordSiHaceFalta(page, 'limites-estado')
  await expect(page.getByTestId('limites-estado')).toContainText('Guardado', { timeout: 15_000 })
  // El seguro apagado se guarda con el botón: el campo queda vacío.
  await page.getByRole('button', { name: 'Guardar seguro' }).click()
  await confirmarPasswordSiHaceFalta(page, 'seguro-estado')
  await expect(page.getByTestId('seguro-estado')).toContainText('Guardado', { timeout: 15_000 })
  await page.reload()
  await expect(page.locator('#seguro-pct')).toHaveValue('', { timeout: 20_000 })
  await expect(page.locator('#limite-bajo-lista')).toHaveValue('10')
})
