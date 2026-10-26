import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// Dirección «Grafito» (src/styles/tokens.css): el cromo del menú lateral y de
// la barra móvil re-declara la paleta --c-* con sus propios tokens. Este test
// mide el contraste de esos tokens en claro y oscuro y fija que la capa del
// shell no cambie geometría (los 44 px los define cada componente).

const leer = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8')
const tokensCss = leer('../styles/tokens.css')
const base = leer('../styles/panel-foundation.css')

function bloque(css, apertura) {
  const inicio = css.indexOf(`${apertura} {`)
  assert.ok(inicio >= 0, `falta el bloque ${apertura}`)
  const cuerpo = css.slice(inicio, css.indexOf('}', inicio))
  const salida = {}
  for (const m of cuerpo.matchAll(/--ds-([\w-]+):\s*(\d+)\s+(\d+)\s+(\d+);/g)) salida[m[1]] = [+m[2], +m[3], +m[4]]
  return salida
}

const lum = ([r, g, b]) => {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
const contraste = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }

const TEMAS = { claro: bloque(tokensCss, ':root'), oscuro: { ...bloque(tokensCss, ':root'), ...bloque(tokensCss, 'html.dark') } }

test('grafito: el texto del cromo cumple AA sobre fondo, relleno y hover', () => {
  for (const [tema, t] of Object.entries(TEMAS)) {
    for (const texto of ['chrome-text', 'chrome-muted', 'chrome-accent']) {
      for (const fondo of ['chrome', 'chrome-raised', 'chrome-hover']) {
        const r = contraste(t[texto], t[fondo])
        assert.ok(r >= 4.5, `${tema}: --ds-${texto} sobre --ds-${fondo} da ${r.toFixed(2)}:1`)
      }
    }
  }
})

test('grafito: el aviso de la demo cumple AA en claro y oscuro', () => {
  for (const [tema, t] of Object.entries(TEMAS)) {
    const r = contraste(t['notice-text'], t['notice-bg'])
    assert.ok(r >= 4.5, `${tema}: aviso ${r.toFixed(2)}:1`)
  }
})

test('grafito: la capa del shell es presentación y se carga después de v3', () => {
  const shell = leer('../components/app/AppShell.jsx')
  assert.ok(shell.indexOf("import '@/styles/panel-foundation.css'") > shell.indexOf("import '@/styles/visual-v3.css'"))
  assert.match(leer('../index.css'), /@import '\.\/styles\/tokens\.css';/)
  assert.doesNotMatch(base, /min-height\s*:/)
  assert.doesNotMatch(base, /border(-width)?:\s*0\b/)
  assert.match(base, /prefers-reduced-motion: reduce/)
})
