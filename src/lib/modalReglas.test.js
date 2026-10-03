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

test('los modales de INV adoptan etiquetas, error junto al campo y resultados (#323)', () => {
  const inventario = leer('../components/control/Inventario.jsx')
  assert.ok(inventario.includes('title="Carga rápida de unidad" size="formulario"'), 'el alta de unidad declara su tamaño estándar')
  assert.ok(inventario.includes('dirty={Boolean(receive.productId'), 'el alta de unidad confirma al cerrar con cambios')
  for (const campo of ['Sucursal', 'Ubicación', 'Condición', 'Batería', 'Importe']) {
    assert.ok(inventario.includes(`FormField label="${campo}"`), `${campo} lleva etiqueta visible en el diálogo`)
  }
  assert.ok(inventario.includes('error={receiveError}'), 'el error del alta va junto al campo, adentro del diálogo')
  assert.ok(!inventario.includes("setError('Indicá al menos un IMEI/serial.')"), 'el error no cae al Aviso general detrás del overlay')
  assert.ok(inventario.includes('<SaveActions pendiente={busy}>'), 'el alta monta el pie estándar del diálogo')

  const compras = leer('../components/control/Compras.jsx')
  assert.ok(compras.includes('recepcionSucio'), 'recibir mercadería confirma al cerrar con cambios')
  assert.ok(compras.includes('errorRecepcionDe(item)'), 'la cantidad inválida se muestra junto a su campo')
  assert.ok(compras.includes('<SaveActions pendiente={busy}>'), 'recibir mercadería usa el pie estándar')

  const recepcion = leer('../components/supply/Recepcion.jsx')
  assert.ok(recepcion.includes('useResultado'), 'la incidencia usa resultados canónicos')
  assert.ok(recepcion.includes('FormField label="Nota"'), 'la nota lleva etiqueta y error adentro del diálogo')
  assert.ok(recepcion.includes('dirty={Boolean(incidencia)'), 'la incidencia confirma al cerrar con cambios')

  const lista = leer('../components/supply/ListaCompraModal.jsx')
  assert.ok(lista.includes('useResultado') && lista.includes("avisar.fallo('imprimir'"), 'la lista de compra imprime con resultados canónicos')
  const etiquetas = leer('../components/supply/EtiquetasPreparacion.jsx')
  assert.ok(etiquetas.includes('useResultado') && etiquetas.includes("avisar.fallo('imprimir'"), 'las etiquetas de preparación imprimen con resultados canónicos')
})

test('los modales de CRM/INV/PRN pendientes quedan documentados (#323)', () => {
  const doc = leer('../../docs/MODALES.md')
  for (const pendiente of ['SellerCustomers.jsx', 'Inventario.jsx', 'ServicioTecnico.jsx', 'Impresoras.jsx']) {
    assert.ok(doc.includes(pendiente), `el pendiente «${pendiente}» está documentado`)
  }
  assert.ok(doc.includes('CRM') && doc.includes('INV') && doc.includes('PRN'))
})

test('los modales de PLT adoptan cierre con cambios, etiquetas y error adentro (#323)', () => {
  const vendedores = leer('../components/control/Vendedores.jsx')
  assert.ok(vendedores.includes('FormField label="Desde"'), 'el horario muestra la etiqueta Desde')
  assert.ok(vendedores.includes('FormField label="Hasta"'), 'el horario muestra la etiqueta Hasta')
  assert.ok(vendedores.includes('dirty={hayCambiosHorario}'), 'el horario confirma al cerrar con cambios')
  assert.ok(vendedores.includes('{horarioError &&'), 'el error del horario queda adentro del diálogo')
  assert.ok(!vendedores.includes("setError(cause?.message || 'No se pudo guardar el horario.')"), 'el error de guardado no va al Aviso de página')
  assert.ok(vendedores.includes('<SaveActions pendiente={busy}>'), 'el horario usa el pie estándar')

  const sucursales = leer('../components/config/TiendasSucursales.jsx')
  assert.ok(sucursales.includes('useValidacionFormulario'), 'sucursales valida con el hook compartido')
  assert.ok(sucursales.includes("error={control.errorDe('nombre')}"), 'el nombre muestra su error junto al campo')
  assert.ok(sucursales.includes('pedirAbrir') && sucursales.includes('<ConfirmDialog'), 'cambiar de sucursal con cambios pide confirmación')
  assert.ok(sucursales.includes('disabled={busy || !control.valido}'), 'el guardado se bloquea con el formulario incompleto')

  const destructivo = leer('../components/config/DialogoDestructivo.jsx')
  assert.ok(destructivo.includes('dirty={Boolean(palabraActual || clave)}'), 'el destructivo confirma al cerrar con algo escrito')
  assert.ok(destructivo.includes('error={errorPalabra}'), 'la palabra se valida junto al campo')
  assert.ok(destructivo.includes('<SaveActions pendiente={busy}>'), 'el destructivo usa el pie estándar')
  assert.ok(!destructivo.includes('PIE_ACCIONES_REVERSO'), 'el pie ya no se arma a mano')
})

