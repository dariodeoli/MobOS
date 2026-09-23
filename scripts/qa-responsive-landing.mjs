// Auditoría responsive de la LANDING en producción (pedido de Dario).
//
// La landing se sirve en el host público (moboss.online); en local, `/` cae al
// acceso. Por eso se audita acá, con los mismos criterios que el spec del panel
// (scroll horizontal, elementos cortados y targets < 44 px) a 360/390/414/768.
// Uso:  node scripts/qa-responsive-landing.mjs
// Evidencia: docs/qa/responsive-mobile/landing-<ancho>.png (+ auditoria-landing.json)
/* global window, document, getComputedStyle */

import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const BASE = process.env.MOBOS_LANDING_URL || 'https://moboss.online/'
const SALIDA = process.env.MOBOS_CAPTURAS || 'docs/qa/responsive-mobile'
const ANCHOS = [[360, 740], [390, 844], [414, 896], [768, 1024]]

async function auditar(page) {
  return page.evaluate(() => {
    const vw = window.innerWidth
    const visible = (el) => el.offsetParent !== null && el.getClientRects().length > 0 && !el.closest('[aria-hidden="true"]')
    const enScrollable = (el) => {
      for (let n = el.parentElement; n; n = n.parentElement) {
        const overflow = getComputedStyle(n).overflowX
        if (overflow === 'auto' || overflow === 'scroll') return true
      }
      return false
    }
    const overflowH = Math.max(0, document.documentElement.scrollWidth - vw)
    const cortados = []
    for (const el of document.querySelectorAll('button, a, input, select, textarea, h1, h2, h3, table, img, [data-testid]')) {
      if (!visible(el) || enScrollable(el)) continue
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) continue
      if (rect.left < -1 || rect.right > vw + 1) {
        cortados.push({
          que: el.tagName.toLowerCase(),
          texto: (el.textContent || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 34),
          izquierda: Math.round(rect.left),
          derecha: Math.round(rect.right),
          ancho: Math.round(rect.width),
          clase: String(el.className).slice(0, 70),
        })
      }
    }
    const chicos = []
    for (const el of document.querySelectorAll('button, a[href], input:not([type="hidden"]), select, textarea, [role="button"]')) {
      if (!visible(el) || el.closest('[aria-hidden="true"]')) continue
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) continue
      if (rect.height < 44 || rect.width < 44) {
        chicos.push({
          que: el.tagName.toLowerCase(),
          texto: (el.textContent || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 30),
          ancho: Math.round(rect.width),
          alto: Math.round(rect.height),
          clase: String(el.className).slice(0, 70),
        })
      }
    }
    const porPatron = {}
    for (const chico of chicos) {
      const clave = `${chico.que}:${chico.clase.replace(/\s+/g, ' ').slice(0, 44)}`
      porPatron[clave] = porPatron[clave] ? { ...porPatron[clave], veces: porPatron[clave].veces + 1 } : { ...chico, veces: 1 }
    }
    return {
      overflowH,
      totalCortados: cortados.length,
      cortados: cortados.slice(0, 8),
      totalChicos: chicos.length,
      chicos: Object.values(porPatron).sort((a, b) => b.veces - a.veces).slice(0, 10),
    }
  })
}

const navegador = await chromium.launch()
const registro = []
mkdirSync(SALIDA, { recursive: true })
for (const [ancho, alto] of ANCHOS) {
  const page = await navegador.newPage({ viewport: { width: ancho, height: alto } })
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  const medicion = await auditar(page)
  registro.push({ pantalla: 'landing', ancho, ...medicion })
  console.log(`[landing-${ancho}] scroll=${medicion.overflowH}px cortados=${medicion.totalCortados} chicos=${medicion.totalChicos}`)
  for (const corte of medicion.cortados) console.log(`   corte: ${corte.que} izq=${corte.izquierda} der=${corte.derecha} · ${corte.texto}`)
  await page.screenshot({ path: `${SALIDA}/landing-${ancho}.png`, fullPage: false })
  await page.close()
}
writeFileSync(`${SALIDA}/auditoria-landing.json`, JSON.stringify(registro, null, 2))
await navegador.close()
