// Datos y argumentos de `scripts/emails-prueba.mjs` (pedido de Dario): arma los
// 10 correos transaccionales con datos ficticios para revisarlos en una casilla
// de prueba o como HTML local. No lo importa ninguna ruta: vive acá para que el
// typecheck del backend lo cubra y para no duplicar los builders de `email.ts`.
import {
  actionLink,
  deviceReportEmail,
  emailVerificationEmail,
  passwordRecoveryEmail,
  paymentDueReminderEmail,
  paymentOverdueEmail,
  receiptEmail,
  reservationDueEmail,
  teamInvitationEmail,
  warrantyStatusEmail,
  welcomeEmail,
} from './email'

/** Los 10 correos, en el orden pedido; el `id` coincide con `logEmailOutcome`. */
export const TIPOS_EMAIL_PRUEBA = [
  { id: 'welcome', nombre: 'Bienvenida' },
  { id: 'team-invitation', nombre: 'Invitación al equipo' },
  { id: 'password-recovery', nombre: 'Recuperación de contraseña' },
  { id: 'email-verification', nombre: 'Verificación de correo' },
  { id: 'receipt', nombre: 'Comprobante de compra' },
  { id: 'device-report', nombre: 'Informe de dispositivo' },
  { id: 'payment-due', nombre: 'Recordatorio de pago' },
  { id: 'payment-overdue', nombre: 'Pago vencido' },
  { id: 'warranty-update', nombre: 'Garantía y servicio' },
  { id: 'reservation-due', nombre: 'Reserva por vencer' },
] as const

export type TipoEmailPrueba = (typeof TIPOS_EMAIL_PRUEBA)[number]['id']

/** Casilla ficticia para la vista previa cuando no se pasa `--to`. */
export const CASILLA_FICTICIA = 'revision@ejemplo.com'

/** Directorio local por defecto para los `.html`. */
export const DIRECTORIO_POR_DEFECTO = '.emails-prueba'

const TIENDA = 'Celulares del Este'
const CLIENTE = 'María González'
const HEX = '0123456789abcdef'
const tokenFicticio = (semilla: number) => HEX.repeat(4).slice(semilla).padEnd(64, '0').slice(0, 64)
const enlace = (path: string, token: string, respaldo: string) => actionLink(path, token) || respaldo

const fechaRelativa = (ahora: Date, dias: number) => new Date(ahora.getTime() + dias * 24 * 60 * 60 * 1000)

export type EmailPrueba = {
  id: TipoEmailPrueba
  nombre: string
  to: string
  subject: string
  html: string
  text: string
}

/**
 * Arma los 10 correos con datos ficticios y enlaces de la app configurada.
 * Si un builder devuelve `null` (p. ej. sin `MOBOS_APP_URL` válido) falla en
 * voz alta: la vista previa no puede quedar a medias.
 */
export function construirEmailsPrueba({ to = CASILLA_FICTICIA, ahora = new Date() }: { to?: string; ahora?: Date } = {}): EmailPrueba[] {
  const destinatario = String(to || '').trim() || CASILLA_FICTICIA
  const recuperacion = tokenFicticio(0)
  const verificacion = tokenFicticio(8)
  const invitacion = tokenFicticio(16)
  const casos = [
    { id: 'welcome', nombre: 'Bienvenida', mensaje: welcomeEmail({ to: destinatario, companyName: TIENDA, tenantId: 'tienda-demo' }) },
    { id: 'team-invitation', nombre: 'Invitación al equipo', mensaje: teamInvitationEmail({ to: destinatario, inviteeName: 'Ana Benítez', companyName: TIENDA, inviterName: 'Darío López', token: invitacion, invitationId: 'invitacion-demo' }) },
    { id: 'password-recovery', nombre: 'Recuperación de contraseña', mensaje: passwordRecoveryEmail({ to: destinatario, companyName: TIENDA, token: recuperacion }) },
    { id: 'email-verification', nombre: 'Verificación de correo', mensaje: emailVerificationEmail({ to: destinatario, companyName: TIENDA, token: verificacion }) },
    { id: 'receipt', nombre: 'Comprobante de compra', mensaje: receiptEmail({ to: destinatario, customerName: CLIENTE, orderNumber: 'PED-1042', lines: [{ quantity: 1, description: 'iPhone 15 · 128 GB', totalPyg: 4850000 }, { quantity: 2, description: 'Funda de silicona', totalPyg: 180000 }, { quantity: 1, description: 'Protector de pantalla', totalPyg: 90000 }], totalPyg: 5120000, trackingUrl: enlace('/p', tokenFicticio(24), 'https://app.moboss.online/p/pedido-demo'), companyName: TIENDA }) },
    { id: 'device-report', nombre: 'Informe de dispositivo', mensaje: deviceReportEmail({ to: destinatario, customerName: CLIENTE, model: 'iPhone 15 · 128 GB', link: enlace('/informe', tokenFicticio(32), 'https://app.moboss.online/informe/demo'), companyName: TIENDA }) },
    { id: 'payment-due', nombre: 'Recordatorio de pago', mensaje: paymentDueReminderEmail({ to: destinatario, customerName: CLIENTE, orderNumber: 'PED-1042', dueAt: fechaRelativa(ahora, 3), amountPyg: 650000, storeName: TIENDA }) },
    { id: 'payment-overdue', nombre: 'Pago vencido', mensaje: paymentOverdueEmail({ to: destinatario, customerName: CLIENTE, orderNumber: 'PED-1042', dueAt: fechaRelativa(ahora, -5), amountPyg: 650000, storeName: TIENDA }) },
    { id: 'warranty-update', nombre: 'Garantía y servicio', mensaje: warrantyStatusEmail({ to: destinatario, customerName: CLIENTE, serial: '356789104523118', storeName: TIENDA, statusLabel: 'Listo para retirar', trackingUrl: enlace('/garantia', tokenFicticio(40), 'https://app.moboss.online/garantia/demo') }) },
    { id: 'reservation-due', nombre: 'Reserva por vencer', mensaje: reservationDueEmail({ to: destinatario, customerName: CLIENTE, itemLabel: 'iPhone 15 · 128 GB', reservedUntil: fechaRelativa(ahora, 2), storeName: TIENDA }) },
  ] as const

  return casos.map((caso) => {
    if (!caso.mensaje) throw new Error(`No se pudo armar el correo «${caso.nombre}»: revisá MOBOS_APP_URL (se usa para los enlaces).`)
    return { id: caso.id, nombre: caso.nombre, ...caso.mensaje }
  })
}

