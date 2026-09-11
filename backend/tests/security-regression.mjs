#!/usr/bin/env node

// Regresiones de seguridad para rutas ya existentes.
// Uso: node backend/tests/security-regression.mjs BASE_URL TOKEN_A COMPANY_TOKEN_A

const [baseUrlArg, tokenA, companyTokenA] = process.argv.slice(2)

if (!baseUrlArg || !tokenA || !companyTokenA) {
  console.error('Uso: node backend/tests/security-regression.mjs BASE_URL TOKEN_A COMPANY_TOKEN_A')
  process.exit(2)
}

const baseUrl = baseUrlArg.replace(/\/+$/, '')
const crossBranchProductId = process.env.MOBOS_SECURITY_CROSS_BRANCH_PRODUCT_ID || 'prod-a-crossbranch-it'
const paymentId = process.env.MOBOS_SECURITY_PAYMENT_ID || 'payment-a-proof-it'

function requestHeaders(token, tenantHeader) {
  const headers = {}
  if (token) headers.Authorization = 'Bearer ' + token
  if (tenantHeader) headers['x-tenant-id'] = tenantHeader
  return headers
}

async function request(path, options = {}) {
  return fetch(baseUrl + path, {
    ...options,
    headers: { ...requestHeaders(options.token, options.tenantHeader), ...(options.headers || {}) },
  })
}

async function expectStatus(name, response, expected) {
  if (response.status !== expected) {
    const body = await response.text()
    throw new Error(name + ': esperado HTTP ' + expected + ', recibido ' + response.status + '. ' + body.slice(0, 200))
  }
}

async function json(response, name) {
  try {
    return await response.json()
  } catch {
    throw new Error(name + ': respuesta no JSON')
  }
}

async function main() {
  let checks = 0

  const companyProducts = await request('/api/products', { token: companyTokenA, tenantHeader: 'tenant-b-it' })
  await expectStatus('companyToken no accede a products', companyProducts, 401)
  checks += 1

  const spoofedProducts = await request('/api/products', { token: tokenA, tenantHeader: 'tenant-b-it' })
  await expectStatus('tenant-header spoof en products', spoofedProducts, 200)
  const productRows = await json(spoofedProducts, 'tenant-header spoof en products')
  if (!Array.isArray(productRows) || productRows.some((row) => row.tenantId !== 'tenant-a-it')) {
    throw new Error('tenant-header spoof en products: la respuesta no quedó limitada al tenant de la sesión')
  }
  checks += 1

  const crossBranch = await request('/api/products?q=' + encodeURIComponent('Cross Branch'), { token: tokenA, tenantHeader: 'tenant-a-it' })
  await expectStatus('products q crossbranch', crossBranch, 200)
  const crossBranchRows = await json(crossBranch, 'products q crossbranch')
  if (!Array.isArray(crossBranchRows) || crossBranchRows.some((row) => row.id === crossBranchProductId)) {
    throw new Error('products q crossbranch: devolvió un producto de otra sucursal')
  }
  checks += 1

  const proofListWithCompanyToken = await request('/api/payments/' + paymentId + '/proofs', { token: companyTokenA, tenantHeader: 'tenant-b-it' })
  await expectStatus('companyToken no accede a metadata de proofs', proofListWithCompanyToken, 401)
  checks += 1

  const proofListWithSpoofedTenant = await request('/api/payments/' + paymentId + '/proofs', { token: tokenA, tenantHeader: 'tenant-b-it' })
  await expectStatus('tenant-header spoof en proofs', proofListWithSpoofedTenant, 200)
  const proofRows = await json(proofListWithSpoofedTenant, 'tenant-header spoof en proofs')
  if (!Array.isArray(proofRows) || proofRows.some((row) => 'data' in row || 'bytes' in row || 'content' in row)) {
    throw new Error('tenant-header spoof en proofs: metadata inválida o con bytes exportados')
  }
  checks += 1

  const publicDownload = await request('/api/payments/' + paymentId + '/proofs/nonexistent-proof', { tenantHeader: 'tenant-a-it' })
  await expectStatus('descarga de proof sin sesión', publicDownload, 401)
  if (publicDownload.headers.has('content-disposition') || publicDownload.headers.get('content-type')?.toLowerCase().startsWith('application/pdf')) {
    throw new Error('descarga de proof sin sesión: expuso headers de archivo')
  }
  checks += 1

  const companyDownload = await request('/api/payments/' + paymentId + '/proofs/nonexistent-proof', { token: companyTokenA })
  await expectStatus('companyToken no descarga proof', companyDownload, 401)
  checks += 1

  const publicUploadBody = new FormData()
  publicUploadBody.set('file', new Blob(['%PDF-1.7 synthetic'], { type: 'application/pdf' }), 'synthetic.pdf')
  const publicUpload = await request('/api/payments/' + paymentId + '/proofs', { method: 'POST', body: publicUploadBody, tenantHeader: 'tenant-a-it' })
  await expectStatus('upload de proof sin sesión', publicUpload, 401)
  checks += 1

  console.log('security-regression: ' + checks + ' checks OK (tenant spoof, q crossbranch, companyToken y export público).')
}

main().catch((error) => {
  console.error('security-regression: FALLÓ - ' + (error instanceof Error ? error.message : String(error)))
  process.exit(1)
})
