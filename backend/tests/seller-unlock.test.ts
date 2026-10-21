import assert from 'node:assert/strict'
import test from 'node:test'
import { readUnlockPin, UnlockInputError } from '../lib/seller-unlock'

const request = (body: string | Uint8Array, headers: Record<string, string> = {}) => {
  // Copy byte fixtures into an owned ArrayBuffer accepted by DOM BodyInit,
  // preserving invalid UTF-8 bytes without a cast or text conversion.
  const payload: string | ArrayBuffer = body instanceof Uint8Array ? new ArrayBuffer(body.byteLength) : body
  if (body instanceof Uint8Array && payload instanceof ArrayBuffer) new Uint8Array(payload).set(body)
  return new Request('https://api.example.test/api/auth/unlock', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: payload })
}

test('self-unlock only accepts a PIN, never a target user or tenant', async () => {
  assert.equal(await readUnlockPin(request('{"pin":"1234"}')), '1234')
  for (const body of ['{}', 'null', '[]', '{"pin":1234}', '{"pin":"123"}', '{"pin":"1234567"}', '{"pin":"1234","sellerId":"other"}', '{"pin":"1234","tenantId":"other"}', '{"pin":"1234","role":"ADMIN"}', '{']) {
    await assert.rejects(readUnlockPin(request(body)), (cause: unknown) => cause instanceof UnlockInputError && cause.status === 400)
  }
})

test('self-unlock bounds body, rejects bad encoding and content type', async () => {
  await assert.rejects(readUnlockPin(request('x'.repeat(1025))), (cause: unknown) => cause instanceof UnlockInputError && cause.status === 413)
  await assert.rejects(readUnlockPin(request('{"pin":"1234"}', { 'content-length': '2048' })), (cause: unknown) => cause instanceof UnlockInputError && cause.status === 413)
  await assert.rejects(readUnlockPin(request(new Uint8Array([0xff, 0xfe]))), (cause: unknown) => cause instanceof UnlockInputError && cause.status === 400)
  await assert.rejects(readUnlockPin(request('{"pin":"1234"}', { 'content-type': 'text/plain' })), (cause: unknown) => cause instanceof UnlockInputError && cause.status === 415)
})

test('self-unlock does not wait indefinitely for a stalled body', async () => {
  const stalled = new Request('https://api.example.test/api/auth/unlock', { method: 'POST', headers: { 'content-type': 'application/json' }, body: new ReadableStream(), duplex: 'half' } as RequestInit)
  await assert.rejects(readUnlockPin(stalled), (cause: unknown) => cause instanceof UnlockInputError && cause.status === 408)
})
