import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

// Aserción de fuente: fija las reglas de docs/CAMPOS.md. Si un campo se
// reimplementa suelto dentro de una pantalla, este test falla y obliga a usar
// el objeto compartido.

const RAIZ = fileURLToPath(new URL('..', import.meta.url))

function archivosFuente() {
  return readdirSync(RAIZ, { recursive: true })
    .filter((ruta) => /\.(jsx?|mjs)$/.test(ruta) && !/\.test\./.test(ruta))
    .map((ruta) => ({ ruta: String(ruta).split(sep).join('/'), contenido: readFileSync(join(RAIZ, ruta), 'utf8') }))
}

test('la consulta de RUC vive solo en el objeto compartido RucField', () => {
  const culpables = archivosFuente()
    .filter((archivo) => /api\/ruc/.test(archivo.contenido) && archivo.ruta !== 'components/shared/RucField.jsx')
    .map((archivo) => archivo.ruta)

  assert.deepEqual(culpables, [])
})

test('el correo y el teléfono no se escriben como input crudo fuera de sus objetos', () => {
  const permitidos = new Set(['components/shared/EmailField.jsx', 'components/shared/PhoneField.jsx'])
  const culpables = archivosFuente()
    .filter((archivo) => !permitidos.has(archivo.ruta) && /type="(email|tel)"/.test(archivo.contenido))
    .map((archivo) => archivo.ruta)

  assert.deepEqual(culpables, [])
})

test('los catálogos se eligen con el Select compartido', () => {
  const permitidos = new Set([
    'components/ui/index.jsx',
    'components/shared/SelectorSucursal.jsx',
    'components/shared/SelectorMedioPago.jsx',
  ])
  const culpables = archivosFuente()
    .filter((archivo) => !permitidos.has(archivo.ruta) && /<select/.test(archivo.contenido))
    .map((archivo) => archivo.ruta)

  assert.deepEqual(culpables, [])
})

test('el comprobante público no expone el snapshot interno', () => {
  // El snapshot guarda la fila completa del pedido (incluido el comentario
  // interno y la facturación); el detalle público filtra por nivel de token y
  // solo sirve los campos que corresponden a ese nivel.
  const ruta = fileURLToPath(new URL('../../backend/app/api/orders/public/[token]/route.ts', import.meta.url))
  const codigo = readFileSync(ruta, 'utf8')
  assert.ok(!codigo.includes('receiptSnapshot'), 'el detalle público no debe servir el snapshot crudo')
  assert.ok(codigo.includes("acceso?.level"), 'el detalle público debe seguir filtrando por nivel')
})
