import assert from 'node:assert/strict'
import test from 'node:test'
import { MAX_PROOF_SIZE_BYTES, normalizeReconciliationNote, readProofFile, safeDownloadName } from '../app/api/payments/_lib'

function pdfFile(name = 'comprobante.pdf') {
  return new File([Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37])], name, { type: 'application/pdf' })
}

test('acepta PDF real y devuelve el material para persistencia', async () => {
  const proof = await readProofFile(pdfFile())
  assert.equal(proof.mimeType, 'application/pdf')
  assert.equal(proof.sizeBytes, 8)
  assert.match(proof.sha256, /^[a-f0-9]{64}$/)
  assert.ok(proof.data.length > 0)
})

test('rechaza MIME no permitido y magic bytes incompatibles', async () => {
  await assert.rejects(() => readProofFile(new File(['synthetic'], 'proof.txt', { type: 'text/plain' })), /Tipo de archivo no permitido/)
  await assert.rejects(() => readProofFile(new File(['not-a-pdf'], 'proof.pdf', { type: 'application/pdf' })), /no coincide/)
})

test('rechaza comprobantes mayores a 5 MiB antes de leerlos', async () => {
  const oversized = new File([new Uint8Array(MAX_PROOF_SIZE_BYTES + 1)], 'large.pdf', { type: 'application/pdf' })
  await assert.rejects(() => readProofFile(oversized), /supera el límite/)
})

test('normaliza nombres para descarga y notas de conciliación', () => {
  assert.equal(safeDownloadName('../../comprobante cliente.pdf'), 'comprobante_cliente.pdf')
  assert.equal(normalizeReconciliationNote('  revisado manualmente  '), 'revisado manualmente')
  assert.equal(normalizeReconciliationNote(''), null)
})
