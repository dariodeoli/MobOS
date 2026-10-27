import { test, expect } from '@playwright/test'
import { writeFile, mkdir } from 'node:fs/promises'
import { openShellDestination, shellCatalog } from './helpers/shell-navigation.js'
import { esperarAnimaciones } from './helpers/animaciones.js'

// Regla «sin recortes» (Dario, 22-10-2026): las páginas scrollean y los
// contenedores crecen. Esta spec entra a la demo como Dueño, recorre TODAS las
// vistas del menú (con sus pestañas y secciones), abre el detalle de un pedido,
// de un cliente y de un producto y un Popup de alta, y falla si en alguna:
//   1. hay scroll horizontal de la página;
//   2. un elemento visible queda recortado por un ancestro con overflow hidden/clip;
//   3. hay un área de scroll interno indeseada (overflow-y auto/scroll con
//      contenido que no entra) fuera de un Popup, un menú o un listado intencional;
//   4. un control queda solo en una fila (flex/grid con un único botón/selector y
//      una fila más de 3 veces más ancha que el control).
// Demo frontend-only (sin backend), igual que shell-layout.
const SALIDA = process.env.MOBOS_QA_OUT || '/tmp/mobos-sin-recortes'
const VIEWPORTS = [
  [1440, 900],
  [1280, 800],
  [768, 1024],
  [390, 844],
]

