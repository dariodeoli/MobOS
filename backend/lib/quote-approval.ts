// A3 (#279) · Aprobación autenticada de presupuestos: versión congelada, OTP y
// evidencia. Lógica pura + helpers de persistencia; las rutas públicas solo
// orquestan. Reglas duras:
// - lo que el cliente revisa y aprueba es un snapshot inmutable con hash sha256;
// - el código OTP vive hasheado (bcrypt), vence y tiene intentos limitados;
// - una firma dibujada es opcional y **no autentica por sí sola**: la
//   autenticación es la posesión del correo/teléfono (OTP);
// - aprobar crea el pedido con exactamente el contenido congelado.
import { createHash, randomInt } from 'node:crypto'
import bcrypt from 'bcryptjs'
import type { Prisma } from '@prisma/client'

export const OTP_TTL_MS = 10 * 60 * 1000
export const OTP_MAX_ATTEMPTS = 5
export const OTP_REENVIO_MS = 60 * 1000
export const FIRMA_MAX_BYTES = 96 * 1024
export const CANALES_OTP = ['EMAIL', 'PHONE'] as const
export type CanalOtp = (typeof CANALES_OTP)[number]

export type ItemCongelado = { productId?: string; description: string; quantity: number; unitPricePyg: number; totalPyg: number }

export type CotizacionCongelable = {
  number: string
  customerName: string | null
  customerId?: string | null
  items: unknown
  subtotalPyg: number | bigint
  discountPyg: number | bigint
  totalPyg: number | bigint
  notes: string | null
  validUntil: Date | null
  status?: string
}

export type SnapshotCotizacion = {
  number: string
  customerName: string
  customerId: string | null
  validUntil: string | null
  notes: string | null
  items: ItemCongelado[]
  subtotalPyg: number
  discountPyg: number
  totalPyg: number
}

const numeroDe = (valor: unknown) => {
  const numero = Number(valor)
  return Number.isFinite(numero) ? Math.max(0, Math.round(numero)) : 0
}

/** Items normalizados tal como quedan congelados (cantidad, precio y total). */
export function itemsCongelados(items: unknown): ItemCongelado[] {
  if (!Array.isArray(items)) return []
  return items
    .map((fila) => {
      const item = fila && typeof fila === 'object' ? fila as Record<string, unknown> : {}
      const quantity = Math.max(1, numeroDe(item.quantity) || 1)
      const unitPricePyg = numeroDe(item.unitPricePyg)
      return {
        ...(typeof item.productId === 'string' && item.productId ? { productId: item.productId } : {}),
        description: String(item.description || 'Producto').trim().slice(0, 300) || 'Producto',
        quantity,
        unitPricePyg,
        totalPyg: numeroDe(item.totalPyg) || quantity * unitPricePyg,
      }
    })
    .filter((item) => item.quantity > 0)
}

/** Snapshot congelado: lo único que se muestra, se aprueba y se convierte. */
export function snapshotDeCotizacion(cotizacion: CotizacionCongelable): SnapshotCotizacion {
  return {
    number: String(cotizacion.number || ''),
    customerName: String(cotizacion.customerName || '').trim(),
    customerId: cotizacion.customerId ?? null,
    validUntil: cotizacion.validUntil ? new Date(cotizacion.validUntil).toISOString() : null,
    notes: cotizacion.notes ?? null,
    items: itemsCongelados(cotizacion.items),
    subtotalPyg: numeroDe(cotizacion.subtotalPyg),
    discountPyg: numeroDe(cotizacion.discountPyg),
    totalPyg: numeroDe(cotizacion.totalPyg),
  }
}

// JSON canónico (claves ordenadas, recursivo): dos snapshots iguales dan el
// mismo hash aunque cambie el orden de las claves.
function canonico(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(canonico)
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(Object.entries(valor as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([clave, fila]) => [clave, canonico(fila)]))
  }
  return valor
}

/** sha256 del snapshot canónico: la evidencia de «qué se aprobó». */
export function hashDeSnapshot(snapshot: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonico(snapshot))).digest('hex')
}

