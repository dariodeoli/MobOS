import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { GRUPOS_CONFIG, ORDEN_GRUPOS_CONFIG } from './gruposConfig.js'
import { SECCIONES_CONFIG, INDICE_CONFIG } from '../../../lib/configIndice.js'

const panel = readFileSync(new URL('../../../pages/PanelVendedor.jsx', import.meta.url), 'utf8')
const bloque = panel.split('const SUBPAGINAS = {')[1].split('// Ayuda vive fuera')[0]
const tabs = [...bloque.matchAll(/\['([a-z-]+)', '([^']+)'\]/g)].map(m => [m[1], m[2]])
const redirecciones = Object.fromEntries([...panel.split('const REDIRECCIONES_CONFIG = {')[1].split('\n}\n')[0].matchAll(/'?([a-z-]+)'?: '([^']+)'/g)].map(m => [m[1], m[2]]))

test('Configuración tiene nueve grupos, en el orden pedido', () => {
  assert.deepEqual(tabs.map(([, nombre]) => nombre), [
    'Negocio', 'Módulos', 'Equipo y acceso', 'Ventas y cobros', 'Impresión y documentos',
    'Mensajes y avisos', 'Seguridad', 'Integraciones y sistema', 'Mi cuenta',
  ])
  assert.deepEqual(tabs.map(([id]) => id), ORDEN_GRUPOS_CONFIG)
  for (const [id, nombre] of tabs) assert.equal(GRUPOS_CONFIG[id].titulo, nombre, id)
})

test('los slugs viejos redirigen a un grupo que existe', () => {
  const nuevos = new Set(tabs.map(([id]) => id))
  for (const viejo of ['organizacion', 'dispositivos', 'comercial', 'impresoras', 'sucursales', 'roles', 'precios', 'historial', 'identidad', 'preferencias']) {
    const destino = redirecciones[viejo]
    assert.ok(destino, `${viejo} redirige`)
    assert.ok(nuevos.has(destino.replace('/configuracion/', '')), `${viejo} → ${destino}`)
  }
  for (const nuevo of nuevos) assert.ok(!redirecciones[nuevo], `${nuevo} no se redirige a sí mismo`)
})

test('el buscador de ajustes apunta a grupos nuevos', () => {
  for (const entrada of INDICE_CONFIG.filter(e => e.section)) assert.ok(SECCIONES_CONFIG[entrada.section] && GRUPOS_CONFIG[entrada.section], entrada.id)
  assert.ok(INDICE_CONFIG.some(e => e.id === 'modulos'))
})
