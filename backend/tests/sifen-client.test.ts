// Cliente SOAP de SIFEN (#130, Fase 1): sobres, parseo de respuestas y
// comportamiento sin configuración. Todo con fetch simulado, sin red real.
import assert from 'node:assert/strict'
import { CODIGO_APROBADO, construirSobreConsulta, construirSobreRecepcion, consultarDe, enviarDe, normalizarRespuestaSifen, SifenNoConfiguradoError } from '../lib/sifen/client'
import type { RespuestaSifen } from '../lib/sifen/client'
import { SifenError } from '../lib/sifen/cdc'
import type { SifenConfig } from '../lib/sifen/config'

const config: SifenConfig = {
  ambiente: 'test', ruc: '44444401', dv: '7', razonSocial: 'Comercio de Prueba S.A.', tipoContribuyente: 2,
  direccion: '', ciudad: '', departamento: '', telefono: '', email: '',
  timbrado: '12558946', establecimiento: '001', puntoExpedicion: '001',
  certificadoPath: '/tmp/no-existe.p12', certificadoPassword: '',
  endpointRecibe: 'https://sifen-test.invalid/de/ws/sync/recibe.wsdl',
  endpointConsulta: 'https://sifen-test.invalid/de/ws/consultas/consulta.wsdl',
  timeoutMs: 5000,
}

async function main() {
  // ── Sobres ──────────────────────────────────────────────────────────
  const sobre = construirSobreRecepcion('<rDE><dVerFor>150</dVerFor></rDE>', 3)
  assert.ok(sobre.includes('<env:Envelope xmlns:env="http://www.w3.org/2003/05/soap-envelope">'))
  assert.ok(sobre.includes('<rEnviDe xmlns="http://ekuatia.set.gov.py/sifen/xsd">'))
  assert.ok(sobre.includes('<dId>3</dId>'))
  assert.ok(sobre.includes('<xDE>&lt;rDE&gt;'), 'el XML del DE viaja escapado dentro de xDE')
  assert.throws(() => construirSobreConsulta('123'), (error: unknown) => error instanceof SifenError && error.codigo === 'cdc_invalido')
  assert.ok(construirSobreConsulta('01444444017001001001452822017012515873260988').includes('<dCDC>01444444017001001001452822017012515873260988</dCDC>'))

  // ── Parseo de respuestas (con prefijos de namespace) ────────────────
  const aprobada = normalizarRespuestaSifen(`
    <env:Envelope xmlns:env="http://www.w3.org/2003/05/soap-envelope">
      <env:Body><ns2:rResEnviDe xmlns:ns2="http://ekuatia.set.gov.py/sifen/xsd">
        <ns2:dFecProc>2026-06-10T15:31:02</ns2:dFecProc>
        <ns2:dCodRes>${CODIGO_APROBADO}</ns2:dCodRes>
        <ns2:dMsgRes>Aprobado</ns2:dMsgRes>
        <ns2:dProtAut>01444444017001001001452822017012515873260988</ns2:dProtAut>
      </ns2:rResEnviDe></env:Body>
    </env:Envelope>`)
  assert.deepEqual(aprobada, {
    codigo: '0260', mensaje: 'Aprobado', aprobado: true,
    fechaProceso: '2026-06-10T15:31:02', protocolo: '01444444017001001001452822017012515873260988', xml: null,
  })

  const rechazada = normalizarRespuestaSifen('<rResEnviDe><dCodRes>0346</dCodRes><dMsgRes>CDC ya utilizado</dMsgRes></rResEnviDe>')
  assert.equal(rechazada.aprobado, false)
  assert.equal(rechazada.codigo, '0346')

  assert.throws(() => normalizarRespuestaSifen('<env:Fault><faultstring>Tiempo agotado</faultstring></env:Fault>'),
    (error: unknown) => error instanceof SifenError && error.codigo === 'respuesta_invalida' && /Tiempo agotado/.test(error.message))

  // ── Sin configuración no se llama a SIFEN ───────────────────────────
  let llamadas = 0
  const fetchProhibido = (async () => { llamadas += 1; throw new Error('no debe llamarse') }) as unknown as typeof fetch
  await assert.rejects(enviarDe('<rDE></rDE>', { fetchImpl: fetchProhibido }), (error: unknown) => error instanceof SifenNoConfiguradoError)
  await assert.rejects(consultarDe('01444444017001001001452822017012515873260988', { fetchImpl: fetchProhibido }), (error: unknown) => error instanceof SifenNoConfiguradoError)
  assert.equal(llamadas, 0)

  // ── Envío con fetch simulado ────────────────────────────────────────
  const respuesta = (cuerpo: string, status = 200) => new Response(cuerpo, { status, headers: { 'Content-Type': 'application/xml' } })
  const cuerpos: Array<{ url: string; body: string }> = []
  const fetchOk = (async (url: string | URL | Request, init?: RequestInit) => {
    cuerpos.push({ url: String(url), body: String(init?.body || '') })
    return respuesta('<rResEnviDe><dCodRes>0260</dCodRes><dMsgRes>Aprobado</dMsgRes></rResEnviDe>')
  }) as unknown as typeof fetch
  const resultado: RespuestaSifen = await enviarDe('<rDE><dVerFor>150</dVerFor></rDE>', { config, fetchImpl: fetchOk })
  assert.equal(resultado.aprobado, true)
  assert.equal(cuerpos.length, 1)
  assert.equal(cuerpos[0].url, config.endpointRecibe, 'usa el endpoint del ambiente configurado')
  assert.ok(cuerpos[0].body.includes('<xDE>'))
  assert.ok(cuerpos[0].body.includes('&lt;rDE&gt;'))

  // HTTP 500 no se traga: error tipado.
  const fetchError = (async () => respuesta('boom', 500)) as unknown as typeof fetch
  await assert.rejects(enviarDe('<rDE></rDE>', { config, fetchImpl: fetchError }), (error: unknown) => error instanceof SifenError && error.codigo === 'http_500')

  // Falla de red: error tipado y en español.
  const fetchCaido = (async () => { throw new Error('sin red') }) as unknown as typeof fetch
  await assert.rejects(enviarDe('<rDE></rDE>', { config, fetchImpl: fetchCaido }), (error: unknown) => error instanceof SifenError && error.codigo === 'sifen_inaccesible')
  await assert.rejects(consultarDe('01444444017001001001452822017012515873260988', { config, fetchImpl: fetchCaido }), (error: unknown) => error instanceof SifenError && error.codigo === 'sifen_inaccesible')

  // Consulta exitosa: usa el endpoint de consulta y devuelve el XML del DE.
  const consultas: string[] = []
  const fetchConsulta = (async (url: string | URL | Request) => {
    consultas.push(String(url))
    return respuesta('<rResConsDE><dCodRes>0260</dCodRes><dMsgRes>Aprobado</dMsgRes><xContenDE>&lt;rDE/&gt;</xContenDE></rResConsDE>')
  }) as unknown as typeof fetch
  const consultado = await consultarDe('01444444017001001001452822017012515873260988', { config, fetchImpl: fetchConsulta })
  assert.equal(consultado.aprobado, true)
  assert.equal(consultado.xml, '<rDE/>')
  assert.equal(consultas[0], config.endpointConsulta)

  console.log('sifen-client: sobres, parseo, sin configuración y errores OK')
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
