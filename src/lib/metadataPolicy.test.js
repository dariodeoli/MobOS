import assert from 'node:assert/strict'
import test from 'node:test'
import { landingStructuredData, resolvePageMetadata } from './metadataPolicy.js'

test('public landing metadata uses the canonical public origin and is indexable', () => {
  const metadata = resolvePageMetadata({ pathname: '/', publicPage: true })

  assert.equal(metadata.canonical, 'https://moboss.online/')
  assert.equal(metadata.robots, 'index, follow')
  assert.equal(metadata.landing, true)
})

test('public status metadata remains canonical and indexable', () => {
  const metadata = resolvePageMetadata({ pathname: '/status/', publicPage: true })

  assert.equal(metadata.canonical, 'https://moboss.online/status')
  assert.equal(metadata.title, 'Estado del sistema · MobOS')
  assert.equal(metadata.robots, 'index, follow')
})

test('authenticated and authentication routes are canonical to the app and noindex', () => {
  for (const pathname of ['/login', '/restablecer-contrasena', '/pos/cargar', '/control/reportes']) {
    const metadata = resolvePageMetadata({ pathname })
    assert.equal(metadata.canonical, `https://app.moboss.online${pathname}`)
    assert.equal(metadata.robots, 'noindex, nofollow')
  }
})

test('unknown routes are noindex and canonicalize to the surface root', () => {
  const metadata = resolvePageMetadata({ pathname: '/missing', publicPage: true })

  assert.equal(metadata.canonical, 'https://moboss.online/')
  assert.equal(metadata.title, 'Página no encontrada · MobOS')
  assert.equal(metadata.robots, 'noindex, nofollow')
})

test('structured data does not invent pricing or offline capability', () => {
  const structuredData = landingStructuredData()

  assert.equal(structuredData.url, 'https://moboss.online/')
  assert.equal('offers' in structuredData, false)
  assert.equal('featureList' in structuredData, false)
})
