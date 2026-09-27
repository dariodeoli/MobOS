#!/usr/bin/env node
// Verificación de #268 (unificar clientes duplicados) en una CUENTA REAL:
// abre Clientes, entra a una ficha y comprueba la acción «Unificar» + el
// preview de lo que se movería (GET .../merge?with=, solo lectura). NO ejecuta
// el merge: la evidencia antes/después ya vive en el e2e.
//
// Requisito: una sesión real exportada.
//   npx playwright codegen --save-storage=/tmp/mobos-qa.json https://app.moboss.online/login
//
// Uso:
//   node scripts/qa-268-merge-produccion.mjs
//   MOBOS_QA_URL=http://localhost:5216 MOBOS_QA_STORAGE_STATE=e2e/.auth/admin.json node scripts/qa-268-merge-produccion.mjs
//   node scripts/qa-268-merge-produccion.mjs --config
//
// Salida: <QA_OUT>/*.png + resultados.json. Con MOBOS_QA_EXIGIR_DEPLOY=1 sale 1
// si la acción todavía no está desplegada (para correr después de integrar).

import { createRequire } from 'node:module'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = String(process.env.MOBOS_QA_URL || 'https://app.moboss.online').replace(/\/$/, '')
const ESTADO = String(process.env.MOBOS_QA_STORAGE_STATE || '')
const SALIDA = process.env.MOBOS_QA_OUT || join(RAIZ, 'docs/QA-268-merge-produccion')
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
  await paso('abrir clientes', async () => {
    await pagina.goto(`${BASE}/clientes`, { waitUntil: 'domcontentloaded' })
    await pagina.getByText('Clientes', { exact: true }).first().waitFor({ timeout: 20000 })
  })
  await pagina.screenshot({ path: join(SALIDA, '01-produccion-clientes.png') })

  const fila = pagina.locator('[data-testid="cliente-fila"]').first()
  await paso('abrir una ficha', async () => {
    await fila.getByRole('button', { name: /Ver detalle completo/ }).click()
    await pagina.getByText('Saldo pendiente', { exact: false }).first().waitFor({ timeout: 20000 })
  })
  await pagina.screenshot({ path: join(SALIDA, '02-produccion-ficha.png') })

  const botonUnificar = pagina.getByTestId('unificar-cliente-boton')
  const desplegado = await botonUnificar.count()
  resultados.pendienteDeploy = desplegado === 0
  if (desplegado === 0) {
    resultados.hallazgos.push('La acción «Unificar» no está desplegada todavía (pendiente de integrar #268 a main).')
  } else {
    await paso('abrir unificar', async () => {
      await botonUnificar.click()
      await pagina.getByTestId('unificar-cliente').waitFor({ timeout: 15000 })
    })
    await pagina.screenshot({ path: join(SALIDA, '03-produccion-unificar.png') })
    resultados.hallazgos.push('La acción «Unificar» está desplegada y el modal abre en producción.')
  }
} catch (cause) {
  resultados.hallazgos.push(`Falló la corrida: ${cause instanceof Error ? cause.message : String(cause)}`)
} finally {
  writeFileSync(join(SALIDA, 'resultados.json'), JSON.stringify(resultados, null, 2))
  await navegador.close()
}

console.log(JSON.stringify(resultados, null, 2))
if (resultados.hallazgos.some((texto) => texto.startsWith('Falló'))) process.exit(1)
if (EXIGIR && resultados.pendienteDeploy) {
  console.error('\n✖ #268 todavía no está desplegado en producción.')
  process.exit(1)
}
