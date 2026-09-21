import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

// Aserción de fuente del Lote 1 del rediseño (docs/REDISENO.md): el shell y el
// topbar son la única fuente de identidad y de acciones secundarias. Si una
// pantalla vuelve a dibujar su propia cabecera, un avatar a mano o un diálogo
// nativo, este test falla y obliga a reutilizar los objetos compartidos.

const RAIZ = fileURLToPath(new URL('..', import.meta.url))
const SHELL = 'components/app/AppShell.jsx'

const leer = (ruta) => readFileSync(join(RAIZ, ruta), 'utf8')
const sinComentarios = (codigo) => codigo.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')

function archivosFuente() {
  return readdirSync(RAIZ, { recursive: true })
    .filter((ruta) => /\.(jsx?|mjs)$/.test(ruta) && !/\.test\./.test(ruta))
    .map((ruta) => ({ ruta: String(ruta).split(sep).join('/'), contenido: readFileSync(join(RAIZ, ruta), 'utf8') }))
}

test('el shell dibuja un solo h1 y expone la miga de sección', () => {
  const codigo = leer(SHELL)
  const h1 = codigo.match(/<h1\b/g) || []
  assert.equal(h1.length, 1, 'el shell debe dibujar un solo h1: el título de la vista')
  assert.match(codigo, /data-testid="shell-breadcrumb"/, 'la cabecera debe exponer la miga de sección')
})

test('las personas del shell se muestran con el Avatar compartido', () => {
  const codigo = leer(SHELL)
  assert.match(codigo, /<Avatar\b/, 'la persona de la barra lateral usa el Avatar compartido')
  assert.ok(!/<img[^>]*rounded-full/.test(codigo), 'sin fotos de personas a mano')
  assert.ok(!/charAt\(0\)\.toUpperCase\(\)/.test(codigo), 'sin iniciales a mano')
})

test('las acciones secundarias viven en el menú del shell', () => {
  const codigo = leer(SHELL)
  assert.match(codigo, /data-testid="shell-drawer-acciones"/, 'el menú debe exponer el bloque de acciones')
  for (const texto of ['Buscar en toda la tienda', 'Tema claro / oscuro', 'Atajos de teclado', 'Cerrar sesión']) {
    assert.ok(codigo.includes(texto), `la acción «${texto}» debe vivir en el menú del shell`)
  }
})

test('la búsqueda global conserva el contrato de combobox', () => {
  const codigo = leer('components/app/GlobalSearch.jsx')
  for (const atributo of ['role="combobox"', 'aria-activedescendant', 'aria-controls="global-search-listbox"', 'role="listbox"', '<EmptyState']) {
    assert.ok(codigo.includes(atributo), `falta ${atributo}`)
  }
})

test('las pantallas no usan diálogos nativos del navegador', () => {
  const culpables = archivosFuente()
    .filter((archivo) => /\b(?:window\s*\.\s*)?(?:alert|confirm)\s*\(/.test(sinComentarios(archivo.contenido)))
    .map((archivo) => archivo.ruta)

  assert.deepEqual(culpables, [])
})

test('el PIN se enmascara: texto oculto y máscara propia', () => {
  // #124: el enmascarado dependía de `-webkit-text-security: asterisk`, un
  // valor inexistente (solo none|circle|disc|square) → el navegador descartaba
  // la regla y el PIN quedaba a la vista. Ahora el input no dibuja el texto y
  // PinInput pinta un punto por dígito.
  const css = leer('index.css')
  assert.match(css, /\.pin-oculto\s*\{[^}]*color:\s*transparent/, 'el input del PIN debe ocultar el texto')
  const valores = [...css.matchAll(/-webkit-text-security:\s*([a-z-]+)/g)].map((m) => m[1])
  for (const valor of valores) {
    assert.ok(['none', 'circle', 'disc', 'square'].includes(valor), `valor inválido de -webkit-text-security: ${valor}`)
  }
})

test('PinInput pinta la máscara de puntos y no muestra los dígitos', () => {
  const codigo = leer('components/ui/index.jsx')
  assert.match(codigo, /pin-oculto/, 'el input de PIN debe usar la clase que oculta el texto')
  const mascara = codigo.slice(codigo.indexOf('export function PinInput'))
  assert.match(mascara, /aria-hidden="true"[\s\S]{0,400}rounded-full/, 'la máscara debe ser decorativa y de puntos')
  assert.ok(!/placeholder="••••"/.test(mascara), 'los puntos no pueden depender del placeholder del input')
})
