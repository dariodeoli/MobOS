// Puentes de impresión: token del agente (hash SHA-256 en reposo), códigos de
// vinculación Crockford de un solo uso y normalización de impresoras. Las rutas
// de sesión y el poller del agente comparten este módulo.
import { randomBytes, timingSafeEqual } from 'node:crypto'
import type { PrismaClient, PrintBridge } from '@prisma/client'
import { hashToken } from './auth'
import { InputError } from './payment-input'
import { estaEnLinea } from './presence'

export const PAIRING_TTL_MS = 15 * 60 * 1000
export const PAIRING_MAX_ATTEMPTS = 5
export const MAX_PUENTES_POR_EMPRESA = 20
export const CODIGO_VINCULACION_LARGO = 10
export const TOKEN_MAX_LARGO = 200

// Crockford base32: sin I, L, O ni U porque se confunden al leerlos en papel.
const ALFABETO_CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

export type CodigoVinculacion = { code: string; codeHash: string; expiresAt: Date }

export type PuentePublico = {
  id: string
  name: string
  branchId: string | null
  version: string | null
  platform: string | null
  lastSeenAt: Date | null
  revokedAt: Date | null
  createdAt: Date
  online: boolean
}

export type ImpresoraNormalizada = {
  name: string
  brand: string
  model: string
  location: string
  connection: 'lan' | 'cups'
  destination: string
  width: number
  copies: number
  cut: boolean
  density: number
  characters: boolean
  isDefault: boolean
  isActive: boolean
  bridgeId: string | null
  branchId: string | null
}

export function generarTokenPuente(): string {
  return randomBytes(32).toString('hex')
}

export function compararHashToken(guardado: string, candidato: string): boolean {
  const izquierda = Buffer.from(String(guardado))
  const derecha = Buffer.from(String(candidato))
  return izquierda.length === derecha.length && timingSafeEqual(izquierda, derecha)
}

// El código se lee en voz alta o se tipea desde el papel: se aceptan minúsculas,
// espacios y los caracteres que Crockford confunde (I/L → 1, O → 0).
export function normalizarCodigoVinculacion(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  const cuerpo = valor.toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/[IL]/g, '1').replace(/O/g, '0')
  if (cuerpo.length !== CODIGO_VINCULACION_LARGO) return null
  if ([...cuerpo].some(caracter => !ALFABETO_CROCKFORD.includes(caracter))) return null
  return `${cuerpo.slice(0, 5)}-${cuerpo.slice(5)}`
}

export function crearCodigoVinculacion(ahora: Date = new Date()): CodigoVinculacion {
  // 256 es múltiplo de 32: el módulo sobre un byte no sesga el alfabeto.
  let cuerpo = ''
  for (let indice = 0; indice < CODIGO_VINCULACION_LARGO; indice += 1) {
    cuerpo += ALFABETO_CROCKFORD[randomBytes(1)[0] % ALFABETO_CROCKFORD.length]
  }
  const code = `${cuerpo.slice(0, 5)}-${cuerpo.slice(5)}`
  return { code, codeHash: hashToken(code), expiresAt: new Date(ahora.getTime() + PAIRING_TTL_MS) }
}

// Vigencia de un código ya emitido: sin usar, sin vencer y con intentos
// disponibles. Al agotar los intentos el código queda inutilizable.
export function codigoVinculacionVigente(
  puente: Pick<PrintBridge, 'pairingUsedAt' | 'pairingExpiresAt' | 'pairingAttempts'>,
  ahora: Date = new Date(),
): boolean {
  return !puente.pairingUsedAt
    && !!puente.pairingExpiresAt
    && puente.pairingExpiresAt.getTime() > ahora.getTime()
    && puente.pairingAttempts < PAIRING_MAX_ATTEMPTS
}

type LectorDePuentes = Pick<PrismaClient, 'printBridge'>

/**
 * Autentica el Bearer de un puente contra su token hasheado. Un token ausente,
 * desconocido, revocado o de longitud distinta devuelve null sin filtrar cuál
 * de las causas se cumplió.
 */
export async function autenticarPuente(request: Request, db: LectorDePuentes): Promise<PrintBridge | null> {
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token || token.length > TOKEN_MAX_LARGO) return null
  const candidato = hashToken(token)
  const puente = await db.printBridge.findUnique({ where: { tokenHash: candidato } })
  if (!puente || puente.revokedAt) return null
  if (!compararHashToken(puente.tokenHash, candidato)) return null
  return puente
}

