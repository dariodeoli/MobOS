// Aserción de fuente (#237): los modales usan el tamaño estándar del objeto
// compartido (`shared/modal.js`) y no vuelven a declarar `max-w-*` a mano. Si
// aparece un modal con ancho suelto, este test falla y obliga a elegir tamaño.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { TAMANOS_MODAL } from '../components/shared/modal.js'
import { usosDeModal } from '../../scripts/auditoria-modales.mjs'

test('cada <Modal> usa un tamaño estándar y no declara max-w a mano', () => {
  const usos = usosDeModal()
  assert.ok(usos.length >= 90, `se auditan todos los modales (encontrados: ${usos.length})`)

  const culpables = usos
    .filter((uso) => uso.ancho || uso.classNameDinamico)
    .map((uso) => `${uso.ruta}:${uso.linea}${uso.ancho ? ` (${uso.ancho})` : ' (className dinámico)'}`)
  assert.deepEqual(culpables, [], 'cada modal usa size="…" del objeto Modal')

  for (const uso of usos) {
    if (uso.declarado) assert.ok(TAMANOS_MODAL[uso.declarado], `${uso.ruta}:${uso.linea} declara un tamaño inválido (${uso.declarado})`)
  }
  assert.deepEqual(Object.keys(TAMANOS_MODAL), ['corto', 'formulario', 'amplio', 'completo'])
})

test('el objeto Modal aplica el tamaño estándar', () => {
  const codigo = readFileSync(fileURLToPath(new URL('../components/ui/index.jsx', import.meta.url)), 'utf8')
  assert.ok(/TAMANOS_MODAL\[size\]/.test(codigo), 'el modal resuelve el ancho por tamaño')
  assert.ok(codigo.includes("from '@/components/shared/modal'"), 'los tamaños viven en el objeto compartido')
  assert.ok(!/max-w-lg/.test(codigo), 'el modal ya no fija un ancho suelto')
})
