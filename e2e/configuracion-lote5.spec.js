// Rediseño Lote 5 (#165): Configuración y Equipo con slug por subpágina,
// formularios en panel derecho en escritorio (apilados en móvil) y sin scroll
// horizontal en 360/768/1440.

import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const SUBPAGINAS = [
  ['equipo', 'Equipo'],
  ['identidad', 'Mi identidad'],
  ['roles', 'Roles y permisos'],
  ['negocio', 'Negocio'],
  ['precios', 'Listas de precios'],
  ['sucursales', 'Sucursales'],
  ['seguridad', 'Seguridad'],
  ['historial', 'Auditoría'],
  ['impresoras', 'Impresoras'],
  ['preferencias', 'Preferencias'],
  ['sistema', 'Estado del sistema'],
]

const ANCHOS = [
  [360, 780],
  [768, 1024],
  [1440, 900],
]

async function sinScrollHorizontal(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)
}

test.describe('Configuración Lote 5', () => {
  test('cada subpágina tiene su slug y su título', async ({ page }) => {
    for (const [slug, titulo] of SUBPAGINAS) {
      await page.goto(`/configuracion/${slug}`)
      await expect(page).toHaveURL(new RegExp(`/configuracion/${slug}$`))
      await expect(page.locator('h1')).toHaveText(titulo)
    }
  })

  test('sin scroll horizontal en 360, 768 y 1440', async ({ page }) => {
    test.setTimeout(180_000)
    for (const [ancho, alto] of ANCHOS) {
      await page.setViewportSize({ width: ancho, height: alto })
      for (const [slug] of SUBPAGINAS) {
        await page.goto(`/configuracion/${slug}`)
        await expect(page.locator('h1')).toBeVisible()
        expect(await sinScrollHorizontal(page), `/configuracion/${slug} desborda a ${ancho}px`).toBe(true)
      }
    }
  })

  test('en escritorio el formulario vive en el panel derecho', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })

    // Equipo: el alta está a la vista, sin abrir modales, en la columna derecha.
    await page.goto('/configuracion/equipo')
    const panelEquipo = page.locator('#equipo-form')
    await expect(panelEquipo).toBeVisible()
    await expect(page.locator('#invite-name')).toBeVisible()
    const cajaEquipo = await panelEquipo.boundingBox()
    expect(cajaEquipo.x).toBeGreaterThan(1440 * 0.5)

    // Sucursales: el formulario queda a la derecha de la lista.
    await page.goto('/configuracion/sucursales')
    const panelSucursal = page.locator('#sucursal-form')
    await expect(panelSucursal).toBeVisible()
    await expect(page.locator('#sucursal-nombre')).toBeVisible()
    const cajaSucursal = await panelSucursal.boundingBox()
    expect(cajaSucursal.x).toBeGreaterThan(1440 * 0.5)
  })

  test('en móvil el formulario se apila y el botón lleva hasta él', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 })
    await page.goto('/configuracion/equipo')
    const boton = page.getByRole('button', { name: '+ Invitar persona' })
    await expect(boton).toBeVisible()
    await boton.click()
    await expect(page.locator('#equipo-form')).toBeInViewport()
    await expect(page.locator('#invite-name')).toBeVisible()

    // En escritorio el botón no hace falta: el panel ya está a la vista.
    await page.setViewportSize({ width: 1440, height: 900 })
    await expect(boton).toBeHidden()
  })
})

// IA de Configuración (#251): Dispositivos y Sistema como grupos propios, con
// Documentación fuera de Configuración (entrada «Ayuda» del shell).
test.describe('Configuración IA', () => {
  test('los grupos separan Dispositivos y Sistema sin duplicar pestañas', async ({ page }) => {
    await page.goto('/configuracion/impresoras')
    const grupos = page.getByRole('tablist', { name: 'Grupos de configuración' })
    for (const label of ['Personas', 'Negocio', 'Seguridad', 'Dispositivos', 'Sistema']) {
      await expect(grupos.getByRole('button', { name: label, exact: true })).toBeVisible()
    }

    // Dispositivos: la configuración y las pruebas de impresión, más las
    // preferencias del dispositivo (no la seguridad de la empresa).
    await grupos.getByRole('button', { name: 'Dispositivos', exact: true }).click()
    await expect(page).toHaveURL(/\/configuracion\/impresoras$/)
    await expect(page.getByRole('tab', { name: 'Impresoras', exact: true })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Preferencias', exact: true })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Estado del sistema', exact: true })).toHaveCount(0)

    // Sistema: solo el monitoreo global (Estado del sistema).
    await grupos.getByRole('button', { name: 'Sistema', exact: true }).click()
    await expect(page).toHaveURL(/\/configuracion\/sistema$/)
    await expect(page.getByRole('tab', { name: 'Estado del sistema', exact: true })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Impresoras', exact: true })).toHaveCount(0)
    await expect(page.getByRole('tab', { name: 'Preferencias', exact: true })).toHaveCount(0)
  })

  test('Documentación sale de Configuración: la ruta vieja redirige a Ayuda', async ({ page }) => {
    await page.goto('/configuracion/documentacion')
    await expect(page).toHaveURL(/\/ayuda\/ayuda$/)
    await expect(page.getByTestId('documentacion')).toBeVisible()
    await expect(page.locator('h1')).toHaveText('Ayuda')
  })

  // Capturas del antes/después (#251), reproducibles:
  //   MOBOS_CAPTURAS=docs/qa/config-ia/despues npx playwright test e2e/configuracion-lote5.spec.js -g capturas
  // Sin variable escribe en test-results y CI no ensucia el repo.
  test('capturas de los grupos y de Ayuda', async ({ page }) => {
    test.setTimeout(120_000)
    const salida = process.env.MOBOS_CAPTURAS || 'test-results/config-ia'
    mkdirSync(salida, { recursive: true })
    for (const [tema, modo] of [['claro', 'light'], ['oscuro', 'dark']]) {
      for (const [vista, ancho, alto] of [['desktop', 1280, 900], ['mobile', 390, 844]]) {
        await page.addInitScript(({ m }) => { try { localStorage.setItem('mobos:theme', m) } catch { /* sin storage */ } }, { m: modo })
        await page.setViewportSize({ width: ancho, height: alto })
        await page.goto('/configuracion/impresoras')
        await expect(page.getByRole('button', { name: 'Dispositivos', exact: true })).toBeVisible({ timeout: 20_000 })
        await page.screenshot({ path: `${salida}/config-grupos-${tema}-${vista}.png` })
        await page.goto('/ayuda/ayuda')
        await expect(page.getByTestId('documentacion')).toBeVisible({ timeout: 20_000 })
        await page.screenshot({ path: `${salida}/ayuda-${tema}-${vista}.png` })
      }
    }
  })
})
