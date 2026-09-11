#!/usr/bin/env node

// Arnes reutilizable para rutas futuras. No contiene datos de negocio ni fixtures reales.
// Uso:
//   node backend/tests/new-modules.mjs BASE_URL TOKEN_A COMPANY_TOKEN_A [cash purchases warranties]

export const DEFAULT_MODULES = [
  { name: 'cash', path: '/api/cash', method: 'GET' },
  { name: 'purchases', path: '/api/purchases', method: 'GET' },
  { name: 'warranties', path: '/api/warranties', method: 'GET' },
]

function authHeaders(token) {
  return token ? { Authorization: 'Bearer ' + token } : {}
}

export async function requestJson(baseUrl, probe, fetchImpl = fetch) {
  const headers = { ...authHeaders(probe.token), ...(probe.headers || {}) }
  const options = { method: probe.method || 'GET', headers }
  if (probe.body !== undefined && probe.body !== null) {
    headers['Content-Type'] = 'application/json'
    options.body = JSON.stringify(probe.body)
  }
  return fetchImpl(baseUrl.replace(/\/+$/, '') + probe.path, options)
}

export async function runModuleSecuritySuite({ baseUrl, tokenA, companyTokenA, modules = DEFAULT_MODULES, fetchImpl = fetch }) {
  if (!baseUrl || !tokenA || !companyTokenA) throw new Error('baseUrl, tokenA y companyTokenA son obligatorios')
  const results = []

  for (const module of modules) {
    const probes = module.probes || [
      { name: 'sin sesión', token: null, expectedStatus: 401 },
      { name: 'companyToken sin acceso a datos', token: companyTokenA, expectedStatus: 401 },
    ]
    for (const probe of probes) {
      const response = await requestJson(baseUrl, {
        path: probe.path || module.path,
        method: probe.method || module.method || 'GET',
        body: probe.body,
        headers: probe.headers,
        token: probe.token === 'seller' ? tokenA : probe.token === 'company' ? companyTokenA : probe.token,
      }, fetchImpl)
      const expected = Array.isArray(probe.expectedStatus) ? probe.expectedStatus : [probe.expectedStatus]
      if (!expected.includes(response.status)) {
        const responseText = await response.text()
        throw new Error(module.name + ' / ' + probe.name + ': esperado HTTP ' + expected.join(' o ') + ', recibido ' + response.status + '. ' + responseText.slice(0, 200))
      }
      results.push({ module: module.name, probe: probe.name, status: response.status })
    }
  }
  return results
}

function modulesFromArgs(names) {
  if (!names.length) return DEFAULT_MODULES
  return names.map((name) => {
    const module = DEFAULT_MODULES.find((candidate) => candidate.name === name)
    if (!module) throw new Error('Módulo desconocido: ' + name + '. Use cash, purchases o warranties.')
    return module
  })
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  const [baseUrl, tokenA, companyTokenA, ...moduleNames] = process.argv.slice(2)
  if (!baseUrl || !tokenA || !companyTokenA) {
    console.error('Uso: node backend/tests/new-modules.mjs BASE_URL TOKEN_A COMPANY_TOKEN_A [cash purchases warranties]')
    process.exit(2)
  }
  runModuleSecuritySuite({ baseUrl, tokenA, companyTokenA, modules: modulesFromArgs(moduleNames) })
    .then((results) => console.log('new-modules: ' + results.length + ' checks preparados/ejecutados OK.'))
    .catch((error) => {
      console.error('new-modules: FALLÓ - ' + (error instanceof Error ? error.message : String(error)))
      process.exit(1)
    })
}
