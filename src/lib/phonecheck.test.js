// #240: puntaje y grado del PhoneCheck.
import test from 'node:test'
import assert from 'node:assert/strict'
const { COSMETICOS, INSPECCION_ITEMS, certificadoPhoneCheck, costoRepuestosInspection, gradoInspection, informePublicoInspection, locksDeVerificacion, payloadInformeInspection, puntajeInspection, resumenCertificaciones, resumenInspection } = await import('./phonecheck.js')

test('puntaje: OK=1, observación=0,5, falla=0 y no aplica no cuenta', () => {
  const items = {}
  for (const item of INSPECCION_ITEMS) items[item.clave] = { estado: 'ok' }
  assert.equal(puntajeInspection({ items }), 100)
  items[INSPECCION_ITEMS[0].clave] = { estado: 'falla' }
  assert.equal(puntajeInspection({ items }), 90, 'una falla sobre 10 ítems = 90')
  items[INSPECCION_ITEMS[1].clave] = { estado: 'observacion' }
  items[INSPECCION_ITEMS[2].clave] = { estado: 'na' }
  // 7 OK + 1 observación + 1 no aplica (no cuenta) + 1 falla = 7,5/9 = 83
  assert.equal(puntajeInspection({ items }), 83)
})

test('grado A/B/C y cosmético del checklist', () => {
  assert.equal(gradoInspection(100), 'A')
  assert.equal(gradoInspection(90), 'A')
  assert.equal(gradoInspection(89), 'B')
  assert.equal(gradoInspection(75), 'B')
  assert.equal(gradoInspection(74), 'C')
  assert.equal(gradoInspection(null), null)
  assert.deepEqual(resumenInspection({ items: {} }), { puntaje: null, grado: null })
  assert.ok(COSMETICOS.includes('marcas de uso'))
})

test('locks y payload del informe quedan listos para DSN/PRN (#240)', () => {
  const verificacion = { etiqueta: 'Verificado', resolvedAt: '2026-09-22T10:00:00.000Z', campos: [
    { clave: 'findMy', valor: 'Off' }, { clave: 'mdm', valor: 'On' }, { clave: 'blacklist', valor: 'Sin reportes actuales' }, { clave: 'simLock', valor: 'Unlocked' },
  ] }
  const chips = locksDeVerificacion(verificacion)
  assert.equal(chips.find(chip => chip.clave === 'icloud').ok, true)
  assert.equal(chips.find(chip => chip.clave === 'mdm').ok, false)
  assert.equal(chips.find(chip => chip.clave === 'esn').ok, true)
  assert.equal(chips.find(chip => chip.clave === 'carrier').ok, true)
  const items = {}
  for (const item of INSPECCION_ITEMS) items[item.clave] = { estado: 'ok' }
  const payload = payloadInformeInspection({ unit: { id: 'u1', serial: 'AUR1', batteryHealth: 88, product: { name: 'iPhone 15', capacity: '128GB' }, condition: 'USED' }, inspection: { items, cosmetico: 'buen estado', bateriaPct: '87', bateriaCiclos: '310' }, verificacion })
  assert.equal(payload.puntaje, 100)
  assert.equal(payload.grado, 'A')
  assert.equal(payload.bateria.porcentaje, '87')
  assert.equal(payload.bateria.ciclos, '310')
  assert.equal(payload.locks.length, 4)
  assert.equal(payload.repuestosNoOemNota, '', 'la nota de repuestos viaja en el payload')
  assert.equal(payload.fuenteVerificacion.proveedor, 'imeicheck.net')
  assert.equal(payload.items.length, INSPECCION_ITEMS.length)
})

test('tablero de certificaciones: grados, certificadas y pendientes (#240)', () => {
  const resumen = resumenCertificaciones([
    { inspection: { grado: 'A' }, lastVerifiedAt: '2026-09-22T10:00:00.000Z' },
    { inspection: { grado: 'B' }, lastVerifiedAt: '2026-09-22T10:00:00.000Z' },
    { inspection: { grado: 'C' }, lastVerifiedAt: null },
    { inspection: null, lastVerifiedAt: null },
    { lastVerifiedAt: '2026-09-22T10:00:00.000Z' },
  ])
  assert.deepEqual(resumen, { total: 5, A: 1, B: 1, C: 1, certificadas: 3, pendientes: 2, sinVerificacion: 2 })
})

