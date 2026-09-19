import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import test from 'node:test'
import { ROLES_CON_DESBLOQUEO, cifrarSecreto, descifrarSecreto, secretEncryptionConfigured } from '../lib/secret-crypto'

// El llavero se lee en cada llamada, así que alcanza con configurarlo acá.
process.env.MOBOS_EMAIL_OUTBOX_ACTIVE_KEY_ID = 'test'
process.env.MOBOS_EMAIL_OUTBOX_ENCRYPTION_KEYS_JSON = JSON.stringify({ test: randomBytes(32).toString('base64') })

test('el llavero configurado habilita el cifrado', () => {
  assert.equal(secretEncryptionConfigured(), true)
})

test('ida y vuelta del código de desbloqueo', () => {
  const uso = { uso: 'service-order-unlock', referencia: 'os_123' }
  const cifrado = cifrarSecreto({ pin: '1234', patron: [1, 2, 5, 9] }, uso)
  assert.ok(!cifrado.includes('1234'), 'el texto plano no puede quedar en el payload')
  assert.deepEqual(descifrarSecreto(cifrado, uso), { pin: '1234', patron: [1, 2, 5, 9] })
})

test('el AAD ata el secreto a su fila', () => {
  const cifrado = cifrarSecreto({ pin: '1234' }, { uso: 'service-order-unlock', referencia: 'os_123' })
  assert.throws(() => descifrarSecreto(cifrado, { uso: 'service-order-unlock', referencia: 'os_999' }))
})

test('un payload corrupto no se descifra', () => {
  assert.throws(() => descifrarSecreto('mobos-secret:v1:test:aaa:bbb:ccc', { uso: 'x', referencia: 'y' }))
})

test('el desbloqueo lo ven dueño, gerente y técnico', () => {
  assert.deepEqual(ROLES_CON_DESBLOQUEO, ['ADMIN', 'GERENTE', 'TECNICO'])
})
