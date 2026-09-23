// #241 (F4 · accesibilidad): el shell v2 cumple AA en claro y oscuro.
//
// Mide contraste REAL en el navegador (no de tokens): recorre los textos
// visibles del shell —sidebar, topbar, cajón del menú, barra inferior, banners
// y pie—, compone las alfas sobre el fondo real (los tokens usan /75, /15, /14)
// y falla si alguno queda por debajo de AA (4.5:1; 3:1 en texto grande).
// Captura las evidencias en docs/rediseno/.
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const SHOTS = 'docs/rediseno'

const preparar = (page, modo) =>
  page.addInitScript((modo) => {
    try {
      localStorage.setItem('mobos:theme', modo)
      localStorage.setItem('mobos:tema-v2', '1')
    } catch { /* sin storage */ }
  }, modo)

// Audita el shell de la página abierta. `contenedores` define qué se considera
// shell (lo demás es contenido del panel y solo se informa).
async function auditar(page, contenedores) {
  return page.evaluate((selectores) => {
    const parse = (c) => {
      const m = String(c).match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/)
      return m ? { rgb: [+m[1], +m[2], +m[3]], a: m[4] === undefined ? 1 : +m[4] } : null
    }
    const sobre = (fg, bg) => fg.rgb.map((v, i) => v * fg.a + bg[i] * (1 - fg.a))
    const lum = ([r, g, b]) => {
      const f = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
    }
    const ratio = (a, b) => {
      const [alto, bajo] = [lum(a), lum(b)].sort((x, y) => y - x)
      return (alto + 0.05) / (bajo + 0.05)
    }
    // Fondo real: compone desde la raíz del documento hasta el elemento.
    const fondoDe = (el) => {
      const cadena = []
      for (let n = el; n; n = n.parentElement) cadena.push(n)
      let fondo = [255, 255, 255]
      for (let i = cadena.length - 1; i >= 0; i--) {
        const bg = parse(getComputedStyle(cadena[i]).backgroundColor)
        if (bg && bg.a > 0) fondo = sobre(bg, fondo)
      }
      return fondo
    }
    const raices = selectores.flatMap((s) => Array.from(document.querySelectorAll(s)))
    const visible = (el) => el.offsetParent !== null && !el.closest('[aria-hidden="true"]')
    // Se miden NODOS de texto (no elementos): hay textos que viven sueltos
    // dentro de un div con íconos (banners) y un scan por elementos los pierde.
    const paseo = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (nodo) => {
        const padre = nodo.parentElement
        if (!padre || !nodo.nodeValue || nodo.nodeValue.trim().length < 2) return NodeFilter.FILTER_REJECT
        if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION'].includes(padre.tagName)) return NodeFilter.FILTER_REJECT
        return visible(padre) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
      },
    })
    const textos = []
    while (paseo.nextNode()) textos.push(paseo.currentNode)

    const bajos = []
    const contenido = []
    let medidosShell = 0
    for (const nodo of textos) {
      const el = nodo.parentElement
      const cs = getComputedStyle(el)
      const color = parse(cs.color)
      if (!color) continue
      const esShell = raices.some((raiz) => raiz.contains(el))
      if (!esShell && !el.closest('[role="dialog"], [role="status"], footer')) continue
      const fondo = fondoDe(el)
      const mezclado = sobre(color, fondo)
      const r = ratio(mezclado, fondo)
      const tam = parseFloat(cs.fontSize)
      const negrita = Number(cs.fontWeight) >= 600
      const grande = tam >= 24 || (tam >= 18.66 && negrita)
      const minimo = grande ? 3 : 4.5
      if (r < minimo) {
        const dato = {
          texto: nodo.nodeValue.trim().slice(0, 40),
          ratio: Number(r.toFixed(2)),
          color: cs.color,
          fondo: fondo.map((v) => Math.round(v)).join(','),
          tamano: cs.fontSize,
          peso: cs.fontWeight,
          clase: String(el.className).slice(0, 90),
        }
        if (esShell) bajos.push(dato)
        else contenido.push(dato)
      }
      if (esShell) medidosShell++
    }
    return { medidosShell, bajos, contenido: contenido.slice(0, 8), totalContenido: contenido.length }
  }, contenedores)
}

