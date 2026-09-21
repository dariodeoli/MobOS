// Configuración por entorno del módulo SIFEN (#130, Fase 1): sin flag y sin
// datos completos queda apagado, y con todo cargado arma endpoints y RUC.
import assert from 'node:assert/strict'
import { ambienteSifen, sifenConfig, sifenFlagActivo, sifenHabilitado, sifenMotivoApagado, SIFEN_ENDPOINTS } from '../lib/sifen/config'

const CLAVES = ['MOBOS_SIFEN_ENABLED', 'MOBOS_SIFEN_AMBIENTE', 'MOBOS_SIFEN_RUC', 'MOBOS_SIFEN_RAZON_SOCIAL', 'MOBOS_SIFEN_TIPO_CONTRIBUYENTE', 'MOBOS_SIFEN_TIMBRADO', 'MOBOS_SIFEN_ESTABLECIMIENTO', 'MOBOS_SIFEN_PUNTO_EXPEDICION', 'MOBOS_SIFEN_CERT_PATH', 'MOBOS_SIFEN_CERT_PASSWORD', 'MOBOS_SIFEN_RECIBE_URL', 'MOBOS_SIFEN_CONSULTA_URL']
const originales = Object.fromEntries(CLAVES.map((clave) => [clave, process.env[clave]]))
const limpiar = () => { for (const clave of CLAVES) delete process.env[clave] }

try {
  // Todo vacío: el módulo está apagado y la app sigue con documentos no fiscales.
  limpiar()
  assert.equal(sifenFlagActivo(), false)
  assert.equal(sifenHabilitado(), false)
  assert.equal(sifenConfig(), null)
  assert.match(String(sifenMotivoApagado()), /MOBOS_SIFEN_ENABLED/)

  // Flag encendido pero sin RUC.
  process.env.MOBOS_SIFEN_ENABLED = '1'
  assert.match(String(sifenMotivoApagado()), /RUC/)

  // RUC con dígito verificador que no corresponde.
  process.env.MOBOS_SIFEN_RUC = '80069563-9'
  assert.match(String(sifenMotivoApagado()), /dígito verificador/)

  // Falta timbrado y certificado.
  process.env.MOBOS_SIFEN_RUC = '80069563-1'
  assert.match(String(sifenMotivoApagado()), /TIMBRADO/)
  process.env.MOBOS_SIFEN_TIMBRADO = '12558946'
  assert.match(String(sifenMotivoApagado()), /CERT_PATH/)

  // Configuración completa en test.
  process.env.MOBOS_SIFEN_CERT_PATH = '/tmp/certificado-de-prueba.p12'
  assert.equal(sifenHabilitado(), true)
  assert.equal(sifenMotivoApagado(), null)
  assert.equal(ambienteSifen(), 'test')
  const config = sifenConfig()
  assert.ok(config)
  assert.equal(config.ruc, '80069563')
  assert.equal(config.dv, '1')
  assert.equal(config.ambiente, 'test')
  assert.equal(config.timbrado, '12558946')
  assert.equal(config.establecimiento, '001')
  assert.equal(config.puntoExpedicion, '001')
  assert.equal(config.tipoContribuyente, 2, 'sin variable, el emisor es persona jurídica')
  assert.equal(config.endpointRecibe, SIFEN_ENDPOINTS.test.recibe)
  assert.equal(config.endpointConsulta, SIFEN_ENDPOINTS.test.consulta)
  assert.equal(config.timeoutMs, 15000)

  // Prod y overrides.
  process.env.MOBOS_SIFEN_AMBIENTE = 'prod'
  process.env.MOBOS_SIFEN_TIPO_CONTRIBUYENTE = '1'
  process.env.MOBOS_SIFEN_RECIBE_URL = 'https://sandbox.invalid/recibe'
  process.env.MOBOS_SIFEN_TIMEOUT_MS = '3000'
  const prod = sifenConfig()
  assert.ok(prod)
  assert.equal(prod.ambiente, 'prod')
  assert.equal(prod.tipoContribuyente, 1)
  assert.equal(prod.endpointRecibe, 'https://sandbox.invalid/recibe')
  assert.equal(prod.endpointConsulta, SIFEN_ENDPOINTS.prod.consulta)
  assert.equal(prod.timeoutMs, 3000)

  // RUC sin dígito: se calcula con el módulo 11 del SIFEN.
  process.env.MOBOS_SIFEN_RUC = '44444401'
  assert.equal(sifenConfig()?.dv, '7')
} finally {
  limpiar()
  for (const [clave, valor] of Object.entries(originales)) if (valor !== undefined) process.env[clave] = valor
}

console.log('sifen-config: flag, motivos, RUC, ambiente y endpoints OK')
