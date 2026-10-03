// #323 — Adopción del modal/drawer estándar en PRN (docs/MODALES.md §3).
//
// Los modales de impresión usan el objeto de la biblioteca: pie fijo con un
// solo primario, error junto al campo con las reglas compartidas y cierre con
// confirmación cuando hay cambios sin guardar. Capturas claro/oscuro/móvil.

import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { cerrarGuiaDemo } from './helpers/demo.js'

const SALIDA = 'docs/qa/323-prn'
mkdirSync(SALIDA, { recursive: true })

async function entrarDemo(page) {
  await page.goto('/demo')
  await page.getByRole('button', { name: /Entrar como Dueño/i }).click()
  await cerrarGuiaDemo(page)
  await page.goto('/configuracion/dispositivos')
  await page.getByTestId('panel-impresoras').waitFor()
}

async function abrirFormulario(page) {
  await page.getByRole('button', { name: 'Agregar impresora' }).click()
  const modal = page.getByRole('dialog', { name: 'Agregar impresora' })
  await expect(modal).toBeVisible()
  return modal
}

async function abrirPrueba(page) {
  const tarjeta = page.locator('xpath=//div[contains(@class, "lg:grid-cols-2")]/div').filter({ hasText: 'Térmica mostrador' })
  await tarjeta.getByRole('button', { name: 'Imprimir prueba' }).click()
  const modal = page.getByRole('dialog', { name: 'Probar: Térmica mostrador' })
  await expect(modal).toBeVisible()
  return modal
}

test.describe('#323 modal estándar en impresión', () => {
  test('el formulario de impresora valida junto al campo y confirma al descartar', async ({ page }) => {
    await page.addInitScript(() => { localStorage.setItem('mobos:theme', 'dark') })
    await page.setViewportSize({ width: 1280, height: 900 })
    await entrarDemo(page)
    const modal = await abrirFormulario(page)

    // Etiquetas visibles: el placeholder no es etiqueta.
    await expect(modal.getByLabel('Nombre visible')).toBeVisible()
    await expect(modal.getByLabel('IP')).toBeVisible()
    await expect(modal.getByLabel('Puerto')).toBeVisible()

    // #297: sin datos válidos el primario queda bloqueado con el motivo; acá lo
    // único que falta es el nombre (IP y puerto vienen sugeridos).
    const guardar = modal.getByRole('button', { name: 'Guardar impresora' })
    await expect(guardar).toBeDisabled()
    await expect(guardar).toHaveAttribute('title', 'Falta: el nombre.')

    // El error va junto al campo al salir de él (no en un toast) y se limpia al
    // completarlo.
    const nombre = modal.getByLabel('Nombre visible')
    await nombre.click()
    await modal.getByLabel('IP').click()
    await expect(modal.getByText('Poné un nombre visible para reconocer la impresora.')).toBeVisible()
    await nombre.fill('Térmica QA 323')
    await expect(modal.getByText('Poné un nombre visible para reconocer la impresora.')).toHaveCount(0)
    await expect(guardar).toBeEnabled()

    // Un dato con formato inválido también queda junto al campo y se limpia al
    // corregirlo (la regla de IP volvió con #336).
    const ip = modal.getByLabel('IP')
    await ip.fill('999')
    await modal.getByLabel('Puerto').click()
    await expect(modal.getByText('Revisá la IP (ej. 192.168.1.23).')).toBeVisible()
    await expect(guardar).toBeDisabled()
    await ip.fill('192.168.1.23')
    await expect(modal.getByText('Revisá la IP (ej. 192.168.1.23).')).toHaveCount(0)
    await expect(guardar).toBeEnabled()

    // Cierre con cambios: confirmación canónica; «Seguir editando» no descarta.
    await page.keyboard.press('Escape')
    const confirmacion = page.getByRole('dialog', { name: '¿Descartar los cambios?' })
    await expect(confirmacion).toBeVisible()
    await confirmacion.getByRole('button', { name: 'Seguir editando' }).click()
    await expect(modal).toBeVisible()
    await page.keyboard.press('Escape')
    await confirmacion.getByRole('button', { name: 'Descartar y cerrar' }).click()
    await expect(modal).toHaveCount(0)
  })

  test('guardar impresora usa el pie fijo y el resultado canónico', async ({ page }) => {
    await page.addInitScript(() => { localStorage.setItem('mobos:theme', 'light') })
    await page.setViewportSize({ width: 390, height: 844 })
    await entrarDemo(page)
    const modal = await abrirFormulario(page)

    // El pie está fijo: la acción primaria se ve aunque el cuerpo scrollee.
    const primaria = modal.getByRole('button', { name: 'Guardar impresora' })
    await expect(primaria).toBeVisible()
    const caja = await primaria.boundingBox()
    expect(caja.y + caja.height).toBeLessThanOrEqual(844)

    await modal.getByLabel('Nombre visible').fill('Térmica QA 323')
    await primaria.click()
    await expect(page.getByText('Impresora se guardó')).toBeVisible()
    await expect(modal).toHaveCount(0)
  })

  test('el editor de prueba confirma al descartar cambios y sin cambios cierra directo', async ({ page }) => {
    await page.addInitScript(() => { localStorage.setItem('mobos:theme', 'dark') })
    await page.setViewportSize({ width: 1280, height: 900 })
    await entrarDemo(page)

    // Sin cambios, el cierre es directo.
    const modal = await abrirPrueba(page)
    await page.keyboard.press('Escape')
    await expect(modal).toHaveCount(0)

    // Con copias cambiadas, el cierre pide confirmación.
    const reabierto = await abrirPrueba(page)
    await reabierto.getByRole('button', { name: 'Una copia más' }).click()
    await expect(reabierto.getByRole('group', { name: 'Copias' })).toContainText('2')
    await page.keyboard.press('Escape')
    const confirmacion = page.getByRole('dialog', { name: '¿Descartar los cambios?' })
    await expect(confirmacion).toBeVisible()
    await confirmacion.getByRole('button', { name: 'Descartar y cerrar' }).click()
    await expect(reabierto).toHaveCount(0)
  })

  test('capturas de los modales PRN (claro, oscuro y móvil)', async ({ page }) => {
    test.setTimeout(180_000)
    const salida = process.env.MOBOS_CAPTURAS || SALIDA
    await entrarDemo(page)
    for (const [tema, modo] of [['claro', 'light'], ['oscuro', 'dark']]) {
      for (const [vista, ancho, alto] of [['desktop', 1280, 900], ['movil', 390, 844]]) {
        // El tema vive en localStorage y se aplica al recargar; la sesión demo
        // sigue activa, no hace falta volver a entrar.
        await page.setViewportSize({ width: ancho, height: alto })
        await page.evaluate((m) => { try { localStorage.setItem('mobos:theme', m) } catch { /* sin storage */ } }, modo)
        await page.reload()
        await page.getByTestId('panel-impresoras').waitFor()

        const formulario = await abrirFormulario(page)
        await formulario.getByLabel('Nombre visible').fill('Térmica del mostrador')
        await page.screenshot({ path: `${salida}/formulario-${tema}-${vista}.png` })
        await page.keyboard.press('Escape')
        const confirmacion = page.getByRole('dialog', { name: '¿Descartar los cambios?' })
        await confirmacion.getByRole('button', { name: 'Descartar y cerrar' }).click()
        await expect(formulario).toHaveCount(0)

        const prueba = await abrirPrueba(page)
        await page.screenshot({ path: `${salida}/prueba-${tema}-${vista}.png` })
        await page.keyboard.press('Escape')
        await expect(prueba).toHaveCount(0)
      }
    }
  })
})
