#!/usr/bin/env node
// Verificación post-deploy SIN sesión de #260/#273: comprueba que los
// marcadores de la UI nueva viajen en los assets desplegados (código vivo en
// producción), sella la versión y captura la demo pública como contexto. No
// escribe datos.
//
// Uso: node scripts/qa-260-273-produccion-sin-sesion.mjs
//   QA_APP=https://app.moboss.online QA_OUT=docs/QA-260-273-produccion-v191
//
// Salida: <QA_OUT>/*.png + resultados.json. Sale 1 si falta algún marcador.

import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const BASE = String(process.env.QA_APP || 'https://app.moboss.online').replace(/\/$/, '')
const SALIDA = process.env.QA_OUT || 'docs/QA-260-273-produccion-v191'
mkdirSync(SALIDA, { recursive: true })

const MARCADORES = {
  'cotizacion-consumidor-final': '#260 · Consumidor final',
  'cotizacion-crear-ficha': '#260 · alta rápida',
  'Ficha creada desde el pedido': '#273 · cronología «Ficha creada desde el pedido»',
  'pedido-asignar-cliente': '#273 · asignar cliente',
  'pedido-crear-ficha': '#273 · crear ficha',
  'pedido-cambiar-cliente': '#273 · cambiar cliente',
  'pedido-quitar-cliente': '#273 · quitar cliente',
}

// 1) Demo pública: al navegar las pantallas, el navegador carga los chunks
// reales (incluidos los lazy). Se juntan todos los .js servidos.
const navegador = await chromium.launch({ headless: true })
const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 } })
const pagina = await contexto.newPage()
const scripts = new Set([...((await (await fetch(`${BASE}/`)).text()).matchAll(/(?:src|href)="([^"]+\.js)"/g))].map((m) => new URL(m[1], BASE).href))
pagina.on('response', (respuesta) => { if (/\.js($|\?)/.test(respuesta.url())) scripts.add(respuesta.url().split('?')[0]) })
await pagina.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await pagina.waitForTimeout(1200)
await pagina.getByRole('button', { name: /Dueño/ }).first().click()
await pagina.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 60000 })
await pagina.waitForTimeout(1500)
if (await pagina.getByRole('dialog', { name: 'Cómo funciona la demo' }).count()) {
  await pagina.getByRole('button', { name: 'Cerrar' }).last().click()
  await pagina.waitForTimeout(400)
}
await pagina.goto(`${BASE}/cotizaciones`, { waitUntil: 'domcontentloaded' })
await pagina.waitForTimeout(1500)
await pagina.screenshot({ path: join(SALIDA, '01-cotizaciones-demo.png') })
await pagina.goto(`${BASE}/pedidos`, { waitUntil: 'domcontentloaded' })
await pagina.waitForTimeout(1500)
await pagina.getByTestId('pedido-fila').first().click().catch(() => {})
await pagina.waitForTimeout(1500)
await pagina.screenshot({ path: join(SALIDA, '02-pedidos-demo.png') })
await navegador.close()

let contenido = ''
for (const url of scripts) contenido += await (await fetch(url)).text().catch(() => '')
const version = (contenido.match(/1\.0\.\d+/) || [])[0] || 'desconocida'
const marcadores = Object.fromEntries(Object.entries(MARCADORES).map(([clave, label]) => [label, contenido.includes(clave)]))

const faltantes = Object.entries(marcadores).filter(([, presente]) => !presente).map(([label]) => label)
const resultados = {
  url: BASE,
  version,
  assets: scripts.size,
  marcadores,
  faltantes,
  pendienteDeploy: faltantes.length > 0,
  capturas: ['01-cotizaciones-demo.png', '02-pedidos-demo.png'],
}
writeFileSync(join(SALIDA, 'resultados.json'), JSON.stringify(resultados, null, 2))
console.log(JSON.stringify(resultados, null, 2))
process.exit(resultados.pendienteDeploy ? 1 : 0)