test('los modales de FIN adoptan cierre con cambios y error junto al campo (#323)', () => {
  const precios = leer('../components/control/Precios.jsx')
  assert.ok(precios.includes('dirty={editorDirty}'), 'Precios confirma al cerrar con cambios')
  assert.ok(precios.includes('useValidacionCampos') && precios.includes('errorDe('), 'Precios valida junto al campo')
  assert.ok(precios.includes('<SaveActions'), 'el pie de Precios se monta en el pie fijo del diálogo')
  assert.ok(!precios.includes("setError('Elegí el producto"), 'el error de ítem ya no va al Aviso de página (quedaba detrás del overlay)')
  assert.ok(precios.includes('avisar.guardado('), 'el guardado avisa con el resultado canónico')

  const autorizaciones = leer('../components/control/Autorizaciones.jsx')
  assert.ok(autorizaciones.includes('dirty={Boolean(rejectTarget)'), 'el rechazo confirma al cerrar con motivo')
  assert.ok(autorizaciones.includes("error={errorDe('motivo')}"), 'el motivo se valida junto al campo')
  assert.ok(!autorizaciones.includes("toast.error('Motivo obligatorio'"), 'el motivo ya no usa toast')
  assert.ok(!autorizaciones.includes('disabled={busy || !rejectNote.trim()}'), 'el motivo vacío no deshabilita el botón')

  const plantillas = leer('../components/control/WhatsAppTemplates.jsx')
  assert.ok(plantillas.includes('dirty={editorDirty}'), 'el editor de plantilla confirma al cerrar con cambios')
  assert.ok(plantillas.includes('useValidacionCampos(REGLAS_EDITOR)'), 'la plantilla valida con las reglas compartidas')
  assert.ok(plantillas.includes('error={errorDe(\'nombre\')}') && plantillas.includes('error={errorDe(\'cuerpo\')}'), 'los errores van junto a los campos')
  assert.ok(plantillas.includes('<SaveActions'), 'el pie de la plantilla se monta en el pie fijo del diálogo')
  assert.ok(!plantillas.includes('<span className="block text-[11px] font-medium uppercase tracking-wider text-mute">Mensaje</span>'), 'el rótulo suelto de Mensaje ya es label')
})

