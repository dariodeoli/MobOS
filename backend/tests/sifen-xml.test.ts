// Serialización XML del DE (#130, Fase 1): grupos del Manual Técnico v150,
// escapado de caracteres y CDC en el Id cuando existe.
import assert from 'node:assert/strict'
import { generarXmlDe, escaparXml } from '../lib/sifen/xml'
import { mapearDocumentoFiscal } from '../lib/sifen/mapping'
import type { OrdenFiscal } from '../lib/sifen/mapping'
import type { SifenConfig } from '../lib/sifen/config'

assert.equal(escaparXml('Cable & "funda" <pro>'), 'Cable &amp; &quot;funda&quot; &lt;pro&gt;')
assert.equal(escaparXml("d'Angelo"), 'd&apos;Angelo')

const config: SifenConfig = {
  ambiente: 'test', ruc: '44444401', dv: '7', razonSocial: 'Comercio & Cía. S.A.', tipoContribuyente: 2,
  direccion: 'Av. Mcal. López 1234', ciudad: 'Asunción', departamento: 'Central',
  telefono: '+595 981 000 000', email: 'fiscal@example.invalid',
  timbrado: '12558946', establecimiento: '001', puntoExpedicion: '001',
  certificadoPath: '', certificadoPassword: '',
  endpointRecibe: 'https://sifen-test.invalid/recibe', endpointConsulta: 'https://sifen-test.invalid/consulta', timeoutMs: 15000,
}

const orden: OrdenFiscal = {
  id: 'orden-2', orderNumber: 'MOB #1002', createdAt: new Date(2026, 5, 10, 15, 30, 0),
  subtotalPyg: 1_100_000, discountPyg: 0, deliveryPyg: 0, totalPyg: 1_100_000,
  items: [
    { description: 'Producto "A" & accesorios', quantity: 2, unitPricePyg: 550_000, totalPyg: 1_100_000, discountPyg: 0 },
  ],
  payments: [{ method: 'TRANSFER', amountPyg: 1_100_000, status: 'CONFIRMED' }],
}

const documento = mapearDocumentoFiscal({ orden, cliente: { name: 'Cliente Prueba' }, config, numeroDocumento: 7, codigoSeguridad: '555666777' })
const xml = generarXmlDe(documento)

assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'))
assert.ok(xml.includes('<rDE xmlns="http://ekuatia.set.gov.py/sifen/xsd"'))
assert.ok(xml.includes('<dVerFor>150</dVerFor>'))
assert.ok(xml.includes(`<DE Id="${documento.cdc}">`), 'el DE lleva el CDC en el Id')
assert.ok(xml.includes(`<dDVId>${String(documento.cdc).slice(43)}</dDVId>`))
assert.ok(xml.includes('<iTiDE>1</iTiDE>'))
assert.ok(xml.includes('<dNumTim>12558946</dNumTim>'))
assert.ok(xml.includes('<dRucEm>44444401</dRucEm>'))
assert.ok(xml.includes('<dDVEmi>7</dDVEmi>'))
assert.ok(xml.includes('<dNomEmi>Comercio &amp; Cía. S.A.</dNomEmi>'), 'el emisor se escapa')
assert.ok(xml.includes('<dNomRec>Cliente Prueba</dNomRec>'))
assert.ok(xml.includes('<iCondOpe>1</iCondOpe>'))
assert.ok(xml.includes('<iTiPago>5</iTiPago>'), 'la transferencia es medio de pago 5')
assert.ok(xml.includes('<dDesProSer>Producto &quot;A&quot; &amp; accesorios</dDesProSer>'), 'la descripción se escapa')
assert.ok(xml.includes('<dCantProSer>2</dCantProSer>'))
assert.ok(xml.includes('<dTotOpeItem>1100000</dTotOpeItem>'))
assert.ok(xml.includes('<iAfecIVA>1</iAfecIVA>'))
assert.ok(xml.includes('<dTasaIVA>10</dTasaIVA>'))
assert.ok(xml.includes('<dTotGralOpe>1100000</dTotGralOpe>'))
assert.ok(xml.includes('<dTotalGs>1100000</dTotalGs>'))
assert.equal((xml.match(/<gCamItem>/g) || []).length, 1)

// Las llaves y corchetes balancean (chequeo simple de buena formación).
for (const tag of ['rDE', 'DE', 'gOpeDE', 'gTimb', 'gDatGralOpe', 'gEmis', 'gDatRec', 'gDtipDE', 'gCamCond', 'gCamItem', 'gTotSub']) {
  const abiertos = (xml.match(new RegExp(`<${tag}[ >]`, 'g')) || []).length
  const cerrados = (xml.match(new RegExp(`</${tag}>`, 'g')) || []).length
  assert.equal(abiertos, cerrados, `las etiquetas ${tag} deben balancear`)
}

// Borrador sin CDC: sin atributo Id ni código de seguridad.
const sinCdc = generarXmlDe(mapearDocumentoFiscal({ orden, cliente: { name: 'Cliente Prueba' }, config, numeroDocumento: 7 }))
assert.ok(!sinCdc.includes('<DE Id='))
assert.ok(!sinCdc.includes('<dCodSeg>'))

console.log('sifen-xml: grupos v150, escapado, CDC y borrador sin numerar OK')