/** Congela la cotización en una versión nueva; reutiliza la última si el contenido no cambió. */
export async function congelarVersionDeCotizacion(
  tx: Prisma.TransactionClient,
  cotizacion: CotizacionCongelable & { id: string; tenantId: string },
  { frozenById = null, motivo = 'share' }: { frozenById?: string | null; motivo?: string } = {},
) {
  const snapshot = snapshotDeCotizacion(cotizacion)
  const hash = hashDeSnapshot(snapshot)
  const ultima = await tx.quoteVersion.findFirst({ where: { quoteId: cotizacion.id, tenantId: cotizacion.tenantId }, orderBy: { version: 'desc' } })
  // El contenido no cambió: la versión vigente sigue siendo la misma.
  if (ultima && ultima.hash === hash) return ultima
  const version = (ultima?.version || 0) + 1
  let creada
  try {
    creada = await tx.quoteVersion.create({
      data: { tenantId: cotizacion.tenantId, quoteId: cotizacion.id, version, hash, snapshot: snapshot as unknown as Prisma.InputJsonValue, frozenById },
    })
  } catch (cause) {
    // Dos congelados simultáneos: el que pierde reutiliza la versión ganadora.
    if ((cause as { code?: string })?.code !== 'P2002') throw cause
    const ganadora = await tx.quoteVersion.findFirst({ where: { quoteId: cotizacion.id, tenantId: cotizacion.tenantId }, orderBy: { version: 'desc' } })
    if (ganadora) return ganadora
    throw cause
  }
  await tx.quote.update({ where: { id: cotizacion.id }, data: { version } })
  await tx.auditLog.create({
    data: {
      tenantId: cotizacion.tenantId,
      userId: frozenById,
      action: 'QUOTE_VERSION_FROZEN',
      entity: 'Quote',
      entityId: cotizacion.id,
      metadata: { version, hash, motivo, items: snapshot.items.length, totalPyg: snapshot.totalPyg },
    },
  })
  return creada
}

// ── OTP ─────────────────────────────────────────────────────────────────────

/** Código de 6 dígitos con aleatoriedad criptográfica. */
export function generarCodigoOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

export async function hashDeCodigo(codigo: string): Promise<string> {
  return bcrypt.hash(codigo, 10)
}

export async function codigoValido(codigo: string, hash: string): Promise<boolean> {
  if (!/^\d{6}$/.test(codigo)) return false
  return bcrypt.compare(codigo, hash)
}

/** Correo enmascarado para mostrar: j***@d***.com */
export function enmascararEmail(email: string): string {
  const [usuario = '', dominio = ''] = String(email || '').trim().toLowerCase().split('@')
  const [host = '', tld = ''] = dominio.split('.')
  const cabeza = (valor: string) => (valor ? `${valor.slice(0, 1)}***` : '***')
  return `${cabeza(usuario)}@${cabeza(host)}${tld ? `.${tld}` : ''}` || '***'
}

/** Teléfono enmascarado para mostrar: +595 98* *** 123 */
export function enmascararTelefono(telefono: string): string {
  const digitos = String(telefono || '').replace(/\D/g, '')
  if (digitos.length < 6) return '***'
  const prefijo = digitos.slice(0, Math.min(5, digitos.length - 4))
  return `${digitos.startsWith('595') ? '+' : ''}${prefijo.slice(0, 3)} ${prefijo.slice(3)}*** *** ${digitos.slice(-3)}`
}

export function hashDeDestino(canal: CanalOtp, destino: string): string {
  return createHash('sha256').update(`quote-approval:${canal}:${String(destino || '').trim().toLowerCase()}`).digest('hex')
}

// ── Evidencia (privacidad) ──────────────────────────────────────────────────

/** IP hasheada (nunca en claro) y dispositivo acotado para la evidencia. */
export function huellaDeCliente(headers: Headers): { ipHash: string | null; userAgent: string | null } {
  const reenviada = String(headers.get('x-forwarded-for') || '').split(',')[0].trim()
  const ip = reenviada || String(headers.get('x-real-ip') || '').trim()
  const agent = String(headers.get('user-agent') || '').trim().slice(0, 300) || null
  return { ipHash: ip ? createHash('sha256').update(`quote-approval-ip:${ip}`).digest('hex') : null, userAgent: agent }
}

/** Firma dibujada opcional: PNG data-url acotado; cualquier otra cosa es null. */
export function normalizarFirma(valor: unknown): string | null {
  if (typeof valor !== 'string' || !valor) return null
  const limpia = valor.trim()
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(limpia)) return null
  const bytes = Buffer.from(limpia.split(',')[1] || '', 'base64')
  if (!bytes.length || bytes.length > FIRMA_MAX_BYTES) return null
  return limpia
}
