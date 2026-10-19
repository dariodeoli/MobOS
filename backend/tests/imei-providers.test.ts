import assert from 'node:assert/strict'
import { findImeiProvider, imeiProviderCatalog, providerCanRunLive, publicImeiProviders } from '../lib/imei-providers'

const sinConfig: NodeJS.ProcessEnv = { NODE_ENV: 'test', IMEICHECK_LIVE: '0', IMEICHECK_TOKEN: '', IMEI_INFO_LIVE: '0', IMEI_INFO_TOKEN: '' }
const catalogo = imeiProviderCatalog(sinConfig)
assert.equal(catalogo.length, 2)
assert.equal(findImeiProvider('imeicheck.net', sinConfig)?.availability, 'simulated')
assert.equal(findImeiProvider('imei.info', sinConfig)?.availability, 'coming_soon')
assert.equal(providerCanRunLive('imei.info', sinConfig), false)
assert.equal(providerCanRunLive('imeicheck.net', { NODE_ENV: 'test', IMEICHECK_LIVE: '1', IMEICHECK_TOKEN: 'secret' } as NodeJS.ProcessEnv), true)
assert.equal(providerCanRunLive('imeicheck.net', { NODE_ENV: 'test', IMEICHECK_LIVE: '1' } as NodeJS.ProcessEnv), false)
assert.equal(findImeiProvider('otro', sinConfig), undefined)
const publico = publicImeiProviders(sinConfig)
assert.equal(publico[0].browserSafe, true)
assert.equal(publico[1].availability, 'coming_soon')
assert.ok(!JSON.stringify(publico).includes('secret'))
console.log('imei-providers.test.ts: ok')
