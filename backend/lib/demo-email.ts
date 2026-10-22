// Correos reales de la DEMO pública (pedido de Dario): la demo corre en el
// navegador sin backend y, cuando la persona carga un correo en el cliente, esta
// capa valida el pedido ESTRUCTURADO y deja que `email.ts` arme el comprobante,
// la cotización o el aviso por estado. Anti-abuso por diseño: sin texto libre en
// el cuerpo (solo nombre e ítems, sanitizados y truncados), un solo destinatario,
// sin adjuntos, dominios desechables rechazados y cuotas por correo/red/global
// (ver `demo-email-quota.ts`). Apagado por defecto: `DEMO_EMAIL_ENABLED=true`.

export const DEMO_EMAIL_KINDS = ['receipt', 'quote', 'ready_for_pickup', 'in_transit', 'delivered'] as const
export type DemoEmailKind = (typeof DEMO_EMAIL_KINDS)[number]

/** Límites del contenido (no de la cuota). */
export const DEMO_EMAIL_LIMITS = { items: 10, quantity: 99, unitPricePyg: 500_000_000, name: 60, description: 70, bodyBytes: 8 * 1024, email: 254 } as const

export class DemoEmailError extends Error {
  code: string
  status: number
  retryAfterSeconds?: number
  constructor(code: string, message: string, status: number, retryAfterSeconds?: number) {
    super(message)
    this.name = 'DemoEmailError'
    this.code = code
    this.status = status
    this.retryAfterSeconds = retryAfterSeconds
  }
}

export type DemoEmailRequest = {
  kind: DemoEmailKind
  number: string
  email: string
  customerName: string
  items: Array<{ quantity: number; description: string; unitPricePyg: number }>
  discountPyg: number
  totalPyg: number
  validUntil: string | null
}

export function demoEmailEnabled(env: NodeJS.ProcessEnv = process.env) {
  return String(env.DEMO_EMAIL_ENABLED ?? '').trim().toLowerCase() === 'true'
}

// Dominios de correo descartable más usados. No hay otra lista en el repo; se
// compara el dominio y cualquier subdominio.
export const DISPOSABLE_EMAIL_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org', 'guerrillamailblock.com', 'sharklasers.com', 'grr.la', 'pokemail.net', 'spam4.me',
  '10minutemail.com', '10minutemail.net', '20minutemail.com', 'tempmail.com', 'temp-mail.org', 'temp-mail.io', 'tempmailo.com', 'tempail.com', 'tempr.email', 'throwawaymail.com',
  'yopmail.com', 'yopmail.net', 'yopmail.fr', 'trashmail.com', 'trashmail.net', 'trashmail.de', 'getnada.com', 'nada.email', 'dispostable.com', 'maildrop.cc',
  'fakeinbox.com', 'mailnesia.com', 'mintemail.com', 'mohmal.com', 'emailondeck.com', 'burnermail.io', 'spamgourmet.com', 'mytemp.email', 'moakt.com', 'tmpmail.org',
  'tmpmail.net', 'discard.email', 'discardmail.com', 'mailcatch.com', 'mailtemp.info', 'inboxkitten.com', 'harakirimail.com', 'anonbox.net', 'guerrillamail.biz', 'dropmail.me',
  'emailfake.com', 'fakemail.net', 'mail.tm', 'tmail.ws', 'tempinbox.com', 'cuvox.de', 'armyspy.com', 'dayrep.com', 'einrot.com',
  // Reservados y casillas ficticias de la propia demo (@ejemplo.com): nunca se envía a ellos.
  'example.com', 'example.org', 'example.net', 'ejemplo.com', 'ejemplo.org', 'ejemplo.net', 'test.com',
  'example', 'ejemplo', 'test', 'invalid', 'localhost', 'local',
])

export function isDisposableEmailDomain(domain: string) {
  const parts = domain.toLowerCase().split('.').filter(Boolean)
  for (let i = 0; i < parts.length; i += 1) if (DISPOSABLE_EMAIL_DOMAINS.has(parts.slice(i).join('.'))) return true
  return false
}

const EMAIL_PATTERN = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@([A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,24}$/

/** Un solo destinatario con forma válida; nunca listas, nombres con `<>` ni espacios. */
export function normalizeDemoEmailAddress(value: unknown) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text || text.length > DEMO_EMAIL_LIMITS.email || /[\s,;<>"()\\]/.test(text) || (text.match(/@/g) || []).length !== 1 || !EMAIL_PATTERN.test(text)) {
    throw new DemoEmailError('invalid_email', 'Ingresá un correo válido (un solo destinatario).', 400)
  }
  const [local, domain] = text.split('@')
  if (isDisposableEmailDomain(domain)) throw new DemoEmailError('disposable_email', 'Ese correo es temporal o de ejemplo. Usá tu correo real para recibir la demo.', 400)
  return `${local}@${domain.toLowerCase()}`
}

