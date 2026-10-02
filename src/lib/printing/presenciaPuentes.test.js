// #319: la presencia de un puente (estado, versión y último contacto) se
// muestra igual en la tarjeta de Puentes y en el tile de Diagnóstico.

import assert from 'node:assert/strict'
import test from 'node:test'
import { presenciaDePuente, plataformaDePuente, versionDePuente } from './presenciaPuentes.js'

const hace = () => 'hace 2 min'

test('un puente en línea con versión reportada muestra estado y versión', () => {
  const presencia = presenciaDePuente({ online: true, version: '1.6.3', plataforma: 'macOS', lastSeenAt: '2026-10-02T10:00:00Z' }, { formatearHace: hace })
  assert.equal(presencia.tono, 'green')
  assert.equal(presencia.label, 'en línea · v1.6.3')
  assert.match(presencia.detalle, /macOS/)
  assert.match(presencia.detalle, /versión 1\.6\.3/)
})

test('sin versión no se inventa una: queda «versión sin reportar»', () => {
  const presencia = presenciaDePuente({ online: true })
  assert.equal(presencia.label, 'en línea')
  assert.equal(presencia.detalle, 'versión sin reportar')
})

test('sin conexión usa el único último contacto disponible', () => {
  const porBackend = presenciaDePuente({ online: false, version: '1.6.0', lastSeenAt: '2026-10-02T09:00:00Z' }, { formatearHace: hace })
  assert.equal(porBackend.label, 'sin conexión · hace 2 min')
  assert.match(porBackend.detalle, /última reportada/)
  // El fixture viejo del demo usaba `ultimaSenal`: se sigue leyendo para no
  // mostrar «sin registro» si queda una caché con la forma anterior.
  const porDemo = presenciaDePuente({ online: false, ultimaSenal: '2026-10-02T09:00:00Z' }, { formatearHace: hace })
  assert.equal(porDemo.label, 'sin conexión · hace 2 min')
})

test('un puente sin datos no rompe la pantalla', () => {
  const presencia = presenciaDePuente(null)
  assert.equal(presencia.label, 'sin conexión · sin registro')
  assert.equal(versionDePuente(null), '')
  assert.equal(plataformaDePuente({ platform: 'linux' }), 'linux')
})
