// Pruebas del mapa categoría→icono (#242): normalización del texto libre
// actual, alias y accesorios que mencionan un equipo.
import test from 'node:test'
import assert from 'node:assert/strict'

const { CATEGORIAS_PRODUCTO, ICONO_CATEGORIA, categoriaDe, etiquetaDeCategoria, iconoDeCategoria, normalizarCategoria } = await import('./categorias.js')

test('las categorías controladas tienen etiqueta e icono', () => {
  assert.deepEqual(CATEGORIAS_PRODUCTO.map(({ clave }) => clave), ['iphone', 'macbook', 'ipad', 'watch', 'airpods', 'accesorios', 'servicio', 'otro'])
  assert.deepEqual(ICONO_CATEGORIA, {
    iphone: 'mobile', macbook: 'laptop', ipad: 'tablet', watch: 'watch',
    airpods: 'buds', accesorios: 'cable', servicio: 'wrench', otro: 'box',
  })
})

test('normaliza el texto libre de categorías y nombres a la categoría canónica', () => {
  assert.equal(categoriaDe('iPhone'), 'iphone')
  assert.equal(categoriaDe('  CELULAR '), 'iphone')
  assert.equal(categoriaDe('MacBook Pro 14'), 'macbook')
  assert.equal(categoriaDe('mac → laptop'), 'macbook')
  assert.equal(categoriaDe('iPad Air'), 'ipad')
  assert.equal(categoriaDe('Apple Watch Series 9'), 'watch')
  assert.equal(categoriaDe('AirPods Pro'), 'airpods')
  assert.equal(categoriaDe('auriculares'), 'airpods')
  assert.equal(categoriaDe('Accesorios'), 'accesorios')
  assert.equal(categoriaDe('Servicio técnico'), 'servicio')
  assert.equal(categoriaDe(''), 'otro')
  assert.equal(categoriaDe('ZZZ'), 'otro')
})

test('un accesorio que menciona un equipo sigue siendo accesorio', () => {
  assert.equal(categoriaDe('Funda iPhone 15'), 'accesorios')
  assert.equal(categoriaDe('Cable USB-C a Lightning'), 'accesorios')
  assert.equal(categoriaDe('Vidrio templado iPad'), 'accesorios')
  assert.equal(categoriaDe('Cargador MacBook 96W'), 'accesorios')
})

test('el icono y la etiqueta salen del mapa', () => {
  assert.equal(iconoDeCategoria('MacBook'), 'laptop')
  assert.equal(iconoDeCategoria('Funda iPhone'), 'cable')
  assert.equal(etiquetaDeCategoria('celular'), 'iPhone')
  assert.equal(etiquetaDeCategoria('nada conocido'), 'Otro')
  assert.equal(normalizarCategoria('watch').icono, 'watch')
})
