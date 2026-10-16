import assert from 'node:assert/strict'
import type { PrismaClient, PrintBridge, PrintJob, PrintJobState } from '@prisma/client'
import {
  LATIDO_PRESENCIA_MS,
  MAX_PUENTES_POR_EMPRESA,
  PAIRING_MAX_ATTEMPTS,
  PAIRING_TTL_MS,
  autenticarPuente,
  codigoVinculacionVigente,
  compararHashToken,
  crearCodigoVinculacion,
  debeRefrescarPresencia,
  generarTokenPuente,
  impresoraDesdeLegacy,
  normalizarCodigoVinculacion,
  normalizarImpresora,
  normalizarPlantillaPrueba,
  remoteEnabledDeTenant,
  resolverPuenteDeImpresion,
  shapePuente,
  topeDePuentesAlcanzado,
} from '../lib/print-bridge'
import { hashToken } from '../lib/auth'
import { InputError } from '../lib/payment-input'
import { cambiosDeImpresora, enmascararDestino, resumenImpresora } from '../lib/print-audit'
import {
  ESTADOS_RESULTADO,
  LEASE_MAX_MS,
  LEASE_MS,
  MAX_ABIERTOS_POR_EMPRESA,
  MAX_INTENTOS_IMPRESION,
  PAYLOAD_MAX_B64,
  VENTANA_DUPLICADO_MS,
  calcularLeaseExtendido,
  calcularRequeue,
  estadoTrasResultado,
  hashSufijo,
  milisegundosEntre,
  shapePublico,
  sufijoCoincide,
  validarPayload,
  validarRasterV1,
  leerTrabajoJson,
  PRINT_BODY_MAX_BYTES,
  MAX_BYTES_ABIERTOS_POR_EMPRESA,
} from '../lib/print-jobs'

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

  // ── Frescura de la presencia (#319) ──────────────────────────────────────
  const conLatido = { lastSeenAt: ahora, version: '1.6.2', platform: 'macOS' }
  assert.equal(debeRefrescarPresencia({ lastSeenAt: null, version: null, platform: null }, { version: '1.6.3', ahora }), true, 'el primer latido siempre escribe')
  assert.equal(debeRefrescarPresencia(conLatido, { version: '1.6.2', platform: 'macOS', ahora: new Date(ahora.getTime() + 1000) }), false, 'dentro de la ventana y sin cambios no se reescribe')
  assert.equal(debeRefrescarPresencia(conLatido, { version: '1.6.3', platform: 'macOS', ahora: new Date(ahora.getTime() + 1000) }), true, 'una versión nueva se refleja sin esperar la ventana')
  assert.equal(debeRefrescarPresencia(conLatido, { version: '1.6.2', platform: 'linux', ahora: new Date(ahora.getTime() + 1000) }), true, 'una plataforma nueva se refleja sin esperar la ventana')
  assert.equal(debeRefrescarPresencia(conLatido, { version: '1.6.2', platform: 'macOS', ahora: new Date(ahora.getTime() + LATIDO_PRESENCIA_MS) }), true, 'pasada la ventana la presencia se refresca')
  assert.equal(debeRefrescarPresencia(conLatido, { version: '', platform: '', ahora: new Date(ahora.getTime() + 1000) }), false, 'un agente viejo sin versión no borra la reportada')

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

  // ── Plantilla del ticket de prueba (#277) ────────────────────────────────
  assert.equal(normalizarPlantillaPrueba(undefined), undefined, 'sin dato no cambia la plantilla')
  assert.equal(normalizarPlantillaPrueba(null), null, 'null borra la plantilla guardada')
  assert.deepEqual(
    normalizarPlantillaPrueba({ tipo: 'corta', ancho: 58, corte: 'parcial', copias: 2, incluyeFecha: true, incluye: { validacion: false }, extra: 'se ignora' }),
    { tipo: 'corta', ancho: 58, corte: 'parcial', copias: 2, incluyeFecha: true },
    'acota y filtra la plantilla',
  )
  assert.deepEqual(normalizarPlantillaPrueba({}), {}, 'una plantilla vacía es válida')
  assert.throws(() => normalizarPlantillaPrueba('texto'), /Plantilla/, 'rechaza plantillas que no son objeto')
  assert.throws(() => normalizarPlantillaPrueba([]), /Plantilla/, 'rechaza listas')
  assert.throws(() => normalizarPlantillaPrueba({ tipo: '' }), /Tipo/, 'exige tipo no vacío')
  assert.throws(() => normalizarPlantillaPrueba({ ancho: 55 }), /ancho/, 'solo acepta 58 u 80 mm')
  assert.throws(() => normalizarPlantillaPrueba({ copias: 9 }), /Copias/, 'rechaza copias fuera de rango')

  const desdeLegacy = impresoraDesdeLegacy({ nombre: 'Vieja', marca: 'Epson', destino: 'usb:CAJA', ancho: 58, copias: 2, densidad: 5, predeterminada: true })
  assert.equal(desdeLegacy.name, 'Vieja', 'mapea las claves legacy en español')
  assert.equal(desdeLegacy.destination, 'cups:CAJA')
  assert.equal(desdeLegacy.width, 58)
  assert.equal(desdeLegacy.copies, 2)
  assert.equal(desdeLegacy.isDefault, true)
  assert.throws(() => impresoraDesdeLegacy(null), /legacy/, 'una impresora legacy nula se rechaza')

  // ── Payload del trabajo ──────────────────────────────────────────────────
  assert.equal(validarPayload('QUJDRA=='), 'QUJDRA==', 'acepta base64 del ticket')
  assert.equal(PAYLOAD_MAX_B64, 524288, 'el tope de payload son 512 KiB base64')
  assert.equal(Buffer.from(validarPayload('A'.repeat(PAYLOAD_MAX_B64)), 'base64').length, 393216, 'límite exacto en bytes decodificados')
  for (const invalid of ['A', 'AA=', 'A===', 'AAAA=AAA', 'AAAA\n', 'AB==']) assert.throws(() => validarPayload(invalid), /mal formado|vacío/)
  assert.equal(MAX_BYTES_ABIERTOS_POR_EMPRESA, 20 * 1024 * 1024)
  const parsed = await leerTrabajoJson(new Request('http://localhost/', { method: 'POST', body: JSON.stringify({ payload: 'A'.repeat(PAYLOAD_MAX_B64) }) }))
  assert.equal(String(parsed.payload).length, PAYLOAD_MAX_B64)
  await assert.rejects(leerTrabajoJson(new Request('http://localhost/', { method: 'POST', body: 'x'.repeat(PRINT_BODY_MAX_BYTES + 1) })), (cause: unknown) => cause instanceof InputError && cause.status === 413)
  let cancelled = false
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(PRINT_BODY_MAX_BYTES)); controller.enqueue(new Uint8Array(1)) }, cancel() { cancelled = true } })
  await assert.rejects(leerTrabajoJson(new Request('http://localhost/', { method: 'POST', body: stream, duplex: 'half' } as RequestInit)), (cause: unknown) => cause instanceof InputError && cause.status === 413)
  assert.equal(cancelled, true, 'stream cortado al superar el límite sin Content-Length')

  assert.throws(() => validarPayload(''), /vacío/, 'rechaza payload vacío')
  assert.throws(() => validarPayload('no-es-base64!'), /vacío/, 'rechaza payload con símbolos')
  assert.throws(() => validarPayload('A'.repeat(PAYLOAD_MAX_B64 + 1)), (cause: unknown) => cause instanceof InputError && cause.status === 413, 'el payload sobre el tope da 413')

  const label = Buffer.from([27,64,27,116,2,27,97,0,27,97,1,29,118,48,0,72,0,1,0,...new Array(72).fill(0),27,100,2,29,86,0])
  for (const count of [1,2,3]) validarRasterV1(Buffer.concat(new Array(count).fill(label)).toString('base64'))
  validarRasterV1(Buffer.concat([label.subarray(0,-3),label.subarray(0,-3)]).toString('base64'))
  for (const malformed of [label.subarray(0,-5),Buffer.concat([label,Buffer.from([255])]),Buffer.concat([label,Buffer.from([27,64])])]) assert.throws(() => validarRasterV1(malformed.toString('base64')), /mal formado/)

  // ── Sufijo de confirmación ───────────────────────────────────────────────
  assert.equal(hashSufijo('7'), hashToken('7'), 'el sufijo se guarda hasheado con SHA-256')
  assert.equal(sufijoCoincide(hashSufijo('7'), hashSufijo('7')), true, 'el sufijo correcto coincide')
  assert.equal(sufijoCoincide(hashSufijo('7'), hashSufijo('70')), false, 'un sufijo distinto no coincide')
  assert.equal(sufijoCoincide('abc', 'abcd'), false, 'largos distintos no rompen la comparación')

  // ── Transiciones de estado ───────────────────────────────────────────────
  assert.deepEqual([...ESTADOS_RESULTADO], ['ACEPTADO', 'INCIERTO', 'FALLIDO'], 'solo tres resultados reportables')
  assert.equal(estadoTrasResultado('RECLAMADO', 'ACEPTADO'), 'ACEPTADO', 'el claim acepta el resultado exitoso')
  assert.equal(estadoTrasResultado('RECLAMADO', 'INCIERTO'), 'INCIERTO', 'el claim acepta el incierto')
  assert.equal(estadoTrasResultado('RECLAMADO', 'FALLIDO'), 'FALLIDO', 'el claim acepta el fallo')
  assert.equal(estadoTrasResultado('ACEPTADO', 'FALLIDO'), null, 'un trabajo cerrado no cambia de estado')
  assert.equal(estadoTrasResultado('CONFIRMADO', 'ACEPTADO'), null, 'un confirmado no vuelve atrás')
  assert.equal(estadoTrasResultado('PENDIENTE', 'ACEPTADO'), null, 'un trabajo sin claim no recibe resultado')

  // ── Requeue por lease vencido ────────────────────────────────────────────
  const vencidoHace = new Date(ahora.getTime() - 1000)
  const vencePronto = new Date(ahora.getTime() + 1000)
  assert.equal(MAX_INTENTOS_IMPRESION, 3, 'el tope de intentos de impresión es explícito')
  assert.equal(calcularRequeue(1, vencidoHace, ahora), 'PENDIENTE', 'con intentos disponibles vuelve a pendiente')
  assert.equal(calcularRequeue(2, vencidoHace, ahora), 'PENDIENTE', 'el penúltimo intento todavía reencola')
  assert.equal(calcularRequeue(3, vencidoHace, ahora), 'FALLIDO', 'agotar los intentos deja el trabajo fallido')
  assert.equal(calcularRequeue(1, vencePronto, ahora), null, 'un lease vigente no se toca')
  assert.equal(calcularRequeue(1, null, ahora), null, 'sin vencimiento no hay requeue')

  // ── Extensión del lease por latido ───────────────────────────────────────
  const reclamadoHace = new Date(ahora.getTime() - 10_000)
  assert.equal(calcularLeaseExtendido(reclamadoHace, ahora)?.getTime(), ahora.getTime() + LEASE_MS, 'el latido extiende 120 s')
  assert.equal(calcularLeaseExtendido(null, ahora), null, 'sin claim no hay lease que extender')
  assert.equal(calcularLeaseExtendido(new Date(ahora.getTime() - LEASE_MAX_MS), ahora), null, 'agotadas las ventanas no se extiende más')
  const cercaDelTope = new Date(ahora.getTime() - LEASE_MAX_MS + 10_000)
  assert.equal(calcularLeaseExtendido(cercaDelTope, ahora)?.getTime(), cercaDelTope.getTime() + LEASE_MAX_MS, 'el lease nunca supera el tope de ventanas')

  // ── Shape público (lista blanca) ─────────────────────────────────────────
  const jobInterno = {
    id: 'job-1',
    state: 'RECLAMADO' as PrintJobState,
    path: 'REMOTO',
    kind: 'prueba',
    bridgeId: 'puente-1',
    printerId: 'impresora-1',
    destination: 'lan:10.0.0.5:9100',
    validation: '1234',
    reference: 'TEST-1',
    suffixLength: 1,
    requestedByUserId: 'user-1',
    requestedByName: 'Admin',
    deviceName: 'Mac',
    bridgeName: 'Puente',
    tokenHint: 'abc…',
    mode: 'test',
    width: 58,
    copies: 1,
    attempts: 1,
    error: null,
    payloadBytes: 12,
    createdAt: ahora,
    acceptedAt: null,
    confirmedAt: null,
    payload: 'QUJDRA==',
    suffixHash: hashSufijo('7'),
    leaseId: 'lease-secreto',
    idempotencyKey: 'clave',
    sourceJobId: 'local-1',
    tokenHash: 'jamas',
  } as unknown as PrintJob
  const publicoJob = shapePublico(jobInterno)
  assert.deepEqual(
    Object.keys(publicoJob).sort(),
    ['acceptedAt', 'attempts', 'bridgeId', 'bridgeName', 'claimedAt', 'confirmedAt', 'copies', 'createdAt', 'destination', 'deviceName', 'durationMs', 'enqueuedAt', 'error', 'fallback', 'fallbackReason', 'id', 'kind', 'mode', 'path', 'payloadBytes', 'physicalConnection', 'printerId', 'printerName', 'queueMs', 'reference', 'requestedByName', 'requestedByUserId', 'requestedTransport', 'state', 'suffixLength', 'tokenHint', 'transport', 'validation', 'width'],
    'el shape público es una lista blanca exacta',
  )
  assert.equal(publicoJob.requestedByUserId, 'user-1', 'el id del usuario que mandó el trabajo alimenta el avatar de la cola')
  assert.equal('suffixHash' in publicoJob, false, 'el shape público nunca expone el hash del sufijo')
  assert.equal(publicoJob.suffixLength, 1, 'el shape público expone el LARGO del sufijo, no su valor (#138)')
  assert.equal('payload' in publicoJob, false, 'el shape público nunca expone bytes ESC/POS')
  assert.equal('suffixHash' in publicoJob, false, 'el shape público nunca expone el hash del sufijo')
  assert.equal('leaseId' in publicoJob, false, 'el shape público nunca expone el lease')
  assert.equal(MAX_ABIERTOS_POR_EMPRESA, 200, 'el cap de trabajos abiertos por empresa es explícito')
  assert.equal(VENTANA_DUPLICADO_MS, 60_000, 'la ventana del guarda anti-duplicados es explícita (#128)')

  // ── Telemetría: diferencias enteras y sin negativos ──────────────────────
  assert.equal(milisegundosEntre(new Date('2026-09-19T12:00:00.000Z'), new Date('2026-09-19T12:00:01.500Z')), 1500, 'la diferencia se redondea a ms enteros')
  assert.equal(milisegundosEntre(new Date('2026-09-19T12:00:02.000Z'), new Date('2026-09-19T12:00:01.000Z')), 0, 'un reloj atrasado no produce negativos')
  assert.equal(milisegundosEntre(null, new Date()), null, 'sin instante inicial no hay medición')
  assert.equal(milisegundosEntre(new Date(), undefined), null, 'sin instante final no hay medición')

  // ── Auditoría de impresoras: IP enmascarada y diff sin secretos ──────────
  assert.equal(enmascararDestino('lan:192.168.1.23:9100'), 'lan:192.168.1.x:9100', 'la IP LAN se audita enmascarada')
  assert.equal(enmascararDestino('cups:MobOS_LAN'), 'cups:MobOS_LAN', 'una cola CUPS no se toca')
  assert.deepEqual(
    cambiosDeImpresora(
      { name: 'Caja', destination: 'lan:10.0.0.5:9100', width: 58, isActive: true, bridgeId: null },
      { name: 'Caja principal', destination: 'lan:10.0.0.5:9100', width: 80, isActive: true, bridgeId: null },
    ),
    { name: { from: 'Caja', to: 'Caja principal' }, width: { from: 58, to: 80 } },
    'el diff audita solo los campos que cambiaron',
  )
  assert.equal(JSON.stringify(cambiosDeImpresora({ destination: 'lan:10.0.0.5:9100' }, { destination: 'lan:10.0.0.9:9100' })).includes('10.0.0.'), false, 'el diff nunca guarda la IP completa')
  assert.deepEqual(
    resumenImpresora({ name: 'Caja', connection: 'lan', destination: 'lan:10.0.0.5:9100', width: 58, copies: 2, isDefault: true, isActive: true }),
    { name: 'Caja', connection: 'lan', destination: 'lan:10.0.0.x:9100', width: 58, copies: 2, isDefault: true, isActive: true, branchId: null },
    'el resumen de auditoría describe la impresora sin la IP completa',
  )

  // ── Resolución del puente por sucursal (#95) ─────────────────────────────
  // Doble mínimo de Prisma: `where` escalar con soporte de `not` y arrays en
  // orden de prioridad, que es lo que la resolución necesita.
  type FilaResolucion = Record<string, unknown>
  const coincide = (fila: FilaResolucion, where: Record<string, unknown>) => Object.entries(where).every(([clave, valor]) => {
    if (valor && typeof valor === 'object' && !Array.isArray(valor) && 'not' in (valor as Record<string, unknown>)) return fila[clave] !== (valor as { not: unknown }).not
    return fila[clave] === valor
  })
  const puentesResolucion: FilaResolucion[] = [
    { id: 'puente-empresa', tenantId: 'tenant-a', branchId: null, revokedAt: null, name: 'Puente empresa' },
    { id: 'puente-sucursal', tenantId: 'tenant-a', branchId: 'sucursal-a', revokedAt: null, name: 'Puente sucursal' },
    { id: 'puente-revocado', tenantId: 'tenant-a', branchId: 'sucursal-b', revokedAt: ahora, name: 'Puente revocado' },
  ]
  const impresorasResolucion: FilaResolucion[] = [
    { id: 'imp-con-puente', tenantId: 'tenant-a', branchId: null, bridgeId: 'puente-empresa', isDefault: false, isActive: true },
    { id: 'imp-sucursal', tenantId: 'tenant-a', branchId: 'sucursal-a', bridgeId: null, isDefault: false, isActive: true },
    { id: 'imp-otra-sucursal', tenantId: 'tenant-a', branchId: 'sucursal-sin-puente', bridgeId: null, isDefault: false, isActive: true },
  ]
  const dbResolucion = {
    printBridge: { findFirst: async ({ where }: { where: Record<string, unknown> }) => puentesResolucion.find(fila => coincide(fila, where)) ?? null },
    printPrinter: { findFirst: async ({ where }: { where: Record<string, unknown> }) => impresorasResolucion.find(fila => coincide(fila, where)) ?? null },
  } as unknown as Parameters<typeof resolverPuenteDeImpresion>[0]

  const conPuente = await resolverPuenteDeImpresion(dbResolucion, 'tenant-a', { printerId: 'imp-con-puente' })
  assert.deepEqual(conPuente, { bridgeId: 'puente-empresa', bridgeName: 'Puente empresa', origen: 'IMPRESORA' }, 'la impresora con puente explícito manda')
  const porSucursal = await resolverPuenteDeImpresion(dbResolucion, 'tenant-a', { printerId: 'imp-sucursal' })
  assert.deepEqual(porSucursal, { bridgeId: 'puente-sucursal', bridgeName: 'Puente sucursal', origen: 'SUCURSAL' }, 'la sucursal de la impresora resuelve su puente')
  const porSucursalDelJob = await resolverPuenteDeImpresion(dbResolucion, 'tenant-a', { branchId: 'sucursal-a' })
  assert.equal(porSucursalDelJob.origen, 'SUCURSAL', 'la sucursal del trabajo gana sin impresora')
  const fallback = await resolverPuenteDeImpresion(dbResolucion, 'tenant-a', { printerId: 'imp-otra-sucursal' })
  assert.deepEqual(fallback, { bridgeId: 'puente-empresa', bridgeName: 'Puente empresa', origen: 'EMPRESA' }, 'sin puente de sucursal cae al de la empresa')
  const porUsuario = await resolverPuenteDeImpresion(dbResolucion, 'tenant-a', { userBranchId: 'sucursal-a' })
  assert.equal(porUsuario.origen, 'SUCURSAL', 'la sucursal del usuario que encola también resuelve')
  const ajeno = await resolverPuenteDeImpresion(dbResolucion, 'tenant-b', { branchId: 'sucursal-a' })
  assert.deepEqual(ajeno, { bridgeId: null, bridgeName: null, origen: 'SIN_PUENTE' }, 'otra empresa no ve puentes ni sucursales')
  assert.equal((await resolverPuenteDeImpresion({ printBridge: { findFirst: async () => null }, printPrinter: { findFirst: async () => null } } as unknown as Parameters<typeof resolverPuenteDeImpresion>[0], 'tenant-a', {})).origen, 'SIN_PUENTE', 'sin puentes activos el trabajo queda libre para el primero que reclame')

  console.log('PASS: token, pairing, autenticación multi-puente, validación de impresoras, auditoría, resolución por sucursal y trabajos de impresión')
}

main().catch(error => { console.error(error); process.exit(1) })
