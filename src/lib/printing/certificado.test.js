import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  AVISO_BLACKLIST,
  controlesDeVerificacion,
  datosCertificado,
  datosChecklist,
  gradoChecklist,
  itemsChecklist,
  puntajeChecklist,
  serialEnmascarado,
} from './certificado.js'

// Payload público de INV (`informePublicoInspection`, docs/PHONECHECK-INFORME.md).
const PUBLICO = {
  tipo: 'certificado-phonecheck',
  version: 1,
  titulo: 'Certificado PhoneCheck',
  grado: 'A',
  puntaje: 100,
  producto: 'iPhone 15',
  capacidad: '128GB',
  condicion: 'USED',
  cosmetico: 'buen estado',
  serial: '••••7518',
  bateria: { porcentaje: '89', ciclos: '310' },
  controles: [{ label: 'iCloud', ok: true }, { label: 'ESN/Blacklist', ok: false }],
  repuestosNoOem: 'Pantalla no OEM',
  items: [
    { grupo: 'Pantalla', label: 'Pantalla / táctil', estado: 'ok', nota: '' },
    { grupo: 'Audio', label: 'Altavoces y micrófono', estado: 'observacion', nota: 'Crujido al máximo' },
    { grupo: 'Energía', label: 'Batería', estado: 'falla', nota: 'Salud 71%' },
  ],
  verificado: '2026-09-21T23:09:00.000Z',
  fuente: { proveedor: 'imeicheck.net', fecha: '2026-09-21T23:09:00.000Z', etiqueta: 'Verificado' },
  aviso: AVISO_BLACKLIST,
  enlace: 'https://app.moboss.online/informe/abc123',
  qr: 'CERT|••••7518|A|100|2026-09-21T23:09:00.000Z',
}

const UNIDAD = {
  id: 'u1',
  serial: 'AUR00017518',
  condition: 'USED',
  batteryHealth: 89,
  product: { name: 'iPhone 15', model: 'iPhone 15', capacity: '128GB' },
  branch: { name: 'Casa Central' },
  location: { code: 'D2', name: 'Depósito 2' },
  // Inspección cruda de INV: items por clave (forma de la UI) + grado guardado.
  inspection: {
    items: {
      pantalla: { estado: 'ok' },
      audio: { estado: 'observacion', nota: 'Crujido al máximo' },
      bateria: { estado: 'falla', nota: 'Salud 71%' },
      faceId: { estado: 'ok' },
      camaras: { estado: 'na' },
      sensores: { estado: 'ok' },
      botones: { estado: 'ok' },
      conexiones: { estado: 'ok' },
      carga: { estado: 'ok' },
      carcasa: { estado: 'ok' },
    },
    cosmetico: 'buen estado',
    bateriaPct: '89',
    bateriaCiclos: '310',
    repuestosNoOem: '',
    puntaje: 92,
    grado: 'A',
    inspeccionadoAt: '2026-09-21T23:09:00.000Z',
    inspeccionadoPor: 'Lucía Fernández',
  },
}

const CONSULTA = {
  imei: '356789102345673',
  status: 'verificado',
  resolvedAt: '2026-09-21T23:09:00.000Z',
  normalized: [
    { clave: 'blacklist', etiqueta: 'Blacklist actual', valor: 'Sin reportes actuales' },
    { clave: 'findMy', etiqueta: 'Find My / iCloud', valor: 'Off' },
    { clave: 'simLock', etiqueta: 'SIM lock', valor: 'Unlocked' },
    { clave: 'mdm', etiqueta: 'MDM', valor: 'Apagado' },
  ],
}

test('el checklist se normaliza desde el payload de INV y desde la inspección cruda (#240)', () => {
  const delPayload = itemsChecklist({ items: PUBLICO.items })
  assert.equal(delPayload.length, 3)
  assert.equal(delPayload[0].label, 'Pantalla / táctil')
  assert.equal(delPayload[1].estado, 'observacion')
  assert.equal(delPayload[2].nota, 'Salud 71%')

  const cruda = itemsChecklist({ items: UNIDAD.inspection.items })
  assert.equal(cruda.length, 10, 'los 10 ítems del checklist de INV')
  assert.equal(cruda.find((item) => item.clave === 'audio').label, 'Altavoces y micrófono')
  assert.equal(cruda.find((item) => item.clave === 'audio').estado, 'observacion')
  assert.equal(cruda.find((item) => item.clave === 'audio').nota, 'Crujido al máximo')
  assert.equal(cruda.find((item) => item.clave === 'camaras').estado, 'na')

  // Lista simple ({clave, estado}) también entra.
  const lista = itemsChecklist({ items: [{ clave: 'pantalla', estado: 'falla' }] })
  assert.equal(lista.find((item) => item.clave === 'pantalla').estado, 'falla')
})

