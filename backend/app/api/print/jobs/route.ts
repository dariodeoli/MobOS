import type { PrintJob, PrintJobPath, PrintJobState } from '@prisma/client'
import { requireSession } from '../../../../lib/auth'
import { error, json } from '../../../../lib/http'
import { prisma } from '../../../../lib/prisma'
import { InputError } from '../../../../lib/payment-input'
import { remoteEnabledDeTenant, resolverPuenteDeImpresion } from '../../../../lib/print-bridge'
import {
  ESTADOS_ABIERTOS,
  ESTADOS_RESULTADO,
  ESTADOS_TRABAJO,
  MAX_ABIERTOS_POR_EMPRESA,
  MAX_SUFIJO,
  hashSufijo,
  shapePublico,
  textoOpcional,
  validarPayload,
} from '../../../../lib/print-jobs'

// Cola de impresión de la empresa. La sesión encola trabajos remotos (con
// payload) o espejos LOCAL (solo metadatos) y lista el shape público, que
// nunca incluye bytes ESC/POS, sufijo ni lease.
export async function POST(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const tenantId = session.user.tenantId
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) return error('Datos del trabajo inválidos.')
  const entrada = body as Record<string, unknown>
  const tomar = (ingles: string, espanol: string) => (entrada[ingles] !== undefined ? entrada[ingles] : entrada[espanol])

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } })
  if (!remoteEnabledDeTenant(tenant?.settings)) return error('La impresión remota está desactivada para esta empresa.', 409)

  let creado: PrintJob | null = null
  let idempotencyKey = ''
  let sourceJobId = ''
  try {
    const camino = (String(tomar('path', 'camino') ?? 'REMOTO').trim().toUpperCase() || 'REMOTO') as PrintJobPath
    if (camino !== 'REMOTO' && camino !== 'LOCAL') throw new InputError('El camino debe ser REMOTO o LOCAL.')
    const printerId = textoOpcional(tomar('printerId', 'impresoraId'), 60) || null
    const destination = textoOpcional(tomar('destination', 'destino'), 200)
    if (!destination) throw new InputError('El destino es obligatorio.')
    const kind = textoOpcional(tomar('kind', 'tipo'), 40) || 'ticket'
    idempotencyKey = textoOpcional(entrada.idempotencyKey ?? request.headers.get('idempotency-key'), 120)
    sourceJobId = textoOpcional(entrada.sourceJobId, 120)
    const sufijo = textoOpcional(tomar('suffix', 'sufijo'), MAX_SUFIJO + 1)
    if (sufijo.length > MAX_SUFIJO) throw new InputError(`El sufijo admite hasta ${MAX_SUFIJO} caracteres.`)

    let payload: string | null = null
    let state: PrintJobState = 'PENDIENTE'
    if (camino === 'REMOTO') {
      payload = validarPayload(tomar('payload', 'data'))
    } else {
      const crudo = tomar('payload', 'data')
      if (crudo !== undefined && crudo !== null && crudo !== '') throw new InputError('Un trabajo LOCAL no lleva payload.')
      const estado = String(tomar('state', 'estado') ?? 'ACEPTADO').trim().toUpperCase()
      if (!(ESTADOS_RESULTADO as readonly string[]).includes(estado)) throw new InputError('Un espejo LOCAL solo acepta ACEPTADO, INCIERTO o FALLIDO.')
      if (!sourceJobId) throw new InputError('Un espejo LOCAL necesita sourceJobId.')
      state = estado as PrintJobState
    }

    let bridgeId: string | null = null
    let bridgeName = textoOpcional(tomar('bridgeName', 'puente'), 80)
    let bridgeOrigen = 'SIN_PUENTE'
    let printerName = ''
    if (printerId) {
      const impresora = await prisma.printPrinter.findFirst({ where: { id: printerId, tenantId }, select: { id: true, bridgeId: true, name: true } })
      if (!impresora) throw new InputError('La impresora elegida no existe en la empresa.', 404)
      printerName = impresora.name
    }
    // Sucursal del trabajo (#95): la del body (pedido/vendedor), la de la
    // impresora o la del usuario que encola. El puente se resuelve por esa
    // sucursal con fallback al predeterminado de la empresa.
    const branchIdPedida = textoOpcional(tomar('branchId', 'sucursalId'), 200) || null
    if (branchIdPedida) {
      const sucursal = await prisma.branch.findFirst({ where: { id: branchIdPedida, tenantId }, select: { id: true } })
      if (!sucursal) throw new InputError('La sucursal elegida no existe en la empresa.', 404)
    }
    const resolucion = await resolverPuenteDeImpresion(prisma, tenantId, {
      printerId,
      branchId: branchIdPedida,
      userBranchId: session.user.branchId,
    })
    bridgeId = resolucion.bridgeId
    bridgeOrigen = resolucion.origen
    if (!bridgeName) bridgeName = resolucion.bridgeName || ''

    // Idempotencia: repetir la clave (o el trabajo local espejado) devuelve el
    // existente sin crear otro ni descontar cupo.
    if (idempotencyKey) {
      const existente = await prisma.printJob.findFirst({ where: { tenantId, idempotencyKey } })
      if (existente) return json({ job: shapePublico(existente) })
    }
    if (sourceJobId) {
      const existente = await prisma.printJob.findFirst({ where: { tenantId, sourceJobId } })
      if (existente) return json({ job: shapePublico(existente) })
    }

    if (camino === 'REMOTO') {
      const abiertos = await prisma.printJob.count({ where: { tenantId, state: { in: [...ESTADOS_ABIERTOS] } } })
      if (abiertos >= MAX_ABIERTOS_POR_EMPRESA) throw new InputError(`La empresa ya tiene ${MAX_ABIERTOS_POR_EMPRESA} trabajos en cola.`, 429)
    }

    creado = await prisma.$transaction(async tx => {
      const job = await tx.printJob.create({
        data: {
          tenantId,
          bridgeId,
          printerId,
          printerName: printerName || null,
          destination,
          kind,
          state,
          path: camino,
          // Reloj de la app (no el default de la base): las etapas de la
          // telemetría se comparan entre sí y no pueden mezclar relojes.
          enqueuedAt: new Date(),
          payload,
          payloadBytes: payload ? Buffer.from(payload, 'base64').length : 0,
          validation: textoOpcional(tomar('validation', 'validacion'), 12),
          suffixHash: sufijo ? hashSufijo(sufijo) : '',
          reference: textoOpcional(tomar('reference', 'ref'), 64),
          requestedByUserId: session.user.id,
          requestedByName: textoOpcional(tomar('requestedByName', 'usuario'), 80) || session.user.name.slice(0, 80),
          deviceName: textoOpcional(tomar('deviceName', 'equipo'), 80),
          bridgeName: bridgeName.slice(0, 80),
          tokenHint: textoOpcional(tomar('tokenHint', 'tokenPista'), 40),
          mode: textoOpcional(tomar('mode', 'modo'), 40),
          width: entero(tomar('width', 'ancho'), 'Ancho', 0, 120, 80),
          copies: entero(tomar('copies', 'copias'), 'Copias', 1, 5, 1),
          idempotencyKey: idempotencyKey || null,
          sourceJobId: sourceJobId || null,
        },
      })
      await tx.auditLog.create({
        data: {
          tenantId,
          userId: session.user.id,
          action: 'PRINT_JOB_ENQUEUED',
          entity: 'PrintJob',
          entityId: job.id,
          metadata: {
            jobId: job.id,
            path: camino,
            kind,
            ...(printerId ? { printerId, ...(printerName ? { printerName } : {}) } : {}),
            ...(bridgeId ? { bridgeId } : {}),
            bridgeOrigin: bridgeOrigen,
            ...(branchIdPedida ? { branchId: branchIdPedida } : {}),
            bytes: job.payloadBytes,
          },
        },
      })
      return job
    })
  } catch (cause) {
    if (cause instanceof InputError) return error(cause.message, cause.status)
    if ((cause as { code?: string })?.code === 'P2002') {
      const existente = idempotencyKey
        ? await prisma.printJob.findFirst({ where: { tenantId, idempotencyKey } })
        : sourceJobId
          ? await prisma.printJob.findFirst({ where: { tenantId, sourceJobId } })
          : null
      if (existente) return json({ job: shapePublico(existente) })
      return error('Ya existe un trabajo con esa clave.', 409)
    }
    return error('No se pudo encolar el trabajo.', 500)
  }
  if (!creado) return error('No se pudo encolar el trabajo.', 500)
  return json({ job: shapePublico(creado) }, { status: 201 })
}

