// Pruebas de `scripts/emails-prueba.mjs` y su módulo de datos
// (`backend/lib/emails-prueba.ts`): los 10 correos se arman, los argumentos se
// parsean y el modo vista previa escribe los `.html` sin transporte.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CASILLA_FICTICIA, DIRECTORIO_POR_DEFECTO, TIPOS_EMAIL_PRUEBA, construirEmailsPrueba, indiceHtml, nombreArchivoEmail, parsearArgumentos } from '../lib/emails-prueba'

const raiz = join(__dirname, '..', '..')
const script = join(raiz, 'scripts', 'emails-prueba.mjs')
const AHORA = new Date('2026-10-15T12:00:00.000Z')

// ── Los 10 correos ──────────────────────────────────────────────────────────
const emails = construirEmailsPrueba({ to: 'revision@ejemplo.com', ahora: AHORA })
assert.equal(emails.length, 10, 'arma los 10 correos')
assert.deepEqual(emails.map((email) => email.id), TIPOS_EMAIL_PRUEBA.map((tipo) => tipo.id), 'respeta el orden y los identificadores de logEmailOutcome')
for (const email of emails) {
  assert.equal(email.to, 'revision@ejemplo.com', `${email.id}: usa la casilla pedida`)
  assert.ok(email.subject.trim().length > 4, `${email.id}: tiene asunto`)
  assert.ok(email.text.trim().length > 40, `${email.id}: tiene versión de texto`)
  assert.ok(email.html.startsWith('<!doctype html><html lang="es">'), `${email.id}: es un documento completo`)
  assert.ok(email.html.includes('data-email-system="mobos-premium"'), `${email.id}: usa el sistema visual compartido`)
}

const porId = new Map(emails.map((email) => [email.id, email]))
const conAccion = ['password-recovery', 'email-verification', 'team-invitation', 'receipt', 'device-report', 'warranty-update'] as const
for (const id of conAccion) {
  const html = porId.get(id)!.html
  assert.ok(html.includes('Si el botón no funciona, copiá y pegá este enlace:'), `${id}: deja el enlace de respaldo visible`)
  assert.ok(html.includes('<a href="https://app.moboss.online/'), `${id}: los enlaces apuntan a la app`)
}
assert.ok(!porId.get('reservation-due')!.html.includes('class="email-cta"'), 'la reserva no inventa un botón que no tiene')
assert.ok(porId.get('receipt')!.html.includes('PED-1042') && porId.get('receipt')!.text.includes('Total: Gs.'), 'el comprobante lleva pedido y total')
assert.ok(porId.get('warranty-update')!.html.includes('356789104523118'), 'la garantía muestra el equipo')
assert.ok(porId.get('payment-overdue')!.html.includes('Cuota vencida'), 'la mora se marca como vencida')
assert.ok(porId.get('payment-due')!.html.includes('Cuota por vencer'), 'el recordatorio avisa que vence pronto')

// Determinismo de las fechas relativas: los datos ficticios no dependen del día real.
const manana = construirEmailsPrueba({ to: 'revision@ejemplo.com', ahora: new Date('2026-10-15T12:00:00.000Z') })
assert.equal(manana.find((email) => email.id === 'payment-due')!.text, porId.get('payment-due')!.text, 'con el mismo ahora, el mismo texto')

// Un enlace roto (sin app válida) no deja la vista a medias.
const entorno = process.env as Record<string, string | undefined>
const appOriginal = entorno.MOBOS_APP_URL
const nodeEnvOriginal = entorno.NODE_ENV
entorno.MOBOS_APP_URL = 'no-es-url'
entorno.NODE_ENV = 'test'
assert.throws(() => construirEmailsPrueba({ to: 'revision@ejemplo.com', ahora: AHORA }), /No se pudo armar el correo/)
if (appOriginal === undefined) delete entorno.MOBOS_APP_URL
else entorno.MOBOS_APP_URL = appOriginal
if (nodeEnvOriginal === undefined) delete entorno.NODE_ENV
else entorno.NODE_ENV = nodeEnvOriginal

// ── Argumentos ──────────────────────────────────────────────────────────────
assert.deepEqual(parsearArgumentos([], {}), { to: '', directorio: DIRECTORIO_POR_DEFECTO, soloHtml: false, ayuda: false, error: null })
assert.deepEqual(parsearArgumentos(['--to', 'prueba@dominio.com', '--out', 'salida'], {}), { to: 'prueba@dominio.com', directorio: 'salida', soloHtml: false, ayuda: false, error: null })
assert.equal(parsearArgumentos(['--to=prueba@dominio.com'], {}).to, 'prueba@dominio.com', 'acepta --bandera=valor')
assert.equal(parsearArgumentos([], { MOBOS_EMAIL_TO: 'env@dominio.com' }).to, 'env@dominio.com', 'usa MOBOS_EMAIL_TO de respaldo')
assert.equal(parsearArgumentos(['--solo-html'], {}).soloHtml, true, 'entiende --solo-html')
assert.equal(parsearArgumentos(['--to', 'choto'], {}).error, 'La casilla «choto» no parece válida (ejemplo: nombre@dominio.com).')
assert.equal(parsearArgumentos(['--to'], {}).error, 'La opción --to necesita un valor.')
assert.equal(parsearArgumentos(['--desconocido'], {}).error, 'Opción desconocida: --desconocido')
assert.equal(parsearArgumentos(['--ayuda'], {}).ayuda, true)

