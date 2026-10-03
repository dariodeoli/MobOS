// #319 — Dispositivos e impresión (auditoría del demo v1.0.209).
//
// Cada acción visible responde: las secundarias viven en «…» por impresora,
// Diagnóstico y Ver actividad abren su panel con el resultado a la vista, la
// prueba avisa el resultado (toast + aviso persistente), «Formatos» pasó a
// llamarse «Ruteo de documentos» y los contadores de la cola salen de la misma
// lista que «Ver cola». La presencia de los puentes muestra estado, versión y
// último contacto del mismo registro. Evidencia en claro, oscuro y móvil.

import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { cerrarGuiaDemo } from './helpers/demo.js'
import { VERSION_AGENTE_DEMO } from '../src/lib/printing/demo.js'

const SALIDA = 'docs/qa/319-dispositivos'
mkdirSync(SALIDA, { recursive: true })

const tarjetaDe = (page, texto) => page.locator('xpath=//div[contains(@class, "lg:grid-cols-2")]/div').filter({ hasText: texto })

async function entrarDemo(page) {
  await page.goto('/demo')
  await page.getByRole('button', { name: /Entrar como Dueño/i }).click()
  await cerrarGuiaDemo(page)
}

async function abrirDispositivos(page) {
  await page.goto('/configuracion/dispositivos')
  await page.getByTestId('panel-impresoras').waitFor()
}

async function abrirAccion(tarjeta, page, opcion) {
  await tarjeta.getByRole('button', { name: /^Más acciones de/ }).click()
  await page.getByRole('menuitem', { name: opcion }).click()
}

