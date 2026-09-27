#!/usr/bin/env node
// Verificación en CUENTA REAL de #273 (cliente ocasional en el pedido) y #260
// (buscar/crear cliente en la cotización). Solo lectura: abre las pantallas,
// comprueba que las acciones/opciones están desplegadas y captura. NO crea,
// cambia ni quita nada.
//
// Requisito: una sesión real exportada.
//   npx playwright codegen --save-storage=/tmp/mobos-qa.json https://app.moboss.online/login
//
// Uso:
//   node scripts/qa-260-273-produccion.mjs
//   node scripts/qa-260-273-produccion.mjs --config
//   MOBOS_QA_EXIGIR_DEPLOY=1 node scripts/qa-260-273-produccion.mjs   # post-deploy
//
// Salida: <QA_OUT>/*.png + resultados.json. `pendienteDeploy: true` cuando la
// rama todavía no está integrada a main (no falla salvo EXIGIR_DEPLOY).

import { createRequire } from 'node:module'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = String(process.env.MOBOS_QA_URL || 'https://app.moboss.online').replace(/\/$/, '')
const ESTADO = String(process.env.MOBOS_QA_STORAGE_STATE || '')
const SALIDA = process.env.MOBOS_QA_OUT || join(RAIZ, 'docs/QA-260-273-produccion')
const EXIGIR = process.env.MOBOS_QA_EXIGIR_DEPLOY === '1'
const SOLO_CONFIG = process.argv.includes('--config')

const faltantes = []
if (!ESTADO) faltantes.push('MOBOS_QA_STORAGE_STATE (sesión real exportada)')
else if (!existsSync(ESTADO)) faltantes.push(`MOBOS_QA_STORAGE_STATE no existe: ${ESTADO}`)

if (SOLO_CONFIG || faltantes.length) {
  console.log(JSON.stringify({ url: BASE, storageState: ESTADO || null, salida: SALIDA, faltantes, listo: faltantes.length === 0 }, null, 2))
  if (faltantes.length) console.error(`\n✖ Falta configurar: ${faltantes.join('; ')}`)
  process.exit(faltantes.length ? 1 : 0)
}

mkdirSync(SALIDA, { recursive: true })
const navegador = await chromium.launch()
const contexto = await navegador.newContext({ storageState: ESTADO, viewport: { width: 1440, height: 900 } })
const pagina = await contexto.newPage()
const resultados = { url: BASE, pasos: [], hallazgos: [], pendienteDeploy: false }

async function paso(nombre, accion) {
  try {
    const valor = await accion()
    resultados.pasos.push({ nombre, ok: true, ...(valor ? { dato: valor } : {}) })
    return valor
  } catch (cause) {
    resultados.pasos.push({ nombre, ok: false, error: cause instanceof Error ? cause.message : String(cause) })
    throw cause
  }
}

try {
  // #273 · Cliente del pedido: acciones presentes (asignar/crear o cambiar/quitar).
  await paso('pedidos: abrir una ficha', async () => {
    await pagina.goto(`${BASE}/pedidos`, { waitUntil: 'domcontentloaded' })
    const fila = pagina.getByTestId('pedido-fila').first()
    await fila.waitFor({ timeout: 20000 })
    await fila.click()
    await pagina.getByText('CLIENTE', { exact: false }).first().waitFor({ timeout: 20000 })
  })
  const accionesPedido = await pagina.evaluate(() => ['pedido-asignar-cliente', 'pedido-crear-ficha', 'pedido-cambiar-cliente', 'pedido-quitar-cliente'].filter((id) => globalThis.document.querySelector(`[data-testid="${id}"]`)))
  resultados.pasos.push({ nombre: 'pedidos: acciones del cliente', ok: accionesPedido.length > 0, dato: accionesPedido.join(', ') })
  if (accionesPedido.length === 0) resultados.pendienteDeploy = true
  await pagina.screenshot({ path: join(SALIDA, '01-pedido-cliente.png') })

  // #260 · Cotización: buscador con alta rápida y «Consumidor final».
  await paso('cotizaciones: abrir el alta', async () => {
    await pagina.goto(`${BASE}/cotizaciones`, { waitUntil: 'domcontentloaded' })
    await pagina.getByRole('button', { name: '+ Nueva cotización' }).click({ timeout: 20000 })
    await pagina.getByRole('textbox', { name: 'Cliente' }).waitFor({ timeout: 15000 })
  })
  const consumidorFinal = await pagina.getByTestId('cotizacion-consumidor-final').count()
  await paso('cotizaciones: escribir para ver resultados', async () => {
    await pagina.getByRole('textbox', { name: 'Cliente' }).fill('a')
    await pagina.waitForTimeout(700)
  })
  const crearFicha = await pagina.getByTestId('cotizacion-crear-ficha').count()
  resultados.pasos.push({ nombre: 'cotizaciones: consumidor final', ok: consumidorFinal > 0 })
  resultados.pasos.push({ nombre: 'cotizaciones: alta rápida', ok: crearFicha > 0 })
  if (consumidorFinal === 0 || crearFicha === 0) resultados.pendienteDeploy = true
  await pagina.screenshot({ path: join(SALIDA, '02-cotizacion-cliente.png') })

  if (resultados.pendienteDeploy) resultados.hallazgos.push('#260/#273 todavía no están desplegados (rama pendiente de integrar a main).')
  else resultados.hallazgos.push('#260/#273 desplegados: acciones del cliente en el pedido y buscador/alta rápida en la cotización presentes.')
} catch (cause) {
  resultados.hallazgos.push(`Falló la corrida: ${cause instanceof Error ? cause.message : String(cause)}`)
} finally {
  writeFileSync(join(SALIDA, 'resultados.json'), JSON.stringify(resultados, null, 2))
  await navegador.close()
}

console.log(JSON.stringify(resultados, null, 2))
if (resultados.hallazgos.some((texto) => texto.startsWith('Falló'))) process.exit(1)
if (EXIGIR && resultados.pendienteDeploy) {
  console.error('\n✖ #260/#273 todavía no están desplegados en producción.')
  process.exit(1)
}
