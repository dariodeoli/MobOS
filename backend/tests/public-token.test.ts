import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'
import { TOKEN_PUBLICO_RE, buscarPorTokenPublico, hashTokenPublico, nuevoTokenPublico } from '../lib/public-token'

test('los tokens públicos nuevos son 64 hex y su hash es sha256', () => {
  const token = nuevoTokenPublico()
  assert.equal(token.length, 64)
  assert.match(token, TOKEN_PUBLICO_RE)
  assert.equal(hashTokenPublico(token), createHash('sha256').update(token).digest('hex'))
  assert.match(hashTokenPublico(token), /^[a-f0-9]{64}$/)
})

test('un token nuevo se resuelve solo por hash (nunca se toca el legacy)', async () => {
  const token = nuevoTokenPublico()
  const llamadas: string[] = []
  const { row, hash, legacy } = await buscarPorTokenPublico(
    token,
    async (valor) => { llamadas.push(`hash:${valor}`); return { id: 'fila' } },
    async (valor) => { llamadas.push(`legacy:${valor}`); return null },
  )
  assert.deepEqual(row, { id: 'fila' })
  assert.equal(legacy, false)
  assert.equal(hash, null)
  assert.deepEqual(llamadas, [`hash:${hashTokenPublico(token)}`])
})

test('un token legacy se resuelve en claro y devuelve su hash para backfill', async () => {
  const legacy = '40e6b0c0-1111-2222-3333-444455556666'
  const { row, hash, legacy: esLegacy } = await buscarPorTokenPublico(
    legacy,
    async () => null,
    async (valor) => (valor === legacy ? { id: 'fila-legacy' } : null),
  )
  assert.deepEqual(row, { id: 'fila-legacy' })
  assert.equal(esLegacy, true)
  assert.equal(hash, hashTokenPublico(legacy))
})

test('un token inexistente no rompe la resolución', async () => {
  const { row, legacy } = await buscarPorTokenPublico('no-existe', async () => null, async () => null)
  assert.equal(row, null)
  assert.equal(legacy, false)
})
