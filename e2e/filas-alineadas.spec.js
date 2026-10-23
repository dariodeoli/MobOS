import { test, expect } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { openShellDestination } from './helpers/shell-navigation.js'
import { esperarAnimaciones } from './helpers/animaciones.js'

// Regla «Alineación de filas» (Dario, 23-10-2026): en toda fila de una lista o
// tabla, cada celda comparte el mismo eje vertical (el bloque título+meta cuenta
// como una unidad, junto a chips, montos, selects y botones de ícono), y los
// selects/chips de estado nunca cortan su valor («Esperando repues…»).
// Entra a la demo como Dueño, recorre las listas del producto y mide cada fila
// visible: los centros verticales de sus celdas difieren ≤ 2 px y ningún
// select/chip de fila tiene el texto truncado. Demo frontend-only.
const SALIDA = process.env.MOBOS_QA_OUT || '/tmp/mobos-filas'
const TOLERANCIA = 2
const VIEWPORTS = [
  [1440, 900],
  [1280, 800],
  [1024, 768],
  [768, 1024],
  [390, 844],
]

// Vistas con listas/tablas (destino del menú → pestañas internas opcionales).
const LISTAS = [
  'Pedidos',
  'Clientes',
  'Productos',
  'Unidades',
  'Compras',
  'Taller y garantías',
  'Delivery',
  'Autorizaciones',
  'Finanzas',
  'Cotizaciones',
  'Trade-In',
  'Promociones',
]

// Fila (testid) que confirma que la lista del destino ya se pintó.
const ESPERA = {
  Pedidos: 'pedido-fila',
  Clientes: 'cliente-fila',
  Productos: 'producto-fila',
  Unidades: 'inventario-fila',
  Compras: 'compra-fila',
  'Taller y garantías': 'servicio-fila',
  Delivery: 'reparto-admin-pedido',
  Autorizaciones: 'autorizacion-fila',
  Cotizaciones: 'cotizacion-fila',
  'Trade-In': 'tradein-fila',
  Promociones: 'promocion-fila',
}