async function entrarDemo(page) {
  await page.route('**/api/**', route =>
    !new URL(route.request().url()).pathname.startsWith('/api/')
      ? route.continue()
      : route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Frontend-only harness"}' }),
  )
  await page.route(/https:\/\//, route => route.abort())
  await page.addInitScript(() => {
    sessionStorage.setItem('mobos:demo-guia-vista', '1')
    try { localStorage.setItem('mobos:aviso-metricas', '1') } catch { /* sin storage */ }
  })
  await page.goto('/demo', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Entrar como Dueño', exact: true }).click()
  await expect(page.getByTestId('shell')).toBeVisible()
}

async function asentar(page) {
  await expect(page.locator('main[aria-busy="true"]')).toHaveCount(0)
  await expect(page.locator('main').first()).toContainText(/\S/)
  // Una animación finita pausada nunca termina: tope de 2 s para no colgar el recorrido.
  await Promise.race([esperarAnimaciones(page), page.waitForTimeout(2000)])
  await page.waitForTimeout(150)
  await Promise.race([esperarAnimaciones(page), page.waitForTimeout(2000)])
}

// Corre en la página: devuelve los hallazgos de la vista actual.
function medir() {
  const vw = window.innerWidth
  const out = []
  const estilos = new Map()
  const getComputedStyle = el => {
    let s = estilos.get(el)
    if (!s) { s = window.getComputedStyle(el); estilos.set(el, s) }
    return s
  }
  const visible = el => {
    const s = getComputedStyle(el)
    if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) return false
    const r = el.getBoundingClientRect()
    return r.width > 1 && r.height > 1
  }
  const ocultos = new Map()
  // El contenido de un <details> cerrado no se pinta, aunque Chromium le siga
  // dando geometría (::details-content): no es un recorte visible.
  const plegado = el => {
    const d = el.closest('details:not([open])')
    return Boolean(d && !el.closest('summary'))
  }
  const oculto = el => Boolean(el.closest('[aria-hidden="true"], [inert], [hidden], .sr-only, [data-recorte-ok]')) || plegado(el)
  const nombre = el => {
    const id = el.getAttribute('data-testid') || el.getAttribute('data-tab-id')
    const clase = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 3).join('.') : ''
    const texto = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30)
    return `${el.tagName.toLowerCase()}${id ? `[${id}]` : ''}${clase ? `.${clase}` : ''} "${texto}"`
  }
  const enPopup = el => Boolean(el.closest('[role="dialog"], [role="alertdialog"], [aria-modal="true"]'))
  const enMenu = el => Boolean(el.closest('[role="menu"], [role="listbox"], [role="tooltip"], [role="combobox"], [data-popover], [data-menu]'))

  // 1. Scroll horizontal de la página.
  if (document.documentElement.scrollWidth > vw + 1)
    out.push({ kind: 'hscroll', what: `scrollWidth ${document.documentElement.scrollWidth} > ${vw}` })

  const todos = [...document.querySelectorAll('body *')].filter(el => !['SCRIPT', 'STYLE', 'NOSCRIPT', 'PATH', 'LINE', 'CIRCLE', 'RECT', 'G', 'DEFS', 'TITLE'].includes(el.tagName.toUpperCase()))

  // 2. Recorte por ancestro con overflow hidden/clip.
  const contenido = el =>
    ['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA', 'IMG', 'SVG'].includes(el.tagName.toUpperCase()) ||
    [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 1)
  for (const el of todos) {
    if (!contenido(el) || !visible(el) || oculto(el)) continue
    const estilo = getComputedStyle(el)
    if (estilo.position === 'fixed') continue
    const r = el.getBoundingClientRect()
    let a = el.parentElement
    let cortado = null
    // Un ancestro que scrollea en un eje sostiene el contenido de ese eje: no es un recorte.
    let scrollX = false
    let scrollY = false
    while (a && a !== document.body && a !== document.documentElement) {
      const s = getComputedStyle(a)
      const ocultaX = ['hidden', 'clip'].includes(s.overflowX)
      const ocultaY = ['hidden', 'clip'].includes(s.overflowY)
      const ellipsis = s.textOverflow === 'ellipsis' || (s.webkitLineClamp && s.webkitLineClamp !== 'none') || /line-clamp/.test(a.className || '')
      // Un absoluto solo lo recorta su bloque contenedor o un ancestro de éste.
      const salta = estilo.position === 'absolute' && s.position === 'static' && !ocultaX && !ocultaY
      if (!salta) {
        if (!ocultaX && ['auto', 'scroll'].includes(s.overflowX)) scrollX = true
        if (!ocultaY && ['auto', 'scroll'].includes(s.overflowY)) scrollY = true
        // Una truncación con puntos suspensivos es intencional y detiene la búsqueda.
        if ((ocultaX || ocultaY) && ellipsis) break
        if ((ocultaX || ocultaY) && visible(a)) {
          const ar = a.getBoundingClientRect()
          const sobreY = ocultaY && !scrollY ? r.bottom - ar.bottom : 0
          const sobreX = ocultaX && !scrollX ? r.right - ar.right : 0
          const sobreIzq = ocultaX && !scrollX ? ar.left - r.left : 0
          const sobreArriba = ocultaY && !scrollY ? ar.top - r.top : 0
          const sobre = Math.max(sobreY, sobreX, sobreArriba, sobreIzq)
          if (sobre > 2 && ar.height > 2) {
            // Un elemento entero fuera del ancestro es un acordeón/slide plegado, no un recorte.
            const fuera = r.top >= ar.bottom - 1 || r.left >= ar.right - 1 || r.bottom <= ar.top + 1 || r.right <= ar.left + 1
            if (!fuera) { cortado = { a, sobre: Math.round(sobre) }; break }
          }
        }
      }
      a = a.parentElement
    }
    if (cortado) out.push({ kind: 'recorte', what: `${nombre(el)} cortado ${cortado.sobre}px por ${nombre(cortado.a)}` })
  }

  // 3. Áreas de scroll interno indeseadas.
  for (const el of todos) {
    const s = getComputedStyle(el)
    if (!['auto', 'scroll'].includes(s.overflowY)) continue
    if (!visible(el) || oculto(el) || enPopup(el) || enMenu(el)) continue
    if (el.scrollHeight <= el.clientHeight + 2) continue
    if (el.closest('[data-scroll-ok]')) continue
    out.push({ kind: 'scroll-interno', what: `${nombre(el)} scroll ${el.scrollHeight}/${el.clientHeight}` })
  }

  // 4. Un control solo en una fila.
  const esControl = el => {
    const t = el.tagName.toUpperCase()
    if (t === 'BUTTON' || t === 'SELECT') return true
    if (t === 'A') return el.getAttribute('role') === 'button' || /btn|button/.test(el.className || '')
    return el.getAttribute('role') === 'button'
  }
  for (const fila of todos) {
    if (enPopup(fila) || enMenu(fila) || oculto(fila) || !visible(fila)) continue
    const s = getComputedStyle(fila)
    if (!/flex|grid/.test(s.display)) continue
    if (fila.getAttribute('role') === 'tablist' || fila.closest('[role="tablist"], nav, [data-tab-more], thead, [data-testid^="shell-"]')) continue
    const hijos = [...fila.children].filter(h => visible(h) && getComputedStyle(h).position !== 'absolute')
    // Un envoltorio con un único control adentro (y nada más) cuenta como el control.
    const soloControl = h => {
      if (esControl(h)) return h
      const interactivos = [...h.querySelectorAll('button, select, a[role="button"], [role="button"]')].filter(visible)
      const campos = h.querySelectorAll('input, textarea, select, label')
      return interactivos.length === 1 && campos.length === 0 && h.textContent.trim() === interactivos[0].textContent.trim() ? interactivos[0] : null
    }
    const unico = hijos.length === 1 ? soloControl(hijos[0]) : null
    if (!unico) continue
    hijos[0] = unico
    const texto = [...fila.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())
    if (texto) continue
    const rf = fila.getBoundingClientRect()
    const rc = hijos[0].getBoundingClientRect()
    if (rf.width > rc.width * 3 && rf.width > 160) out.push({ kind: 'control-solo', what: `${nombre(hijos[0])} solo en ${nombre(fila)} (${Math.round(rc.width)}/${Math.round(rf.width)}px)` })
  }
  return out
}

