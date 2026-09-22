// #240: puntaje y grado del PhoneCheck.
import test from 'node:test'
import assert from 'node:assert/strict'
const { COSMETICOS, INSPECCION_ITEMS, certificadoPhoneCheck, gradoInspection, informePublicoInspection, locksDeVerificacion, payloadInformeInspection, puntajeInspection, resumenCertificaciones, resumenInspection } = await import('./phonecheck.js')

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

test('el informe publico sale sin PII y con QR (#240 DSN/PRN)', () => {
  const informe = informePublicoInspection({ grado: 'A', puntaje: 100, serial: 'AUR0001', producto: 'iPhone 15', items: [{ grupo: 'Pantalla', label: 'Pantalla', estado: 'falla', nota: 'Rayón profundo' }, { grupo: 'Audio', label: 'Audio', estado: 'ok', nota: 'no debe salir' }], locks: [{ label: 'iCloud', ok: true }], bateria: { porcentaje: '89', ciclos: '310' }, verificado: '2026-09-22T10:00:00.000Z' }, { enlace: 'https://app.moboss.online/informe/abc' })
  assert.equal(informe.serial, '•••0001')
  assert.equal(informe.items[0].nota, 'Rayón profundo')
  assert.equal(informe.items[1].nota, '')
  assert.match(informe.aviso, /blacklist mundial/)
  assert.match(informe.qr, /^CERT\|/)
  assert.ok(!JSON.stringify(informe).includes('AUR0001'), 'no filtra el serial completo')
})
