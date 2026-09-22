// #237 — Modales con ancho estándar: capturas antes/después de los principales
// y control del ancho renderizado por tamaño (corto 448 · formulario 576 ·
// amplio 768 · completo 1024). QA237_FASE=antes|despues (por defecto despues):
// en "antes" solo captura; en "despues" además exige el ancho del estándar.
import { test, expect } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { SEED } from './helpers/seed-data.js'

const API = SEED.api
const FASE = process.env.QA237_FASE === 'antes' ? 'antes' : 'despues'
const DIR = join('docs', 'qa', '237')
mkdirSync(DIR, { recursive: true })
const ANCHO_ESPERADO = { corto: 448, formulario: 576, amplio: 768, completo: 1024 }
const medidos = {}

test.use({ viewport: { width: 1440, height: 900 } })

async function capturar(page, dialogo, nombre, tamano) {
  await expect(dialogo).toBeVisible()
  const caja = await dialogo.boundingBox()
  medidos[nombre] = { ancho: Math.round(caja.width), tamano, fase: FASE }
  await dialogo.screenshot({ path: join(DIR, `237-${nombre}-${FASE}.png`) })
  if (FASE !== 'antes') expect(Math.round(caja.width), `${nombre} debe medir ${ANCHO_ESPERADO[tamano]}px (${tamano})`).toBe(ANCHO_ESPERADO[tamano])
}

test.afterAll(() => {
  writeFileSync(join(DIR, `anchos-${FASE}.json`), `${JSON.stringify(medidos, null, 2)}\n`)
})

test('Búsqueda global (amplio)', async ({ page }) => {
  await page.goto('/pos')
  await page.getByRole('button', { name: 'Buscar en toda la tienda' }).click()
  await capturar(page, page.getByRole('dialog', { name: 'Búsqueda global' }), 'busqueda-global', 'amplio')
})

test('Notificaciones (formulario)', async ({ page }) => {
  await page.goto('/pos')
  await page.getByRole('button', { name: /^Notificaciones/ }).first().click()
  await capturar(page, page.getByRole('dialog', { name: 'Notificaciones' }), 'notificaciones', 'formulario')
})

test('Nuevo conteo (formulario, antes sin ancho declarado)', async ({ page }) => {
  await page.goto('/inventario')
  await page.getByRole('button', { name: 'Conteos', exact: true }).click()
  await page.getByRole('button', { name: 'Nuevo conteo' }).click()
  await capturar(page, page.getByRole('dialog', { name: 'Nuevo conteo' }), 'nuevo-conteo', 'formulario')
})

test('Cambiar sucursal (corto)', async ({ page }) => {
  await page.goto('/pos')
  await page.getByTestId('menu-acciones').click()
  await page.getByTestId('menu-acciones-lista').getByRole('menuitem', { name: 'Cambiar sucursal' }).click()
  await capturar(page, page.getByRole('dialog', { name: 'Cambiar sucursal' }), 'cambiar-sucursal', 'corto')
})

test('Proveedores (amplio)', async ({ page }) => {
  const nombre = `Proveedor QA237 ${Date.now().toString(36).toUpperCase()}`
  await page.goto('/compras')
  await expect(page.getByRole('heading', { name: 'Compras' })).toBeVisible()
  await page.evaluate(async ({ api, nombre }) => {
    const respuesta = await fetch(`${api}/api/suppliers`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nombre, document: '80012345-6' }),
    })
    if (!respuesta.ok) throw new Error(`No se pudo crear el proveedor: ${respuesta.status}`)
  }, { api: API, nombre })
  await page.reload()
  await page.getByRole('button', { name: 'Proveedores' }).click()
  await capturar(page, page.getByRole('dialog', { name: 'Proveedores' }), 'proveedores', 'amplio')
})

test('Crear cliente (amplio)', async ({ page }) => {
  await page.goto('/clientes')
  await page.getByRole('button', { name: '+ Crear cliente' }).click()
  await capturar(page, page.getByRole('dialog', { name: 'Crear cliente' }), 'crear-cliente', 'amplio')
})

test('Ficha del cliente (amplio)', async ({ page }) => {
  await page.goto('/clientes')
  const verPerfil = page.getByRole('button', { name: /Ver perfil/ }).first()
  await expect(verPerfil).toBeVisible()
  await verPerfil.click()
  await capturar(page, page.getByRole('dialog', { name: /^Cliente: / }), 'ficha-cliente', 'amplio')
})
