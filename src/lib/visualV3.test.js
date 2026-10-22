import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// Visual v3 (docs/visual-v3/DIRECCION.md): la paleta del shell autenticado
// (scope `.shell-nav-v2`) pisa lienzo, superficies y líneas sobre la global de
// la biblioteca. Este test mide el contraste EFECTIVO (biblioteca + shell) de
// los tonos de texto sobre cada superficie del shell, en claro y oscuro, y fija
// el contrato de la capa v3 (sin tocar geometría, con reduced-motion).

const leer = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8')
const lib = leer('../../node_modules/owncoding-ui/dist/styles.css')
const shell = leer('../components/app/shellNavigation.css')
const v3 = leer('../styles/visual-v3.css')

function tokens(css, apertura) {
  // Bloques que ABREN una línea con el selector exacto (`.shell-nav-v2 {` no
  // debe tomar `.dark .shell-nav-v2 {`).
  const salida = {}
  const lineas = css.split('\n')
  lineas.forEach((linea, i) => {
    if (linea.trimEnd() !== apertura) return
    let fin = i
    while (fin < lineas.length && !lineas[fin].includes('}')) fin++
    for (const m of lineas.slice(i, fin + 1).join('\n').matchAll(/--c-([\w-]+):\s*(\d+)\s+(\d+)\s+(\d+);/g)) salida[m[1]] = [+m[2], +m[3], +m[4]]
  })
  return salida
}

const lum = ([r, g, b]) => {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
const contraste = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }

const PALETAS = {
  claro: { ...tokens(lib, ':root {'), ...tokens(shell, '.shell-nav-v2 {') },
  oscuro: { ...tokens(lib, ':root {'), ...tokens(lib, 'html.dark {'), ...tokens(shell, '.dark .shell-nav-v2 {') },
}

test('v3: el texto del shell cumple AA sobre lienzo, tarjeta, relleno y hover', () => {
  for (const [tema, p] of Object.entries(PALETAS)) {
    for (const texto of ['fore', 'mute', 'fono-dark', 'fono-text', 'ok-text', 'warn-text', 'bad-text', 'info-text']) {
      for (const fondo of ['paper', 'ink', 'ink-900', 'ink-800', 'ink-700']) {
        if (!p[texto] || !p[fondo]) continue
        if (tema === 'oscuro' && texto === 'fono-dark') continue // en oscuro fono-dark es relleno, no texto
        const r = contraste(p[texto], p[fondo])
        assert.ok(r >= 4.5, `${tema}: --c-${texto} sobre --c-${fondo} da ${r.toFixed(2)}:1`)
      }
    }
  }
})

test('v3: en oscuro las superficies elevadas son más claras que el lienzo', () => {
  const p = PALETAS.oscuro
  assert.ok(lum(p.ink) > lum(p.paper), 'la tarjeta es más clara que el lienzo')
  assert.ok(lum(p['ink-800']) > lum(p.ink), 'el relleno elevado es más claro que la tarjeta')
  assert.ok(lum(p['ink-700']) > lum(p['ink-800']), 'el hover es más claro que el relleno')
})

test('v3: el lienzo claro tiene tinte y la tarjeta se separa de él', () => {
  const p = PALETAS.claro
  assert.notDeepEqual(p.paper, p.ink)
  assert.ok(contraste(p.ink, p.paper) > 1.08, 'tarjeta y lienzo se distinguen')
})

test('v3: la capa es solo presentación y respeta reduced-motion', () => {
  assert.match(leer('../components/app/AppShell.jsx'), /import '@\/styles\/visual-v3\.css'/)
  assert.match(leer('../components/shared/Popup.jsx'), /v3-portal/)
  assert.match(v3, /prefers-reduced-motion: reduce/)
  // La capa no define la paleta --c-* (vive en la biblioteca y el scope del shell).
  assert.doesNotMatch(v3, /--c-[\w-]+\s*:/)
  // Sin cambios de geometría de controles: no fija min-height (los 44 px
  // los define cada componente).
  assert.doesNotMatch(v3, /min-height\s*:/)
  // Los bordes se vuelven transparentes, no desaparecen (sin saltos de layout).
  assert.doesNotMatch(v3, /border(-width)?:\s*0\b/)
})
