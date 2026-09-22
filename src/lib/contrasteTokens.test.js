import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

// Guarda de contraste de la paleta (#176): los tokens que se usan como TEXTO
// tienen que cumplir AA (4.5:1) sobre las superficies del tema. Si alguien
// toca la paleta y un token deja de ser legible, este test lo frena.

const RAIZ = fileURLToPath(new URL('..', import.meta.url))
const css = readFileSync(join(RAIZ, 'index.css'), 'utf8')

function tokensDe(selector) {
  const inicio = css.indexOf(selector)
  assert.ok(inicio !== -1, `falta el bloque ${selector}`)
  const bloque = css.slice(inicio, css.indexOf('}', inicio))
  const tokens = {}
  for (const match of bloque.matchAll(/--c-([\w-]+):\s*([\d]+)\s+([\d]+)\s+([\d]+);/g)) {
    tokens[match[1]] = [Number(match[2]), Number(match[3]), Number(match[4])]
  }
  return tokens
}

const luminancia = ([r, g, b]) => {
  const f = (valor) => { const v = valor / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
const contraste = (a, b) => {
  const [alto, bajo] = [luminancia(a), luminancia(b)].sort((x, y) => y - x)
  return (alto + 0.05) / (bajo + 0.05)
}

// Tokens con rol de texto + superficies donde se apoyan.
const TEXTO = ['fore', 'mute', 'fono-dark', 'fono-light', 'ok', 'warn', 'bad', 'info']
const SUPERFICIES = ['paper', 'ink', 'ink-900', 'ink-800']

test('los tokens de texto de la paleta cumplen contraste AA en claro y oscuro', () => {
  for (const [tema, selector] of [['claro', ':root {'], ['oscuro', '.dark {']]) {
    const tokens = tokensDe(selector)
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