export async function topeDePuentesAlcanzado(tenantId: string, db: LectorDePuentes): Promise<boolean> {
  const activos = await db.printBridge.count({ where: { tenantId, revokedAt: null } })
  return activos >= MAX_PUENTES_POR_EMPRESA
}

// Shape público del puente: nunca incluye tokenHash ni el código de pairing.
export function shapePuente(puente: PrintBridge, ahora: Date = new Date()): PuentePublico {
  return {
    id: puente.id,
    name: puente.name,
    branchId: puente.branchId ?? null,
    version: puente.version,
    platform: puente.platform,
    lastSeenAt: puente.lastSeenAt,
    revokedAt: puente.revokedAt,
    createdAt: puente.createdAt,
    online: !puente.revokedAt && estaEnLinea(puente.lastSeenAt, ahora),
  }
}

// Kill switch de impresión remota por empresa: solo `printRemote === false` la
// apaga; cualquier configuración ausente o inválida la deja encendida.
export function remoteEnabledDeTenant(settings: unknown): boolean {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return true
  return (settings as Record<string, unknown>).printRemote !== false
}

function texto(valor: unknown, etiqueta: string, maximo: number, obligatorio = false): string {
  const limpio = typeof valor === 'string' ? valor.trim() : ''
  if (obligatorio && !limpio) throw new InputError(`${etiqueta} es obligatorio.`)
  if (limpio.length > maximo) throw new InputError(`${etiqueta} admite hasta ${maximo} caracteres.`)
  return limpio
}

function booleano(valor: unknown, etiqueta: string, porDefecto: boolean): boolean {
  if (valor === undefined || valor === null) return porDefecto
  if (typeof valor !== 'boolean') throw new InputError(`${etiqueta} debe ser verdadero o falso.`)
  return valor
}

function entero(valor: unknown, etiqueta: string, minimo: number, maximo: number, porDefecto: number): number {
  if (valor === undefined || valor === null || valor === '') return porDefecto
  const numero = Number(valor)
  if (!Number.isInteger(numero) || numero < minimo || numero > maximo) throw new InputError(`${etiqueta} debe ser un entero entre ${minimo} y ${maximo}.`)
  return numero
}

// Destinos aceptados por el agente: LAN directa o cola CUPS (el prefijo `usb:`
// es el nombre histórico de una cola y se normaliza).
const DESTINO_RE = /^(lan:[^\s:]+:\d{1,5}|(?:cups|usb):[^\s]+)$/

export function normalizarImpresora(valor: unknown): ImpresoraNormalizada {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) throw new InputError('Datos de impresora inválidos.')
  const entrada = valor as Record<string, unknown>
  const name = texto(entrada.name, 'Nombre', 120, true)
  const brand = texto(entrada.brand, 'Marca', 120)
  const model = texto(entrada.model, 'Modelo', 120)
  const location = texto(entrada.location, 'Ubicación', 400)
  const destinoCrudo = texto(entrada.destination, 'Destino', 200, true)
  const destination = destinoCrudo.startsWith('usb:') ? `cups:${destinoCrudo.slice(4)}` : destinoCrudo
  if (!DESTINO_RE.test(destination)) throw new InputError('El destino debe ser lan:host:puerto, cups:<cola> o usb:<cola>.')
  const conexionCruda = texto(entrada.connection, 'Conexión', 20)
  const connection = conexionCruda === '' || conexionCruda === 'usb' ? (destination.startsWith('lan:') ? 'lan' : 'cups') : conexionCruda
  if (connection !== 'lan' && connection !== 'cups') throw new InputError('La conexión debe ser lan o cups.')
  if (connection === 'lan' && !destination.startsWith('lan:')) throw new InputError('Una impresora LAN necesita un destino lan:host:puerto.')
  if (connection === 'cups' && destination.startsWith('lan:')) throw new InputError('Una impresora CUPS necesita un destino cups:<cola>.')
  const width = entero(entrada.width, 'Ancho', 58, 80, 80)
  if (width !== 58 && width !== 80) throw new InputError('El ancho debe ser 58 u 80 mm.')
  const bridgeIdCrudo = texto(entrada.bridgeId, 'Puente', 200)
  const branchIdCrudo = texto(entrada.branchId, 'Sucursal', 200)
  return {
    name,
    brand,
    model,
    location,
    connection,
    destination,
    width,
    copies: entero(entrada.copies, 'Copias', 1, 5, 1),
    cut: booleano(entrada.cut, 'Corte automático', true),
    density: entero(entrada.density, 'Densidad', 1, 5, 3),
    characters: booleano(entrada.characters, 'Caracteres especiales', true),
    isDefault: booleano(entrada.isDefault, 'Predeterminada', false),
    isActive: booleano(entrada.isActive, 'Activa', true),
    bridgeId: bridgeIdCrudo || null,
    branchId: branchIdCrudo || null,
  }
}