test('puntaje y grado siguen las reglas de INV (#240)', () => {
  assert.equal(puntajeChecklist([]), null)
  assert.equal(puntajeChecklist([{ estado: 'ok' }, { estado: 'na' }]), 100, 'no aplica no cuenta')
  assert.equal(puntajeChecklist([{ estado: 'ok' }, { estado: 'observacion' }]), 75)
  assert.equal(puntajeChecklist([{ estado: 'ok' }, { estado: 'falla' }]), 50)
  assert.equal(gradoChecklist(100), 'A')
  assert.equal(gradoChecklist(90), 'A')
  assert.equal(gradoChecklist(75), 'B')
  assert.equal(gradoChecklist(74), 'C')
  assert.equal(gradoChecklist(null), null)
})

test('el resumen del checklist prioriza el payload público de INV', () => {
  const resumen = datosChecklist(UNIDAD, { informe: PUBLICO })
  assert.equal(resumen.hay, true)
  assert.equal(resumen.grado, 'A')
  assert.equal(resumen.puntaje, 100)
  assert.equal(resumen.ok, 1)
  assert.equal(resumen.evaluados, 3)
  assert.equal(resumen.noOk.length, 2)
  assert.equal(resumen.noOk[0].nota, 'Crujido al máximo')
  assert.equal(resumen.cosmetico, 'buen estado')
  assert.deepEqual(resumen.bateria, { porcentaje: '89', ciclos: '310' })
  assert.equal(resumen.controles.length, 2)
  assert.equal(resumen.controles[1].ok, false)
  assert.equal(resumen.verificado, '2026-09-21T23:09:00.000Z')
  assert.equal(resumen.aviso, AVISO_BLACKLIST)
})

test('sin payload, el resumen sale de la inspección cruda y de la consulta IMEI', () => {
  const resumen = datosChecklist(UNIDAD, { verificacion: CONSULTA })
  assert.equal(resumen.grado, 'A', 'grado guardado por INV')
  assert.equal(resumen.puntaje, 92)
  assert.equal(resumen.ok, 7)
  assert.equal(resumen.evaluados, 9, 'no aplica no cuenta')
  assert.equal(resumen.cosmetico, 'buen estado')
  assert.deepEqual(resumen.bateria, { porcentaje: '89', ciclos: '310' })
  assert.equal(resumen.verificadoPor, 'Lucía Fernández')
  const labels = resumen.controles.map((control) => control.label)
  assert.deepEqual(labels, ['iCloud', 'MDM', 'ESN/Blacklist', 'Carrier/SIM'])
  assert.equal(resumen.controles[0].ok, true)
  assert.equal(resumen.controles[2].ok, true)
})

test('los controles se derivan de la verificación IMEI (iCloud/MDM/ESN/Carrier)', () => {
  const controles = controlesDeVerificacion(CONSULTA)
  assert.deepEqual(controles.map((control) => [control.label, control.ok]), [['iCloud', true], ['MDM', true], ['ESN/Blacklist', true], ['Carrier/SIM', true]])
  assert.deepEqual(controlesDeVerificacion(null), [])
  const reportado = controlesDeVerificacion({ normalized: [{ clave: 'findMy', etiqueta: 'Find My / iCloud', valor: 'On' }, { clave: 'blacklist', etiqueta: 'Blacklist actual', valor: 'Reportado' }] })
  assert.equal(reportado[0].ok, false)
  assert.equal(reportado[1].ok, false)
})

test('el certificado usa el enlace público de INV y nunca imprime el serial en claro (#240)', () => {
  const datos = datosCertificado(UNIDAD, { informe: PUBLICO, emisor: 'Móvil Center', ahora: new Date('2026-09-22T10:00:00Z') })
  assert.equal(datos.titulo, 'Certificado PhoneCheck', 'el título lo manda INV')
  assert.equal(datos.grado, 'A')
  assert.equal(datos.serialEnmascarado, '••••7518')
  assert.equal(datos.enlace, 'https://app.moboss.online/informe/abc123')
  assert.equal(datos.emisor, 'Móvil Center')
  assert.ok(datos.codigo.startsWith('CERT|'))
  assert.ok(!datos.codigo.includes('AUR00017518'), 'el código interno no lleva el serial completo')
  assert.ok(!datos.codigoBarras.includes('AUR00017518'))
  assert.ok(!datos.codigoBarras.includes('•'), 'el código de barras es ASCII')
  assert.equal(datos.aviso, AVISO_BLACKLIST)
  assert.equal(datos.fuente.proveedor, 'imeicheck.net')
})

test('sin payload el certificado queda «pendiente» y su QR apunta a la ficha pública', () => {
  const sinInspeccion = { serial: 'AUR00017518', product: { name: 'iPhone 15' } }
  const datos = datosCertificado(sinInspeccion, { base: 'https://app.moboss.online', ahora: new Date('2026-09-22T10:00:00Z') })
  assert.equal(datos.titulo, 'Certificado de inspección', 'sin contrato de INV el título es neutro')
  assert.equal(datos.grado, 'P')
  assert.equal(datos.puntaje, null)
  assert.equal(datos.hay, false)
  assert.equal(datos.enlace, 'https://app.moboss.online/u/AUR00017518')
  assert.deepEqual(datos.controles, [])
  assert.equal(serialEnmascarado('AUR00017518'), '•••••••7518')
  assert.equal(serialEnmascarado('123'), '123')
})