async function entrarDemo(page) {
  await page.route('**/api/**', route =>
    !new URL(route.request().url()).pathname.startsWith('/api/')
      ? route.continue()
      : route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Frontend-only harness"}' }),
  )
  await page.route(/https:\/\//, route => route.abort())
  await page.addInitScript(() => {
    sessionStorage.setItem('mobos:demo-guia-vista', '1')
    try { localStorage.setItem('mobos:aviso-metricas', '1'); localStorage.setItem('mobos:clientes-vista', 'list') } catch { /* sin storage */ }
  })
  await page.goto('/demo', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Entrar como Dueño', exact: true }).click()
  await expect(page.getByTestId('shell')).toBeVisible()
}

async function asentar(page) {
  await expect(page.locator('main[aria-busy="true"]')).toHaveCount(0)
  await expect(page.locator('main').first()).toContainText(/\S/)
  await Promise.race([esperarAnimaciones(page), page.waitForTimeout(2000)])
  await page.waitForTimeout(150)
  await Promise.race([esperarAnimaciones(page), page.waitForTimeout(2000)])
}

// Corre en la página: devuelve los hallazgos de las filas visibles.
export function medirFilas(tolerancia) {
  const out = []
  const visible = el => {
    const s = getComputedStyle(el)
    if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) return false
    const r = el.getBoundingClientRect()
    return r.width > 1 && r.height > 1
  }
  const nombre = el => {
    const id = el.getAttribute('data-testid')
    const texto = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 50)
    return `${el.tagName.toLowerCase()}${id ? `[${id}]` : ''} "${texto}"`
  }
  const dentroDeMain = el => Boolean(el.closest('main'))
  const filas = new Set()
  for (const el of document.querySelectorAll('tbody tr, [data-testid$="-fila"], [role="row"]')) {
    if (!dentroDeMain(el) || !visible(el) || el.closest('thead, [aria-hidden="true"], [data-recorte-ok]')) continue
    if (el.matches('[data-testid="planilla-fila-movil"]')) continue
    filas.add(el)
  }
  // Una fila dentro de otra (tr dentro de un [data-testid$=-fila]) cuenta una sola vez: la interior.
  const lista = [...filas].filter(f => ![...filas].some(o => o !== f && f.contains(o)))
  // Centro vertical del CONTENIDO visible de la celda (texto, íconos, selects):
  // un botón de 44 px con el texto pegado arriba no está centrado aunque su caja sí.
  const centroY = el => {
    let top = Infinity
    let bottom = -Infinity
    const sumar = r => { if (r.width > 0 && r.height > 0) { top = Math.min(top, r.top); bottom = Math.max(bottom, r.bottom) } }
    const recorrer = n => {
      if (n.nodeType === 3) {
        if (!n.textContent.trim()) return
        const rango = document.createRange()
        rango.selectNodeContents(n)
        for (const r of rango.getClientRects()) sumar(r)
        return
      }
      if (n.nodeType !== 1 || !visible(n)) return
      if (n.matches('svg, img, canvas, select, input, textarea, progress')) { sumar(n.getBoundingClientRect()); return }
      for (const c of n.childNodes) recorrer(c)
    }
    recorrer(el)
    if (top === Infinity) { const r = el.getBoundingClientRect(); return r.top + r.height / 2 }
    return (top + bottom) / 2
  }
  const celdasDe = fila => {
    let nodo = fila
    // Un envoltorio único (link/button de fila completa) se atraviesa.
    for (let i = 0; i < 3; i += 1) {
      const hijos = [...nodo.children].filter(h => visible(h) && getComputedStyle(h).position !== 'absolute')
      if (hijos.length === 1 && !hijos[0].matches('input, select, button, a[role="button"]') && hijos[0].children.length > 1) nodo = hijos[0]
      else break
    }
    const s = getComputedStyle(nodo)
    if (s.display === 'contents') return []
    return [...nodo.children].filter(h => visible(h) && getComputedStyle(h).position !== 'absolute' && getComputedStyle(h).position !== 'fixed' && (h.textContent.trim() || h.querySelector('svg, img, input, select, button')))
  }
  const ctx = document.createElement('canvas').getContext('2d')
  for (const fila of lista) {
    const celdas = celdasDe(fila)
    if (celdas.length >= 2) {
      const r0 = fila.getBoundingClientRect()
      // Si la fila envuelve a varias líneas (celdas en distintos renglones) no hay eje común: es otro patrón.
      const tops = celdas.map(c => c.getBoundingClientRect())
      const unaLinea = tops.every(t => t.top < Math.min(...tops.map(x => x.bottom)) - 1)
      if (unaLinea) {
        const centros = celdas.map(centroY)
        const dif = Math.max(...centros) - Math.min(...centros)
        if (dif > tolerancia) {
          const peor = celdas.map((c, i) => `${nombre(c).slice(0, 36)}@${Math.round(centros[i] - r0.top)}`).join(' | ')
          out.push({ kind: 'eje', what: `${nombre(fila)} difiere ${dif.toFixed(1)}px: ${peor}` })
        }
      }
    }
    // Un chip, select o botón que se sale de la celda que lo contiene pisa a su vecina.
    for (const celda of celdas) {
      const rc = celda.getBoundingClientRect()
      for (const el of celda.querySelectorAll('select, button, [class*="chip"], [class*="badge"]')) {
        if (!visible(el) || getComputedStyle(el).position === 'absolute' || el.closest('[aria-hidden="true"]')) continue
        const re = el.getBoundingClientRect()
        if (re.right > rc.right + 1.5 || re.left < rc.left - 1.5) out.push({ kind: 'desborda-celda', what: `${nombre(el)} sale ${Math.round(Math.max(re.right - rc.right, rc.left - re.left))}px de su celda` })
      }
    }
    // Selects y chips sin truncar.
    for (const sel of fila.querySelectorAll('select')) {
      if (!visible(sel)) continue
      const s = getComputedStyle(sel)
      const opcion = sel.selectedOptions[0]?.textContent?.trim() || ''
      ctx.font = `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`
      const ancho = ctx.measureText(opcion).width
      const util = sel.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight)
      if (ancho > util + 1) out.push({ kind: 'select-truncado', what: `${nombre(sel)} texto ${Math.round(ancho)}px > ${Math.round(util)}px` })
    }
    for (const el of fila.querySelectorAll('button, span, a, div, p')) {
      if (!visible(el) || !el.children.length === 0) continue
      const s = getComputedStyle(el)
      if (s.textOverflow !== 'ellipsis' && !/line-clamp/.test(el.className || '')) continue
      if (el.scrollWidth <= el.clientWidth + 1) continue
      // Solo chips, estados y botones: el título largo con puntos suspensivos es intencional.
      if (el.closest('select') || !el.matches('button, [role="button"], [class*="chip"], [class*="badge"], [class*="estado"], [data-estado], [data-chip]')) continue
      out.push({ kind: 'chip-truncado', what: `${nombre(el)} ${el.scrollWidth}px > ${el.clientWidth}px` })
    }
  }
  return { hallazgos: out, filas: lista.length }
}

