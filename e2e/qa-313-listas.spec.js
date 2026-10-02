// #313 — Pedidos y Clientes: códigos humanos, una acción principal y listas
// legibles en móvil (auditoría demo v1.0.209).
//
// Verifica:
//  · Pedidos muestra el código humano (AUR-#0001) y nunca el id interno.
//  · Clientes: una acción visible (resumen rápido) + el resto en «…»; los
//    montos quedan a la derecha y no pisan los accesos.
//  · En móvil (390) las dos listas son tarjetas, sin scroll horizontal.
//  · La vista rápida no repite el detalle ni del cliente ni del pedido.
// Capturas: MOBOS_CAPTURAS=docs/QA-313-listas npx playwright test e2e/qa-313-listas.spec.js
import { test, expect } from '@playwright/test'
import { cerrarGuiaDemo } from './helpers/demo.js'

const SHOTS = process.env.MOBOS_CAPTURAS || 'test-results/QA-313-listas'

async function abrirDemo(page) {
  await page.goto('/demo')
  await page.getByRole('button', { name: /Vendedor/ }).first().click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'))
  await cerrarGuiaDemo(page)
}

async function abrirClientes(page) {
  await page.goto('/clientes')
  await page.getByTestId('cliente-fila').first().waitFor({ timeout: 20_000 })
}

async function abrirPedidos(page) {
  await page.goto('/pedidos')
  await page.getByTestId('pedido-fila').first().waitFor({ timeout: 20_000 })
}

async function capturarClientes(page, prefijo, { movil = false } = {}) {
  await abrirClientes(page)
  await page.screenshot({ path: `${SHOTS}/${prefijo}-01-clientes.png` })

  const fila = page.getByTestId('cliente-fila').filter({ hasText: 'Lucía Fernández' }).first()
  const mas = fila.getByRole('button', { name: 'Más acciones de Lucía Fernández' })
  await expect(mas).toBeVisible()
  if (!movil) {
    // Una sola acción visible (el ojito) + el disparador del «…».
    await expect(fila.getByRole('button')).toHaveCount(2)
    await expect(fila.getByRole('button', { name: 'Resumen rápido de Lucía Fernández' })).toHaveCount(1)
    await expect(page.getByRole('menuitem')).toHaveCount(0)
  }
  await mas.click()
  await expect(page.getByRole('menuitem', { name: 'Ver detalle completo de Lucía Fernández' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Enviar WhatsApp a Lucía Fernández' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Elegir plantilla de WhatsApp para Lucía Fernández' })).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/${prefijo}-02-clientes-menu.png` })
  await page.keyboard.press('Escape')

  // Vista rápida: contacto + tres cifras + acciones; sin repetir la ficha.
  await fila.getByRole('button', { name: 'Resumen rápido de Lucía Fernández' }).click()
  const popup = page.getByRole('dialog').filter({ hasText: 'Total gastado' })
  await popup.waitFor({ timeout: 10_000 })
  await expect(popup.getByText('Últimas compras')).toHaveCount(0)
  await expect(popup.getByText('Nota interna')).toHaveCount(0)
  await expect(popup.getByRole('button', { name: 'Ver detalle completo' })).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/${prefijo}-03-cliente-popup.png` })
  await popup.getByRole('button', { name: 'Cerrar', exact: true }).click()
}

async function capturarPedidos(page, prefijo, { movil = false } = {}) {
  await abrirPedidos(page)
  const tabla = page.getByTestId('pedidos-tabla')
  // Código humano: nunca el id interno de la demo.
  await expect(tabla).not.toContainText('demo-venta')
  await expect(tabla).toContainText(/AUR-#\d{4}/)
  await page.screenshot({ path: `${SHOTS}/${prefijo}-04-pedidos.png` })

  // Vista rápida: resumen + acceso al detalle, sin las secciones largas.
  await page.getByTestId('pedido-fila').first().getByRole('button', { name: /Vista rápida de/ }).click()
  const panel = page.getByTestId('pedido-vista-rapida')
  await expect(panel).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Ver pedido completo' })).toBeVisible()
  await expect(panel.getByText('Artículos preparados')).toHaveCount(0)
  await expect(panel.getByText('Cronología')).toHaveCount(0)
  await page.screenshot({ path: `${SHOTS}/${prefijo}-05-pedido-panel.png` })
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click()
  if (!movil) await expect(page.getByTestId('pedido-vista-rapida')).toHaveCount(0)
}

test('listas: códigos humanos, una acción y montos alineados (claro)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await abrirDemo(page)

  // Clientes: los montos cierran a la derecha en su columna y no pisan los
  // accesos (#313); antes el ojito y el WhatsApp se montaban sobre la deuda.
  await abrirClientes(page)
  const medidas = await page.getByTestId('clientes-tabla').evaluate((tabla) => {
    const filas = [...tabla.querySelectorAll('[data-testid="cliente-fila"]')]
    const borde = (fila, indice) => {
      const celda = fila.children[indice]
      const contenido = celda.querySelector('span') || celda
      return Math.round(contenido.getBoundingClientRect().right)
    }
    const totales = filas.map((fila) => borde(fila, 4))
    const deudas = filas.map((fila) => borde(fila, 6))
    const sinSolape = filas.every((fila) => {
      const deuda = fila.children[6].getBoundingClientRect()
      const acciones = fila.children[7].getBoundingClientRect()
      return deuda.right <= acciones.left + 1
    })
    return { totales, deudas, sinSolape }
  })
  expect(new Set(medidas.totales).size, `montos desalineados: ${medidas.totales}`).toBe(1)
  expect(new Set(medidas.deudas).size, `deudas desalineadas: ${medidas.deudas}`).toBe(1)
  expect(medidas.sinSolape, 'los accesos pisan la columna de deuda').toBe(true)

  await capturarClientes(page, 'claro')
  await capturarPedidos(page, 'claro')
})

test('listas: códigos humanos y acciones en oscuro', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.addInitScript(() => localStorage.setItem('mobos:theme', 'dark'))
  await abrirDemo(page)
  await capturarClientes(page, 'oscuro')
  await capturarPedidos(page, 'oscuro')
})

test('listas: tarjetas en móvil sin scroll horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await abrirDemo(page)

  await abrirClientes(page)
  // La lista es de tarjetas: una por cliente, con su total y deuda.
  const tarjeta = page.getByTestId('cliente-fila').first()
  await expect(tarjeta).toContainText('Total gastado')
  await expect(tarjeta).toContainText('Deuda')
  const scrollClientes = await page.getByTestId('clientes-tabla').evaluate((nodo) => nodo.scrollWidth - nodo.clientWidth)
  expect(scrollClientes, 'la lista de clientes no debe scrollear en horizontal').toBeLessThanOrEqual(0)

  await capturarClientes(page, 'movil', { movil: true })

  await abrirPedidos(page)
  await expect(page.getByTestId('pedido-fila').first()).toContainText(/AUR-#\d{4}/)
  const scrollPedidos = await page.getByTestId('pedidos-tabla').evaluate((nodo) => nodo.scrollWidth - nodo.clientWidth)
  expect(scrollPedidos, 'la lista de pedidos no debe scrollear en horizontal').toBeLessThanOrEqual(0)
  const scrollDocumento = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(scrollDocumento, 'la página no debe scrollear en horizontal').toBeLessThanOrEqual(0)

  await capturarPedidos(page, 'movil', { movil: true })
})
