// QA visual de los tokens v2 en Finanzas (#241 F1) sobre la demo: que montos,
// fechas y tablas no se rompan (desbordes, recortes, formato, alineación
// numérica y contraste AA) con el nuevo sistema de tokens.
//
// Uso: QA_BASE_URL=https://app.moboss.online node scripts/qa-finanzas-tokens-v2.mjs
// Salida: docs/qa/tokens-v2-finanzas/<versión>/*.jpg + resultados.json
/* global document, getComputedStyle */
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const WEB = (process.env.QA_BASE_URL || 'https://app.moboss.online').replace(/\/$/, '')
const VERSION = process.env.QA_VERSION || 'local'
const SALIDA = process.env.QA_OUT || join(RAIZ, `docs/qa/tokens-v2-finanzas/${VERSION}`)
mkdirSync(SALIDA, { recursive: true })

const resultados = []
const anotar = (nombre, ok, detalle) => {
  resultados.push({ nombre, ok, detalle })
  console.log(`${ok ? 'OK   ' : 'FALLO'} ${nombre}${detalle ? ` — ${detalle}` : ''}`)
}
const ver = async (nombre, fn) => {
  try {
    const detalle = await fn()
    anotar(nombre, true, detalle || '')
  } catch (error) {
    anotar(nombre, false, String(error?.message || error).slice(0, 400))
  }
}

// Se mide dentro de la página: desborde/clip, formato, alineación y contraste.
const MEDIR = () => {
  const visible = (el) => {
    const rect = el.getBoundingClientRect()
    const estilo = getComputedStyle(el)
    return rect.width > 1 && rect.height > 1 && estilo.visibility !== 'hidden' && estilo.display !== 'none'
  }
  const clipDe = (el) => Math.max(0, el.scrollWidth - el.clientWidth)
  const hoja = (el) => el.children.length === 0 && el.textContent.trim().length > 0
  // Un importe tiene dígitos: evita falsos positivos con el prefijo "Gs.".
  const esMonto = (texto) => /^(Gs\.?\s?\d[\d.,]*|US\$\s?\d[\d.,]*|R\$\s?\d[\d.,]*|€\s?\d[\d.,]*)$/.test(texto)
  const esFecha = (texto) => /^(\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?|\d{1,2}[- ]\w{3,4}\.?)(\s*·\s*\d{1,2}:\d{2})?$/i.test(texto)
  // Los controles deshabilitados (o casi transparentes) están exentos de AA.
  const deshabilitado = (el) => {
    let nodo = el
    for (let i = 0; nodo && i < 4; i++) {
      if (nodo.disabled === true || nodo.getAttribute?.('aria-disabled') === 'true') return true
      if (Number.parseFloat(getComputedStyle(nodo).opacity || '1') < 0.9) return true
      nodo = nodo.parentElement
    }
    return false
  }
  const color = (texto) => {
    const m = texto.match(/rgba?\(([^)]+)\)/)
    if (!m) return null
    const [r, g, b, a = '1'] = m[1].split(',').map((n) => Number(n.trim()))
    return { r, g, b, a: Number(a) }
  }
  const luminancia = ({ r, g, b }) => {
    const canal = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
    return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b)
  }
  const fondoDe = (el) => {
    let nodo = el
    while (nodo && nodo !== document.documentElement) {
      const c = color(getComputedStyle(nodo).backgroundColor)
      if (c && c.a > 0.5) return c
      nodo = nodo.parentElement
    }
    return { r: 255, g: 255, b: 255, a: 1 }
  }
  const contraste = (el) => {
    const frente = color(getComputedStyle(el).color)
    if (!frente) return null
    const fondo = fondoDe(el)
    const l1 = luminancia(frente); const l2 = luminancia(fondo)
    const [alta, baja] = l1 > l2 ? [l1, l2] : [l2, l1]
    return Number(((alta + 0.05) / (baja + 0.05)).toFixed(2))
  }

  const nodos = [...document.querySelectorAll('body *')].filter(visible).filter(hoja)
  const montos = nodos.filter((el) => esMonto(el.textContent.trim()) && !deshabilitado(el))
  const fechas = nodos.filter((el) => esFecha(el.textContent.trim()))
  const tablas = [...document.querySelectorAll('table, [data-testid$="-tabla"]')].filter(visible)

  const mapear = (el) => {
    const estilo = getComputedStyle(el)
    const tamano = Number.parseFloat(estilo.fontSize) || 14
    const negrita = Number(estilo.fontWeight) >= 600
    return {
      texto: el.textContent.trim().slice(0, 40),
      clip: clipDe(el),
      tabular: estilo.fontVariantNumeric.includes('tabular-nums'),
      contraste: contraste(el),
      grande: tamano >= 18.66 || (negrita && tamano >= 14),
      testid: el.closest('[data-testid]')?.getAttribute('data-testid') || '',
      clase: el.getAttribute('class') || el.parentElement?.getAttribute('class') || '',
      ruta: `${el.tagName.toLowerCase()}${el.closest('[data-testid]') ? `[${el.closest('[data-testid]').getAttribute('data-testid')}]` : ''}`,
    }
  }

  return {
    pagina: { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth },
    montos: montos.map(mapear),
    fechas: fechas.map(mapear),
    tablas: tablas.map((el) => ({ testid: el.getAttribute('data-testid') || el.tagName.toLowerCase(), clip: clipDe(el), filas: el.querySelectorAll('tr, [data-testid$="-fila"]').length })),
  }
}