async function auditar(page, vista, hallazgos, conteo) {
  await asentar(page)
  const { hallazgos: lista, filas } = await page.evaluate(medirFilas, TOLERANCIA)
  conteo.filas += filas
  if (filas) conteo.vistas.push(`${vista}(${filas})`)
  for (const h of lista) hallazgos.push(`${vista} · ${h.kind}: ${h.what}`)
}

async function recorrerSecciones(page, vista, hallazgos, conteo) {
  const nav = page.locator('main nav[aria-label^="Secciones de"]').first()
  if (!(await nav.count())) return
  const aria = await nav.getAttribute('aria-label')
  const etiquetas = await nav.getByRole('button').evaluateAll(b => b.map(n => n.textContent.trim()).filter(Boolean))
  for (const etiqueta of etiquetas) {
    const boton = page.getByRole('navigation', { name: aria, exact: true }).getByRole('button', { name: etiqueta, exact: true })
    if (!(await boton.count())) continue
    await boton.first().click().catch(() => {})
    await auditar(page, `${vista} › ${etiqueta}`, hallazgos, conteo)
  }
}

for (const [ancho, alto] of VIEWPORTS) {
  test(`filas alineadas y sin textos cortados · ${ancho}×${alto}`, async ({ page }) => {
    test.setTimeout(600_000)
    const hallazgos = []
    const conteo = { filas: 0, vistas: [] }
    try {
      await page.setViewportSize({ width: ancho, height: alto })
      await entrarDemo(page)
      await asentar(page)
      for (const destino of LISTAS) {
        try {
          await openShellDestination(page, destino)
        } catch (error) {
          hallazgos.push(`${destino} @${ancho} · no-abre: ${String(error.message).split('\n')[0]}`)
          continue
        }
        if (ESPERA[destino]) await page.getByTestId(ESPERA[destino]).first().waitFor({ timeout: 10_000 }).catch(() => { if (ancho >= 768) hallazgos.push(`${destino} @${ancho} · sin-filas: no apareció ${ESPERA[destino]}`) })
        await auditar(page, `${destino} @${ancho}`, hallazgos, conteo)
        await recorrerSecciones(page, `${destino} @${ancho}`, hallazgos, conteo)
      }
    } finally {
      await mkdir(SALIDA, { recursive: true })
      await writeFile(`${SALIDA}/filas-${ancho}.txt`, [`filas medidas: ${conteo.filas}`, conteo.vistas.join(', '), '', ...hallazgos].join('\n'))
    }
    expect(conteo.filas, 'el recorrido tiene que medir filas reales').toBeGreaterThan(30)
    expect(hallazgos, `Filas desalineadas o con textos cortados a ${ancho}×${alto}:\n${hallazgos.join('\n')}`).toEqual([])
  })
}

// El medidor tiene que ver lo que dice ver.
test('el medidor marca ejes distintos y selects cortados, y deja pasar lo alineado', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 600 })
  await page.setContent(`<body style="margin:0"><main>
    <div data-testid="a-fila" style="display:flex;gap:8px;align-items:flex-start;height:60px"><div>Título<br>meta</div><span>Gs 0</span><select style="width:60px"><option>Esperando repuesto largo</option></select></div>
    <div data-testid="b-fila" style="display:flex;gap:8px;align-items:center;height:60px"><div>Título<br>meta</div><span>Gs 0</span><select style="width:200px"><option>Listo</option></select></div>
  </main></body>`)
  const { hallazgos } = await page.evaluate(medirFilas, TOLERANCIA)
  const tipos = [...new Set(hallazgos.map(h => h.kind))].sort()
  expect(tipos).toEqual(['eje', 'select-truncado'])
  expect(hallazgos.every(h => h.what.includes('a-fila') || h.what.includes('select') )).toBeTruthy()
})
