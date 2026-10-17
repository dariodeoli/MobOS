import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { ESTADOS, TONOS_ESTADO, estadoInfo } from '../../lib/estados.js'

// Bloques compartidos del rediseño (docs/PANTALLAS.md). Los componentes JSX se
// verifican por contrato de fuente (convención del repo); la lógica de
// estados se ejecuta de verdad.
const leer = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8')

test('estados: todo estado resuelve a uno de los 4 tonos y tolera variantes', () => {
  for (const mapa of Object.values(ESTADOS)) {
    for (const [clave, info] of Object.entries(mapa)) {
      assert.ok(TONOS_ESTADO.includes(info.tono), `${clave}: tono ${info.tono}`)
      assert.ok(info.label && !/\.\.\.|…/.test(info.label), `${clave}: etiqueta completa`)
    }
  }
  assert.deepEqual(estadoInfo('conciliado'), { label: 'Conciliado', tono: 'ok' })
  assert.deepEqual(estadoInfo('Por cobrar'), { label: 'Por cobrar', tono: 'warn' })
  assert.equal(estadoInfo('COMPLETED', 'pedido').tono, 'ok')
  assert.equal(estadoInfo('CANCELLED', 'pedido').tono, 'bad')
  assert.equal(estadoInfo('PENDING', 'pedido').tono, 'warn')
  assert.equal(estadoInfo('DELIVERED', 'entrega').tono, 'neutral')
})

test('estados: desconocido o vacío no rompe y queda neutral', () => {
  assert.deepEqual(estadoInfo('algo raro'), { label: 'algo raro', tono: 'neutral' })
  assert.deepEqual(estadoInfo(null), { label: '—', tono: 'neutral' })
  assert.deepEqual(estadoInfo(''), { label: '—', tono: 'neutral' })
})

test('StatusChip usa la familia de texto *-text, w-fit y el mapa único', () => {
  const chip = leer('./StatusChip.jsx')
  assert.match(chip, /from '@\/lib\/estados'/)
  for (const tono of ['ok', 'warn', 'bad']) assert.match(chip, new RegExp(`text-${tono}-text`), `tono ${tono} con texto de contraste`)
  assert.match(chip, /w-fit/)
  assert.doesNotMatch(chip, /#[0-9a-fA-F]{6}\b/, 'sin colores hex')
})

test('Toolbar envuelve ActionToolbar con los huecos search/filters/view/primary/more', () => {
  const barra = leer('./Toolbar.jsx')
  assert.match(barra, /import \{ ActionToolbar \} from 'owncoding-ui'/)
  for (const hueco of ['search', 'filters', 'view', 'primary', 'more']) assert.match(barra, new RegExp(`\\b${hueco}\\b`), `hueco ${hueco}`)
  assert.match(barra, /\{search && /, 'un hueco vacío no deja contenedor')
})

test('BarraModulo es un shim sobre Toolbar y conserva sus testids y props', () => {
  const shim = leer('./BarraModulo.jsx')
  assert.match(shim, /import Toolbar from '@\/components\/shared\/Toolbar'/)
  assert.match(shim, /testId = 'barra-modulo'/)
  assert.match(shim, /data-testid=\{testId\}/)
  for (const prop of ['icono', 'titulo', 'descripcion', 'contexto', 'tituloVisible', 'expandir']) assert.match(shim, new RegExp(`\\b${prop}\\b`))
})

test('ListaDensa: columnas ≥ md en grilla sin min-w, tarjetas < md, y modo clásico intacto', () => {
  const lista = leer('./ListaDensa.jsx')
  assert.match(lista, /columns/)
  assert.match(lista, /renderCard/)
  assert.match(lista, /renderFila/, 'los callers clásicos siguen funcionando')
  assert.match(lista, /gridTemplateColumns/)
  assert.match(lista, /PieListado/)
  assert.doesNotMatch(lista.replace(/\/\/[^\n]*/g, ''), /min-w-\[\d|overflow-x-auto/, 'sin tabla con min-w ni scroll horizontal')
  assert.match(leer('./useMediaQuery.js'), /min-width: 768px/, 'md = 768')
})

test('FieldRow: una caja con un borde, 44px, etiqueta arriba y error accesible', () => {
  const campo = leer('./FieldRow.jsx')
  assert.match(campo, /min-h-11/)
  assert.match(campo, /max-w-\[640px\]/)
  assert.match(campo, /<Label htmlFor/)
  assert.match(campo, /role="alert"/)
  assert.match(campo, /'aria-invalid': error \? true/)
  assert.match(campo, /'aria-describedby': unirDescripciones/)
  assert.match(campo, /focus-within:ring-2/, 'el foco del teclado se refleja en el contenedor compartido')
  assert.match(campo, /\[&_input\]:border-0/, 'el input hijo no pinta su propio borde')
  assert.equal((campo.match(/rounded-lg border /g) || []).length, 1, 'un solo borde exterior')
})

test('Stat tiene variante compact y StatGrid es una tira de una línea con scroll horizontal en celular', () => {
  const ui = leer('../ui/index.jsx')
  assert.match(ui, /export function Stat\(\{[^}]*compact = false/)
  const grilla = leer('./StatGrid.jsx')
  assert.match(grilla, /flex min-w-0 items-stretch overflow-x-auto/, 'tira de una línea')
  assert.doesNotMatch(grilla, /grid-cols-2/, 'ya no apila 2×2 en celular')
  assert.match(ui, /text-base font-semibold leading-6 tabular-nums/, 'cifra compacta de 16px semibold tabular')
  // #461: etiqueta + cifra en una línea; si no entra, la cifra baja (no se pisa con la métrica vecina).
  assert.match(ui, /min-h-10 shrink-0 flex-wrap items-center gap-x-2/, 'etiqueta + cifra en una línea y sin superposición')
  assert.match(ui, /whitespace-nowrap text-base font-semibold leading-6 tabular-nums/, 'la cifra nunca se parte')
})
