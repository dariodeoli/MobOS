import assert from 'node:assert/strict'
import test from 'node:test'
import { landingStructuredData, resolvePageMetadata } from './metadataPolicy.js'

test('public landing metadata uses the canonical public origin and is indexable', () => {
  const metadata = resolvePageMetadata({ pathname: '/', publicPage: true })

  assert.equal(metadata.canonical, 'https://moboss.online/')
  assert.equal(metadata.robots, 'index, follow')
  assert.equal(metadata.landing, true)
})

test('customer portal metadata uses its own canonical origin and remains private', () => {
  const metadata = resolvePageMetadata({ pathname: '/', publicPage: true, clientPortal: true })
  assert.equal(metadata.canonical, 'https://clientes.moboss.online/')
  assert.equal(metadata.title, 'Portal de clientes · MobOS')
  assert.equal(metadata.robots, 'noindex, nofollow')
  assert.equal(metadata.landing, false)
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

test('configuration subpages keep their own child slug in the URL and the title', () => {
  const rutas = {
    '/configuracion': 'Configuración',
    '/configuracion/equipo': 'Equipo',
    '/configuracion/invitaciones': 'Invitaciones',
    '/configuracion/identidad': 'Mi identidad',
    '/configuracion/roles': 'Roles y permisos',
    '/configuracion/historial': 'Historial',
    '/configuracion/negocio': 'Negocio',
    '/configuracion/sucursales': 'Sucursales',
    '/configuracion/seguridad': 'Seguridad',
    '/configuracion/impresoras': 'Impresoras',
    '/configuracion/impresion': 'Estado de impresión',
    '/configuracion/sistema': 'Estado del sistema',
  }
  for (const [pathname, label] of Object.entries(rutas)) {
    const metadata = resolvePageMetadata({ pathname })
    assert.equal(metadata.title, `${label} · MobOS`)
    assert.equal(metadata.canonical, `https://app.moboss.online${pathname}`)
    assert.equal(metadata.robots, 'noindex, nofollow')
  }
})

test('tabbed sections keep their own child slug in the URL and the title', () => {
  const rutas = {
    '/analisis/reportes': 'Reportes',
    '/analisis/asistente': 'Asistente',
    '/finanzas/caja': 'Caja',
    '/finanzas/creditos': 'Créditos',
    '/inventario/unidades': 'Unidades',
    '/inventario/transito': 'En tránsito',
  }
  for (const [pathname, label] of Object.entries(rutas)) {
    const metadata = resolvePageMetadata({ pathname })
    assert.equal(metadata.title, `${label} · MobOS`)
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