async function auditar(page, vista, hallazgos) {
  await asentar(page)
  // Las entradas «al aparecer» arrancan al scrollear: recorrer la página antes de medir.
  await page.evaluate(async () => {
    for (const y of [document.documentElement.scrollHeight, 0]) {
      window.scrollTo(0, y)
      await new Promise(resolve => setTimeout(resolve, 120))
    }
  })
  await asentar(page)
  const lista = await page.evaluate(medir)
  for (const h of lista) hallazgos.push(`${vista} · ${h.kind}: ${h.what}`)
}

async function recorrerSecciones(page, vista, hallazgos) {
  // Pestañas internas de la vista (Finanzas, Análisis, Configuración…).
  const nav = page.locator('main nav[aria-label^="Secciones de"]').first()
  if (!(await nav.count())) return
  const aria = await nav.getAttribute('aria-label')
  const etiquetas = await nav.getByRole('button').evaluateAll(b => b.map(n => n.textContent.trim()).filter(Boolean))
  for (const etiqueta of etiquetas) {
    const boton = page.getByRole('navigation', { name: aria, exact: true }).getByRole('button', { name: etiqueta, exact: true })
    if (!(await boton.count())) continue
    await boton.first().click().catch(() => {})
    await auditar(page, `${vista} › ${etiqueta}`, hallazgos)
  }
}

async function vivo(page, donde) {
  const r = await Promise.race([page.evaluate('1').then(() => 'vivo'), new Promise(res => setTimeout(() => res('CONGELADA'), 4000))])
  console.log(`   [${donde}] ${r}`)
  if (r !== 'vivo') throw new Error(`página congelada en ${donde}`)
}

async function abrirYAuditar(page, vista, hallazgos, abrir) {
  try {
    await abrir()
    await vivo(page, 'tras abrir detalle')
  } catch (error) {
    // Sin botón de alta en esa vista no es un recorte: no hay nada que medir.
    if (error.message !== 'SIN_ALTA') hallazgos.push(`${vista} · no-abre: ${String(error.message).split('\n')[0]}`)
    await page.keyboard.press('Escape').catch(() => {})
    return
  }
  await auditar(page, vista, hallazgos)
}

