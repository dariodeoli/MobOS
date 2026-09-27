import assert from 'node:assert/strict'

// A5 (#279) — Variante agotada → alternativas: el comprador propone (versiones),
// el vendedor resuelve y, si cambia el precio, el cliente aprueba con OTP por
// el enlace público. La necesidad original se libera recién al aceptar.
const [base, admin] = process.argv.slice(2)
if (!base || !admin) throw new Error('base y token admin requeridos')
let checks = 0
async function req(path, method = 'GET', body, expected = 200, token = admin) {
  const response = await fetch(base + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const data = await response.json().catch(() => null)
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data)}`)
  checks++
  return data
}
async function publico(path, method = 'GET', body, expected = 200) {
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
  const data = await response.json().catch(() => null)
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data)}`)
  checks++
  return data
}
const sufijo = Date.now().toString(36).toUpperCase()

const producto = await req('/api/products', 'POST', { sku: `A5-${sufijo}`, name: 'Equipo A5', pricePyg: 2000000, stock: 1, branchId: 'branch-a-it' }, 201)
const crearNecesidad = async (nota) => {
  const necesidad = await req('/api/supply/needs', 'POST', { productId: producto.id, quantity: 1, priority: 'NORMAL', notes: `A5 ${nota} ${sufijo}` }, 201)
  return necesidad.id || necesidad.need?.id || necesidad.necesidad?.id
}

// 1) El comprador propone versiones; la necesidad queda esperando al cliente.
const necesidadA = await crearNecesidad('con diferencia')
const v1 = await req(`/api/supply/needs/${encodeURIComponent(necesidadA)}/alternatives`, 'POST', { reason: 'Se agotó el azul', optionSummary: 'Negro 256 GB', priceDeltaPyg: 150000, newEta: new Date(Date.now() + 5 * 86400000).toISOString(), notes: 'Misma garantía' }, 201)
assert.equal(v1.alternative.version, 1)
const v2 = await req(`/api/supply/needs/${encodeURIComponent(necesidadA)}/alternatives`, 'POST', { optionSummary: 'Gris 256 GB', priceDeltaPyg: 120000 }, 201)
assert.equal(v2.alternative.version, 2, 'cada propuesta es una versión nueva')
const listado = await req(`/api/supply/needs/${encodeURIComponent(necesidadA)}/alternatives`)
assert.equal(listado.alternatives.length, 2, 'el historial conserva las versiones')
assert.equal(listado.need.status, 'ESPERANDO_CLIENTE')

// 2) El vendedor no puede aceptar solo un cambio de precio.
await req(`/api/supply/alternatives/${encodeURIComponent(v2.alternative.id)}/decision`, 'POST', { decision: 'ACEPTAR' }, 409)
// Enviarlo al cliente genera el enlace y el OTP (que el vendedor le pasa).
const envio = await req(`/api/supply/alternatives/${encodeURIComponent(v2.alternative.id)}/decision`, 'POST', { decision: 'ENVIAR_CLIENTE', motivo: 'Lo llamamos' })
assert.match(envio.link, /^\/alternativa\/[a-f0-9]{64}$/)
assert.match(String(envio.otp || ''), /^\d{6}$/, 'con diferencia de precio hay OTP')
const token = envio.link.split('/').pop()

// 3) El cliente ve la propuesta y el historial sin sesión.
const vista = await publico(`/api/public/supply/alternatives/${token}`)
assert.equal(vista.alternative.version, 2)
assert.equal(vista.alternative.requiereOtp, true)
assert.equal(vista.versions.length, 2, 'el cliente ve el historial de versiones')
// OTP incorrecto: no aprueba y suma intento.
await publico(`/api/public/supply/alternatives/${token}`, 'POST', { decision: 'ACEPTAR', otp: '000001' }, 400)
// OTP correcto: acepta y **libera** la necesidad.
const aprobado = await publico(`/api/public/supply/alternatives/${token}`, 'POST', { decision: 'ACEPTAR', otp: envio.otp })
assert.equal(aprobado.estado, 'ACEPTADA')
assert.equal(aprobado.estadoNecesidad, 'COMPRADA', 'la necesidad se libera recién al aceptar')
const tras = await req(`/api/supply/needs/${encodeURIComponent(necesidadA)}/alternatives`)
assert.equal(tras.need.status, 'COMPRADA')
assert.equal(tras.alternatives.find((fila) => fila.version === 2).customerApprovedAt !== null, true, 'la versión aprobada conserva la fecha')
await publico(`/api/public/supply/alternatives/${token}`, 'POST', { decision: 'ACEPTAR' }, 409)

// 4) Sin diferencia de precio el vendedor acepta directo (sin OTP).
const necesidadB = await crearNecesidad('sin diferencia')
const simple = await req(`/api/supply/needs/${encodeURIComponent(necesidadB)}/alternatives`, 'POST', { optionSummary: 'Mismo modelo, otro color', priceDeltaPyg: 0 }, 201)
const aceptada = await req(`/api/supply/alternatives/${encodeURIComponent(simple.alternative.id)}/decision`, 'POST', { decision: 'ACEPTAR' })
assert.equal(aceptada.estado, 'ACEPTADA')
assert.equal(aceptada.estadoNecesidad, 'COMPRADA')

// 5) Si el cliente rechaza, la necesidad vuelve al panel (el vendedor decide).
const necesidadC = await crearNecesidad('rechazo')
const propuesta = await req(`/api/supply/needs/${encodeURIComponent(necesidadC)}/alternatives`, 'POST', { optionSummary: 'Otro modelo', priceDeltaPyg: 0 }, 201)
const envioC = await req(`/api/supply/alternatives/${encodeURIComponent(propuesta.alternative.id)}/decision`, 'POST', { decision: 'ENVIAR_CLIENTE' })
assert.equal(envioC.otp, null, 'sin diferencia de precio no hay OTP')
const rechazo = await publico(`/api/public/supply/alternatives/${envioC.link.split('/').pop()}`, 'POST', { decision: 'RECHAZAR', motivo: 'Prefiero esperar el original' })
assert.equal(rechazo.estado, 'RECHAZADA')
assert.equal(rechazo.estadoNecesidad, 'ABIERTA')

// 6) Validaciones y permisos.
await req(`/api/supply/needs/${encodeURIComponent(necesidadB)}/alternatives`, 'POST', { optionSummary: 'Otra' }, 409)
const necesidadD = await crearNecesidad('validaciones')
await req(`/api/supply/needs/${encodeURIComponent(necesidadD)}/alternatives`, 'POST', { priceDeltaPyg: 1000 }, 400)
await req(`/api/supply/needs/${encodeURIComponent(necesidadD)}/alternatives`, 'POST', { optionSummary: 'X' }, 401, 'token-invalido')
await req(`/api/supply/alternatives/${encodeURIComponent(v2.alternative.id)}/decision`, 'POST', { decision: 'OTRA' }, 400)

console.log(`PASS: alternativas A5 (versiones, vendedor decide, cliente aprueba con OTP y necesidad liberada) · ${checks} chequeos`)