// Índice de la vista previa: enlaza los 10 archivos y muestra el destinatario.
const indice = indiceHtml(emails, { to: 'revision@ejemplo.com', transporte: false })
for (const [posicion, email] of emails.entries()) assert.ok(indice.includes(nombreArchivoEmail(posicion, email.id)), `el índice enlaza ${email.id}`)
assert.ok(indice.includes('revision@ejemplo.com'), 'el índice muestra el destinatario usado')
assert.equal(nombreArchivoEmail(0, 'welcome'), '01-welcome.html')

// ── El script de punta a punta (sin transporte: solo HTML) ──────────────────
const sinTransporte: Record<string, string | undefined> = { ...process.env }
for (const clave of ['WEEM_EMAIL_RELAY_URL', 'WEEM_EMAIL_RELAY_TOKEN', 'MOBOS_APP_URL', 'MOBOS_EMAIL_TO', 'MOBOS_EMAIL_OUTBOX_ACTIVE_KEY_ID', 'MOBOS_EMAIL_OUTBOX_ENCRYPTION_KEYS_JSON']) delete sinTransporte[clave]
const corrida = (args: string[], env: Record<string, string | undefined> = sinTransporte) => spawnSync(process.execPath, [script, ...args], { cwd: raiz, env: env as NodeJS.ProcessEnv, encoding: 'utf8' })

const salida = mkdtempSync(join(tmpdir(), 'emails-prueba-'))
try {
  const preview = corrida(['--out', salida])
  assert.equal(preview.status, 0, `la vista previa sale 0: ${preview.stderr}`)
  assert.ok(preview.stdout.includes('Sin transporte de correo: no se envía nada.'), 'avisa que no envía nada')
  assert.ok(preview.stdout.includes(CASILLA_FICTICIA), 'muestra el destinatario ficticio usado')
  const archivos = readdirSync(salida).sort()
  assert.equal(archivos.length, 11, 'deja 10 correos + index.html')
  assert.ok(archivos.includes('01-welcome.html') && archivos.includes('10-reservation-due.html') && archivos.includes('index.html'))
  const bienvenida = readFileSync(join(salida, '01-welcome.html'), 'utf8')
  assert.ok(bienvenida.includes('data-email-system="mobos-premium"') && bienvenida.includes('Te damos la bienvenida a MobOS'), 'el HTML guardado es el correo real')

  const invalida = corrida(['--to', 'no-es-mail'])
  assert.equal(invalida.status, 1)
  assert.ok(invalida.stderr.includes('no parece válida'))

  const desconocida = corrida(['--nope'])
  assert.equal(desconocida.status, 1)
  assert.ok(desconocida.stderr.includes('Opción desconocida: --nope'))
} finally {
  rmSync(salida, { recursive: true, force: true })
}

// ── Con transporte configurado (sin mandar nada a la red) ───────────────────
const conTransporte: Record<string, string | undefined> = {
  ...sinTransporte,
  WEEM_EMAIL_RELAY_URL: 'https://relay.ejemplo.com/email',
  WEEM_EMAIL_RELAY_TOKEN: 'x'.repeat(32),
  MOBOS_APP_URL: 'https://app.moboss.online',
  MOBOS_EMAIL_OUTBOX_ACTIVE_KEY_ID: 'clave-1',
  MOBOS_EMAIL_OUTBOX_ENCRYPTION_KEYS_JSON: JSON.stringify({ 'clave-1': Buffer.alloc(32, 7).toString('base64') }),
}
const exigeCasilla = corrida([], conTransporte)
assert.equal(exigeCasilla.status, 1, 'con transporte exige --to')
assert.ok(exigeCasilla.stderr.includes('Hay transporte de correo configurado'), 'explica por qué no envía')

const salidaForzada = mkdtempSync(join(tmpdir(), 'emails-prueba-html-'))
try {
  const soloHtml = corrida(['--solo-html', '--out', salidaForzada], conTransporte)
  assert.equal(soloHtml.status, 0, `--solo-html no envía: ${soloHtml.stderr}`)
  assert.ok(soloHtml.stdout.includes('--solo-html'), 'aclara que se forzó la vista previa')
  assert.equal(readdirSync(salidaForzada).length, 11, 'deja los 10 correos + índice')
} finally {
  rmSync(salidaForzada, { recursive: true, force: true })
}

console.log('emails-prueba: 10 correos, argumentos y vista previa ok')