const revisar = (etiqueta, medicion, { permitirScrollTablas = false } = {}) => {
  const problemas = []
  const pagina = medicion.pagina
  if (pagina.scrollWidth > pagina.clientWidth + 1) problemas.push(`la página desborda (${pagina.scrollWidth} > ${pagina.clientWidth})`)
  const cortados = medicion.montos.filter((m) => m.clip > 1)
  if (cortados.length) problemas.push(`montos recortados: ${cortados.map((m) => `"${m.texto}" (+${m.clip}px)`).join(', ')}`)
  const fechasCortadas = medicion.fechas.filter((f) => f.clip > 1)
  if (fechasCortadas.length) problemas.push(`fechas recortadas: ${fechasCortadas.map((f) => `"${f.texto}" (+${f.clip}px)`).join(', ')}`)
  const tablasCortadas = medicion.tablas.filter((t) => t.clip > 1)
  if (tablasCortadas.length && !permitirScrollTablas) problemas.push(`tablas con columnas ocultas: ${tablasCortadas.map((t) => `${t.testid} (+${t.clip}px)`).join(', ')}`)
  const contrasteBajo = [...medicion.montos].filter((m) => m.contraste !== null && m.contraste < (m.grande ? 3 : 4.5))
  if (contrasteBajo.length) problemas.push(`contraste AA insuficiente: ${contrasteBajo.map((m) => `"${m.texto}" ${m.contraste}:1 (${m.ruta} · ${m.clase.slice(0, 60)})`).join(', ')}`)
  const sinTabular = medicion.montos.filter((m) => !m.tabular)
  const detalle = `${medicion.montos.length} montos · ${medicion.fechas.length} fechas · ${medicion.tablas.length} tablas${sinTabular.length ? ` · sin tabular-nums: ${sinTabular.map((m) => `"${m.texto}" (${m.ruta})`).join(', ')}` : ' · montos tabulares ✓'}`
  return { problemas, detalle }
}

const browser = await chromium.launch()
const contexto = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await contexto.newPage()

await ver('Demo: se entra como Dueño y se cierra la guía', async () => {
  await page.goto(`${WEB}/demo`)
  await page.getByRole('button', { name: /Entrar como Dueño/i }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 30000 })
  const guia = page.getByRole('dialog', { name: 'Cómo funciona la demo' })
  if (await guia.count()) await page.getByRole('button', { name: 'Cerrar' }).last().click()
  return page.url().replace(WEB, '')
})

const pantallas = [
  ['resumen', '/resumen', { espera: /Facturado|Resumen/i }],
  ['ganancias', '/analisis/ganancias', { espera: /Ganancias|Cómo se calcula/i }],
  ['caja', '/finanzas/caja', { espera: 'auditoria-efectivo-tabla' }],
  ['conciliacion', '/finanzas/conciliacion', { espera: /Conciliación/i }],
  ['gastos', '/finanzas/gastos', { espera: /Gastos|Movimientos/i }],
  ['bancos', '/finanzas/bancos', { espera: /Bancos|Cuentas/i }],
]

for (const [nombre, ruta, opciones] of pantallas) {
  await ver(`Tokens v2 · ${nombre}: montos, fechas y tablas sin romperse`, async () => {
    await page.goto(`${WEB}${ruta}`)
    if (opciones.espera) {
      const selector = opciones.espera instanceof RegExp ? page.getByText(opciones.espera).first() : page.getByTestId(opciones.espera)
      await selector.waitFor({ timeout: 30000 })
    }
    await page.waitForTimeout(900)
    const medicion = await page.evaluate(MEDIR)
    await page.screenshot({ path: join(SALIDA, `${nombre}-1440.jpg`), type: 'jpeg', quality: 72 })
    const { problemas, detalle } = revisar(nombre, medicion)
    if (problemas.length) throw new Error(`${detalle} · ${problemas.join(' · ')}`)
    return detalle
  })
}

await ver('Tokens v2 · móvil 390: caja y gastos sin desborde de página', async () => {
  const movil = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const chico = await movil.newPage()
  await chico.goto(`${WEB}/demo`)
  await chico.getByRole('button', { name: /Entrar como Dueño/i }).click()
  await chico.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 30000 })
  const guia = chico.getByRole('dialog', { name: 'Cómo funciona la demo' })
  if (await guia.count()) await chico.getByRole('button', { name: 'Cerrar' }).last().click()
  const detalles = []
  for (const [nombre, ruta, espera] of [['caja', '/finanzas/caja', 'auditoria-efectivo-tabla'], ['gastos', '/finanzas/gastos', /Gastos|Movimientos/i]]) {
    await chico.goto(`${WEB}${ruta}`)
    const selector = espera instanceof RegExp ? chico.getByText(espera).first() : chico.getByTestId(espera)
    await selector.waitFor({ timeout: 30000 })
    await chico.waitForTimeout(800)
    const medicion = await chico.evaluate(MEDIR)
    await chico.screenshot({ path: join(SALIDA, `${nombre}-390.jpg`), type: 'jpeg', quality: 72 })
    const { problemas, detalle } = revisar(nombre, medicion, { permitirScrollTablas: true })
    // En móvil las tablas pueden scrollear dentro de su contenedor; la página no.
    const graves = problemas.filter((p) => !p.startsWith('tablas con columnas ocultas'))
    if (graves.length) throw new Error(`${detalle} · ${graves.join(' · ')}`)
    detalles.push(`${nombre}: ${detalle}`)
  }
  await movil.close()
  return detalles.join(' · ')
})

writeFileSync(join(SALIDA, 'resultados.json'), JSON.stringify({ web: WEB, version: VERSION, fecha: new Date().toISOString(), resultados }, null, 2))
await browser.close()
const fallos = resultados.filter((r) => !r.ok)
console.log(`\n${resultados.length - fallos.length}/${resultados.length} verificaciones OK · capturas en ${SALIDA}`)
if (fallos.length) process.exitCode = 1
