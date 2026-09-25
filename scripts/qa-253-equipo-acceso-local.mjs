// #253 · Verificación funcional del grupo «Equipo y acceso» en la demo local.
//
// Comprueba y captura, en claro/oscuro y desktop/mobile:
//   - Integrantes: la sección, sus fichas y el resumen de horario.
//   - Metas y comisiones: una fila por integrante activo; la meta se edita en
//     la demo y el cumplimiento de la ficha se actualiza al instante.
//   - Horario de acceso: se carga un rango y el resumen queda en la ficha.
//   - Roles y permisos: la matriz sigue dentro del grupo.
//
// Uso: QA_BASE_URL=http://127.0.0.1:5216 QA_ETIQUETA=verificacion-local node scripts/qa-253-equipo-acceso-local.mjs
// Salida: docs/qa/253-equipo-acceso/<etiqueta>/*.jpg|png + resultados.json
/* global window, document */
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const BASE = (process.env.QA_BASE_URL || 'http://127.0.0.1:5216').replace(/\/$/, '')
const ETIQUETA = process.env.QA_ETIQUETA || 'verificacion-local'
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
  const foto = (sufijo, tipo = 'jpg') => page.screenshot({ path: join(SALIDA, `${sufijo}-${variante.nombre}.${tipo}`), type: tipo === 'png' ? 'png' : 'jpeg', quality: 70 })

  const checks = {}
  await entrarDemo(page)
  await page.goto(`${BASE}/configuracion/equipo`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: 'Integrantes' }).waitFor({ timeout: 25_000 })
  await esperar(900)

  // 1 · Integrantes + Metas y comisiones + Roles dentro del grupo.
  checks.integrantes = await page.getByRole('heading', { name: 'Integrantes' }).isVisible()
  checks.metas = await page.getByRole('heading', { name: 'Metas y comisiones' }).isVisible()
  checks.roles = await page.getByRole('heading', { name: 'Matriz de capacidades' }).isVisible()
  const filasIntegrantes = await page.getByTestId('integrante-fila').count()
  const filasMetas = await page.getByTestId('meta-fila').count()
  checks.unaFilaDeMetasPorIntegranteActivo = filasIntegrantes === filasMetas && filasMetas > 0
  await foto('01-integrantes')
  await page.getByTestId('integrante-fila').first().screenshot({ path: join(SALIDA, `ficha-integrante-${variante.nombre}.png`) }).catch(() => {})

  // 2 · Editar la meta en demo: la ficha y el cumplimiento se actualizan.
  const campoMeta = page.getByLabel(/^Meta diaria de /).first()
  const nombre = (await campoMeta.getAttribute('aria-label') || '').replace('Meta diaria de ', '')
  await campoMeta.fill('250000')
  await campoMeta.blur()
  await esperar(900)
  const ficha = page.getByTestId('integrante-fila').filter({ hasText: nombre }).first()
  checks.metaGuardadaEnFicha = await ficha.getByText('Gs 250.000', { exact: true }).isVisible().catch(() => false)
  checks.cumplimientoVisible = await page.getByTestId('meta-fila').filter({ hasText: nombre }).getByText(/^\d+%$/).isVisible().catch(() => false)
  await page.getByTestId('equipo-metas-comisiones').scrollIntoViewIfNeeded().catch(() => {})
  await esperar(300)
  await foto('02-metas')
  await page.getByTestId('equipo-metas-comisiones').screenshot({ path: join(SALIDA, `metas-tarjeta-${variante.nombre}.png`) }).catch(() => {})

  // 3 · Horario de acceso: rango + resumen en la ficha.
  await page.getByLabel(`Horario de ${nombre}`).click()
  const modal = page.getByRole('dialog', { name: /Horario de acceso/ }).filter({ visible: true }).first()
  await modal.waitFor({ timeout: 15_000 })
  await modal.getByRole('button', { name: '+ Rango' }).click()
  await esperar(300)
  await modal.screenshot({ path: join(SALIDA, `modal-horario-${variante.nombre}.png`) }).catch(() => {})
  await modal.getByRole('button', { name: 'Guardar horario' }).click()
  await page.getByText('Horario de acceso actualizado.').waitFor({ timeout: 15_000 })
  await esperar(500)
  checks.horarioResumido = await page.getByLabel(`Horario de ${nombre}`).innerText().then(texto => texto.includes('Horario ·')).catch(() => false)
  await page.getByLabel(`Horario de ${nombre}`).scrollIntoViewIfNeeded().catch(() => {})
  await esperar(300)
  await foto('03-horario')

  // 4 · Roles y permisos.
  await page.getByRole('heading', { name: 'Matriz de capacidades' }).scrollIntoViewIfNeeded().catch(() => {})
  await esperar(300)
  await foto('04-roles')

  const desborde = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  resultados.push({
    variante: variante.nombre,
    nombreEditado: nombre,
    filasIntegrantes,
    filasMetas,
    checks,
    desbordeHorizontal: desborde,
    erroresPagina: errores,
  })
  await contexto.close()
}

await navegador.close()
writeFileSync(join(SALIDA, 'resultados.json'), JSON.stringify({ base: BASE, etiqueta: ETIQUETA, fecha: new Date().toISOString(), resultados }, null, 2))
for (const fila of resultados) {
  const fallos = Object.entries(fila.checks).filter(([, ok]) => !ok).map(([clave]) => clave)
  console.log(`${fila.variante}: ${fallos.length ? `FALLOS ${fallos.join(', ')}` : 'checks OK'} · ${fila.filasIntegrantes}/${fila.filasMetas} filas · desborde ${fila.desbordeHorizontal}px · errores ${fila.erroresPagina.length}`)
}
