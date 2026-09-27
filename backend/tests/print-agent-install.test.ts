import assert from 'node:assert/strict'
import test from 'node:test'
import { baseDeInstalacion, urlDeInstalacion } from '../lib/print-agent-install'

// #17 · Detrás del proxy, `request.url` trae el origen interno
// (`https://0.0.0.0:3000`): la URL del instalador salía rota y el `curl | bash`
// de la guía no existía. La cadena es: override → MOBOS_API_URL →
// X-Forwarded-* (solo con MOBOS_TRUST_PROXY) → origen del request.
const requestInterno = () => new Request('https://0.0.0.0:3000/api/print-agent/manifest')

test('el override explícito del instalador gana y conserva su path/base', () => {
  const env = { MOBOS_PRINT_INSTALL_BASE: 'https://cdn.moboss.online/agente/', MOBOS_API_URL: 'https://api.moboss.online' }
  assert.equal(baseDeInstalacion(requestInterno(), env), 'https://cdn.moboss.online/agente')
})

test('MOBOS_API_URL resuelve el instalador aunque el request traiga el origen interno', () => {
  assert.equal(urlDeInstalacion(requestInterno(), { MOBOS_API_URL: 'https://api.moboss.online/' }), 'https://api.moboss.online/print-agent/install.sh')
  // Una URL con path se reduce a su origen: el instalador vive en la raíz.
  assert.equal(baseDeInstalacion(requestInterno(), { MOBOS_API_URL: 'https://api.moboss.online/v1' }), 'https://api.moboss.online')
})

test('X-Forwarded-Host/Proto se usa solo cuando el proxy es confiable', () => {
  const cabeceras = { 'x-forwarded-host': 'api.moboss.online', 'x-forwarded-proto': 'https' }
  const conProxy = new Request('http://10.0.0.5:3000/api/print-agent/manifest', { headers: cabeceras })
  assert.equal(baseDeInstalacion(conProxy, { MOBOS_TRUST_PROXY: 'true' }), 'https://api.moboss.online')
  // Sin la bandera, el header se ignora: no se puede envenenar la URL pública.
  assert.equal(baseDeInstalacion(conProxy, {}), 'http://10.0.0.5:3000')
})

test('un X-Forwarded-Host inválido no entra en la URL y cae al origen del request', () => {
  const hostInvalido = new Request('https://0.0.0.0:3000/api/print-agent/manifest', { headers: { 'x-forwarded-host': 'https://evil.example/x' } })
  assert.equal(baseDeInstalacion(hostInvalido, { MOBOS_TRUST_PROXY: 'true' }), 'https://0.0.0.0:3000')
  // Sin proto confiable se usa el del request.
  const sinProto = new Request('http://10.0.0.5:3000/api/print-agent/manifest', { headers: { 'x-forwarded-host': 'api.moboss.online' } })
  assert.equal(baseDeInstalacion(sinProto, { MOBOS_TRUST_PROXY: 'true' }), 'http://api.moboss.online')
})

test('sin configuración ni proxy queda el origen del request (local)', () => {
  assert.equal(urlDeInstalacion(new Request('http://localhost:3001/api/print-agent/manifest'), {}), 'http://localhost:3001/print-agent/install.sh')
})
