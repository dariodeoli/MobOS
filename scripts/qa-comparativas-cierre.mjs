// Láminas de cierre visual: matriz claro/oscuro/móvil (filas) × ANTES | DESPUÉS
// (columnas) con la fuente de cada lado, para #271, #277 y el cierre de #256
// (páginas secundarias).
//
// Las imágenes «después» de #271 se generaron aplicando localmente el fix de PLT
// sin commitear (ver docs/QA-VERIFICACION-271-277.md): la rama las guarda como
// evidencia del comportamiento esperado hasta que el fix se integre.
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

const MATRICES = [
  {
    salida: 'docs/qa/271-avatar-sin-flash/comparativa-cierre.jpg',
    titulo: '#271 · Recarga del bloqueo: la foto anterior no debe aparecer',
    nota: 'Durante la ventana del avatar (demorado 1,5 s) en claro, oscuro y móvil. ANTES: se pintaba la foto vieja del dispositivo. DESPUÉS: iniciales neutras hasta resolver y luego la foto correcta (fix de PLT aplicado localmente sin commitear; se re-verifica al integrarse).',
    columnas: [
      { etiqueta: 'ANTES', fuente: 'DSN · main, sin fix' },
      { etiqueta: 'DESPUÉS', fuente: 'fix de PLT aplicado localmente' },
    ],
    filas: [
      { etiqueta: 'Claro', celdas: ['docs/qa/271-avatar-sin-flash/dsn-antes/bloqueo-en-curso-claro.jpg', 'docs/qa/271-avatar-sin-flash/dsn-despues/bloqueo-en-curso-claro.jpg'] },
      { etiqueta: 'Oscuro', celdas: ['docs/qa/271-avatar-sin-flash/dsn-antes/bloqueo-en-curso-oscuro.jpg', 'docs/qa/271-avatar-sin-flash/dsn-despues/bloqueo-en-curso-oscuro.jpg'] },
      { etiqueta: 'Móvil', celdas: ['docs/qa/271-avatar-sin-flash/dsn-antes/bloqueo-en-curso-movil.jpg', 'docs/qa/271-avatar-sin-flash/dsn-despues/bloqueo-en-curso-movil.jpg'] },
    ],
  },
  {
    salida: 'docs/qa/plantilla-prueba/comparativa-cierre.jpg',
    titulo: '#277 · Editor de la plantilla del ticket de prueba',
    nota: 'Ficha de la impresora → Probar, en claro, oscuro y móvil. ANTES (v1.0.190): modal mínimo con 1 copia fija. DESPUÉS: tipo corto (predeterminado) o completo, bloques, ancho 58/80, corte, copias, vista previa del rollo y guardado en la impresora.',
    columnas: [
      { etiqueta: 'ANTES', fuente: 'Producción v1.0.190' },
      { etiqueta: 'DESPUÉS', fuente: 'Rama slot/diseno' },
    ],
    filas: [
      { etiqueta: 'Claro', celdas: ['docs/qa/plantilla-prueba/antes/editor-claro-desktop-modal.jpg', 'docs/qa/plantilla-prueba/despues/editor-claro-desktop-modal.jpg'] },
      { etiqueta: 'Oscuro', celdas: ['docs/qa/plantilla-prueba/antes/editor-oscuro-desktop-modal.jpg', 'docs/qa/plantilla-prueba/despues/editor-oscuro-desktop-modal.jpg'] },
      { etiqueta: 'Móvil', celdas: ['docs/qa/plantilla-prueba/antes/editor-claro-mobile.jpg', 'docs/qa/plantilla-prueba/despues/editor-claro-mobile.jpg'] },
    ],
  },
  {
    salida: 'docs/qa/paginas-secundarias/cierre/comparativa-cierre.jpg',
    titulo: '#256 · Páginas secundarias: barra de módulo compacta',
    nota: 'Productos, en claro, oscuro y móvil. ANTES: encabezado suelto y acciones dispersas. DESPUÉS: barra con identidad, contexto y acciones. Barrido final: 6/7 páginas con barra visible (la séptima es el pipeline del dueño).',
    columnas: [
      { etiqueta: 'ANTES', fuente: 'Producción v1.0.190' },
      { etiqueta: 'DESPUÉS', fuente: 'Rama slot/diseno' },
    ],
    filas: [
      { etiqueta: 'Claro', celdas: ['docs/qa/paginas-secundarias/antes/productos-claro-desktop.jpg', 'docs/qa/paginas-secundarias/cierre/productos-claro-desktop.jpg'] },
      { etiqueta: 'Oscuro', celdas: ['docs/qa/paginas-secundarias/antes/productos-oscuro-desktop.jpg', 'docs/qa/paginas-secundarias/cierre/productos-oscuro-desktop.jpg'] },
      { etiqueta: 'Móvil', celdas: ['docs/qa/paginas-secundarias/antes/productos-claro-mobile.jpg', 'docs/qa/paginas-secundarias/cierre/productos-claro-mobile.jpg'] },
    ],
  },
]

