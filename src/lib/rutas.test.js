import assert from 'node:assert/strict'
import test from 'node:test'
import { DESTINO_LEGADO, RUTA_DE_VISTA, rutaDeVista, vistaDeRuta } from './rutas.js'

test('cada vista del panel tiene su slug nuevo', () => {
  assert.equal(rutaDeVista('cargar'), '/ventas')
  assert.equal(rutaDeVista('pedidos'), '/pedidos')
  assert.equal(rutaDeVista('repartos'), '/delivery')
  assert.equal(rutaDeVista('cotizador'), '/trade-in')
  assert.equal(rutaDeVista('tradein-admin'), '/trade-in')
  assert.equal(rutaDeVista('equipo'), '/configuracion')
  assert.equal(rutaDeVista('no-existe'), null)
})

test('el slug nuevo resuelve la vista interna', () => {
  assert.equal(vistaDeRuta('ventas'), 'cargar')
  assert.equal(vistaDeRuta('pedidos'), 'pedidos')
  assert.equal(vistaDeRuta('delivery'), 'repartos')
  assert.equal(vistaDeRuta('configuracion'), 'equipo')
  assert.equal(vistaDeRuta('trade-in'), 'cotizador')
  assert.equal(vistaDeRuta('trade-in', { esOwner: true }), 'tradein-admin')
  assert.equal(vistaDeRuta('no-existe'), null)
})

test('las URLs viejas siguen teniendo destino y ninguna queda en /pos', () => {
  for (const id of Object.keys(RUTA_DE_VISTA)) {
    assert.ok(DESTINO_LEGADO[id], `falta /pos/${id} en el mapa de compatibilidad`)
  }
  assert.equal(DESTINO_LEGADO[''], '/ventas')
  assert.equal(DESTINO_LEGADO.cargar, '/ventas')
  assert.equal(DESTINO_LEGADO.tradein, '/trade-in')
  assert.equal(DESTINO_LEGADO.historial, '/configuracion/historial')
  for (const [origen, destino] of Object.entries(DESTINO_LEGADO)) {
    assert.ok(destino.startsWith('/') && !destino.startsWith('/pos'), `destino inválido para ${origen}: ${destino}`)
  }
})
