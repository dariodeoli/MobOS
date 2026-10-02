// #312 — Ficha del cliente: accesos siempre visibles (auditoría demo v1.0.209).
// La cabecera con las acciones y las pestañas quedan fijas dentro del modal:
// al scrollear el contenido siguen a la vista. Se verifica en claro, oscuro y
// móvil, y las capturas quedan en docs/QA-312-ficha-accesos/ cuando se corre
// con MOBOS_CAPTURAS=docs/QA-312-ficha-accesos.
import { test, expect } from '@playwright/test'
import { cerrarGuiaDemo } from './helpers/demo.js'

const SHOTS = process.env.MOBOS_CAPTURAS || 'test-results/QA-312-ficha-accesos'

async function abrirFichaDemo(page) {
  await page.goto('/demo')
  await page.getByRole('button', { name: /Vendedor/ }).first().click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'))
  await cerrarGuiaDemo(page)
  await page.goto('/clientes?cliente=demo-cliente-lucia')
  const ficha = page.getByRole('dialog')
  await ficha.getByText('TOTAL GASTADO').waitFor({ timeout: 20_000 })
  return ficha
}

/** El control entra completo en el recuadro visible del modal. */
function visibleEnFicha(locator) {
  return locator.evaluate((el) => {
    const rect = el.getBoundingClientRect()
    const caja = el.closest('[role="dialog"]').getBoundingClientRect()
    return rect.top >= caja.top - 1 && rect.bottom <= caja.bottom + 1
  })
}

/** Acciones de la cabecera y pestañas, todas dentro del modal. */
async function esperarAccesosVisibles(ficha) {
  const accesos = {
    portal: ficha.getByRole('button', { name: 'Portal del cliente' }),
    whatsapp: ficha.getByRole('button', { name: 'Enviar WhatsApp a Lucía Fernández' }),
    tabs: ficha.getByRole('tab', { name: /^Resumen/ }),
  }
  for (const [nombre, control] of Object.entries(accesos)) {
    await expect(control, `falta el acceso ${nombre}`).toBeVisible()
    expect(await visibleEnFicha(control), `el acceso ${nombre} quedó fuera del modal`).toBe(true)
  }
  await expect(ficha.getByTestId('perfil-cabecera-fija')).toBeVisible()
}

async function scrollear(page, ficha, fraccion) {
  await ficha.evaluate((el, valor) => { el.scrollTop = Math.round((el.scrollHeight - el.clientHeight) * valor) }, fraccion)
  await page.waitForTimeout(250)
}

async function recorrerYCapturar(page, ficha, prefijo) {
  // Al abrir: acciones y pestañas a la vista, sin scrollear.
  await esperarAccesosVisibles(ficha)
  await page.screenshot({ path: `${SHOTS}/${prefijo}-01-inicial.png` })

  // A mitad y al fondo del resumen, los accesos siguen a la vista.
  await scrollear(page, ficha, 0.5)
  await esperarAccesosVisibles(ficha)
  await page.screenshot({ path: `${SHOTS}/${prefijo}-02-scroll-medio.png` })

  await scrollear(page, ficha, 1)
  await esperarAccesosVisibles(ficha)
  await page.screenshot({ path: `${SHOTS}/${prefijo}-03-scroll-fondo.png` })

  // Cambiar de pestaña estando al fondo: la cabecera fija sigue y la solapa
  // elegida queda marcada (el contenido puede quedar al fondo: es scroll
  // propio del modal, no de la cabecera).
  await ficha.getByRole('tab', { name: /^Pedidos/ }).click()
  await expect(ficha.getByRole('tab', { name: /^Pedidos/ })).toHaveAttribute('aria-selected', 'true')
  await esperarAccesosVisibles(ficha)
  await page.screenshot({ path: `${SHOTS}/${prefijo}-04-otra-pestana.png` })
}

test('ficha: acciones y pestañas siguen visibles al scrollear (claro)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const ficha = await abrirFichaDemo(page)
  await recorrerYCapturar(page, ficha, 'claro')
})

test('ficha: acciones y pestañas siguen visibles al scrollear (oscuro)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.addInitScript(() => localStorage.setItem('mobos:theme', 'dark'))
  const ficha = await abrirFichaDemo(page)
  await recorrerYCapturar(page, ficha, 'oscuro')
})

test('ficha: acciones y pestañas siguen visibles al scrollear (móvil)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const ficha = await abrirFichaDemo(page)
  await recorrerYCapturar(page, ficha, 'movil')
})
