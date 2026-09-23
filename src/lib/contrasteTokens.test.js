import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

// Guarda de contraste de la paleta (#176/#241): los tokens que se usan como
// TEXTO tienen que cumplir AA (4.5:1) sobre las superficies del tema. Cubre la
// paleta base y el scope v2 (`.v2-piloto` / `.tema-v2`) en ambos temas. Si
// alguien toca la paleta y un token deja de ser legible, este test lo frena.

const RAIZ = fileURLToPath(new URL('..', import.meta.url))
const css = readFileSync(join(RAIZ, 'index.css'), 'utf8')
const lineas = css.split('\n')

// Devuelve el bloque que ABRE con el selector pedido y contiene tokens `--c-*`.
// (Un `css.indexOf` a secas puede caer en un bloque sin tokens, como el
// `html.dark { color-scheme: dark }` que precede a la paleta.)
function bloqueDe(apertura) {
  const inicios = lineas
    .map((linea, indice) => (linea.trim().startsWith(apertura) ? indice : -1))
    .filter((indice) => indice !== -1)
  for (const inicio of inicios) {
    let fin = inicio
    while (fin < lineas.length && !lineas[fin].includes('}')) fin++
    const bloque = lineas.slice(inicio, fin + 1).join('\n')
    if (bloque.includes('--c-')) return bloque
  }
  assert.fail(`falta el bloque de tokens que abre con ${apertura}`)
}

function tokensDe(apertura) {
  const tokens = {}
  for (const match of bloqueDe(apertura).matchAll(/--c-([\w-]+):\s*([\d]+)\s+([\d]+)\s+([\d]+);/g)) {
    tokens[match[1]] = [Number(match[2]), Number(match[3]), Number(match[4])]
  }
  return tokens
}

// Paleta efectiva: la base del tema y encima los overrides del scope v2.
const PALETAS = {
  'claro (base)': [':root {'],
  'oscuro (base)': ['html.dark {'],
  'claro (v2)': [':root {', '.v2-piloto,'],
  'oscuro (v2)': ['html.dark {', '.dark .v2-piloto,'],
}

function efectiva(bloques) {
  return bloques.reduce((paleta, apertura) => ({ ...paleta, ...tokensDe(apertura) }), {})
}

const luminancia = ([r, g, b]) => {
  const f = (valor) => { const v = valor / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
const contraste = (a, b) => {
  const [alto, bajo] = [luminancia(a), luminancia(b)].sort((x, y) => y - x)
  return (alto + 0.05) / (bajo + 0.05)
}
// Composición de un color con alfa sobre un fondo opaco.
const sobre = (color, alfa, fondo) => color.map((valor, indice) => valor * alfa + fondo[indice] * (1 - alfa))

// Tokens con rol de texto + superficies donde se apoyan.
const TEXTO = ['fore', 'mute', 'fono-dark', 'fono-light', 'ok', 'warn', 'bad', 'info']
const SUPERFICIES = ['paper', 'ink', 'ink-900', 'ink-800']

test('los tokens de texto de la paleta cumplen contraste AA en claro y oscuro (base y v2)', () => {
  for (const [tema, bloques] of Object.entries(PALETAS)) {
    const tokens = efectiva(bloques)
    for (const rol of TEXTO) {
      for (const superficie of SUPERFICIES) {
        const t = tokens[rol]
        const fondo = tokens[superficie]
        if (!t || !fondo) continue
        const ratio = contraste(t, fondo)
        assert.ok(ratio >= 4.5, `${tema}: --c-${rol} sobre --c-${superficie} da ${ratio.toFixed(2)}:1 (AA exige 4.5)`)
      }
    }
  }
})

test('el ítem activo del shell v2 cumple AA sobre su propio tinte (#241)', () => {
  // Claro: azul de acción como texto sobre `rgb(var(--c-info) / .14)`.
  const claro = efectiva(PALETAS['claro (v2)'])
  const fondoClaro = sobre(claro.info, 0.14, claro['ink-800'])
  assert.ok(
    contraste(claro.info, fondoClaro) >= 4.5,
    `claro: texto activo sobre su tinte da ${contraste(claro.info, fondoClaro).toFixed(2)}:1`,
  )
  // Oscuro: texto de primer nivel sobre `rgb(var(--c-info) / .20)`.
  const oscuro = efectiva(PALETAS['oscuro (v2)'])
  const fondoOscuro = sobre(oscuro.info, 0.2, oscuro['ink-800'])
  assert.ok(
    contraste(oscuro.fore, fondoOscuro) >= 4.5,
    `oscuro: texto activo sobre su tinte da ${contraste(oscuro.fore, fondoOscuro).toFixed(2)}:1`,
  )
})