test('la etiqueta Certificado lleva grado, puntaje y QR del informe (#240)', () => {
  const items = {}
  for (const item of INSPECCION_ITEMS) items[item.clave] = { estado: 'ok' }
  const cert = certificadoPhoneCheck({ id: 'u1', serial: 'AUR0001', batteryHealth: 90, product: { name: 'iPhone 15' } }, { items, cosmetico: 'buen estado', bateriaPct: '89', inspeccionadoAt: '2026-09-22T10:00:00.000Z', inspeccionadoPor: 'Hernán Acosta' }, { base: 'https://app.moboss.online' })
  assert.equal(cert.grado, 'A')
  assert.equal(cert.puntaje, 100)
  assert.match(cert.qr.contenido, /^CERT\|u1\|AUR0001\|A\|100/)
  assert.equal(cert.qr.enlace, 'https://app.moboss.online/inventario/unidad/u1')
})

test('el costo de repuestos de la inspección se normaliza para el margen (#148 §19)', () => {
  assert.equal(costoRepuestosInspection({ costoRepuestosPyg: 120000 }), 120000)
  assert.equal(costoRepuestosInspection({ costoRepuestosPyg: '350000' }), 350000)
  assert.equal(costoRepuestosInspection({}), 0)
  assert.equal(costoRepuestosInspection({ costoRepuestosPyg: null }), 0)
  assert.equal(costoRepuestosInspection({ costoRepuestosPyg: -5 }), 0)
  assert.equal(costoRepuestosInspection({ costoRepuestosPyg: 1.5 }), 0)
  assert.equal(costoRepuestosInspection({ costoRepuestosPyg: 'nada' }), 0)
})

test('el informe publico sale sin PII y con QR (#240 DSN/PRN)', () => {
  const informe = informePublicoInspection({ grado: 'A', puntaje: 100, serial: 'AUR0001', producto: 'iPhone 15', items: [{ grupo: 'Pantalla', label: 'Pantalla', estado: 'falla', nota: 'Rayón profundo' }, { grupo: 'Audio', label: 'Audio', estado: 'ok', nota: 'no debe salir' }], locks: [{ label: 'iCloud', ok: true }], bateria: { porcentaje: '89', ciclos: '310' }, verificado: '2026-09-22T10:00:00.000Z' }, { enlace: 'https://app.moboss.online/informe/abc' })
  assert.equal(informe.serial, '•••0001')
  assert.equal(informe.items[0].nota, 'Rayón profundo')
  assert.equal(informe.items[1].nota, '')
  assert.match(informe.aviso, /blacklist mundial/)
  assert.match(informe.qr, /^CERT\|/)
  assert.ok(!JSON.stringify(informe).includes('AUR0001'), 'no filtra el serial completo')
})

// ── #241 paso 6: ficha completa (oficial vs borrador y locks con fuente) ─────

