import { test } from 'node:test'
import assert from 'node:assert/strict'
import { demoConsultaImei, detalleImei, enmascararImei, htmlComprobanteImei, imeiValido, resumenImei, textoNota } from './imeiComprobante.js'

test('el IMEI se muestra enmascarado (solo los últimos 4)', () => {
  assert.equal(enmascararImei('356789102345673'), '•••••••••••5673')
  assert.equal(enmascararImei('123'), '•••')
})

test('valida el dígito control (Luhn) antes de consultar', () => {
  assert.equal(imeiValido('356789102345673'), true)
  assert.equal(imeiValido('356789102345679'), false)
  assert.equal(imeiValido('DEMO-FERNANDEZ'), false)
  assert.equal(imeiValido(''), false)
})

test('el detalle es honesto: solo afirma sin reportes cuando el proveedor lo dice', () => {
  const verificadoLimpio = { status: 'verificado', resolvedAt: '2026-09-21T12:00:00Z', normalized: [{ clave: 'blacklist', valor: 'Sin reportes actuales' }] }
  assert.match(detalleImei(verificadoLimpio), /sin reportes al 21\/9\/2026/)
  const verificadoReportado = { status: 'verificado', resolvedAt: '2026-09-21T12:00:00Z', normalized: [{ clave: 'blacklist', valor: 'Reportado' }] }
  assert.match(detalleImei(verificadoReportado), /con reportes/)
  assert.match(detalleImei({ status: 'fallido' }), /No verificado/)
  assert.match(detalleImei({ status: 'pendiente' }), /en curso/)
  assert.match(detalleImei({ status: 'parcial', normalized: [] }), /IMEI verificado/)
})

test('el resumen público no expone costos, ids externos ni la respuesta cruda', () => {
  const consulta = {
    id: 'q1', imei: '356789102345673', status: 'verificado', etiqueta: 'Verificado',
    costUsd: 0.06, externalId: 'ext-123', responseRaw: { secreto: true }, provider: 'imeicheck.net',
    normalized: [
      { clave: 'blacklist', etiqueta: 'Blacklist actual', valor: 'Sin reportes actuales' },
      { clave: 'mdm', etiqueta: 'MDM', valor: 'Apagado' },
      { clave: 'costo', etiqueta: 'Costo interno', valor: '0.06' },
    ],
    requestedAt: '2026-09-21T12:00:00Z', resolvedAt: '2026-09-21T12:00:05Z',
  }
  const resumen = resumenImei(consulta, { cliente: 'Lucía Fernández' })
  const serializado = JSON.stringify(resumen)
  assert.equal(serializado.includes('0.06'), false)
  assert.equal(serializado.includes('ext-123'), false)
  assert.equal(serializado.includes('secreto'), false)
  assert.equal(resumen.campos.some((campo) => campo.etiqueta === 'Costo interno'), false)
  assert.equal(resumen.imei, '•••••••••••5673')
  assert.equal(resumen.fuente, 'IMEIcheck.net')
})

test('la nota adjunta lleva estado, fecha, fuente y el aviso de simulada', () => {
  const texto = textoNota(resumenImei(demoConsultaImei('356789102345673')))
  assert.match(texto, /sin reportes/)
  assert.match(texto, /fuente IMEIcheck\.net/)
  assert.match(texto, /simulada en demo/)
})

// #203: el A4 del comprobante de IMEI tiene que imprimir con contraste real
// (mismas reglas que el resto de los comprobantes) y no permitir inyección de
// markup con valores del proveedor.
test('el HTML A4 del comprobante IMEI fuerza contraste, escapa y no expone datos internos', () => {
  const resumen = resumenImei({
    ...demoConsultaImei('356789102345673'),
    normalized: [{ clave: 'blacklist', etiqueta: '<img src=x onerror=alert(1)>', valor: '"><script>alert(1)</script>' }],
  }, { cliente: '<b>Tienda</b>' })
  const html = htmlComprobanteImei(resumen, { tienda: '<b>Tienda</b>' })
  assert.ok(html.includes('-webkit-print-color-adjust:exact') && html.includes('print-color-adjust:exact'), 'contraste real al imprimir')
  assert.ok(html.includes('@media print'), 'reglas de impresión')
  assert.ok(html.includes('Documento no fiscal'))
  assert.ok(html.includes('Simulada en demo'), 'avisa que el resultado es ficticio')
  assert.ok(!html.includes('<script>'), 'escapa el markup del proveedor')
  assert.ok(!html.includes('<img src=x'), 'escapa etiquetas del proveedor')
  assert.ok(html.includes('&lt;b&gt;Tienda&lt;/b&gt;'), 'escapa el nombre de la tienda')
  assert.ok(!/costo|provider|raw/i.test(html), 'sin datos internos')
})
