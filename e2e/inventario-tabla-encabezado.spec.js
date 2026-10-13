// Stock · Lista de unidades: **todas las columnas con su título arriba** y **la
// grilla alineada** — el encabezado y las filas comparten la misma plantilla de
// columnas (`--stock-cols`), así cada título cae exactamente sobre su columna en
// los estados: lleno, cargando (esqueleto con la misma grilla), vacío (sin
// tabla, solo el aviso), IMEI largo en mono y filas densas.
//
// Capturas antes/después: `docs/qa/inventario-tabla-encabezado/` (el antes se
// generó con el código previo: el encabezado caía 6 px a la izquierda y no tenía
// íconos). Con `MOBOS_CAPTURAS` el spec escribe las capturas donde se indique.
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const SHOTS = process.env.MOBOS_CAPTURAS || 'test-results/inventario-tabla-encabezado'

// Mide cada columna del encabezado contra la misma columna de la primera fila
// (o del primer esqueleto): el borde izquierdo del encabezado, su ancho y el
// hueco entre columnas tienen que coincidir al decimal.
const medirColumnas = (page, selectorFila = '[data-testid="inventario-fila"]') => page.evaluate((selector) => {
  const fila = document.querySelector(selector)
  const contenedor = fila?.parentElement?.parentElement
  const encabezado = contenedor?.querySelector('[data-testid="inventario-encabezado"]')
  const celdasEnc = [...(encabezado?.children || [])]
  const celdasFila = [...(fila?.children || [])]
  return celdasEnc.map((celda, indice) => {
    const a = celda.getBoundingClientRect()
    const b = celdasFila[indice]?.getBoundingClientRect()
    return {
      columna: indice,
      titulo: (celda.textContent || '').trim(),
      iconos: celda.querySelectorAll('svg').length,
      xEncabezado: Math.round(a.x * 10) / 10,
      anchoEncabezado: Math.round(a.width * 10) / 10,
      xCelda: b ? Math.round(b.x * 10) / 10 : null,
      anchoCelda: b ? Math.round(b.width * 10) / 10 : null,
      deltaX: b ? Math.round((a.x - b.x) * 10) / 10 : null,
      deltaAncho: b ? Math.round((a.width - b.width) * 10) / 10 : null,
    }
  })
}, selectorFila)

const exigirAlineada = (columnas, contexto) => {
  // Casilla · Modelo · IMEI / serie · Batería · Proveedor · Costo · Estado · Acciones.
  expect(columnas.length, `${contexto}: columnas del encabezado`).toBe(8)
  for (const columna of columnas) {
    expect(columna.deltaX, `${contexto}: columna ${columna.columna} «${columna.titulo}» desplazada ${columna.deltaX} px`).toBe(0)
    expect(columna.deltaAncho, `${contexto}: columna ${columna.columna} «${columna.titulo}» con ancho distinto`).toBe(0)
  }
  // La casilla de selección no lleva título; el resto sí.
  for (const columna of columnas.slice(1)) {
    expect(columna.titulo.length, `${contexto}: la columna ${columna.columna} tiene título`).toBeGreaterThan(2)
  }
}

test('la grilla del encabezado cae exactamente sobre las celdas (1440)', async ({ page }) => {
  // #304: en móvil el listado usa tarjetas compactas; la grilla se audita en escritorio.
  for (const [vista, ancho, alto] of [['desktop', 1440, 900]]) {
    await page.setViewportSize({ width: ancho, height: alto })
    await page.goto('/stock/unidades')
    await expect(page.getByTestId('inventario-fila').first()).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('inventario-encabezado')).toBeVisible()
    exigirAlineada(await medirColumnas(page), `lleno/${vista}`)
  }
})

test('el estado de carga usa la misma grilla (esqueleto alineado, sin vacío)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  // La API de stock responde con demora: se alcanza a ver el esqueleto.
  await page.route('**/api/stock/items**', async (ruta) => {
    await new Promise((resolver) => setTimeout(resolver, 4_000))
    await ruta.continue().catch(() => {})
  })
  await page.goto('/stock/unidades')
  const cargando = page.getByTestId('unidades-cargando')
  await expect(cargando).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('unidades-vacio')).toHaveCount(0)
  await expect(page.getByTestId('inventario-encabezado')).toBeVisible()
  exigirAlineada(await medirColumnas(page, '[data-testid="unidades-cargando"] > div'), 'cargando')
  await expect(page.getByTestId('inventario-fila').first()).toBeVisible({ timeout: 20_000 })
})

test('vacío sin tabla e IMEI largo en mono: la grilla queda alineada', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  // Vacío: sin filas no hay tabla; queda el aviso y los filtros.
  await page.goto('/stock/unidades?q=ZZZNOEXISTE999')
  await expect(page.getByTestId('unidades-vacio')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('inventario-fila')).toHaveCount(0)
  await expect(page.getByTestId('filtros-stock')).toBeVisible()

  // IMEI largo en mono: la fila sigue en una línea y las columnas alineadas.
  await page.goto('/stock/unidades?q=E2EE2EIPHONE15')
  const fila = page.getByTestId('inventario-fila').first()
  await expect(fila).toBeVisible({ timeout: 20_000 })
  const alto = (await fila.boundingBox())?.height || 0
  expect(alto, `la fila densa mide ${alto} px`).toBeLessThanOrEqual(60)
  exigirAlineada(await medirColumnas(page), 'IMEI largo/denso')
  await expect(fila.getByTestId('unidad-imei')).toContainText('E2EE2EIPHONE15')
})

test('capturas de la tabla en todos los estados', async ({ page }) => {
  mkdirSync(SHOTS, { recursive: true })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/stock/unidades')
  await expect(page.getByTestId('inventario-fila').first()).toBeVisible({ timeout: 20_000 })
  await page.screenshot({ path: `${SHOTS}/tabla-01-lleno-desktop.png` })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/stock/unidades')
  // #304: en móvil se ven las tarjetas compactas (la tabla no se renderiza).
  await expect(page.getByTestId('inventario-tarjeta-movil').first()).toBeVisible({ timeout: 20_000 })
  await page.screenshot({ path: `${SHOTS}/tabla-02-lleno-mobile.png`, fullPage: true })

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/stock/unidades?q=ZZZNOEXISTE999')
  await expect(page.getByTestId('unidades-vacio')).toBeVisible({ timeout: 20_000 })
  await page.screenshot({ path: `${SHOTS}/tabla-03-vacio.png` })

  await page.route('**/api/stock/items**', async (ruta) => {
    await new Promise((resolver) => setTimeout(resolver, 4_000))
    await ruta.continue().catch(() => {})
  })
  await page.goto('/stock/unidades')
  await expect(page.getByTestId('unidades-cargando')).toBeVisible({ timeout: 20_000 })
  await page.screenshot({ path: `${SHOTS}/tabla-04-cargando.png` })
  await page.unroute('**/api/stock/items**')
  await page.goto('/stock/unidades?q=E2EE2EIPHONE15')
  await expect(page.getByTestId('inventario-fila').first()).toBeVisible({ timeout: 20_000 })
  await page.screenshot({ path: `${SHOTS}/tabla-05-imei-largo.png` })
})
