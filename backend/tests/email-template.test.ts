import assert from 'node:assert/strict'
import {
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
} from '../lib/email'

const recovery = passwordRecoveryEmail({ to: 'dueno@tienda.com', companyName: 'Tienda Test', token: 'a'.repeat(64) })
assert.ok(recovery, 'el correo de recuperación se arma')
const html = recovery.html

// Sistema compartido, accesible y resistente a clientes de correo.
assert.ok(html.startsWith('<!doctype html><html lang="es">'), 'declara idioma y documento completo')
assert.ok(html.includes('role="article"') && html.includes('aria-roledescription="email"'), 'expone una estructura de correo accesible')
assert.ok(html.includes('data-email-system="mobos-premium"'), 'identifica el sistema visual compartido')
assert.ok(html.includes('width="600"') && html.includes('max-width:600px'), 'usa un shell centrado de 600px')
assert.ok(html.includes('@media only screen and (max-width:620px)'), 'incluye adaptación para pantallas pequeñas')
assert.ok(html.includes('name="color-scheme" content="light dark"'), 'declara soporte de esquema de color')
assert.ok(html.includes('@media (prefers-color-scheme:dark)'), 'incluye fallback legible para modo oscuro')
assert.equal(html.match(/<h1/g)?.length, 1, 'mantiene un solo título principal')

// Preheader oculto, identidad visible y contexto que no depende solo del color.
const preheaderStart = html.indexOf('class="email-preheader"')
const preheaderEnd = html.indexOf('</div>', preheaderStart)
assert.ok(preheaderStart > 0 && html.slice(preheaderStart, preheaderEnd).includes('Seguridad de la cuenta'), 'incluye un preheader útil y oculto')
assert.ok(html.includes('Mob<span style="color:#166534">OS</span>'), 'usa el wordmark de texto seguro')
assert.ok(html.indexOf('Seguridad de la cuenta', preheaderEnd) > preheaderEnd, 'muestra el contexto como badge visible')
assert.ok(html.includes('background:#166534') && html.includes('color:#FFFFFF'), 'el CTA usa una combinación de alto contraste')
assert.ok(html.includes('font-size:15px;line-height:1.7'), 'el cuerpo conserva tamaño y altura de línea legibles')

// CTA y URL de respaldo apuntan exactamente al mismo destino.
const actionUrl = html.match(/<a href="([^"]+)"[^>]*>Restablecer contraseña<\/a>/)
assert.ok(actionUrl, 'el botón tiene su enlace')
assert.ok(html.includes('Si el botón no funciona, copiá y pegá este enlace:'), 'muestra la instrucción de respaldo')
assert.ok(html.split(`href="${actionUrl[1]}"`).length >= 3, 'el botón y el enlace visible comparten URL')
assert.ok(html.includes(`>${actionUrl[1]}</a>`), 'la URL queda visible y copiable')
assert.ok(recovery.text.includes(`Restablecer contraseña: ${actionUrl[1]}`), 'el texto plano conserva la acción y URL')
assert.ok(recovery.text.includes('Cuenta: Tienda Test') && recovery.text.includes('Validez: 30 minutos'), 'el texto plano conserva los detalles de seguridad')