for (const [ancho, alto] of VIEWPORTS) {
  test(`sin recortes ni scroll interno · ${ancho}×${alto}`, async ({ page }) => {
    test.setTimeout(900_000)
    const hallazgos = []
    try {
    await page.setViewportSize({ width: ancho, height: alto })
    await entrarDemo(page)
    await asentar(page)
    const t0 = Date.now()
    const catalogo = await shellCatalog(page)
    console.log(`catálogo ${Date.now() - t0} ms · ${catalogo.destinations.length} destinos`)
    const destinos = catalogo.destinations
    expect(destinos.length, 'el catálogo del menú no puede estar vacío').toBeGreaterThan(10)
    for (const destino of destinos) {
      const vista = `${destino} @${ancho}`
      console.log(`> ${vista}`)
      try {
        await openShellDestination(page, destino)
      } catch (error) {
        if (!/Unknown shell journey/.test(error.message)) hallazgos.push(`${vista} · no-abre: ${String(error.message).split('\n')[0]}`)
        continue
      }
      const t1 = Date.now()
      await auditar(page, vista, hallazgos)
      await recorrerSecciones(page, vista, hallazgos)
      console.log(`${vista} ${Date.now() - t1} ms`)
    }

    // Detalles y altas.
    const detalle = async (destino, etiqueta, abrir) => {
      console.log(`> ${etiqueta} @${ancho}`)
      for (const paso of ['esc1', 'esc2']) {
        const r = await Promise.race([page.keyboard.press('Escape').then(() => 'ok'), page.waitForTimeout(5000).then(() => 'COLGADO')])
        console.log(paso, r)
      }
      await openShellDestination(page, destino)
      await vivo(page, 'tras abrir destino')
      await asentar(page)
      await vivo(page, 'tras asentar')
      await abrirYAuditar(page, `${etiqueta} @${ancho}`, hallazgos, abrir)
    }
    await detalle('Pedidos', 'Detalle de pedido', async () => {
      await page.getByTestId('pedido-fila').first().click()
      await page.waitForTimeout(500)
    })
    await detalle('Clientes', 'Detalle de cliente', async () => {
      await page.getByTestId('cliente-fila').first().click()
      await page.waitForTimeout(500)
    })
    await detalle('Productos', 'Detalle de producto', async () => {
      await page.getByTestId('producto-fila').first().click()
      await page.waitForTimeout(500)
    })
    await detalle('Productos', 'Popup Nuevo producto', async () => {
      const alta = page.getByRole('button', { name: /Nuevo producto|Crear producto|Agregar producto/ }).first()
      if (!(await alta.count())) throw new Error('SIN_ALTA')
      await alta.click()
      await expect(page.getByRole('dialog').first()).toBeVisible()
    })
    await detalle('Clientes', 'Popup Nuevo cliente', async () => {
      await page.getByRole('button', { name: /Crear cliente|Nuevo cliente|Agregar cliente/ }).first().click()
      await expect(page.getByRole('dialog').first()).toBeVisible()
    })

    } finally {
      await mkdir(SALIDA, { recursive: true })
      await writeFile(`${SALIDA}/hallazgos-${ancho}.txt`, hallazgos.join('\n'))
    }
    expect(hallazgos, `Recortes y scrolls internos a ${ancho}×${alto}:\n${hallazgos.join('\n')}`).toEqual([])
  })
}

// El detector tiene que ver lo que dice ver: cada caso malo produce su hallazgo y
// el caso sano no produce ninguno.
test('el detector marca recortes, scroll interno y controles solos', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 600 })
  await page.setContent(`<body style="margin:0">
    <div id="recorte" style="height:40px;overflow:hidden"><p style="height:120px;margin:0">Texto cortado por el alto fijo</p></div>
    <div id="scroll" style="height:50px;overflow-y:auto"><p style="height:200px;margin:0">Contenido con scroll interno</p></div>
    <div id="solo" style="display:flex;justify-content:flex-end;width:700px"><button>Guardar</button></div>
    <div id="ok" style="display:flex;gap:8px;width:700px"><button>Uno</button><button>Dos</button></div>
    <div id="sano" style="height:auto;overflow:hidden"><p>Texto que entra</p></div>
  </body>`)
  const tipos = (await page.evaluate(medir)).map(h => h.kind).sort()
  expect(tipos).toEqual(['control-solo', 'recorte', 'scroll-interno'])
})