test('la ficha distingue el grado oficial del borrador y avisa si hay cambios', async () => {
  const { estadoInspeccion, huellaInspeccion } = await import('./phonecheck.js')
  const items = {}
  for (const item of INSPECCION_ITEMS) items[item.clave] = { estado: 'ok' }
  const guardada = { items, cosmetico: 'buen estado', nota: '', puntaje: 100, grado: 'A', inspeccionadoAt: '2026-09-23T10:00:00.000Z', inspeccionadoPor: 'Hernán Acosta', itemsLista: [1, 2] }

  const sinCambios = estadoInspeccion({ inspection: guardada, borrador: { items, cosmetico: 'buen estado', nota: '' } })
  assert.equal(sinCambios.oficial.grado, 'A')
  assert.equal(sinCambios.oficial.guardadoPor, 'Hernán Acosta')
  assert.equal(sinCambios.oficial.guardadoEn, '2026-09-23T10:00:00.000Z')
  assert.equal(sinCambios.sinGuardar, false, 'un borrador igual a lo guardado no ensucia')
  assert.equal(sinCambios.marcados, INSPECCION_ITEMS.length)
  assert.equal(sinCambios.total, INSPECCION_ITEMS.length)

  const cambiada = estadoInspeccion({
    inspection: guardada,
    borrador: { items: { ...items, pantalla: { estado: 'falla' }, camaras: { estado: 'observacion' } }, cosmetico: 'buen estado', nota: '' },
  })
  assert.equal(cambiada.sinGuardar, true)
  assert.equal(cambiada.provisional.grado, 'B', 'el provisional baja a B con una falla y una observación')
  assert.equal(cambiada.oficial.grado, 'A', 'el oficial sigue siendo el guardado')

  const sinOficial = estadoInspeccion({ inspection: null, borrador: { items } })
  assert.equal(sinOficial.oficial, null)
  assert.equal(sinOficial.sinGuardar, true)
  assert.equal(estadoInspeccion({ inspection: guardada, borrador: null }).sinGuardar, false, 'sin borrador no hay nada sin guardar')
  assert.equal(huellaInspeccion({ items: { b: { estado: 'ok' }, a: { estado: 'ok' } } }), huellaInspeccion({ items: { a: { estado: 'ok' }, b: { estado: 'ok' } } }), 'la huella no depende del orden')
  assert.notEqual(huellaInspeccion({ items, nota: 'x' }), huellaInspeccion({ items, nota: '' }))
})

test('los chips de locks muestran la fuente y la hora de la verificación (#241 paso 6)', async () => {
  const { resumenVerificacion } = await import('./phonecheck.js')
  const verificacion = resumenVerificacion({
    status: 'verificado', serviceName: 'Apple Basic', provider: 'imeicheck.net', resolvedAt: '2026-09-23T15:04:00.000Z', imeiMasked: '••••5678',
    campos: [{ clave: 'findMy', valor: 'Off' }, { clave: 'blacklist', valor: 'Sin reportes actuales' }],
  })
  assert.equal(verificacion.servicio, 'Apple Basic')
  assert.equal(verificacion.proveedor, 'imeicheck.net')
  assert.match(verificacion.fecha, /2026-09-23T15:04/)
  assert.equal(verificacion.chips.length, 2)
  assert.equal(verificacion.chips[0].ok, true)
  // Acepta el formato `normalized` del backend y avisa si es simulada.
  const simulada = resumenVerificacion({ provider: 'imeicheck.net (demo)', esMock: true, normalized: [{ clave: 'mdm', valor: 'On' }] })
  assert.equal(simulada.simulado, true)
  assert.equal(simulada.servicio, 'imeicheck.net (demo)')
  assert.equal(simulada.chips[0].clave, 'mdm')
  assert.equal(simulada.fecha, null, 'sin fecha no inventa una')
  // Sin campos no hay chips (estado honesto).
  assert.equal(resumenVerificacion(null), null)
  assert.equal(resumenVerificacion({}), null)
  assert.equal(resumenVerificacion({ campos: [] }), null)
})

test('los locks del tile salen listos para ChipsLocks (#241 lote C)', async () => {
  const { locksParaChips } = await import('./phonecheck.js')
  const verificacion = {
    serviceName: 'Apple Basic', resolvedAt: '2026-09-24T20:40:00.000Z',
    campos: [{ clave: 'findMy', valor: 'Off' }, { clave: 'mdm', valor: 'On' }, { clave: 'blacklist', valor: 'Sin reportes actuales' }],
  }
  const locks = locksParaChips(verificacion)
  assert.deepEqual(locks.map((lock) => lock.clave), ['icloud', 'mdm', 'esn'])
  assert.equal(locks[0].estado, 'libre')
  assert.equal(locks[1].estado, 'activo', 'MDM activo se pinta como incidencia')
  assert.equal(locks[2].estado, 'libre')
  assert.match(locks[1].detalle, /MDM: On · Apple Basic/)
  assert.equal(locksParaChips(null).length, 0, 'sin verificación no hay chips')
  assert.equal(locksParaChips({ campos: [] }).length, 0)
  assert.equal(locksParaChips({ campos: [{ clave: 'marca', valor: 'Apple' }] }).length, 0, 'lo que no es lock no se muestra')
})