// Todos los builders confirmados usan el mismo shell y mantienen sus variantes.
const date = new Date('2026-10-15T12:00:00.000Z')
const messages = [
  emailVerificationEmail({ to: 'verificar@test.com', companyName: 'Tienda Test', token: 'b'.repeat(64) }),
  welcomeEmail({ to: 'bienvenida@test.com', companyName: 'Tienda Test', tenantId: 'tenant-1' }),
  teamInvitationEmail({ to: 'equipo@test.com', inviteeName: 'Ana', companyName: 'Tienda Test', inviterName: 'Darío', token: 'c'.repeat(64), invitationId: 'inv-1' }),
  receiptEmail({ to: 'cliente@test.com', customerName: 'Cliente', orderNumber: 'MOB #1', lines: [{ quantity: 1, description: 'Producto', totalPyg: 100000 }], totalPyg: 100000, trackingUrl: 'https://app.moboss.online/p/token' }),
  deviceReportEmail({ to: 'informe@test.com', customerName: 'Cliente', model: 'Galaxy A55', link: 'https://app.moboss.online/informe/token', companyName: 'Tienda Test' }),
  paymentDueReminderEmail({ to: 'cuota@test.com', customerName: 'Cliente', orderNumber: 'MOB-2', dueAt: date, amountPyg: 250000, storeName: 'Tienda Test' }),
  paymentOverdueEmail({ to: 'mora@test.com', customerName: 'Cliente', orderNumber: 'MOB-3', dueAt: date, amountPyg: 250000, storeName: 'Tienda Test' }),
  warrantyStatusEmail({ to: 'garantia@test.com', customerName: 'Cliente', serial: 'SN-123', storeName: 'Tienda Test', statusLabel: 'Listo para retirar', trackingUrl: 'https://app.moboss.online/garantia/token' }),
  reservationDueEmail({ to: 'reserva@test.com', customerName: 'Cliente', itemLabel: 'Galaxy A55', reservedUntil: date, storeName: 'Tienda Test' }),
]
assert.equal(messages.length, 9)
for (const message of messages) {
  assert.ok(message, 'cada builder produce su correo')
  assert.ok(message.html.includes('data-email-system="mobos-premium"'), 'cada builder usa el shell premium')
  assert.ok(message.html.includes('class="email-preheader"'), 'cada builder incluye preheader')
  assert.ok(message.text.includes('MobOS · app.moboss.online'), 'cada builder entrega texto plano completo')
}

const receipt = messages[3]!
assert.ok(receipt.html.includes('aria-label="Detalle del comprobante"'), 'el comprobante ofrece una tabla semántica y escaneable')
assert.ok(receipt.html.includes('<th scope="col"') && receipt.html.includes('<th scope="row"'), 'la tabla relaciona encabezados y datos')
assert.ok(receipt.text.includes('1 × Producto — Gs. 100.000') && receipt.text.includes('Total: Gs. 100.000'), 'el comprobante de texto conserva líneas y total')

const report = messages[4]!
assert.ok(report.html.includes('aria-label="Resumen del informe"'), 'el informe resume datos en una tabla semántica')
assert.ok(report.text.includes('Equipo: Galaxy A55') && report.text.includes('Enlace del informe:'), 'el informe de texto conserva contexto y enlace')

assert.ok(messages[5]!.html.includes('data-tone="warning"'), 'el aviso de vencimiento tiene énfasis de advertencia')
assert.ok(messages[6]!.html.includes('data-tone="danger"'), 'la mora tiene énfasis de alerta')
assert.ok(messages[8]!.html.includes('data-tone="warning"'), 'la reserva próxima a vencer tiene énfasis de advertencia')
assert.ok(html.includes('[data-tone="warning"] .email-badge') && html.includes('[data-tone="danger"] .email-badge'), 'las alertas conservan énfasis diferenciado en modo oscuro')

// Las entradas dinámicas siguen escapadas en los límites HTML de confianza.
const unsafe = '<img src=x onerror=alert(1)>'
const escapedReceipt = receiptEmail({ to: 'seguro@test.com', customerName: unsafe, orderNumber: 'MOB-4', lines: [{ quantity: 1, description: unsafe, totalPyg: 1 }], totalPyg: 1, trackingUrl: 'https://app.moboss.online/p?a=1&b=2', companyName: unsafe })
assert.ok(escapedReceipt)
assert.ok(!escapedReceipt.html.includes(unsafe) && !escapedReceipt.html.includes('<img src=x'), 'no inserta HTML dinámico sin escapar')
assert.ok(escapedReceipt.html.includes('&lt;img src=x onerror=alert(1)&gt;'), 'conserva el contenido dinámico como texto escapado')
assert.ok(escapedReceipt.html.includes('https://app.moboss.online/p?a=1&amp;b=2'), 'escapa URLs dentro de atributos y texto visible')

console.log('email-template: shell premium, accesibilidad, variantes, respaldo y escaping verificados')
