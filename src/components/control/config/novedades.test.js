import assert from 'node:assert/strict'
import test from 'node:test'
import { ultimasNovedades } from './novedades.js'

const DOC = `# Novedades para el dueño

Texto introductorio.

---

## v1.0.2 — 2026-10-14

Rediseño de la aplicación.

- **Pedidos:** archivado automático.
- **Portal:** saldo a favor opcional.

## v1.0.1 — 2026-10-01

- **Ventas:** catálogo más rápido.

## Otra cosa sin versión

- no cuenta
`

test('ultimasNovedades devuelve las versiones más nuevas primero, sin Markdown', () => {
  const [primera, segunda, ...resto] = ultimasNovedades(DOC)
  assert.equal(primera.version, 'v1.0.2')
  assert.equal(primera.fecha, '2026-10-14')
  assert.equal(primera.intro, 'Rediseño de la aplicación.')
  assert.deepEqual(primera.items, ['Pedidos: archivado automático.', 'Portal: saldo a favor opcional.'])
  assert.equal(segunda.version, 'v1.0.1')
  assert.deepEqual(resto, [])
})

test('ultimasNovedades respeta la cantidad y tolera texto vacío', () => {
  assert.equal(ultimasNovedades(DOC, 1).length, 1)
  assert.deepEqual(ultimasNovedades(''), [])
  assert.deepEqual(ultimasNovedades(undefined), [])
})
