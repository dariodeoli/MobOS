// Cliente SOAP de SIFEN (#130, Fase 1). Construye el sobre, envía el DE y
// consulta por CDC contra los endpoints oficiales del Manual Técnico v150.
// Sin certificado no hay mTLS ni firma: la Fase 2 agrega el certificado
// (PKCS#12) y la firma XMLDSig antes de llamar a estas funciones.
//
// Las pruebas simulan las respuestas con `fetchImpl`: acá no hay credenciales
// ni se toca la red real.

import { SifenError } from './cdc'
import type { SifenConfig } from './config'
import { escaparXml } from './xml'

export const SOAP_NS = 'http://www.w3.org/2003/05/soap-envelope'
export const SIFEN_NS = 'http://ekuatia.set.gov.py/sifen/xsd'

/** Código de SIFEN para un DE aprobado (Manual, tabla de códigos de respuesta). */
export const CODIGO_APROBADO = '0260'

export class SifenNoConfiguradoError extends SifenError {
  constructor() {
    super('sifen_no_configurado', 'SIFEN no está configurado: sin certificado la emisión sigue siendo un documento no fiscal.')
  }
}

export type RespuestaSifen = {
  codigo: string
  mensaje: string
  aprobado: boolean
  fechaProceso: string | null
  protocolo: string | null
  /** XML del DE devuelto por una consulta aprobada, si viene. */
  xml: string | null
}

/** Sobre SOAP de recepción de DE (rEnviDe) con el XML adentro de xDE. */
export function construirSobreRecepcion(xml: string, id = 1): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<env:Envelope xmlns:env="${SOAP_NS}"><env:Header/><env:Body>`,
    `<rEnviDe xmlns="${SIFEN_NS}"><dId>${Number(id) || 1}</dId><xDE>${escaparXml(xml)}</xDE></rEnviDe>`,
    '</env:Body></env:Envelope>',
  ].join('')
}

/** Sobre SOAP de consulta de DE por CDC (rEnviConsDE). */
export function construirSobreConsulta(cdc: string, id = 1): string {
  const texto = String(cdc ?? '').replace(/\D/g, '')
  if (!/^\d{44}$/.test(texto)) throw new SifenError('cdc_invalido', 'La consulta necesita un CDC de 44 dígitos.')
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<env:Envelope xmlns:env="${SOAP_NS}"><env:Header/><env:Body>`,
    `<rEnviConsDE xmlns="${SIFEN_NS}"><dId>${Number(id) || 1}</dId><dCDC>${texto}</dCDC></rEnviConsDE>`,
    '</env:Body></env:Envelope>',
  ].join('')
}

const valorDe = (xml: string, etiqueta: string): string | null => {
  const coincidencia = new RegExp(`<(?:[\\w.-]+:)?${etiqueta}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.-]+:)?${etiqueta}>`).exec(xml)
  return coincidencia ? coincidencia[1].trim() : null
}

const desescaparXml = (valor: string) => valor
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'")
  .replace(/&amp;/g, '&')

/** Convierte la respuesta SOAP de SIFEN en un resultado tipado. */
export function normalizarRespuestaSifen(xml: string): RespuestaSifen {
  const cuerpo = String(xml ?? '')
  const codigo = valorDe(cuerpo, 'dCodRes')
  if (!codigo) {
    const falla = valorDe(cuerpo, 'faultstring') || valorDe(cuerpo, 'Text') || valorDe(cuerpo, 'faultcode')
    throw new SifenError('respuesta_invalida', `SIFEN devolvió una respuesta sin código de resultado${falla ? `: ${falla}` : '.'}`)
  }
  const xmlDe = valorDe(cuerpo, 'xContenDE') || valorDe(cuerpo, 'xDE')
  return {
    codigo,
    mensaje: valorDe(cuerpo, 'dMsgRes') || '',
    aprobado: codigo === CODIGO_APROBADO,
    fechaProceso: valorDe(cuerpo, 'dFecProc'),
    protocolo: valorDe(cuerpo, 'dProtAut') || valorDe(cuerpo, 'dCDC'),
    xml: xmlDe ? desescaparXml(xmlDe) : null,
  }
}

type Opciones = { config?: SifenConfig | null; fetchImpl?: typeof fetch; id?: number }

async function llamar(endpoint: string, sobre: string, config: SifenConfig, fetchImpl: typeof fetch): Promise<RespuestaSifen> {
  const respuesta = await fetchImpl(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/xml; charset=UTF-8', Accept: 'application/xml' },
    body: sobre,
    signal: AbortSignal.timeout(config.timeoutMs),
  })
  const texto = await respuesta.text()
  if (!respuesta.ok) throw new SifenError(`http_${respuesta.status}`, `SIFEN respondió HTTP ${respuesta.status}: ${texto.slice(0, 300)}`)
  return normalizarRespuestaSifen(texto)
}

/** Envía un DE ya serializado (y firmado, en Fase 2) al WS de recepción. */
export async function enviarDe(xml: string, { config = null, fetchImpl = fetch, id = 1 }: Opciones = {}): Promise<RespuestaSifen> {
  if (!config) throw new SifenNoConfiguradoError()
  if (!String(xml ?? '').includes('<rDE')) throw new SifenError('de_invalido', 'El XML a enviar no parece un rDE.')
  try {
    return await llamar(config.endpointRecibe, construirSobreRecepcion(xml, id), config, fetchImpl)
  } catch (error) {
    if (error instanceof SifenError) throw error
    throw new SifenError('sifen_inaccesible', `No se pudo conectar con SIFEN: ${error instanceof Error ? error.message : 'error de red'}.`)
  }
}

/** Consulta un DE por CDC (para reintentos y conciliación). */
export async function consultarDe(cdc: string, { config = null, fetchImpl = fetch, id = 1 }: Opciones = {}): Promise<RespuestaSifen> {
  if (!config) throw new SifenNoConfiguradoError()
  try {
    return await llamar(config.endpointConsulta, construirSobreConsulta(cdc, id), config, fetchImpl)
  } catch (error) {
    if (error instanceof SifenError) throw error
    throw new SifenError('sifen_inaccesible', `No se pudo conectar con SIFEN: ${error instanceof Error ? error.message : 'error de red'}.`)
  }
}
