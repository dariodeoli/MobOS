// #301 · Sistema y Auditoría: coherencia de datos y lectura humana.
//
// - El resumen de chequeos coincide con la lista (y explica si no hay datos).
// - Los errores de 24 h y los problemas de impresión salen de la misma fuente
//   que sus contadores (con «y N más» cuando la lista se recorta).
// - AEX sin credenciales lo dice en vez de parecer «en orden».
// - La auditoría no repite «Inventario», marca la severidad y esconde los
//   identificadores técnicos (ID de petición, huellas, URLs) en «Detalles
//   técnicos», con etiquetas legibles.
//
// Capturas: MOBOS_301_CAPTURAS=docs/qa/301-sistema-auditoria \
//   npx playwright test e2e/qa-301-sistema-auditoria.spec.js
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const SALIDA = process.env.MOBOS_301_CAPTURAS || ''

async function capturar(page, nombre) {
  if (!SALIDA) return
  mkdirSync(SALIDA, { recursive: true })
  await page.screenshot({ path: join(SALIDA, `${nombre}.png`), fullPage: true })
}

test('#301 · Sistema: los contadores coinciden con sus listas', async ({ page }) => {
  await page.goto('/configuracion/sistema')
  const resumen = page.getByTestId('sistema-resumen-chequeos')
  await expect(resumen).toContainText(/\d+ chequeos? ·/, { timeout: 20_000 })
  // El resumen arranca en «0 chequeos · comprobando…»: esperar a que la lista
  // de chequeos cargue antes de comparar el número con las filas.
  await expect(page.getByTestId('sistema-chequeo').first()).toBeVisible({ timeout: 20_000 })

  // El número del encabezado es exactamente la cantidad de filas de chequeos.
  const texto = (await resumen.textContent()) || ''
  const cantidad = Number((texto.match(/^(\d+)/) || [])[1] || 0)
  await expect(page.getByTestId('sistema-chequeo')).toHaveCount(cantidad)

  // Errores de las últimas 24 h: el badge no puede contradecir la lista.
  const errores = page.locator('div.rounded-xl.border.border-ink-600.p-3').filter({ hasText: 'Errores recientes' })
  if (await errores.count()) {
    const badge = Number(((await page.getByTestId('errores-recientes').textContent()) || '0').trim())
    const filas = await errores.locator('li').count()
    if (badge > filas) {
      await expect(page.getByTestId('errores-y-mas')).toContainText(`y ${badge - filas} más`)
    } else {
      expect(filas).toBeLessThanOrEqual(badge)
    }
  }

  // AEX sin credenciales se avisa; con credenciales (CI) no se inventa nada.
  const sinClaves = page.getByText('Faltan las claves de AEX')
  if (await sinClaves.count()) await expect(sinClaves).toBeVisible()
  await capturar(page, '01-sistema-coherente')
})

test('#301 · Auditoría: sin filtro duplicado, con severidad y detalles técnicos', async ({ page }) => {
  await page.goto('/configuracion/historial')
  const area = page.getByLabel('Filtrar por área')
  await expect(area).toBeVisible({ timeout: 20_000 })

  // El filtro separa las dos entidades de inventario; ya no hay dos «Inventario».
  await expect(area.locator('option[value="InventoryUnit"]')).toHaveText('Inventario · unidades')
  await expect(area.locator('option[value="Product"]')).toHaveText('Inventario · productos')
  await expect(area.locator('option', { hasText: /^Inventario$/ })).toHaveCount(0)

  const fila = page.getByTestId('auditoria-fila').first()
  await expect(fila).toBeVisible()
  // Severidad visible para el ojo del dueño.
  await expect(fila).toHaveAttribute('data-severidad', /^(alta|media|info)$/)

  // La fila expandida esconde la jerga técnica en un desplegable etiquetado.
  // No todas las acciones traen metadata: se busca la primera que sí.
  const filas = page.getByTestId('auditoria-fila')
  const total = await filas.count()
  let encontrada = false
  for (let i = 0; i < Math.min(total, 10); i += 1) {
    const candidata = filas.nth(i)
    await candidata.click()
    if (await page.getByTestId('auditoria-detalles').count()) { encontrada = true; break }
    await candidata.click()
  }
  expect(encontrada, 'alguna fila de la auditoría trae metadata').toBe(true)
  const detalles = page.getByTestId('auditoria-detalles')
  await expect(detalles).toBeVisible()
  await expect(detalles.getByText('Detalles técnicos')).toBeVisible()
  // El bloque arranca plegado: se abre para ver los campos etiquetados y el JSON.
  await detalles.getByText('Detalles técnicos').click()
  await expect(detalles.getByText('JSON crudo')).toBeVisible()
  // Los campos del metadata se leen con etiqueta (sin claves crudas).
  const etiquetas = (await detalles.locator('dt').allTextContents()).map((texto) => texto.replace(/:$/, '').trim())
  expect(etiquetas.length).toBeGreaterThan(0)
  for (const crudo of ['requestId', 'serial', 'url']) expect(etiquetas).not.toContain(crudo)
  await capturar(page, '02-auditoria-legible')
})