const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1320, height: 900 }, deviceScaleFactor: 1 })).newPage()

for (const trabajo of MATRICES) {
  const filas = trabajo.filas.map((fila) => {
    const esMovil = fila.etiqueta.toLowerCase().startsWith('móvil')
    return `
    <div class="etiqueta">${fila.etiqueta}</div>
    ${fila.celdas.map((ruta) => `<figure${esMovil ? ' class="celda-movil"' : ''}><img src="${dataUrl(ruta)}" alt="${fila.etiqueta}"></figure>`).join('')}
  `
  }).join('')
  const hoja = `
    <style>
      * { box-sizing: border-box }
      body { margin: 0; background: #0b1220; color: #e5e7eb; font-family: -apple-system, system-ui, 'Segoe UI', sans-serif }
      .hoja { width: 1320px; padding: 24px 24px 18px }
      h1 { font-size: 19px; margin: 0 0 6px }
      p { font-size: 12px; line-height: 1.45; color: #9ca3af; margin: 0 0 14px; max-width: 1240px }
      .matriz { display: grid; grid-template-columns: 84px 1fr 1fr; gap: 12px; align-items: start }
      .cabecera { font-size: 12px; font-weight: 700; letter-spacing: .03em; padding: 2px 4px }
      .cabecera span { display: block; color: #9ca3af; font-weight: 400; letter-spacing: 0 }
      .etiqueta { font-size: 12px; font-weight: 700; color: #9ca3af; padding-top: 8px }
      figure { margin: 0; background: #111827; border: 1px solid #1f2937; border-radius: 12px; overflow: hidden }
      img { display: block; width: 100%; height: auto }
      .celda-movil { padding: 10px }
      .celda-movil img { max-width: 320px; margin: 0 auto; border-radius: 8px }
      .pie { margin-top: 12px; font-size: 11px; color: #6b7280 }
    </style>
    <div class="hoja">
      <h1>${trabajo.titulo}</h1>
      <p>${trabajo.nota}</p>
      <div class="matriz">
        <div></div>
        ${trabajo.columnas.map((columna) => `<div class="cabecera">${columna.etiqueta}<span>${columna.fuente}</span></div>`).join('')}
        ${filas}
      </div>
      <p class="pie">Evidencia generada por scripts/qa-comparativas-cierre.mjs · capturas individuales en las carpetas de cada pedido.</p>
    </div>`
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"></head><body>${hoja}</body></html>`, { waitUntil: 'load' })
  await page.evaluate(() => Promise.all([...document.images].map((img) => (img.complete ? null : new Promise((r) => { img.onload = r; img.onerror = r })))))
  await page.locator('.hoja').screenshot({ path: join(RAIZ, trabajo.salida), type: 'jpeg', quality: 80 })
  console.log(`[comparativa] ${trabajo.salida} (${trabajo.filas.length} temas × ${trabajo.columnas.length} lados)`)
}

await browser.close()