// Listado por empresa con filtros de estado, tope de página y cursor de fecha.
export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const tenantId = session.user.tenantId
  const url = new URL(request.url)
  const stateRaw = (url.searchParams.get('state') || '').trim().toUpperCase()
  if (stateRaw && !(ESTADOS_TRABAJO as readonly string[]).includes(stateRaw)) return error('Estado inválido.')
  const limitRaw = Number(url.searchParams.get('limit'))
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(100, Math.floor(limitRaw)) : 50
  const beforeRaw = url.searchParams.get('before')
  let before: Date | null = null
  if (beforeRaw) {
    before = new Date(beforeRaw)
    if (Number.isNaN(before.getTime())) return error('El cursor before no es una fecha válida.')
  }
  const [jobs, tenant] = await Promise.all([
    prisma.printJob.findMany({
      where: { tenantId, ...(stateRaw ? { state: stateRaw as PrintJobState } : {}), ...(before ? { createdAt: { lt: before } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } }),
  ])
  return json({ jobs: jobs.map(shapePublico), remoteEnabled: remoteEnabledDeTenant(tenant?.settings) })
}

function entero(valor: unknown, etiqueta: string, minimo: number, maximo: number, porDefecto: number): number {
  if (valor === undefined || valor === null || valor === '') return porDefecto
  const numero = Number(valor)
  if (!Number.isInteger(numero) || numero < minimo || numero > maximo) throw new InputError(`${etiqueta} debe ser un entero entre ${minimo} y ${maximo}.`)
  return numero
}