// La configuración legacy de localStorage usa claves en español; se aceptan
// las canónicas en inglés para no atarse a la forma vieja del cliente.
// `branchId` queda afuera a propósito: la sucursal es del backend y una
// configuración local no puede inventar ids de sucursal.
export function impresoraDesdeLegacy(valor: unknown): ImpresoraNormalizada {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) throw new InputError('Impresora legacy inválida.')
  const entrada = valor as Record<string, unknown>
  const tomar = (ingles: string, espanol: string) => (entrada[ingles] !== undefined ? entrada[ingles] : entrada[espanol])
  return normalizarImpresora({
    name: tomar('name', 'nombre'),
    brand: tomar('brand', 'marca'),
    model: tomar('model', 'modelo'),
    location: tomar('location', 'ubicacion'),
    connection: tomar('connection', 'conexion'),
    destination: tomar('destination', 'destino'),
    width: tomar('width', 'ancho'),
    copies: tomar('copies', 'copias'),
    cut: tomar('cut', 'corte'),
    density: tomar('density', 'densidad'),
    characters: tomar('characters', 'caracteres'),
    isDefault: tomar('isDefault', 'predeterminada'),
    isActive: tomar('isActive', 'activa'),
    bridgeId: tomar('bridgeId', 'bridgeId'),
  })
}

type LectorDeImpresion = Pick<PrismaClient, 'printBridge' | 'printPrinter'>

export type OrigenPuente = 'IMPRESORA' | 'SUCURSAL' | 'EMPRESA' | 'SIN_PUENTE'

export type ResolucionPuente = {
  bridgeId: string | null
  bridgeName: string | null
  origen: OrigenPuente
}

/**
 * Resuelve el puente que debe imprimir un trabajo (#95):
 * 1. el puente explícito de la impresora elegida (configuración manda);
 * 2. el puente activo de la sucursal del trabajo (pedido/vendedor o de la
 *    propia impresora), el más antiguo primero;
 * 3. el puente predeterminado de la empresa: el de la impresora activa
 *    marcada `isDefault` o, sin ella, el puente activo más antiguo;
 * 4. sin puentes activos, `null`: el trabajo queda sin asignar y lo reclama el
 *    primer puente que aparezca.
 */
export async function resolverPuenteDeImpresion(
  db: LectorDeImpresion,
  tenantId: string,
  opciones: { printerId?: string | null; branchId?: string | null; userBranchId?: string | null } = {},
): Promise<ResolucionPuente> {
  const impresora = opciones.printerId
    ? await db.printPrinter.findFirst({ where: { id: opciones.printerId, tenantId }, select: { bridgeId: true, branchId: true } })
    : null
  if (impresora?.bridgeId) {
    const puente = await db.printBridge.findFirst({ where: { id: impresora.bridgeId, tenantId, revokedAt: null }, select: { id: true, name: true } })
    if (puente) return { bridgeId: puente.id, bridgeName: puente.name, origen: 'IMPRESORA' }
  }
  const sucursal = opciones.branchId || impresora?.branchId || opciones.userBranchId || null
  if (sucursal) {
    const puente = await db.printBridge.findFirst({ where: { tenantId, branchId: sucursal, revokedAt: null }, orderBy: { createdAt: 'asc' }, select: { id: true, name: true } })
    if (puente) return { bridgeId: puente.id, bridgeName: puente.name, origen: 'SUCURSAL' }
  }
  const predeterminada = await db.printPrinter.findFirst({
    where: { tenantId, isDefault: true, isActive: true, bridgeId: { not: null } },
    select: { bridgeId: true },
  })
  if (predeterminada?.bridgeId) {
    const puente = await db.printBridge.findFirst({ where: { id: predeterminada.bridgeId, tenantId, revokedAt: null }, select: { id: true, name: true } })
    if (puente) return { bridgeId: puente.id, bridgeName: puente.name, origen: 'EMPRESA' }
  }
  const empresa = await db.printBridge.findFirst({ where: { tenantId, revokedAt: null }, orderBy: { createdAt: 'asc' }, select: { id: true, name: true } })
  if (empresa) return { bridgeId: empresa.id, bridgeName: empresa.name, origen: 'EMPRESA' }
  return { bridgeId: null, bridgeName: null, origen: 'SIN_PUENTE' }
}