export type OpcionesEmailsPrueba = {
  to: string
  directorio: string
  soloHtml: boolean
  ayuda: boolean
  error: string | null
}

const patronCasilla = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Parsea `--to`, `--out`, `--solo-html` y `--ayuda` (con `MOBOS_EMAIL_TO` de respaldo). */
export function parsearArgumentos(argv: readonly string[] = [], env: { MOBOS_EMAIL_TO?: string } = {}): OpcionesEmailsPrueba {
  const opciones: OpcionesEmailsPrueba = { to: '', directorio: DIRECTORIO_POR_DEFECTO, soloHtml: false, ayuda: false, error: null }
  const leerValor = (indice: number, bandera: string): [string | null, number] => {
    const actual = argv[indice]
    const conIgual = actual.indexOf('=')
    if (conIgual > -1) return [actual.slice(conIgual + 1).trim(), indice]
    const siguiente = argv[indice + 1]
    if (siguiente === undefined || siguiente.startsWith('--')) {
      opciones.error = `La opción ${bandera} necesita un valor.`
      return [null, indice]
    }
    return [String(siguiente).trim(), indice + 1]
  }
  for (let indice = 0; indice < argv.length; indice += 1) {
    const actual = String(argv[indice])
    if (actual === '--ayuda' || actual === '--help' || actual === '-h') opciones.ayuda = true
    else if (actual === '--solo-html') opciones.soloHtml = true
    else if (actual === '--to' || actual.startsWith('--to=')) {
      const [valor, salto] = leerValor(indice, '--to')
      indice = salto
      if (valor !== null) opciones.to = valor
    } else if (actual === '--out' || actual.startsWith('--out=')) {
      const [valor, salto] = leerValor(indice, '--out')
      indice = salto
      if (valor !== null) opciones.directorio = valor || DIRECTORIO_POR_DEFECTO
    } else if (actual.startsWith('-')) opciones.error = `Opción desconocida: ${actual}`
  }
  if (!opciones.to && typeof env.MOBOS_EMAIL_TO === 'string') opciones.to = env.MOBOS_EMAIL_TO.trim()
  if (opciones.to && !patronCasilla.test(opciones.to)) opciones.error = `La casilla «${opciones.to}» no parece válida (ejemplo: nombre@dominio.com).`
  return opciones
}

export function ayudaEmailsPrueba(): string {
  return [
    'Uso: node scripts/emails-prueba.mjs [--to <casilla>] [--out <directorio>] [--solo-html]',
    '',
    'Renderiza los 10 correos transaccionales con datos ficticios.',
    '  --to <casilla>    destinatario (o MOBOS_EMAIL_TO). Con transporte configurado los envía.',
    '  --out <dir>       dónde guardar los .html de vista previa (default: .emails-prueba).',
    '  --solo-html       guarda los .html aunque el transporte esté configurado.',
    '  --ayuda           muestra esta ayuda.',
    '',
    'Sin transporte (o con --solo-html) no envía nada: deja un .html por correo y un index.html.',
  ].join('\n')
}

export function nombreArchivoEmail(indice: number, id: string): string {
  return `${String(indice + 1).padStart(2, '0')}-${id}.html`
}

/** Índice simple para revisar la vista previa en el navegador. */
export function indiceHtml(emails: EmailPrueba[], { to, transporte }: { to: string; transporte: boolean }): string {
  const escapar = (valor: string) => valor.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const filas = emails.map((email, indice) => `<li><a href="${nombreArchivoEmail(indice, email.id)}">${escapar(email.nombre)}</a><span class="s"> · ${escapar(email.subject)}</span></li>`).join('')
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Correos de prueba · MobOS</title><style>body{font:15px/1.6 system-ui,sans-serif;margin:32px;color:#17211B}h1{font-size:22px;margin:0 0 4px}p{color:#4B5F53;margin:0 0 18px}li{margin:8px 0}.s{color:#4B5F53}a{color:#0B5E43;font-weight:600}</style></head><body><h1>Correos de prueba</h1><p>Destinatario usado: ${escapar(to)} · transporte ${transporte ? 'configurado (solo vista previa)' : 'sin configurar'} · ${emails.length} correos</p><ul>${filas}</ul></body></html>`
}
