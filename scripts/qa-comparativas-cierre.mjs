// Láminas de cierre visual: dos capturas lado a lado (ANTES | DESPUÉS) con su
// fuente, para #271, #277 y el cierre de #256 (páginas secundarias).
//
// Las imágenes de PLT (#271), que viven en su rama, se extraen antes con:
//   git show origin/slot/plataforma:docs/qa/271-avatar-sin-flash/bloqueo-reload-en-curso.jpg > /tmp/plt-271-en-curso.jpg
//
//   node scripts/qa-comparativas-cierre.mjs
/* global document */
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const dataUrl = (ruta) => {
  const absoluta = ruta.startsWith('/') ? ruta : join(RAIZ, ruta)
  const mime = extname(absoluta).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg'
  return `data:${mime};base64,${readFileSync(absoluta).toString('base64')}`
}

const TRABAJOS = [
  {
    salida: 'docs/qa/271-avatar-sin-flash/comparativa-cierre.jpg',
    titulo: '#271 · Recarga del bloqueo: la foto anterior no debe aparecer',
    nota: 'Durante la ventana del avatar (claro, 1280×900, avatar demorado). Antes se pintaba la foto vieja del dispositivo; con el fix quedan las iniciales neutras hasta que entra la foto correcta.',
    antes: { ruta: 'docs/qa/271-avatar-sin-flash/dsn-antes/bloqueo-en-curso-claro.jpg', fuente: 'DSN · main, sin fix (bug reproducido)' },
    despues: { ruta: process.env.PLT_271_EN_CURSO || '/tmp/plt-271-en-curso.jpg', fuente: 'PLT · slot/plataforma, con fix' },
  },
  {
    salida: 'docs/qa/plantilla-prueba/comparativa-cierre.jpg',
    titulo: '#277 · Editor de la plantilla del ticket de prueba',
    nota: 'Ficha de la impresora → Probar (claro, 1280×900). Antes: modal mínimo con 1 copia fija. Después: tipo corto (predeterminado) o completo, bloques, ancho 58/80, corte, copias, vista previa del rollo y guardado en la impresora.',
    antes: { ruta: 'docs/qa/plantilla-prueba/antes/editor-claro-desktop-modal.jpg', fuente: 'Producción v1.0.190' },
    despues: { ruta: 'docs/qa/plantilla-prueba/despues/editor-claro-desktop-modal.jpg', fuente: 'Rama slot/diseno' },
  },
  {
    salida: 'docs/qa/paginas-secundarias/cierre/comparativa-cierre.jpg',
    titulo: '#256 · Páginas secundarias: barra de módulo compacta',
    nota: 'Productos (claro, 1280×900). Antes: encabezado suelto y acciones dispersas. Después: barra con identidad, contexto y acciones. Barrido final: 6/7 páginas con barra visible (la séptima es el pipeline del dueño).',
    antes: { ruta: 'docs/qa/paginas-secundarias/antes/productos-claro-desktop.jpg', fuente: 'Producción v1.0.190' },
    despues: { ruta: 'docs/qa/paginas-secundarias/cierre/productos-claro-desktop.jpg', fuente: 'Rama slot/diseno' },
  },
]

const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 })).newPage()

for (const trabajo of TRABAJOS) {
  const hoja = `
    <style>
      * { box-sizing: border-box }
      body { margin: 0; background: #0b1220; color: #e5e7eb; font-family: -apple-system, system-ui, 'Segoe UI', sans-serif }
      .hoja { width: 1280px; padding: 26px 26px 20px }
      h1 { font-size: 19px; margin: 0 0 6px }
      p { font-size: 12px; line-height: 1.45; color: #9ca3af; margin: 0 0 16px; max-width: 1180px }
      .grilla { display: grid; grid-template-columns: 1fr 1fr; gap: 16px }
      figure { margin: 0; background: #111827; border: 1px solid #1f2937; border-radius: 14px; overflow: hidden }
      figcaption { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; padding: 8px 12px; font-size: 12px; font-weight: 700; letter-spacing: .02em }
      figcaption span { color: #9ca3af; font-weight: 400 }
      img { display: block; width: 100%; height: auto }
      .pie { margin-top: 12px; font-size: 11px; color: #6b7280 }
    </style>
    <div class="hoja">
      <h1>${trabajo.titulo}</h1>
      <p>${trabajo.nota}</p>
      <div class="grilla">
        <figure><figcaption>ANTES <span>${trabajo.antes.fuente}</span></figcaption><img src="${dataUrl(trabajo.antes.ruta)}" alt="antes"></figure>
        <figure><figcaption>DESPUÉS <span>${trabajo.despues.fuente}</span></figcaption><img src="${dataUrl(trabajo.despues.ruta)}" alt="después"></figure>
      </div>
      <p class="pie">Evidencia generada por scripts/qa-comparativas-cierre.mjs · capturas individuales en las carpetas de cada pedido.</p>
    </div>`
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"></head><body>${hoja}</body></html>`, { waitUntil: 'load' })
  await page.evaluate(() => Promise.all([...document.images].map((img) => (img.complete ? null : new Promise((r) => { img.onload = r; img.onerror = r })))))
  await page.locator('.hoja').screenshot({ path: join(RAIZ, trabajo.salida), type: 'jpeg', quality: 80 })
  console.log(`[comparativa] ${trabajo.salida}`)
}

await browser.close()
