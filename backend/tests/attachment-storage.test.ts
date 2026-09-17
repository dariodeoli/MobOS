import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { attachmentStorageDir, deleteAttachment, readAttachment, saveAttachment } from '../lib/attachment-storage'

const pdfBytes = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37])
const dbRecord = { storageKey: null, data: pdfBytes }
const savedDir = process.env.MOBOS_STORAGE_DIR

test.afterEach(() => {
  if (savedDir === undefined) delete process.env.MOBOS_STORAGE_DIR
  else process.env.MOBOS_STORAGE_DIR = savedDir
})

test('sin MOBOS_STORAGE_DIR no toca el disco y devuelve storageKey null', async () => {
  delete process.env.MOBOS_STORAGE_DIR
  assert.equal(attachmentStorageDir(), '')
  assert.deepEqual(await saveAttachment({ tenantId: 'tenant-a', area: 'payment-proofs', fileName: 'comprobante.pdf', mimeType: 'application/pdf', sha256: 'a'.repeat(64), data: pdfBytes }), { storageKey: null })
})

test('guarda el adjunto en el volumen y readAttachment lo lee del disco', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'mobos-attach-unit.'))
  process.env.MOBOS_STORAGE_DIR = ` ${dir} `
  try {
    const input = { tenantId: 'tenant-a', area: 'payment-proofs', fileName: '../../Comprobante Cliente.PDF', mimeType: 'application/pdf', sha256: 'b'.repeat(64), data: pdfBytes }
    const { storageKey } = await saveAttachment(input)
    assert.ok(storageKey)
    assert.equal(storageKey.split('/').length, 3)
    assert.match(storageKey, /^[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9._-]+$/)
    assert.ok(storageKey.endsWith('.pdf'))
    assert.deepEqual(Uint8Array.from(await readFile(path.join(dir, storageKey))), pdfBytes)
    assert.deepEqual(await readAttachment({ storageKey, data: Uint8Array.from([0x00]) }), pdfBytes)
    const second = await saveAttachment(input)
    assert.notEqual(second.storageKey, storageKey)
    await deleteAttachment({ storageKey })
    await assert.rejects(() => readFile(path.join(dir, storageKey)))
    await deleteAttachment({ storageKey })
    await deleteAttachment(null)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('cae de vuelta a data cuando no hay storageKey o el archivo ya no existe', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'mobos-attach-unit.'))
  process.env.MOBOS_STORAGE_DIR = dir
  try {
    assert.deepEqual(await readAttachment(dbRecord), pdfBytes)
    assert.deepEqual(await readAttachment({ storageKey: 'tenant-a/payment-proofs/ausente.pdf', data: pdfBytes }), pdfBytes)
    assert.deepEqual(await readAttachment({ storageKey: '../../etc/passwd', data: pdfBytes }), pdfBytes)
    await deleteAttachment({ storageKey: '../../etc/passwd' })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
