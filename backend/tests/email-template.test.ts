import assert from 'node:assert/strict'
import { passwordRecoveryEmail, teamInvitationEmail, receiptEmail } from '../lib/email'

// El correo tiene UN solo encabezado: el título. El texto de contexto (eyebrow)
// viaja como preheader oculto y nunca se repite como cabecera visible; la marca
// ya la agrega el relay. Los colores son los del tema claro de la app.

const correo = passwordRecoveryEmail({ to: 'dueno@tienda.com', companyName: 'Tienda Test', token: 'a'.repeat(64) })
assert.ok(correo, 'el correo de recuperación se arma')
const html = correo.html

// 1) El eyebrow vive solo en el preheader oculto.
const preheaderInicio = html.indexOf('display:none')
const preheaderFin = html.indexOf('</div>', preheaderInicio)
const preheader = html.slice(preheaderInicio, preheaderFin)
assert.ok(preheader.includes('Seguridad de la cuenta'), 'el contexto va en el preheader')
const h1 = html.indexOf('<h1')
assert.ok(h1 > preheaderFin, 'el título va después del preheader')
assert.equal(html.indexOf('Seguridad de la cuenta', preheaderFin), -1, 'el contexto no se repite como cabecera')

// 2) Un solo título y sin banda de encabezado.
assert.equal(html.match(/<h1/g)?.length, 1, 'un solo título')
assert.ok(!html.includes('background:#05f19c'), 'sin banda verde de encabezado')

// 3) Colores del tema claro de la app.
for (const color of ['#f4f7fa', '#ffffff', '#cbd5e2', '#e0e7f0', '#080e1a', '#3a465a', '#10b981', '#041c12']) {
  assert.ok(html.includes(color), `usa el color de la app ${color}`)
}
assert.ok(!html.includes('#64748b') && !html.includes('#0b1822'), 'sin colores viejos')

// 4) El texto plano acompaña el mismo orden (título primero).
assert.ok(correo.text.startsWith('Recuperá tu contraseña'), 'el texto arranca con el título')

// 5) Todos los correos comparten la misma plantilla (invitación y comprobante).
const invitacion = teamInvitationEmail({ to: 'vendedor@tienda.com', inviteeName: 'Ana', companyName: 'Tienda Test', inviterName: 'Dario', token: 'b'.repeat(64), invitationId: 'inv-1' })
assert.ok(invitacion && invitacion.html.includes('#10b981') && invitacion.html.includes('display:none'), 'la invitación usa la misma plantilla')
const comprobante = receiptEmail({ to: 'cliente@test.com', customerName: 'Cliente', orderNumber: 'MOB #1', lines: [{ quantity: 1, description: 'Producto', totalPyg: 100000 }], totalPyg: 100000, trackingUrl: 'https://app.moboss.online/p/token' })
assert.ok(comprobante && comprobante.html.includes('#f4f7fa') && !comprobante.html.includes('#e2e8f0'), 'el comprobante usa la paleta de la app')

console.log('email-template: un solo encabezado, paleta de la app y misma plantilla para todos')
