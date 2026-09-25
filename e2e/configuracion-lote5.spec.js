// Rediseño Lote 5 (#165): Configuración y Equipo con slug por subpágina,
// formularios en panel derecho en escritorio (apilados en móvil) y sin scroll
// horizontal en 360/768/1440.

import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const SUBPAGINAS = [
  ['mi-cuenta', 'Mi cuenta'],
  ['organizacion', 'Organización'],
  ['equipo', 'Equipo y acceso'],
  ['comercial', 'Comercial'],
  ['seguridad', 'Seguridad y auditoría'],
  ['dispositivos', 'Dispositivos'],
  ['sistema', 'Sistema'],
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

    // Sucursales (dentro de Organización): el formulario queda a la derecha de la lista.
    await page.goto('/configuracion/organizacion')
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

// IA de Configuración (#251): siete secciones sin duplicar, con Documentación
// fuera de Configuración (entrada «Ayuda» del shell).
test.describe('Configuración IA', () => {
  test('las siete secciones no duplican Dispositivos, Sistema ni Preferencias', async ({ page }) => {
    await page.goto('/configuracion/dispositivos')
    await expect(page.locator('main').getByRole('tab')).toHaveCount(7)

    // Dispositivos: impresoras y su diagnóstico local, sin el estado global.
    await expect(page.getByRole('tab', { name: 'Dispositivos', exact: true })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('paneles-impresion')).toBeVisible()
    await page.getByTestId('panel-diagnostico').click()
    await expect(page.getByRole('heading', { name: 'Diagnóstico de impresión (esta computadora)' })).toBeVisible()
    await expect(page.getByTestId('monitoreo-global')).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Sistema', exact: true })).toBeVisible()

    // Sistema: solo el monitoreo global (Estado del sistema).
    await page.locator('main').getByRole('tab', { name: 'Sistema', exact: true }).click()
    await expect(page).toHaveURL(/\/configuracion\/sistema$/)
    await expect(page.getByRole('heading', { name: 'Sincronización' })).toBeVisible()

    // Las preferencias del dispositivo viven en Mi cuenta, una sola vez.
    await page.locator('main').getByRole('tab', { name: 'Mi cuenta', exact: true }).click()
    await expect(page.locator('#pref-bloqueo')).toBeVisible()
  })

  // #253 · Dispositivos: la pantalla se ordena en secciones (impresoras,
  // puentes, formatos, diagnóstico y cola/historial) y deja claro que el
  // monitoreo de la empresa vive en Estado del sistema, sin repetirse.
  test('Dispositivos ordena sus secciones sin duplicar el monitoreo de Sistema', async ({ page }) => {
    await page.goto('/configuracion/dispositivos')
    const paneles = page.getByTestId('paneles-impresion')
    for (const label of ['Impresoras', 'Puentes', 'Formatos', 'Diagnóstico', 'Cola e historial']) {
      await expect(paneles.getByRole('button', { name: label, exact: true })).toBeVisible()
    }
    await expect(paneles.getByRole('button', { name: 'Estado del sistema', exact: true })).toHaveCount(0)

    // Puentes: la gestión es una sección (ya no un modal suelto).
    await page.getByTestId('panel-puentes').click()
    await expect(page.getByTestId('puentes-impresion')).toBeVisible()
    await expect(page).toHaveURL(/panel=puentes/)
    await expect(page.getByRole('button', { name: 'Agregar puente' })).toBeVisible()

    // Diagnóstico: estado local y red, con el enlace al monitoreo global.
    await page.getByTestId('panel-diagnostico').click()
    await expect(page.getByTestId('diagnostico-impresion')).toBeVisible()
    await expect(page.getByTestId('monitoreo-global')).toContainText('Estado del sistema')

    // Cola e historial: la cola de esta computadora y la actividad.
    await page.getByTestId('panel-cola').click()
    await expect(page.getByTestId('cola-impresion')).toBeVisible()
    await expect(page.getByText('Actividad de impresión')).toBeVisible()

    // Formatos: la impresora recordada por tipo de documento.
    await page.getByTestId('panel-formatos').click()
    await expect(page.getByTestId('formatos-impresion')).toBeVisible()

    // Sistema: el monitoreo enlaza a configurar/probar, sin duplicar la config.
    await page.goto('/configuracion/sistema')
    await expect(page.getByTestId('monitoreo-vs-impresoras')).toContainText('Dispositivos · Impresoras')
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
        await page.goto('/configuracion/dispositivos')
        await expect(page.getByRole('tab', { name: 'Dispositivos', exact: true })).toBeVisible({ timeout: 20_000 })
        await page.screenshot({ path: `${salida}/config-secciones-${tema}-${vista}.png` })
        await page.goto('/ayuda/ayuda')
        await expect(page.getByTestId('documentacion')).toBeVisible({ timeout: 20_000 })
        await page.screenshot({ path: `${salida}/ayuda-${tema}-${vista}.png` })
      }
    }
  })
})
