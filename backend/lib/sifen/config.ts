// Configuración por entorno del módulo SIFEN (#130, Fase 1). Sin valores
// reales en el repositorio: mientras el flag no esté activo y no haya RUC,
// timbrado y certificado cargados, `sifenConfig()` devuelve null y la app sigue
// emitiendo documentos no fiscales como siempre.
//
// Variables (todas opcionales, documentadas en docs/SIFEN.md):
//   MOBOS_SIFEN_ENABLED=1
//   MOBOS_SIFEN_AMBIENTE=test|prod
//   MOBOS_SIFEN_RUC=80012345-6
//   MOBOS_SIFEN_RAZON_SOCIAL=...
//   MOBOS_SIFEN_TIMBRADO=...
//   MOBOS_SIFEN_ESTABLECIMIENTO=001
//   MOBOS_SIFEN_PUNTO_EXPEDICION=001
//   MOBOS_SIFEN_CERT_PATH=/ruta/al/certificado.p12
//   MOBOS_SIFEN_CERT_PASSWORD=...
//   MOBOS_SIFEN_TIMEOUT_MS=15000
//   MOBOS_SIFEN_RECIBE_URL / MOBOS_SIFEN_CONSULTA_URL (override de endpoints)

import { dvRucValido, separarRuc } from './cdc'
import type { SifenAmbiente } from './contracts'

export type SifenConfig = {
  ambiente: SifenAmbiente
  ruc: string
  dv: string
  razonSocial: string
  tipoContribuyente: number
  direccion: string
  ciudad: string
  departamento: string
  telefono: string
  email: string
  timbrado: string
  establecimiento: string
  puntoExpedicion: string
  certificadoPath: string
  certificadoPassword: string
  endpointRecibe: string
  endpointConsulta: string
  timeoutMs: number
}

// Endpoints oficiales del Manual Técnico v150 (§7.10). Producción y test
// comparten rutas; solo cambia el dominio.
export const SIFEN_ENDPOINTS: Record<SifenAmbiente, { recibe: string; consulta: string }> = {
  test: {
    recibe: 'https://sifen-test.set.gov.py/de/ws/sync/recibe.wsdl',
    consulta: 'https://sifen-test.set.gov.py/de/ws/consultas/consulta.wsdl',
  },
  prod: {
    recibe: 'https://sifen.set.gov.py/de/ws/sync/recibe.wsdl',
    consulta: 'https://sifen.set.gov.py/de/ws/consultas/consulta.wsdl',
  },
}

const texto = (valor: unknown) => String(valor ?? '').trim()

export function ambienteSifen(): SifenAmbiente {
  return texto(process.env.MOBOS_SIFEN_AMBIENTE).toLowerCase() === 'prod' ? 'prod' : 'test'
}

/** El flag existe y está encendido. */
export function sifenFlagActivo(): boolean {
  const valor = texto(process.env.MOBOS_SIFEN_ENABLED).toLowerCase()
  return valor === '1' || valor === 'true' || valor === 'si' || valor === 'sí'
}

/**
 * Motivo por el que la emisión fiscal está apagada; null cuando está lista.
 * Sirve para diagnóstico (endpoint de estado o logs) sin filtrar valores.
 */
export function sifenMotivoApagado(): string | null {
  if (!sifenFlagActivo()) return 'MOBOS_SIFEN_ENABLED no está activo.'
  const ruc = texto(process.env.MOBOS_SIFEN_RUC)
  if (!ruc) return 'Falta MOBOS_SIFEN_RUC.'
  try {
    const { ruc: base, dv } = separarRuc(ruc)
    if (!dvRucValido(base, dv)) return 'El dígito verificador de MOBOS_SIFEN_RUC no corresponde.'
  } catch {
    return 'MOBOS_SIFEN_RUC no tiene un formato válido.'
  }
  if (!texto(process.env.MOBOS_SIFEN_TIMBRADO)) return 'Falta MOBOS_SIFEN_TIMBRADO.'
  if (!texto(process.env.MOBOS_SIFEN_CERT_PATH)) return 'Falta MOBOS_SIFEN_CERT_PATH.'
  return null
}

export function sifenHabilitado(): boolean {
  return sifenMotivoApagado() === null
}

/**
 * Configuración completa del módulo, o null si el flag está apagado o falta
 * algún dato. No abre ni valida el certificado: la firma es Fase 2.
 */
export function sifenConfig(): SifenConfig | null {
  if (!sifenHabilitado()) return null
  const ambiente = ambienteSifen()
  const { ruc, dv } = separarRuc(texto(process.env.MOBOS_SIFEN_RUC))
  const timeout = Number(texto(process.env.MOBOS_SIFEN_TIMEOUT_MS) || 15_000)
  return {
    ambiente,
    ruc,
    dv,
    razonSocial: texto(process.env.MOBOS_SIFEN_RAZON_SOCIAL) || '',
    tipoContribuyente: Number(texto(process.env.MOBOS_SIFEN_TIPO_CONTRIBUYENTE) || 2) === 1 ? 1 : 2,
    direccion: texto(process.env.MOBOS_SIFEN_DIRECCION) || '',
    ciudad: texto(process.env.MOBOS_SIFEN_CIUDAD) || '',
    departamento: texto(process.env.MOBOS_SIFEN_DEPARTAMENTO) || '',
    telefono: texto(process.env.MOBOS_SIFEN_TELEFONO) || '',
    email: texto(process.env.MOBOS_SIFEN_EMAIL) || '',
    timbrado: texto(process.env.MOBOS_SIFEN_TIMBRADO),
    establecimiento: texto(process.env.MOBOS_SIFEN_ESTABLECIMIENTO) || '001',
    puntoExpedicion: texto(process.env.MOBOS_SIFEN_PUNTO_EXPEDICION) || '001',
    certificadoPath: texto(process.env.MOBOS_SIFEN_CERT_PATH),
    certificadoPassword: texto(process.env.MOBOS_SIFEN_CERT_PASSWORD),
    endpointRecibe: texto(process.env.MOBOS_SIFEN_RECIBE_URL) || SIFEN_ENDPOINTS[ambiente].recibe,
    endpointConsulta: texto(process.env.MOBOS_SIFEN_CONSULTA_URL) || SIFEN_ENDPOINTS[ambiente].consulta,
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 15_000,
  }
}
