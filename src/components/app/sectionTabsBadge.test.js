// #357: contador por pestaña: oculto en 0, tope visual y nombre accesible.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { cuentaBadge, etiquetaBadge, infoBadge, nombreConBadge, textoBadge } from './sectionTabsBadge.js'
import { claveBadge, leerBadgesPestanas, publicarBadgePestana } from '../../lib/badgesPestanas.js'

test('cuentaBadge: solo enteros positivos; 0, vacío o inválido ocultan', () => {
  assert.equal(cuentaBadge(3), 3)
  assert.equal(cuentaBadge('4'), 4)
  for (const valor of [0, '0', -2, null, undefined, '', 'x', NaN]) assert.equal(cuentaBadge(valor), 0, String(valor))
})

test('infoBadge: null en 0 y etiqueta accesible «3 pendientes»', () => {
  assert.equal(infoBadge({ id: 'a', label: 'A', badge: 0 }), null)
  assert.equal(infoBadge({ id: 'a', label: 'A' }), null)
  assert.deepEqual(infoBadge({ id: 'a', label: 'A', badge: 3 }), { cuenta: 3, texto: '3', etiqueta: '3 pendientes' })
  assert.equal(infoBadge({ id: 'a', label: 'A', badge: 1 }).etiqueta, '1 pendiente')
  assert.equal(infoBadge({ id: 'a', label: 'A', badge: 2, badgeLabel: 'avisos' }).etiqueta, '2 avisos')
})

test('textoBadge topa en 99+ y nombreConBadge junta etiqueta y cuenta', () => {
  assert.equal(textoBadge(99), '99')
  assert.equal(textoBadge(150), '99+')
  assert.equal(etiquetaBadge(5), '5 pendientes')
  assert.equal(nombreConBadge({ label: 'Por aprobar', badge: 3 }), 'Por aprobar, 3 pendientes')
  assert.equal(nombreConBadge({ label: 'Por aprobar', badge: 0 }), undefined)
})

test('SectionTabs: toda pestaña con id usa el contador (arreglo [id, label, cuenta] incluido)', () => {
  const fuente = readFileSync(new URL('./SectionTabs.jsx', import.meta.url), 'utf8')
  assert.match(fuente, /badge: item\[2\]/)
  assert.equal((fuente.match(/data-tab-id=\{item\.id\}/g) || []).length, (fuente.match(/aria-label=\{nombreConBadge\(item\)\}/g) || []).length)
  assert.match(fuente, /aria-hidden="true"\s+data-tab-badge/)
})

test('el shell publica el contador de Control desde Stock y lo retira al salir', () => {
  const clave = claveBadge('stock', 'control')
  assert.equal(clave, 'stock:control')
  publicarBadgePestana(clave, 3)
  assert.equal(leerBadgesPestanas()[clave], 3)
  publicarBadgePestana(clave, 0)
  assert.equal(clave in leerBadgesPestanas(), false)
  publicarBadgePestana(clave, 'x')
  assert.equal(clave in leerBadgesPestanas(), false)
  const stock = readFileSync(new URL('../stock/StockShell.jsx', import.meta.url), 'utf8')
  assert.match(stock, /publicarBadgePestana\(clave, pendientesStock\)/)
  assert.match(stock, /return \(\) => publicarBadgePestana\(clave, 0\)/)
})