const SHELL = [
  '[data-testid="shell-lateral"]',
  'header',
  'nav[aria-label="Accesos rápidos"]',
  '[data-testid="shell-drawer-acciones"]',
  'footer',
]

function informar(etiqueta, medicion) {
  console.log(`[${etiqueta}] textos shell=${medicion.medidosShell} bajos=${medicion.bajos.length} · contenido bajos=${medicion.totalContenido}`)
  if (medicion.bajos.length) console.log(JSON.stringify(medicion.bajos, null, 2))
  if (medicion.totalContenido) console.log('contenido:', JSON.stringify(medicion.contenido))
}

test.describe('shell v2 · contraste AA', () => {
  for (const [vista, ancho, alto] of [['desktop', 1280, 900], ['mobile', 390, 844]]) {
    for (const [tema, modo] of [['claro', 'light'], ['oscuro', 'dark']]) {
      test(`${vista} ${tema}: el shell cumple AA`, async ({ page }) => {
        mkdirSync(SHOTS, { recursive: true })
        await page.setViewportSize({ width: ancho, height: alto })
        await preparar(page, modo)
        await page.goto('/resumen')
        await expect(page.locator('.tema-v2')).toHaveCount(1)
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 })
        // Que el contenido esté cargado: la captura es evidencia del shell, no
        // de los esqueletos de carga.
        await expect(page.getByText('Facturado').first()).toBeVisible({ timeout: 30_000 })

        const shell = await auditar(page, SHELL)
        informar(`shell-${vista}-${tema}`, shell)
        await page.screenshot({ path: `${SHOTS}/c241f4-shell-aa-${tema}-${vista}.png` })
        expect(shell.bajos, `AA en el shell (${vista} ${tema})`).toEqual([])

        if (vista === 'mobile') {
          await page.getByRole('button', { name: 'Menú', exact: true }).click()
          const menu = page.locator('[role="dialog"][aria-modal="true"]')
          await expect(menu).toBeVisible()
          const dentro = await auditar(page, [...SHELL, '[role="dialog"][aria-modal="true"]'])
          informar(`shell-${vista}-${tema}-menu`, dentro)
          await page.screenshot({ path: `${SHOTS}/c241f4-shell-aa-${tema}-menu.png` })
          expect(dentro.bajos, `AA en el menú (${vista} ${tema})`).toEqual([])
        }
      })
    }
  }
})

test('banner sin conexión: el shell sigue cumpliendo AA en ambos temas', async ({ page }) => {
  for (const [tema, modo] of [['claro', 'light'], ['oscuro', 'dark']]) {
    await preparar(page, modo)
    await page.goto('/resumen')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 })
    await page.context().setOffline(true)
    // El evento se dispara además a mano: la emulación de red no lo emite de
    // forma determinista y acá se mide el aviso, no el emulador.
    await page.evaluate(() => window.dispatchEvent(new Event('offline')))
    const banner = page.locator('[role="status"].bg-bad')
    await expect(banner).toBeVisible({ timeout: 10_000 })
    const medicion = await auditar(page, ['[role="status"].bg-bad'])
    informar(`shell-conexion-${tema}`, medicion)
    expect(medicion.bajos, `AA del aviso sin conexión (${tema})`).toEqual([])
    await page.context().setOffline(false)
  }
})

// El shell v2 vive sobre las pantallas: en oscuro se comprueba también el
// contenido del piloto (chips y avisos con los tonos nuevos). El contenido se
// informa; lo que se exige AA es el shell.
test('oscuro completo: el shell v2 sobre una pantalla del pilotaje', async ({ page }) => {
  mkdirSync(SHOTS, { recursive: true })
  await page.setViewportSize({ width: 1280, height: 900 })
  await preparar(page, 'dark')
  await page.goto('/inventario/unidades')
  await expect(page.locator('.tema-v2')).toHaveCount(1)
  await expect(page.getByTestId('inventario-fila').first()).toBeVisible({ timeout: 30_000 })
  const medicion = await auditar(page, SHELL)
  informar('shell-inventario-oscuro', medicion)
  await page.screenshot({ path: `${SHOTS}/c241f4-shell-aa-inventario-oscuro.png` })
  expect(medicion.bajos, 'AA del shell v2 en la pantalla de inventario').toEqual([])
})
