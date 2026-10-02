// #324: coherencia de los fixtures del demo. Verifica en navegador que las
// contradicciones de la auditoría (artículos en Gs 0, transacciones sin monto,
// comprobante genérico, proveedores «sin registrar», cola de impresión 0 vs 2,
// roles cruzados e historiales/plantillas con error simulado) quedaron resueltas
// y que los módulos sin cobertura (Abastecimiento, Precios, Análisis, Seguridad,
// Sistema, kardex, cotizaciones y roles secundarios) muestran datos.
import { mkdirSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { cerrarGuiaDemo } from './helpers/demo'

const salidaCapturas = process.env.MOBOS_324_CAPTURAS || ''

async function capturar(page, nombre) {
  if (!salidaCapturas) return
  mkdirSync(salidaCapturas, { recursive: true })
  await page.screenshot({ path: `${salidaCapturas}/${nombre}.jpg`, type: 'jpeg', quality: 72, fullPage: true })
}

async function entrarComo(page, perfil) {
  // La marca de demo vive en sessionStorage: si la pestaña ya entró con otro
  // rol, se limpia y se recarga para volver a la entrada de perfiles.
  await page.goto('/demo')
  await page.evaluate(() => {
    try {
      sessionStorage.removeItem('mobos:demo-session')
      sessionStorage.removeItem('mobos:demo-session:role')
    } catch { /* sin sessionStorage */ }
  })
  await page.goto('/demo')
  await page.getByRole('button', { name: new RegExp(`Entrar como ${perfil}`) }).click()
  await cerrarGuiaDemo(page, { timeout: 2500 })
}

test('#324 · dueño: pedidos con artículos, transacciones y comprobante de Aurora Móviles', async ({ page }) => {
  await entrarComo(page, 'Dueño')
  await expect(page).toHaveURL(/\/resumen$/)
  await page.goto('/pedidos')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  const fila = page.getByTestId('pedido-fila').filter({ hasText: /AUR-#?0002/ }).first()
  await fila.waitFor({ state: 'visible', timeout: 25_000 })
  await fila.click()
  await expect(page.getByRole('heading', { name: 'AUR-#0002' })).toBeVisible()
  // Las secciones del detalle arrancan plegadas: se abren para auditar que el
  // pedido trae sus artículos y que la transacción no está en Gs 0.
  await page.getByRole('button', { name: /Artículos preparados/ }).click()
  await expect(page.getByText('Funda MagSafe Transparente')).toBeVisible()
  await expect(page.getByText('Sin artículos detallados')).toHaveCount(0)
  await page.getByRole('button', { name: /Información de pago/ }).click()
  await expect(page.getByText(/50\.000/).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /Cliente Carlos Benítez/ })).toBeVisible()
  await capturar(page, '01-dueno-pedido')
})

test('#324 · dueño: proveedores unificados y cola de impresión honesta', async ({ page }) => {
  await entrarComo(page, 'Dueño')
  await page.goto('/compras')
  await page.getByRole('button', { name: 'Proveedores' }).click()
  await expect(page.getByTestId('proveedor-fila')).toHaveCount(3)
  await expect(page.getByText('Importadora Tecnológica S.A.').first()).toBeVisible()
  await expect(page.getByText('Distribuidora del Este').first()).toBeVisible()
  await expect(page.getByText('Sin proveedores registrados.')).toHaveCount(0)
  await capturar(page, '02-dueno-proveedores')

  await page.goto('/configuracion/dispositivos')
  await page.getByRole('button', { name: 'Cola e historial' }).click()
  await expect(page.getByText('2 pendientes').first()).toBeVisible({ timeout: 25_000 })
  await capturar(page, '03-dueno-cola-impresion')
})

test('#324 · dueño: historial del integrante y plantillas de WhatsApp sin error simulado', async ({ page }) => {
  await entrarComo(page, 'Dueño')
  await page.goto('/configuracion/equipo')
  const fila = page.getByTestId('integrante-fila').filter({ hasText: 'Diego López' }).first()
  await fila.waitFor({ state: 'visible', timeout: 25_000 })
  await fila.getByRole('button', { name: 'Historial de Diego López' }).click()
  const modal = page.getByRole('dialog').filter({ hasText: 'Historial de Diego López' })
  await expect(modal.getByText('Alta en el equipo')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('quedó simulada en este navegador')).toHaveCount(0)
  await capturar(page, '04-dueno-historial-integrante')

  await page.goto('/garantias')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  // El selector de plantillas del taller no debe quedar en error.
  await expect(page.getByText('No se pudieron cargar las plantillas.')).toHaveCount(0)
})

test('#324 · dueño: kardex, cotizaciones y reportes con cifras', async ({ page }) => {
  await entrarComo(page, 'Dueño')
  await page.goto('/cotizaciones')
  await expect(page.getByTestId('cotizacion-fila').first()).toBeVisible({ timeout: 25_000 })
  await expect(page.getByText('COT-#0018')).toBeVisible()
  await expect(page.getByTestId('cotizacion-fila')).toHaveCount(6)
  await capturar(page, '05-dueno-cotizaciones')

  await page.goto('/productos')
  const producto = page.getByTestId('producto-fila').filter({ hasText: 'iPhone 15 Pro 256GB Titanio' }).first()
  await producto.waitFor({ state: 'visible', timeout: 25_000 })
  await producto.click()
  const ficha = page.getByRole('dialog')
  await ficha.getByRole('tab', { name: 'Kardex' }).click()
  const kardex = ficha.getByTestId('kardex-contenido')
  await expect(kardex).toBeVisible()
  await expect(kardex.getByTestId('kardex-movimiento').first()).toBeVisible({ timeout: 15_000 })
  await capturar(page, '06-dueno-kardex')

  await page.goto('/analisis')
  await expect(page.getByText('Total del período').first()).toBeVisible({ timeout: 25_000 })
  await expect(page.getByText('no se muestran cifras')).toHaveCount(0)
  await capturar(page, '07-dueno-reportes')
})

test('#324 · dueño: abastecimiento completo, seguridad y sistema con datos', async ({ page }) => {
  await entrarComo(page, 'Dueño')
  const rutas = [
    ['/abastecimiento', 'por-comprar', 'iPhone 15 Pro 256GB Titanio'],
    ['/compras-centro', 'compras-centro', 'CMP-AUR-0001'],
    ['/preparacion', 'preparar-compra', 'CMP-AUR-0001'],
    ['/preparar-lote', 'preparar-lote', 'LOTE-AUR-0002'],    ['/recepcion', null, 'LOTE-AUR-0002'],
    ['/metricas', null, 'Importadora Tecnológica S.A.'],
  ]
  for (const [ruta, testid, texto] of rutas) {
    await page.goto(ruta)
    if (testid) await expect(page.getByTestId(testid)).toBeVisible({ timeout: 25_000 })
    await expect(page.getByText(texto).first()).toBeVisible({ timeout: 25_000 })
    await capturar(page, `08-abastecimiento-${ruta.replaceAll('/', '')}`)
  }

  await page.goto('/configuracion/seguridad')
  await expect(page.getByText('Hernán Acosta').first()).toBeVisible({ timeout: 25_000 })
  await capturar(page, '09-dueno-seguridad')

  await page.goto('/configuracion/sistema')
  await expect(page.getByText('Base de datos').first()).toBeVisible({ timeout: 25_000 })
  await expect(page.getByText('2 pendientes').first()).toBeVisible()
  await capturar(page, '10-dueno-sistema')
})

test('#324 · roles secundarios: el menú dice la misma persona y rol que Equipo', async ({ page }) => {
  test.slow()
  const perfiles = [
    ['Vendedor', 'Diego López', 'Vendedor', /\/pos$/],
    ['Gerente', 'Ana Giménez', 'Gerente', /\/pos$/],
    ['Caja', 'María Benítez', 'Cajera', /\/pos$/],
    ['Técnico', 'Jorge Villalba', 'Técnico', /\/servicio$/],
    ['Delivery', 'Marcos Aquino', 'Repartidor', /\/delivery\/repartos$/],
    ['Dueño', 'Hernán Acosta', 'Dueño', /\/resumen$/],
  ]
  for (const [perfil, persona, rol, url] of perfiles) {
    await entrarComo(page, perfil)
    await expect(page).toHaveURL(url)
    await expect(page.getByText(persona).first()).toBeVisible({ timeout: 25_000 })
    await expect(page.getByText(rol, { exact: true }).first()).toBeVisible()
    await capturar(page, `11-rol-${perfil.toLowerCase()}`)
  }

  // El repartidor tiene sus pedidos asignados en la demo.
  await entrarComo(page, 'Delivery')
  await expect(page).toHaveURL(/\/delivery\/repartos$/)
  await expect(page.getByTestId('reparto-pedido').first()).toBeVisible({ timeout: 25_000 })
  await expect(page.getByText(/AUR-#?0005/)).toBeVisible()
  await capturar(page, '12-rol-delivery-pedidos')
})