/** Clave de cuota: minúsculas, sin `+alias` y sin puntos en Gmail, para que no se burle el tope por correo. */
export function demoEmailQuotaKey(address: string) {
  const [rawLocal, domain] = address.toLowerCase().split('@')
  let local = rawLocal.split('+')[0]
  let host = domain
  if (host === 'googlemail.com') host = 'gmail.com'
  if (host === 'gmail.com') local = local.replace(/\./g, '')
  return `${local}@${host}`
}

/**
 * Texto libre permitido (nombre e ítems): sin etiquetas, enlaces ni correos,
 * solo letras, números y puntuación comercial, colapsado y truncado.
 */
export function sanitizeDemoText(value: unknown, max: number) {
  let text = typeof value === 'string' ? value : ''
  text = text.normalize('NFKC')
    .replace(/<[^>]*>/g, ' ')
    .replace(/(?:https?:|ftp:|www\.)\S*/gi, ' ')
    .replace(/\S+@\S+/g, ' ')
    .replace(/\b[\w-]+(?:\.[\w-]+)*\.(?:com|net|org|py|io|me|ly|xyz|info|biz|co|app|dev|online|site|link|ru|cn|tk|top|click)\b\S*/gi, ' ')
    .replace(/[^\p{L}\p{N} .,\-+/()·&'#%:]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (text.length > max) text = `${text.slice(0, max - 1).trimEnd()}…`
  return text
}

const NUMBER_PATTERN = /^[A-Za-z]{2,5}[- ]?#?\d{1,8}$/
const ALLOWED_KEYS = new Set(['kind', 'number', 'email', 'customerName', 'items', 'discountPyg', 'totalPyg', 'validUntil'])
const ALLOWED_ITEM_KEYS = new Set(['quantity', 'description', 'unitPricePyg'])
const bad = (message: string) => new DemoEmailError('invalid_request', message, 400)

function wholeNumber(value: unknown, min: number, max: number, label: string) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) throw bad(`${label} inválido.`)
  return value
}

/** Valida el cuerpo JSON: claves cerradas, tipos estrictos y totales recalculados (no se confía en el cliente). */
export function parseDemoEmailRequest(body: unknown): DemoEmailRequest {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw bad('Solicitud inválida.')
  const input = body as Record<string, unknown>
  for (const key of Object.keys(input)) if (!ALLOWED_KEYS.has(key)) throw bad('Solicitud inválida.')
  if (typeof input.kind !== 'string' || !(DEMO_EMAIL_KINDS as readonly string[]).includes(input.kind)) throw bad('Tipo de correo inválido.')
  const kind = input.kind as DemoEmailKind
  const number = typeof input.number === 'string' ? input.number.trim() : ''
  if (!NUMBER_PATTERN.test(number)) throw bad('Número de documento inválido.')
  const email = normalizeDemoEmailAddress(input.email)
  if (!Array.isArray(input.items) || !input.items.length || input.items.length > DEMO_EMAIL_LIMITS.items) throw bad('Detalle inválido.')
  const items = input.items.map(raw => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw bad('Detalle inválido.')
    const row = raw as Record<string, unknown>
    for (const key of Object.keys(row)) if (!ALLOWED_ITEM_KEYS.has(key)) throw bad('Detalle inválido.')
    const description = sanitizeDemoText(row.description, DEMO_EMAIL_LIMITS.description) || 'Artículo'
    return { quantity: wholeNumber(row.quantity, 1, DEMO_EMAIL_LIMITS.quantity, 'Cantidad'), description, unitPricePyg: wholeNumber(row.unitPricePyg, 0, DEMO_EMAIL_LIMITS.unitPricePyg, 'Precio') }
  })
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPricePyg, 0)
  const discountPyg = input.discountPyg === undefined ? 0 : wholeNumber(input.discountPyg, 0, subtotal, 'Descuento')
  const totalPyg = subtotal - discountPyg
  if (input.totalPyg !== undefined && input.totalPyg !== totalPyg) throw bad('El total no coincide con el detalle.')
  let validUntil: string | null = null
  if (input.validUntil !== undefined && input.validUntil !== null) {
    if (kind !== 'quote' || typeof input.validUntil !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(input.validUntil)) throw bad('Validez inválida.')
    const date = new Date(`${input.validUntil.slice(0, 10)}T12:00:00Z`)
    if (!Number.isFinite(date.getTime())) throw bad('Validez inválida.')
    validUntil = input.validUntil.slice(0, 10)
  }
  return { kind, number, email, customerName: sanitizeDemoText(input.customerName, DEMO_EMAIL_LIMITS.name), items, discountPyg, totalPyg, validUntil }
}

export function demoValidUntilLabel(isoDay: string | null) {
  if (!isoDay) return null
  const [year, month, day] = isoDay.split('-')
  return `${day}/${month}/${year}`
}

/** Dirección enmascarada para logs y auditoría: nunca el correo completo. */
export function maskDemoEmail(address: string) {
  const [local, domain] = address.split('@')
  return `${local.slice(0, 1)}***@${domain}`
}
