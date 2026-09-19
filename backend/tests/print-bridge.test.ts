import assert from 'node:assert/strict'
import type { PrismaClient, PrintBridge } from '@prisma/client'
import {
  MAX_PUENTES_POR_EMPRESA,
  PAIRING_MAX_ATTEMPTS,
  PAIRING_TTL_MS,
  autenticarPuente,
  codigoVinculacionVigente,
  compararHashToken,
  crearCodigoVinculacion,
  generarTokenPuente,
  impresoraDesdeLegacy,
  normalizarCodigoVinculacion,
  normalizarImpresora,
  remoteEnabledDeTenant,
  shapePuente,
  topeDePuentesAlcanzado,
} from '../lib/print-bridge'
import { hashToken } from '../lib/auth'

async function main() {
  // ── Normalización del código de vinculación (Crockford) ──────────────────
  assert.equal(normalizarCodigoVinculacion('abcde-fghij'), 'ABCDE-FGH1J', 'acepta minúsculas, separador y confunde I con 1')
  assert.equal(normalizarCodigoVinculacion('abcde fghij'), 'ABCDE-FGH1J', 'acepta espacios')
  assert.equal(normalizarCodigoVinculacion('ABCDE-FGH1J'), 'ABCDE-FGH1J', 'es idempotente sobre la forma canónica')
  assert.equal(normalizarCodigoVinculacion('ABCDE-FGHIO'), 'ABCDE-FGH10', 'la O se lee como cero')
  assert.equal(normalizarCodigoVinculacion('ABCDE-FGHIL'), 'ABCDE-FGH11', 'la I y la L se leen como uno')
  assert.equal(normalizarCodigoVinculacion('ABCDE-FGHIU'), null, 'la U no existe en Crockford')
  assert.equal(normalizarCodigoVinculacion('ABCDE-FGH1'), null, 'rechaza largo incorrecto')
  assert.equal(normalizarCodigoVinculacion('ABCDE-FGH1!'), null, 'rechaza símbolos')
  assert.equal(normalizarCodigoVinculacion(1234567890), null, 'rechaza no-texto')

  // ── Emisión y vigencia del código ────────────────────────────────────────
  const ahora = new Date('2026-09-19T12:00:00.000Z')
  const emitido = crearCodigoVinculacion(ahora)
  assert.match(emitido.code, /^[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/, 'el código generado usa el alfabeto Crockford')
  assert.equal(emitido.codeHash, hashToken(emitido.code), 'solo se persiste el hash del código')
  assert.equal(emitido.expiresAt.getTime() - ahora.getTime(), PAIRING_TTL_MS, 'el código vence a los 15 minutos')

  const vigente = { pairingUsedAt: null, pairingExpiresAt: new Date(ahora.getTime() + 1000), pairingAttempts: 0 }
  assert.equal(codigoVinculacionVigente(vigente, ahora), true, 'un código fresco está vigente')
  assert.equal(codigoVinculacionVigente({ ...vigente, pairingExpiresAt: new Date(ahora.getTime() - 1) }, ahora), false, 'un código vencido no sirve')
  assert.equal(codigoVinculacionVigente({ ...vigente, pairingExpiresAt: ahora }, ahora), false, 'el borde vencido no sirve')
  assert.equal(codigoVinculacionVigente({ ...vigente, pairingUsedAt: ahora }, ahora), false, 'un código ya usado no sirve')
  assert.equal(codigoVinculacionVigente({ ...vigente, pairingAttempts: PAIRING_MAX_ATTEMPTS }, ahora), false, 'agotar intentos invalida el código')
  assert.equal(codigoVinculacionVigente({ ...vigente, pairingAttempts: PAIRING_MAX_ATTEMPTS - 1 }, ahora), true, 'el último intento todavía sirve')

  // ── Token del puente ─────────────────────────────────────────────────────
  const token = generarTokenPuente()
  assert.match(token, /^[a-f0-9]{64}$/, 'el token son 32 bytes en hex')
  assert.notEqual(token, generarTokenPuente(), 'dos tokens nunca coinciden')
  assert.equal(compararHashToken(hashToken(token), hashToken(token)), true, 'el hash correcto compara igual')
  assert.equal(compararHashToken(hashToken(token), hashToken(`${token}x`)), false, 'un hash distinto no compara igual')
  assert.equal(compararHashToken('abc', 'abcd'), false, 'largos distintos no rompen la comparación')

  // ── Autenticación del puente ─────────────────────────────────────────────
  const puenteA = { id: 'puente-a', tenantId: 'tenant-a', name: 'Puente A', tokenHash: hashToken('token-a'), revokedAt: null } as unknown as PrintBridge
  const puenteB = { id: 'puente-b', tenantId: 'tenant-b', name: 'Puente B', tokenHash: hashToken('token-b'), revokedAt: null } as unknown as PrintBridge
  const puenteRevocado = { id: 'puente-c', tenantId: 'tenant-a', name: 'Puente C', tokenHash: hashToken('token-c'), revokedAt: new Date('2026-09-18T00:00:00.000Z') } as unknown as PrintBridge
  const puentes = [puenteA, puenteB, puenteRevocado]
  const db = {
    printBridge: {
      findUnique: async ({ where }: { where: { tokenHash: string } }) => puentes.find(puente => compararHashToken(puente.tokenHash, where.tokenHash)) ?? null,
      count: async ({ where }: { where: { tenantId: string; revokedAt: null } }) => puentes.filter(puente => puente.tenantId === where.tenantId && !puente.revokedAt).length,
    },
  } as unknown as Pick<PrismaClient, 'printBridge'>
  const solicitud = (bearer?: string) => new Request('http://local.test/api/print/bridge/heartbeat', { headers: bearer === undefined ? {} : { Authorization: `Bearer ${bearer}` } })

  assert.equal(await autenticarPuente(solicitud(), db), null, 'sin header no autentica')
  assert.equal(await autenticarPuente(solicitud('token-desconocido'), db), null, 'un token desconocido no autentica')
  assert.equal(await autenticarPuente(solicitud('token-c'), db), null, 'un puente revocado no autentica')
  assert.equal(await autenticarPuente(solicitud('x'.repeat(201)), db), null, 'un token fuera de largo no autentica')
  assert.equal((await autenticarPuente(solicitud('token-a'), db))?.id, 'puente-a', 'cada token resuelve su propio puente')
  assert.equal((await autenticarPuente(solicitud('token-b'), db))?.id, 'puente-b', 'los puentes no se pisan entre sí')

  assert.equal(await topeDePuentesAlcanzado('tenant-a', db), false, 'por debajo del tope se puede crear')
  assert.equal(await topeDePuentesAlcanzado('tenant-b', db), false, 'el tope es por empresa')
  assert.equal(MAX_PUENTES_POR_EMPRESA, 20, 'el tope de puentes por empresa es explícito')

  // ── Shape público ────────────────────────────────────────────────────────
  const publico = shapePuente({ ...puenteA, lastSeenAt: new Date(ahora.getTime() - 1000) } as PrintBridge, ahora)
  assert.equal(publico.online, true, 'un latido reciente marca online')
  assert.equal('tokenHash' in publico, false, 'el shape público nunca expone tokenHash')
  assert.equal('pairingCodeHash' in publico, false, 'el shape público nunca expone el código')
  assert.equal(shapePuente(puenteA, ahora).online, false, 'sin latidos no está online')
  assert.equal(shapePuente({ ...puenteRevocado, lastSeenAt: ahora } as PrintBridge, ahora).online, false, 'un puente revocado nunca está online')

  // ── Kill switch por empresa ──────────────────────────────────────────────
  assert.equal(remoteEnabledDeTenant(undefined), true, 'sin configuración la impresión remota está encendida')
  assert.equal(remoteEnabledDeTenant({}), true, 'settings vacío deja la impresión remota encendida')
  assert.equal(remoteEnabledDeTenant({ printRemote: true }), true)
  assert.equal(remoteEnabledDeTenant({ printRemote: false }), false, 'solo el false explícito apaga la impresión remota')
  assert.equal(remoteEnabledDeTenant('no-es-objeto'), true)

  // ── Validación de impresoras ─────────────────────────────────────────────
  const impresora = normalizarImpresora({ name: '  Mostrador  ', destination: 'lan:192.168.1.23:9100' })
  assert.equal(impresora.name, 'Mostrador', 'recorta el nombre')
  assert.equal(impresora.connection, 'lan', 'deduce la conexión del destino')
  assert.equal(impresora.width, 80, 'ancho por defecto 80')
  assert.equal(impresora.copies, 1, 'copias por defecto 1')
  assert.equal(impresora.density, 3, 'densidad por defecto 3')
  assert.equal(impresora.isActive, true, 'activa por defecto')
  assert.equal(impresora.isDefault, false, 'no predeterminada por defecto')
  assert.equal(impresora.bridgeId, null, 'sin puente asignado')

  const legacy = normalizarImpresora({ name: 'Caja', connection: 'cups', destination: 'usb:EPSON_TM20' })
  assert.equal(legacy.destination, 'cups:EPSON_TM20', 'normaliza el prefijo usb: a cups:')
  assert.equal(legacy.connection, 'cups', 'la cola USB histórica es una cola CUPS')

  assert.throws(() => normalizarImpresora({ destination: 'lan:1.2.3.4:9100' }), /Nombre/, 'exige nombre')
  assert.throws(() => normalizarImpresora({ name: 'X' }), /Destino/, 'exige destino')
  assert.throws(() => normalizarImpresora({ name: 'X', destination: 'ftp:cola' }), /destino/, 'rechaza destinos desconocidos')
  assert.throws(() => normalizarImpresora({ name: 'X', destination: 'cups:cola', connection: 'lan' }), /LAN/, 'una LAN no puede apuntar a una cola')
  assert.throws(() => normalizarImpresora({ name: 'X', destination: 'lan:1.2.3.4:9100', connection: 'cups' }), /CUPS/, 'una CUPS no puede apuntar a LAN')
  assert.throws(() => normalizarImpresora({ name: 'X', destination: 'lan:1.2.3.4:9100', width: 57 }), /Ancho/, 'rechaza anchos fuera de 58/80')
  assert.throws(() => normalizarImpresora({ name: 'X', destination: 'lan:1.2.3.4:9100', copies: 9 }), /Copias/, 'rechaza copias fuera de rango')
  assert.throws(() => normalizarImpresora({ name: 'X', destination: 'lan:1.2.3.4:9100', density: 0 }), /Densidad/, 'rechaza densidad fuera de rango')
  assert.throws(() => normalizarImpresora({ name: 'x'.repeat(121), destination: 'cups:cola' }), /120/, 'rechaza nombres largos')
  assert.throws(() => normalizarImpresora({ name: 'X', destination: 'lan:1.2.3.4:9100', isActive: 'sí' }), /verdadero o falso/, 'no acepta strings como booleanos')

  const desdeLegacy = impresoraDesdeLegacy({ nombre: 'Vieja', marca: 'Epson', destino: 'usb:CAJA', ancho: 58, copias: 2, densidad: 5, predeterminada: true })
  assert.equal(desdeLegacy.name, 'Vieja', 'mapea las claves legacy en español')
  assert.equal(desdeLegacy.destination, 'cups:CAJA')
  assert.equal(desdeLegacy.width, 58)
  assert.equal(desdeLegacy.copies, 2)
  assert.equal(desdeLegacy.isDefault, true)
  assert.throws(() => impresoraDesdeLegacy(null), /legacy/, 'una impresora legacy nula se rechaza')

  console.log('PASS: token, pairing, autenticación multi-puente y validación de impresoras')
}

main().catch(error => { console.error(error); process.exit(1) })
