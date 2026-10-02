// Aserción de fuente (#237/#323): los modales usan el tamaño estándar del
// objeto compartido (`shared/modal.js`), no declaran `max-w-*` a mano y el
// objeto estándar (header/cuerpo/pie, cierre con cambios, validación y
// resultados) vive en la biblioteca; la app no conserva una copia local.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { TAMANOS_MODAL } from '../components/shared/modal.js'
import { usosDeModal } from '../../scripts/auditoria-modales.mjs'

const leer = (ruta) => readFileSync(fileURLToPath(new URL(ruta, import.meta.url)), 'utf8')

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

test('el objeto Modal de la biblioteca quedó adoptado sin copia local (#323)', () => {
  const kit = leer('../components/ui/index.jsx')
  // La app re-exporta el objeto de la biblioteca y ya no define el overlay.
  assert.ok(/export \{[\s\S]*\n  Modal,\n/.test(kit), 'el kit re-exporta Modal de owncoding-ui')
  assert.ok(/export \{[\s\S]*\n  Drawer,\n/.test(kit), 'el kit re-exporta Drawer de owncoding-ui')
  assert.ok(kit.includes("from 'owncoding-ui'"), 'los objetos salen del paquete')
  assert.ok(!kit.includes('function Modal('), 'la app no define su propio Modal')
  assert.ok(!kit.includes('function Drawer('), 'la app no define su propio Drawer')
  assert.ok(!kit.includes('fixed inset-0'), 'el overlay vive solo en la biblioteca')
  assert.ok(kit.includes('useDialogDirty') && kit.includes('useResultado') && kit.includes('useValidacionCampos'), 'el kit expone los objetos nuevos')

  // Los tamaños y la pieza de formulario también salen de la biblioteca.
  assert.ok(leer('../components/shared/modal.js').includes("from 'owncoding-ui/utils'"))
  assert.ok(leer('../components/shared/formulario.js').includes("from 'owncoding-ui/utils'"))

  // La biblioteca instalada trae las piezas del estándar.
  const biblioteca = leer('../../node_modules/owncoding-ui/src/components/ui.jsx')
  for (const pieza of ['useDialogDirty', 'CIERRE_CON_CAMBIOS', 'useResultado', 'min-h-0 flex-1 overflow-y-auto']) {
    assert.ok(biblioteca.includes(pieza), `la biblioteca publica «${pieza}»`)
  }
})

test('los compartidos de CMP adoptan resultados canónicos y cierre con cambios (#323)', () => {
  const etiquetas = leer('../components/shared/EtiquetasProductoModal.jsx')
  assert.ok(etiquetas.includes('useResultado'), 'etiquetas avisa con el objeto de resultados')
  assert.ok(etiquetas.includes("avisar.fallo('imprimir'"), 'el fallo de impresión usa el texto canónico')
  assert.ok(!etiquetas.includes('useToast'), 'etiquetas no vuelve al toast crudo')
  assert.ok(etiquetas.includes('<FormActions>'), 'el pie de etiquetas se monta en el pie fijo del diálogo')

  const reporte = leer('../components/shared/ReportePreview.jsx')
  assert.ok(reporte.includes('useResultado') && reporte.includes("avisar.fallo('imprimir'"))

  const comprobante = leer('../components/shared/ComprobantePreview.jsx')
  assert.ok(comprobante.includes('useResultado') && comprobante.includes("avisar.fallo('imprimir'"))

  const compartir = leer('../components/shared/CompartirImagen.jsx')
  assert.ok(compartir.includes("avisar.copiado('Imagen'"), 'copiar imagen usa el resultado canónico')

  const cropper = leer('../components/shared/PhotoCropper.jsx')
  assert.ok(/dirty=\{dirty\}/.test(cropper), 'el recorte confirma al cerrar con cambios')
  assert.ok(cropper.includes('<FormActions>'), 'el recorte usa el pie fijo del diálogo')
})

test('los modales de CRM/INV/PRN pendientes quedan documentados (#323)', () => {
  const doc = leer('../../docs/MODALES.md')
  for (const pendiente of ['SellerCustomers.jsx', 'Inventario.jsx', 'ServicioTecnico.jsx', 'Impresoras.jsx']) {
    assert.ok(doc.includes(pendiente), `el pendiente «${pendiente}» está documentado`)
  }
  assert.ok(doc.includes('CRM') && doc.includes('INV') && doc.includes('PRN'))
})
