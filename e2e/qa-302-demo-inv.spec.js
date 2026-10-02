// #302 · Demo completa de INV: ninguna ruta visible queda vacía ni con
// «Página no encontrada». Delivery y Abastecimiento se apoyan en los fixtures
// de #324; acá se verifica que cada pantalla abra con su título correcto y con
// datos ficticios reales (no un error de página ni un listado mudo).
// Corre en el demo anónimo del Dueño. Evidencia en docs/qa/302-demo-inv/.
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { cerrarGuiaDemo } from './helpers/demo.js'

const DIR = join('docs', 'qa', '302-demo-inv')

const RUTAS = [
  ['delivery', '/delivery', 'Delivery', 'reparto-admin-pedido'],
  ['compras-centro', '/compras-centro', 'Compras del Centro', 'compra-centro-fila'],
  ['preparar-lote', '/preparar-lote', 'Preparar lote', 'preparar-lote-fila'],
  ['abastecimiento', '/abastecimiento', 'Por comprar', 'por-comprar'],
  ['preparacion', '/preparacion', 'Preparar compra', 'preparar-compra-fila'],
  ['recepcion', '/recepcion', 'Recepción', 'recepcion-llegada'],
  ['metricas', '/metricas', 'Métricas de abastecimiento', 'metricas-resumen'],
]

async function entrarDemo(page) {
  await page.goto('/demo')
  await page.getByRole('button', { name: /Entrar como Dueño/ }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'))
  await cerrarGuiaDemo(page)
}

test('#302 · ninguna ruta de INV queda vacía ni con título de página inexistente', async ({ page }) => {
  mkdirSync(DIR, { recursive: true })
  await page.setViewportSize({ width: 1280, height: 900 })
  await entrarDemo(page)

  for (const [archivo, ruta, titulo, testid] of RUTAS) {
    await page.goto(ruta)
    // El título lo resuelve metadataPolicy: «Compras del Centro» y «Preparar
    // lote» caían al aviso de página inexistente aunque la pantalla existía.
    await expect(page).toHaveTitle(`${titulo} · MobOS`)
    await expect(page.getByRole('heading', { name: titulo, level: 1 })).toBeVisible()
    // La pantalla abre con su contenido (fixtures del demo), nunca vacía.
    await expect(page.getByTestId(testid).first()).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('Página no encontrada')).toHaveCount(0)
    await page.screenshot({ path: join(DIR, `${archivo}-1280-light.png`) })
  }

  // Delivery además se revisa en móvil: no desborda y muestra sus repartos.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/delivery')
  await expect(page.getByTestId('reparto-admin-pedido').first()).toBeVisible({ timeout: 20_000 })
  const desborde = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(desborde, `delivery móvil desborda ${desborde} px`).toBeLessThanOrEqual(1)
  await page.screenshot({ path: join(DIR, 'delivery-390-light.png') })
})

test('#302 · Delivery y Abastecimiento abren con los fixtures del demo (#324)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await entrarDemo(page)

  // Delivery: pedidos asignados al repartidor ficticio, con saldo por cobrar.
  await page.goto('/delivery')
  await page.getByRole('button', { name: 'Asignados', exact: true }).click()
  const reparto = page.locator('[data-testid="reparto-admin-pedido"][data-pedido="AUR-0005"]')
  await expect(reparto).toBeVisible()
  await expect(reparto).toContainText('Juan Pereira')
  await expect(reparto).toContainText('Falta cobrar')

  // Abastecimiento: las mismas compras, lotes y recepciones ficticias en cada
  // pantalla (una sola fuente de la que cuelgan todas).
  await page.goto('/abastecimiento')
  await expect(page.getByText('iPhone 15 Pro 256GB Titanio').first()).toBeVisible()
  await page.goto('/compras-centro')
  await expect(page.getByText('CMP-AUR-0001').first()).toBeVisible()
  await page.goto('/preparacion')
  await expect(page.getByText('CMP-AUR-0001').first()).toBeVisible()
  await page.goto('/preparar-lote')
  await expect(page.getByText('LOTE-AUR-0001').first()).toBeVisible()
  await page.goto('/recepcion')
  await expect(page.getByTestId('recepcion-llegada').first()).toBeVisible()
  await page.goto('/metricas')
  await expect(page.getByTestId('metricas-proveedores-tabla')).toBeVisible()
})