test('los modales de CRM adoptan cierre con cambios, error junto al campo y resultados (#323)', () => {
  const seller = leer('../components/ventas/SellerCustomers.jsx')
  assert.ok(seller.includes('dirty={crearAbierto && crearSucio}'), 'crear cliente confirma al cerrar con datos')
  assert.ok(seller.includes('phones.some((phone) => !telefonoValido(phone'), 'el teléfono inválido frena el alta')
  assert.ok(!seller.includes('throw new Error(MENSAJE_TELEFONO)'), 'el teléfono inválido ya no cae al error general')
  assert.ok(seller.includes('<SaveActions pendiente={saving}>'), 'el alta usa el pie estándar')
  assert.ok(seller.includes('avisar.guardado('), 'el alta avisa con el resultado canónico')

  const ficha = leer('../components/customers/FichaClienteModal.jsx')
  assert.ok(ficha.includes('dirty={sucio}'), 'la ficha del cliente confirma al cerrar con datos')
  assert.ok(ficha.includes("errorNombre={errorDe('nombre')}"), 'el nombre muestra su error junto al campo')
  assert.ok(!ficha.includes("disabled={busy || !String(valor.name || '').trim()}"), 'el nombre vacío no deshabilita el botón')

  const delPedido = leer('../components/ventas/ClienteDelPedidoModal.jsx')
  assert.ok(delPedido.includes('dirty={sucio}'), 'la ficha desde el pedido confirma al cerrar')
  assert.ok(delPedido.includes("errorNombre={errorDe('nombre')}"), 'el nombre se valida junto al campo')

  const perfil = leer('../components/customers/CustomerProfile.jsx')
  assert.ok(perfil.includes('dirty={Boolean(resolveTarget)'), 'la resolución de la solicitud confirma al cerrar con motivo')
  assert.ok(perfil.includes("error={resolveAction === 'reject' ? errorResolve('motivo')"), 'el motivo se valida junto al campo')
  assert.ok(!perfil.includes("toast.error('Motivo obligatorio'"), 'el motivo ya no usa toast')
  assert.ok(!perfil.includes('disabled={resolveBusy || (resolveAction'), 'el motivo vacío no deshabilita el botón')
  assert.ok(perfil.includes('<SaveActions pendiente={resolveBusy}>'), 'la resolución usa el pie estándar')

  const unificar = leer('../components/customers/UnificarClienteModal.jsx')
  assert.ok(unificar.includes('dirty={tocado}'), 'unificar confirma al cerrar con un destino elegido')
  assert.ok(unificar.includes('avisar.guardado(') && unificar.includes("avisar.fallo('guardar'"), 'los resultados de unificar son canónicos')

  const marketing = leer('../components/customers/MarketingCampaigns.jsx')
  assert.ok(marketing.includes("avisar.enviado('La campaña'"), 'la campaña se anuncia con el resultado de envío')
  assert.ok(marketing.includes("avisar.copiado('El enlace'") && marketing.includes("avisar.fallo('copiar'"), 'copiar el enlace usa resultados canónicos')
  const campanas = leer('../components/customers/CampanasClientes.jsx')
  assert.ok(campanas.includes("avisar.enviado('El mensaje de WhatsApp'"), 'el envío de WhatsApp usa el resultado canónico')
  assert.ok(campanas.includes("avisar.fallo('enviar'") && campanas.includes("avisar.fallo('guardar'"), 'los fallos de campaña son canónicos')

  const delivery = leer('../components/delivery/StoreDelivery.jsx')
  assert.ok(delivery.includes('dirty={Boolean(rechazar)'), 'rechazar la rendición confirma al cerrar con motivo')
  assert.ok(delivery.includes("error={errorDe('motivo')}"), 'el motivo de la rendición va junto al campo')
  assert.ok(delivery.includes('<SaveActions pendiente={ocupado}'), 'el rechazo usa el pie estándar')

  const servicio = leer('../components/control/ServicioTecnico.jsx')
  assert.ok(servicio.includes('dirty={formSucio}') && servicio.includes('dirty={catalogoSucio}'), 'la orden y el catálogo confirman al cerrar con cambios')
  assert.ok(servicio.includes("error={errorOrden('customerName')}") && servicio.includes("error={errorOrden('device')}"), 'cliente y dispositivo muestran su error junto al campo')
  assert.ok(servicio.includes('<FormField label="Servicio del catálogo"'), 'el selector del catálogo tiene label visible')
  assert.ok(servicio.includes('<FormField label="Nombre del servicio"'), 'el catálogo tiene labels visibles')
  assert.ok(servicio.includes('<SaveActions pendiente={busy}>'), 'la orden usa el pie estándar')
  assert.ok(!servicio.includes('useDialogDirty(formSucio)'), 'el dirty de la orden va en el objeto del diálogo')
})
