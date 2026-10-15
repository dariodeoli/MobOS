import test from 'node:test'
import { Buffer } from 'node:buffer'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { prepararNovedades } from '../../scripts/preparar-novedades.mjs'

function contexto(t) {
  const raiz = mkdtempSync(join(tmpdir(), 'mobos-novedades-'))
  t.after(() => rmSync(raiz, { recursive: true, force: true }))
  return raiz
}

test('el checkout canónico prevalece sobre un documento reubicado antiguo', t => {
  const raiz = contexto(t)
  mkdirSync(join(raiz, 'docs'))
  writeFileSync(join(raiz, 'docs/NOVEDADES.md'), '## versión vigente\n')
  writeFileSync(join(raiz, 'NOVEDADES.md'), '## versión antigua\n')
  assert.equal(prepararNovedades(raiz), false)
  assert.equal(readFileSync(join(raiz, 'docs/NOVEDADES.md'), 'utf8'), '## versión vigente\n')
})

test('restaura byte a byte el documento reubicado por Railpack y permite repetir', t => {
  const raiz = contexto(t)
  const contenido = Buffer.from('## v1 — novedades\n\nVenta y verificación.\n')
  writeFileSync(join(raiz, 'NOVEDADES.md'), contenido)
  assert.equal(prepararNovedades(raiz), true)
  assert.deepEqual(readFileSync(join(raiz, 'docs/NOVEDADES.md')), contenido)
  assert.equal(prepararNovedades(raiz), false)
})

test('falla antes de compilar si el builder omitió ambas rutas', t => {
  assert.throws(() => prepararNovedades(contexto(t)), /Falta docs\/NOVEDADES\.md/)
})

test('npm run build prepara las novedades antes de ejecutar Vite', () => {
  const paquete = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))
  assert.equal(paquete.scripts.prebuild, 'node scripts/preparar-novedades.mjs')
})