test.describe('#319 dispositivos e impresión', () => {
  test('las acciones de la tarjeta responden y la cola usa una sola cuenta', async ({ page }) => {
    await page.addInitScript(() => { localStorage.setItem('mobos:theme', 'dark') })
    await page.setViewportSize({ width: 1280, height: 900 })
    await entrarDemo(page)
    await abrirDispositivos(page)

    const tarjeta = tarjetaDe(page, 'Térmica mostrador')
    // La tarjeta deja a la vista solo lo principal: prueba y edición.
    await expect(tarjeta.getByRole('button', { name: 'Imprimir prueba' })).toBeVisible()
    await expect(tarjeta.getByRole('button', { name: 'Editar' })).toBeVisible()
    await expect(tarjeta.getByRole('button', { name: 'Diagnóstico', exact: true })).toHaveCount(0)
    await expect(tarjeta.getByRole('button', { name: 'Ver actividad', exact: true })).toHaveCount(0)
    await expect(tarjeta.getByRole('button', { name: 'Plantilla' })).toHaveCount(0)

    // El menú «…» conserva todas las secundarias.
    await tarjeta.getByRole('button', { name: /^Más acciones de/ }).click()
    for (const opcion of ['Plantilla de la prueba', 'Diagnóstico', 'Ver actividad', 'Duplicar', 'Desactivar', 'Eliminar']) {
      await expect(page.getByRole('menuitem', { name: opcion })).toBeVisible()
    }
    await page.screenshot({ path: `${SALIDA}/acciones-oscuro.png` })
    await page.keyboard.press('Escape')

    // Diagnóstico: antes no pasaba nada; ahora abre su panel con el resultado
    // y el nombre de la impresora diagnosticada (no el de la predeterminada).
    await abrirAccion(tarjeta, page, 'Diagnóstico')
    await expect(page).toHaveURL(/panel=diagnostico/)
    await expect(page.getByTestId('diagnostico-impresion')).toBeVisible()
    await expect(page.getByText('Diagnóstico simulado', { exact: false })).toBeVisible()
    await expect(page.getByTestId('diagnostico-impresion')).toContainText('Impresora')
    await expect(page.getByTestId('diagnostico-impresion')).toContainText('Térmica mostrador')
    await page.screenshot({ path: `${SALIDA}/diagnostico-oscuro.png` })

    // Ver actividad: abre Cola e historial con el filtro de esa impresora.
    await page.getByTestId('panel-impresoras').click()
    await abrirAccion(tarjeta, page, 'Ver actividad')
    await expect(page).toHaveURL(/panel=cola/)
    await expect(page.getByText('Actividad de impresión')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Quitar filtro' })).toBeVisible()

    // Contadores: el encabezado, la lista de espera y «Ver cola» dicen lo mismo.
    await expect(page.getByTestId('cola-impresion')).toContainText('2 pendientes · 1 fallidos')
    await expect(page.getByText('2 trabajo(s) esperando impresión.')).toBeVisible()
    await page.getByRole('button', { name: 'Ver cola' }).click()
    const cola = page.getByRole('dialog', { name: 'Cola de impresión' })
    await expect(cola.getByText('Pendientes del agente (2)')).toBeVisible()
    await expect(cola.getByText('Fallidos (1)')).toBeVisible()
    await page.keyboard.press('Escape')
    await page.screenshot({ path: `${SALIDA}/cola-oscuro.png` })

    // Ruteo de documentos: el panel dejó de llamarse «Formatos».
    await expect(page.getByRole('button', { name: 'Formatos', exact: true })).toHaveCount(0)
    await page.getByTestId('panel-formatos').click()
    await expect(page.getByRole('button', { name: 'Ruteo de documentos', exact: true })).toBeVisible()
    await expect(page.getByTestId('formatos-impresion')).toContainText('Ruteo de documentos')
    await page.screenshot({ path: `${SALIDA}/ruteo-oscuro.png` })

    // Puentes: estado, versión y plataforma del mismo registro. La versión sale
    // de la misma constante que la demo (#336): un bump del agente no rompe acá.
    await page.getByTestId('panel-puentes').click()
    await expect(page.getByTestId('puentes-impresion')).toContainText(`en línea · v${VERSION_AGENTE_DEMO}`)
    await expect(page.getByTestId('puentes-impresion')).toContainText('macOS')
    await page.screenshot({ path: `${SALIDA}/puentes-oscuro.png` })
  })

  test('la prueba rápida avisa el resultado con toast y aviso persistente', async ({ page }) => {
    await page.addInitScript(() => { localStorage.setItem('mobos:theme', 'light') })
    await page.setViewportSize({ width: 1280, height: 900 })
    await entrarDemo(page)
    await abrirDispositivos(page)

    const tarjeta = tarjetaDe(page, 'Térmica mostrador')
    await tarjeta.getByRole('button', { name: 'Imprimir prueba' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Imprimir prueba' }).click()
    await expect(page.getByText('Prueba simulada (demo)').first()).toBeVisible()
    const resultado = page.getByTestId('resultado-prueba')
    await expect(resultado).toBeVisible()
    await expect(resultado).toContainText('Prueba simulada (demo)')
    await expect(resultado).toContainText('Térmica mostrador')
    await page.screenshot({ path: `${SALIDA}/prueba-claro.png` })

    // La tarjeta actualiza su última prueba (el seed no la tenía) y el aviso se
    // puede cerrar.
    await expect(tarjeta).toContainText('Prueba corta')
    await resultado.getByRole('button', { name: 'Cerrar' }).click()
    await expect(resultado).toHaveCount(0)
    await page.screenshot({ path: `${SALIDA}/acciones-claro.png` })
  })

  test('en móvil el menú «…» y las acciones quedan usables', async ({ page }) => {
    await page.addInitScript(() => { localStorage.setItem('mobos:theme', 'light') })
    await page.setViewportSize({ width: 390, height: 844 })
    await entrarDemo(page)
    await abrirDispositivos(page)

    const tarjeta = tarjetaDe(page, 'Térmica mostrador')
    const menu = tarjeta.getByRole('button', { name: /^Más acciones de/ })
    await expect(menu).toBeVisible()
    const caja = await menu.boundingBox()
    expect(caja.height).toBeGreaterThanOrEqual(40)
    await menu.click()
    await expect(page.getByRole('menuitem', { name: 'Diagnóstico' })).toBeVisible()
    await page.screenshot({ path: `${SALIDA}/menu-movil.png` })
  })
})
