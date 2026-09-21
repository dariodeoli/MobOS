// Archivos de prueba privados de este navegador, nunca enviados al servidor.
// En la demo viven solo en memoria (#204): se descartan al recargar.
import { isDemoRuntime } from './demoMode'

const memoria = new Map()

function database() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('mobos-demo-proofs', 1)
    req.onupgradeneeded = () => req.result.createObjectStore('proofs', { keyPath: 'id' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(new Error('No se pudo abrir el almacenamiento de comprobantes demo.'))
  })
}
async function transaction(mode, operation) {
  const db = await database()
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('proofs', mode)
      const req = operation(tx.objectStore('proofs'))
      tx.oncomplete = () => resolve(req.result)
      tx.onerror = () => reject(new Error('No se pudo guardar el comprobante. Revisá el espacio disponible.'))
      tx.onabort = tx.onerror
    })
  } finally { db.close() }
}
export async function listDemoProofs(paymentId) {
  if (isDemoRuntime) return [...memoria.values()].filter(p => p.paymentId === paymentId)
  return (await transaction('readonly', store => store.getAll())).filter(p => p.paymentId === paymentId)
}
export async function saveDemoProof(paymentId, file) {
  if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type)) throw new Error('Usá JPG, PNG, WebP o PDF.')
  if (file.size > 5 * 1024 * 1024 || file.size === 0) throw new Error('El archivo debe tener entre 1 byte y 5 MB.')
  const proof = { id: crypto.randomUUID(), paymentId, name: file.name, mimeType: file.type, size: file.size, createdAt: new Date().toISOString(), file }
  if (isDemoRuntime) {
    memoria.set(proof.id, proof)
    return proof
  }
  await transaction('readwrite', store => store.put(proof))
  return proof
}
