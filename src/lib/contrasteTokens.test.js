import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

// Guarda de contraste y adopción de la paleta (#176/#241): los tokens que se
// usan como TEXTO tienen que cumplir AA (4.5:1) sobre las superficies del
// tema. Desde la adopción de #241 la paleta v2 es **global** y vive en la
// biblioteca (`owncoding-ui`, importada con `styles.css`); este test la mide
// donde realmente está y frena si la app vuelve a pisar tokens a mano.

const RAIZ = fileURLToPath(new URL('..', import.meta.url))
const cssApp = readFileSync(join(RAIZ, 'index.css'), 'utf8')
const cssLib = readFileSync(join(RAIZ, '../node_modules/owncoding-ui/dist/styles.css'), 'utf8')
const lineas = cssLib.split('\n')

// Devuelve el bloque que ABRE con el selector pedido y contiene tokens `--c-*`.
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
  assert.fail(`la biblioteca no define el bloque de tokens que abre con ${apertura}`)
}

function tokensDe(apertura) {
  const tokens = {}
  for (const match of bloqueDe(apertura).matchAll(/--c-([\w-]+):\s*([\d]+)\s+([\d]+)\s+([\d]+);/g)) {
    tokens[match[1]] = [Number(match[2]), Number(match[3]), Number(match[4])]
  }
  return tokens
}

// Paleta efectiva de la app: la global de la biblioteca (los scopes v2 ya no
// traen overrides; `.tema-v2`/`.v2-piloto` son alias).
const PALETAS = {
  claro: [':root {'],
  oscuro: ['html.dark {'],
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

test('la app adopta la paleta de la biblioteca y no vuelve a pisarla', () => {
  // Estructura de la adopción (#241): paquete fijado a un tag, preset de
  // Tailwind con el content del bundle y styles.css después de Tailwind.
  const pkg = JSON.parse(readFileSync(join(RAIZ, '../package.json'), 'utf8'))
  const spec = String(pkg.dependencies?.['owncoding-ui'] || '')
  assert.match(spec, /owncoding-ui/, 'falta la dependencia owncoding-ui')
  assert.match(spec, /v\d+\.\d+\.\d+/, 'la biblioteca se fija a un tag (no a una rama)')
  const tailwind = readFileSync(join(RAIZ, '../tailwind.config.js'), 'utf8')
  assert.match(tailwind, /presets:\s*\[preset\]/, 'el preset de la biblioteca va en tailwind.config')
  assert.match(tailwind, /owncodingContent/, 'el content del bundle tiene que estar (Tailwind 3.4 lo ignora del preset)')
  const posTailwind = cssApp.indexOf('@tailwind utilities;')
  const posImport = cssApp.indexOf("@import 'owncoding-ui/styles.css'")
  assert.ok(posImport > 0, 'falta el import de styles.css en el CSS principal')
  // Vite exige que los @import precedan al resto (spec CSS): va antes de las
  // directivas de Tailwind y las reglas propias quedan después (y ganan).
  assert.ok(posImport < posTailwind, 'styles.css va antes de las directivas de Tailwind (Vite)')
  // Sin bloques locales de paleta: el ajuste de un rol va a la biblioteca.
  assert.doesNotMatch(
    cssApp,
    /--c-(paper|fore|ink|ink-\d|mute|fono|fono-dark|fono-light|fono-glow|ok|bad|warn|info|reserved|onbrand|pass|pass-dark|pass-soft|accion)\s*:/,
    'la app no puede redefinir la paleta --c-*',
  )
})

test('la app no vuelve a duplicar las reglas v2 de la biblioteca (#241, lote 32)', () => {
  // El bloque `.v2-piloto` propio se retiró: navegación, chips, stepper,
  // números, tiles, medallas, encabezados y degradados viven en `styles.css`.
  const prohibidas = [
    /\.tema-v2 nav\b/,
    /\.v2-piloto nav\b/,
    /\.v2-chip\b/,
    /\.v2-paso-activo\b/,
    /\.v2-tile\b/,
    /\.v2-grado\b/,
    /\.v2-numero\b/,
    /bg-fono\\\/15/,
    /text-onbrand\\\//,
    /from-fono-dark/,
    /\.tema-v2 thead\b/,
  ]
  for (const regla of prohibidas) {
    assert.doesNotMatch(cssApp, regla, `index.css no debe volver a declarar ${regla}`)
  }
  // Y la biblioteca tiene que seguir publicando lo que la app borró.
  for (const regla of [/\.tema-v2 \.v2-tile/, /\.tema-v2 \.oc-paso-activo/, /\.v2-piloto \.v2-chip/, /\.tema-v2 \.v2-chip\.bg-ok/]) {
    assert.match(cssLib, regla, `la biblioteca debe cubrir ${regla}`)
  }
  // Lo propio de la app sigue: superficies rojas y área táctil del topbar.
  assert.match(cssApp, /\.tema-v2 \.bg-bad/, 'la app mantiene sus superficies rojas')
  assert.match(cssApp, /header button::after/, 'el topbar mantiene el área táctil de 44 px')
})

test('los tokens de texto de la paleta cumplen contraste AA en claro y oscuro', () => {
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
  const claro = efectiva(PALETAS.claro)
  const fondoClaro = sobre(claro.info, 0.14, claro['ink-800'])
  assert.ok(
    contraste(claro.info, fondoClaro) >= 4.5,
    `claro: texto activo sobre su tinte da ${contraste(claro.info, fondoClaro).toFixed(2)}:1`,
  )
  // Oscuro: texto de primer nivel sobre `rgb(var(--c-info) / .20)`.
  const oscuro = efectiva(PALETAS.oscuro)
  const fondoOscuro = sobre(oscuro.info, 0.2, oscuro['ink-800'])
  assert.ok(
    contraste(oscuro.fore, fondoOscuro) >= 4.5,
    `oscuro: texto activo sobre su tinte da ${contraste(oscuro.fore, fondoOscuro).toFixed(2)}:1`,
  )
})
