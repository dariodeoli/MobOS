import { hashToken, trustedClientIp } from '../../../../../lib/auth'
import { error, json } from '../../../../../lib/http'
import { prisma } from '../../../../../lib/prisma'
import {
  PAIRING_MAX_ATTEMPTS,
  codigoVinculacionVigente,
  generarTokenPuente,
  normalizarCodigoVinculacion,
} from '../../../../../lib/print-bridge'
import { textoOpcional } from '../../../../../lib/print-jobs'

// Canje del código de vinculación por el token del puente. El código es de un
// solo uso: se consume con un UPDATE condicionado y el token se devuelve una
// única vez; nunca se registra ni se compara fuera del hash.
export async function POST(request: Request) {
  const ip = trustedClientIp(request)
  if (!dentroDelLimite(ip)) return error('Demasiados intentos de vinculación. Esperá un minuto.', 429)
  const body = await request.json().catch(() => null)
  const code = normalizarCodigoVinculacion(body?.code)
  if (!code) return error('El código de vinculación no es válido.', 400)
  const codeHash = hashToken(code)
  const puente = await prisma.printBridge.findFirst({ where: { pairingCodeHash: codeHash } })
  if (!puente || puente.revokedAt) return error('Código de vinculación inválido o vencido.', 401)

  const ahora = new Date()
  if (!codigoVinculacionVigente(puente, ahora)) {
    const intentos = puente.pairingAttempts + 1
    await prisma.$transaction(async tx => {
      await tx.printBridge.updateMany({ where: { id: puente.id, pairingCodeHash: codeHash }, data: { pairingAttempts: intentos } })
      await tx.auditLog.create({ data: { tenantId: puente.tenantId, action: 'PRINT_BRIDGE_PAIR_FAILED', entity: 'PrintBridge', entityId: puente.id, metadata: { intentos, ...networkMetadata(ip) } } })
    })
    if (intentos >= PAIRING_MAX_ATTEMPTS) return error('Código de vinculación bloqueado por intentos. Generá uno nuevo.', 429)
    return error('Código de vinculación inválido o vencido.', 401)
  }

  const token = generarTokenPuente()
  const version = textoOpcional(body?.version, 40)
  const platform = textoOpcional(body?.platform, 40)
  const consumido = await prisma.$transaction(async tx => {
    const cambio = await tx.printBridge.updateMany({
      where: { id: puente.id, pairingCodeHash: codeHash, pairingUsedAt: null, pairingExpiresAt: { gt: ahora }, pairingAttempts: { lt: PAIRING_MAX_ATTEMPTS }, revokedAt: null },
      data: {
        tokenHash: hashToken(token),
        pairingUsedAt: ahora,
        pairingAttempts: 0,
        ...(version ? { version } : {}),
        ...(platform ? { platform } : {}),
      },
    })
    if (!cambio.count) return false
    await tx.auditLog.create({ data: { tenantId: puente.tenantId, action: 'PRINT_BRIDGE_PAIRED', entity: 'PrintBridge', entityId: puente.id, metadata: {} } })
    return true
  })
  if (!consumido) return error('Código de vinculación inválido o vencido.', 401)
  return json({ token, bridgeId: puente.id }, { status: 201 })
}

// Rate limit en memoria por IP (10/min): instancia única. Sin IP confiable no
// se limita, igual que el resto de los límites de autenticación del backend.
const VENTANA_MS = 60_000
const MAX_INTENTOS_POR_IP = 10
const intentosPorIp = new Map<string, number[]>()

function dentroDelLimite(ip: string | null, ahora: number = Date.now()): boolean {
  if (!ip) return true
  const previos = (intentosPorIp.get(ip) || []).filter(marca => ahora - marca < VENTANA_MS)
  if (previos.length >= MAX_INTENTOS_POR_IP) {
    intentosPorIp.set(ip, previos)
    return false
  }
  previos.push(ahora)
  intentosPorIp.set(ip, previos)
  return true
}

function networkMetadata(ip: string | null) {
  return ip ? { clientNetworkHash: hashToken(`network:${ip}`) } : {}
}
