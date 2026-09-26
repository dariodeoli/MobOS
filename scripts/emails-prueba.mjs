// Correos de prueba (#pedido de Dario): renderiza los 10 correos transaccionales
// con datos ficticios y los envía a la casilla de `--to`/`MOBOS_EMAIL_TO` si el
// transporte está configurado; si no, deja los `.html` en un directorio local
// para revisarlos en el navegador.
//
//   node scripts/emails-prueba.mjs --to casilla@dominio.com
//   node scripts/emails-prueba.mjs --solo-html --out /tmp/emails
//
// No duplica plantillas: usa los builders de `backend/lib/email.ts` a través del
// mismo puente TypeScript del arnés (`backend/tests/run-unit.cjs`).
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = resolve(join(dirname(fileURLToPath(import.meta.url)), '..'))

// Puente TypeScript → CommonJS con la dependencia del backend (sin duplicar
// builders ni agregar dependencias nuevas).
const require = createRequire(import.meta.url)
let ts
try { ts = require(join(raiz, 'backend', 'node_modules', 'typescript')) } catch { ts = require('typescript') }
require.extensions['.ts'] = (modulo, archivo) => modulo._compile(ts.transpileModule(readFileSync(archivo, 'utf8'), {
  compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, archivo)

const { emailTransportConfigured, logEmailOutcome, sendTransactionalEmail } = require(join(raiz, 'backend', 'lib', 'email.ts'))
const { construirEmailsPrueba, parsearArgumentos, ayudaEmailsPrueba, nombreArchivoEmail, indiceHtml, CASILLA_FICTICIA } = require(join(raiz, 'backend', 'lib', 'emails-prueba.ts'))

const opciones = parsearArgumentos(process.argv.slice(2), process.env)
if (opciones.ayuda) {
  console.log(ayudaEmailsPrueba())
  process.exit(0)
}
if (opciones.error) {
  console.error(`${opciones.error}\n\n${ayudaEmailsPrueba()}`)
  process.exit(1)
}

const emails = construirEmailsPrueba({ to: opciones.to || CASILLA_FICTICIA })
const transporte = Boolean(emailTransportConfigured())

if (transporte && !opciones.soloHtml && !opciones.to) {
  console.error(`Hay transporte de correo configurado: indicá la casilla con --to o MOBOS_EMAIL_TO (o usá --solo-html para la vista previa).\n\n${ayudaEmailsPrueba()}`)
  process.exit(1)
}

const fecha = new Date().toISOString()
let fallos = 0

if (transporte && !opciones.soloHtml) {
  console.log(`Enviando ${emails.length} correos de prueba a ${opciones.to}…`)
  for (const email of emails) {
    const ok = await sendTransactionalEmail({
      to: email.to,
      subject: email.subject,
      html: email.html,
      text: email.text,
      idempotencyKey: `emails-prueba-${email.id}-${fecha}`,
    })
    logEmailOutcome(email.id, ok ? 'delivered-to-relay' : 'delivery-failed')
    if (!ok) fallos += 1
    console.log(`  ${ok ? 'ok' : 'falló'}  ${email.nombre} — ${email.subject}`)
  }
  console.log(fallos ? `\n${fallos} correo(s) no se pudieron enviar.` : `\nListo: ${emails.length}/${emails.length} enviados a ${opciones.to}.`)
  process.exit(fallos ? 1 : 0)
}

const directorio = resolve(process.cwd(), opciones.directorio)
mkdirSync(directorio, { recursive: true })
emails.forEach((email, indice) => writeFileSync(join(directorio, nombreArchivoEmail(indice, email.id)), email.html, 'utf8'))
writeFileSync(join(directorio, 'index.html'), indiceHtml(emails, { to: emails[0].to, transporte }), 'utf8')

console.log(`Sin transporte de correo: no se envía nada.`)
console.log(`Vista previa de ${emails.length} correos en ${directorio}`)
console.log(`  Abrí index.html para recorrerlos, o revisá el asunto de cada uno en los nombres de archivo.`)
if (transporte && opciones.soloHtml) console.log(`(El transporte está configurado; usaste --solo-html.)`)
console.log(`Destinatario usado en los datos: ${emails[0].to}`)
