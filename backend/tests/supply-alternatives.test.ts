import assert from 'node:assert/strict'
import { estadoNecesidadTras, generarCodigoOtp, generarTokenPublico, hashToken, huellaOtp, otpValido, otpVigente, requiereAprobacionCliente, resumenAlternativa } from '../lib/supply-alternatives'

// A5 (#279): reglas puras del flujo de alternativas.

// Solo una diferencia de precio/condiciones exige aprobación del cliente.
assert.equal(requiereAprobacionCliente(0), false)
assert.equal(requiereAprobacionCliente(undefined), false)
assert.equal(requiereAprobacionCliente(150000), true)
assert.equal(requiereAprobacionCliente(-5000), true)

// La necesidad original se libera solo al aceptar; rechazar la devuelve al panel.
assert.equal(estadoNecesidadTras('ACEPTADA'), 'COMPRADA')
assert.equal(estadoNecesidadTras('RECHAZADA'), 'ABIERTA')
assert.equal(estadoNecesidadTras('CANCELADA'), 'CANCELADA')
assert.equal(estadoNecesidadTras('ENVIADA_AL_CLIENTE'), 'ESPERANDO_CLIENTE')
assert.equal(estadoNecesidadTras('PROPUESTA'), 'ESPERANDO_CLIENTE')

// Enlace público: 64 hex y hash estable (nunca se guarda el token plano).
const token = generarTokenPublico()
assert.match(token, /^[a-f0-9]{64}$/)
assert.equal(hashToken(token), hashToken(token))
assert.notEqual(hashToken(token), token)

// OTP: 6 dígitos, huella verificable, vencimiento y límite de intentos.
const codigo = generarCodigoOtp()
assert.match(codigo, /^\d{6}$/)
const huella = huellaOtp(codigo)
assert.equal(otpValido(codigo, huella), true)
assert.equal(otpValido('000001', huella), false)
assert.equal(otpValido(codigo, huella, 5), false, 'con 5 intentos fallidos el código se bloquea')
assert.equal(otpVigente(new Date(Date.now() + 60_000)), true)
assert.equal(otpVigente(new Date(Date.now() - 1000)), false)
assert.equal(otpVigente(null), false)

// Resumen legible para la auditoría y el enlace.
assert.match(resumenAlternativa({ optionSummary: 'Negro 256 GB', priceDeltaPyg: 150000 }), /^Negro 256 GB · \+Gs 150/)
assert.match(resumenAlternativa({ optionSummary: 'Azul 128 GB', priceDeltaPyg: -5000 }), /−Gs 5/)

console.log('supply-alternatives: reglas A5 OK')
