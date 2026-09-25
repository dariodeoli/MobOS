// #250 · Adopción del buscador dependiente (modelo → capacidad → color) en Stock
// y Compras: la búsqueda usa el objeto de la biblioteca (ProductCombobox, CMP) y
// el alta resuelve las dependencias con el catálogo compartido (lib/catalog.js).
// El SKU único lo hace el servidor; la pantalla no duplica lógica de catálogo.
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { SEED } from './helpers/seed-data.js'

const API = SEED.api
const SHOTS = process.env.MOBOS_CAPTURAS || 'test-results/qa-250-buscador'
const marca = () => `BD${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`.toUpperCase()

async function limpiarProducto(page, nombre) {
  try {
    await page.evaluate(async ({ api, nombre }) => {
      const filas = await fetch(`${api}/api/products?q=${encodeURIComponent(nombre)}`, { credentials: 'include' }).then((r) => r.json()).catch(() => [])
      const productos = Array.isArray(filas) ? filas : filas?.products || []
      for (const producto of productos) {
        if (!String(producto.name || '').includes(nombre)) continue
        await fetch(`${api}/api/products?id=${encodeURIComponent(producto.id)}`, { method: 'DELETE', credentials: 'include' }).catch(() => {})
      }
    }, { api: API, nombre })
  } catch { /* limpieza best-effort */ }
}

test('Stock: el alta del modelo depende de capacidad → color y crea el producto', async ({ page }) => {
  const modelo = `iPhone Stock ${marca()}`
  try {
    await page.goto('/inventario/unidades')
    await page.getByRole('button', { name: '+ Recibir unidad' }).click()
    const modal = page.getByRole('dialog')
    const combo = modal.getByRole('combobox').first()
    await expect(combo).toBeVisible({ timeout: 20_000 })

    // Se busca un modelo inexistente y se elige crearlo desde el campo.
    await combo.fill(modelo)
    await modal.getByRole('option', { name: /como producto nuevo/i }).click()
    const cascada = modal.getByTestId('variante-producto')
    await expect(cascada).toBeVisible()
    mkdirSync(SHOTS, { recursive: true })
    await page.screenshot({ path: `${SHOTS}/02-stock-cascada.png` })

    // Dependencias: el modelo viene del texto tipeado (capacidad habilitada) y
    // el color recién se habilita cuando hay capacidad.
    const capacidad = cascada.getByLabel('Capacidad del producto')
    const color = cascada.getByLabel('Color del producto')
    await expect(capacidad).toBeEnabled()
    await expect(color).toBeDisabled()
    await expect(cascada.getByLabel('Modelo del producto')).toHaveValue(modelo)

    // Con un modelo del lineup, las capacidades sugeridas salen del catálogo.
    await cascada.getByLabel('Modelo del producto').fill('iPhone 15')
    await expect(capacidad).toBeEnabled()
    const sugeridas = await cascada.locator('#variante-producto-capacidades option').evaluateAll((opciones) => opciones.map((opcion) => opcion.value))
    expect(sugeridas, 'capacidades del lineup para iPhone 15').toContain('128GB')
    // Y al elegir la capacidad se habilita el color (sugerencias del catálogo real).
    await capacidad.fill('128GB')
    await expect(color).toBeEnabled()
    await color.fill('Verde QA')

    // Se vuelve al modelo nuevo (cambiar el modelo resetea la dependencia) y se
    // completa de nuevo la cascada antes de crear.
    await cascada.getByLabel('Modelo del producto').fill(modelo)
    await expect(capacidad).toHaveValue('')
    await expect(color).toBeDisabled()
    await capacidad.fill('256GB')
    await color.fill('Verde QA')
    await cascada.getByTestId('variante-producto-crear').click()
    await expect(cascada).toHaveCount(0)
    // El producto creado conserva la dependencia elegida (modelo, capacidad, color)
    // y el modal queda con esa variante elegida.
    const creado = await page.evaluate(async ({ api, modelo }) => {
      const filas = await fetch(`${api}/api/products?q=${encodeURIComponent(modelo)}`, { credentials: 'include' }).then((r) => r.json()).catch(() => [])
      const productos = Array.isArray(filas) ? filas : filas?.products || []
      return productos.find((item) => String(item.name).includes(modelo)) || null
    }, { api: API, modelo })
    expect(creado, 'el producto se creó').not.toBeNull()
    expect(creado.capacity).toBe('256GB')
    expect(creado.color).toBe('Verde QA')
    expect(String(creado.sku)).toContain('IPHONE-STOCK')
    await expect(combo).toHaveValue(new RegExp(modelo))
    await page.screenshot({ path: `${SHOTS}/03-stock-variante-creada.png` })
  } finally { await limpiarProducto(page, modelo) }
})

test('Compras: la línea usa el buscador y el alta dependiente queda en la línea', async ({ page }) => {
  const modelo = `iPhone Compra ${marca()}`
  try {
    mkdirSync(SHOTS, { recursive: true })
    await page.goto('/compras')
    const combo = page.locator('input[placeholder="Buscar producto…"]:visible').first()
    await expect(combo).toBeVisible({ timeout: 20_000 })
    await combo.fill(modelo)
    await page.getByRole('option', { name: /como producto nuevo/i }).first().click()
    const modal = page.getByRole('dialog')
    const cascada = modal.getByTestId('variante-producto')
    await expect(cascada).toBeVisible()
    await cascada.getByLabel('Capacidad del producto').fill('128GB')
    await cascada.getByLabel('Color del producto').fill('Azul')
    await page.screenshot({ path: `${SHOTS}/01-compras-cascada.png` })
    await cascada.getByTestId('variante-producto-crear').click()
    // La línea queda con el producto creado elegido en su buscador.
    await expect(combo).toHaveValue(new RegExp(modelo), { timeout: 20_000 })
  } finally { await limpiarProducto(page, modelo) }
})
