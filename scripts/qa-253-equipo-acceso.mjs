// #253 · Grupo «Equipo y acceso» (Configuración): capturas del antes/después.
//
// Recorre la demo pública como dueño y captura el grupo en claro/oscuro y
// desktop/mobile: integrantes (con el resumen de horario), metas y comisiones
// (con el historial) y roles y permisos. Sirve para el «antes» (producción) y
// el «después» (rama): la sonda se adapta a las dos versiones.
//
// Uso: QA_BASE_URL=https://app.moboss.online QA_ETIQUETA=produccion node scripts/qa-253-equipo-acceso.mjs
// Salida: docs/qa/253-equipo-acceso/<etiqueta>/*.jpg|png + resultados-<etiqueta>.json
/* global window, document */
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const BASE = (process.env.QA_BASE_URL || 'https://app.moboss.online').replace(/\/$/, '')
const ETIQUETA = process.env.QA_ETIQUETA || 'post-deploy'
const SALIDA = join(process.env.QA_OUT || 'docs/qa/253-equipo-acceso', ETIQUETA)
mkdirSync(SALIDA, { recursive: true })

const VARIANTES = [
  { nombre: 'desktop-claro', ancho: 1280, alto: 900, tema: null },
  { nombre: 'desktop-oscuro', ancho: 1280, alto: 900, tema: 'dark' },
  { nombre: 'movil-claro', ancho: 390, alto: 844, tema: null },
]
const filtro = (process.env.QA_VARIANTES || '').split(',').map(valor => valor.trim()).filter(Boolean)
const variantes = filtro.length ? VARIANTES.filter(v => filtro.includes(v.nombre)) : VARIANTES
const esperar = ms => new Promise(resolve => setTimeout(resolve, ms))

async function entrarDemo(page) {
  await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded' })
  await esperar(1400)
  await page.getByRole('button', { name: /Entrar como Dueño/ }).first().click()
  await page.waitForURL(url => !url.pathname.startsWith('/demo'), { timeout: 30_000 })
  await esperar(2200)
  const guia = page.getByRole('dialog', { name: 'Cómo funciona la demo' })
  const aparecio = await guia.waitFor({ state: 'visible', timeout: 4000 }).then(() => true).catch(() => false)
  if (aparecio) await guia.getByRole('button', { name: 'Cerrar' }).click().catch(() => {})
}

const resultados = []
const navegador = await chromium.launch()

for (const variante of variantes) {
  const contexto = await navegador.newContext({
    viewport: { width: variante.ancho, height: variante.alto },
    deviceScaleFactor: 2,
  })
  await contexto.addInitScript(({ tema }) => {
    try { if (tema) localStorage.setItem('mobos:theme', tema) } catch { /* sin almacenamiento */ }
  }, { tema: variante.tema })
  const page = await contexto.newPage()
  const errores = []
  page.on('pageerror', error => errores.push(String(error.message).slice(0, 160)))

  await entrarDemo(page)
  await page.goto(`${BASE}/configuracion/equipo`, { waitUntil: 'domcontentloaded' })
  await esperar(1800)

  // Integrantes: la sección y la primera ficha.
  const tituloIntegrantes = await page.getByRole('heading', { name: /^(Integrantes|Funcionarios y metas)$/ }).first().innerText().catch(() => '')
  await page.getByRole('heading', { name: /Integrantes|Funcionarios y metas/ }).first().scrollIntoViewIfNeeded().catch(() => {})
  await esperar(300)
  await page.screenshot({ path: join(SALIDA, `equipo-integrantes-${variante.nombre}.jpg`), type: 'jpeg', quality: 70 })
  const ficha = page.getByTestId('integrante-fila').first()
  const horario = await page.getByRole('button', { name: /^Horario de / }).first().innerText().catch(() => '')
  if (await ficha.count()) await ficha.screenshot({ path: join(SALIDA, `integrantes-ficha-${variante.nombre}.png`) }).catch(() => {})

  // Metas y comisiones (solo en la versión nueva).
  const metas = page.getByTestId('equipo-metas-comisiones')
  const tieneMetas = (await metas.count()) > 0
  if (tieneMetas) {
    await metas.scrollIntoViewIfNeeded().catch(() => {})
    await esperar(300)
    await page.screenshot({ path: join(SALIDA, `equipo-metas-${variante.nombre}.jpg`), type: 'jpeg', quality: 70 })
    await metas.screenshot({ path: join(SALIDA, `metas-tarjeta-${variante.nombre}.png`) }).catch(() => {})
  }
  const filasMeta = await page.getByTestId('meta-fila').count().catch(() => 0)

  // Roles y permisos: cierre del grupo.
  const matriz = page.getByRole('heading', { name: 'Matriz de capacidades' })
  await matriz.scrollIntoViewIfNeeded().catch(() => {})
  await esperar(300)
  await page.screenshot({ path: join(SALIDA, `equipo-roles-${variante.nombre}.jpg`), type: 'jpeg', quality: 70 })

  const desborde = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  resultados.push({
    variante: variante.nombre,
    tituloIntegrantes,
    horarioVisible: horario.replace(/\s+/g, ' ').slice(0, 80) || null,
    tieneMetas,
    filasMeta,
    desbordeHorizontal: desborde,
    erroresPagina: errores,
  })
  await contexto.close()
}

await navegador.close()
writeFileSync(join(SALIDA, `resultados-${ETIQUETA}.json`), JSON.stringify({ base: BASE, etiqueta: ETIQUETA, fecha: new Date().toISOString(), resultados }, null, 2))
for (const fila of resultados) {
  console.log(`${fila.variante}: «${fila.tituloIntegrantes}» · metas ${fila.tieneMetas} (${fila.filasMeta} filas) · horario ${fila.horarioVisible || '—'} · desborde ${fila.desbordeHorizontal}px · errores ${fila.erroresPagina.length}`)
}
