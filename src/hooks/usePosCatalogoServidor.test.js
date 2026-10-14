// #354: el POS pagina y busca en el servidor y cae al catálogo local sin conexión.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const hook = readFileSync(new URL('./usePosCatalogoServidor.js', import.meta.url), 'utf8')
const api = readFileSync(new URL('../lib/api/index.js', import.meta.url), 'utf8')
const formulario = readFileSync(new URL('../components/ventas/FormularioVenta.jsx', import.meta.url), 'utf8')
const paso = readFileSync(new URL('../components/ventas/venta/PasoProductos.jsx', import.meta.url), 'utf8')

test('el recurso products.page pide /api/products con page, pageSize y q', () => {
  assert.match(api, /page: \(\{ q = '', page = 1, pageSize = 16, accessoryCategory = '' \} = \{\}/)
  assert.match(api, /accessoryCategory \? \{ accessoryCategory \} : \{\}/)
  assert.match(api, /\/api\/products\?\$\{new URLSearchParams\(\{ page: String\(page\), pageSize: String\(pageSize\)/)
})

test('la búsqueda tiene debounce y vuelve a la página 1', () => {
  assert.match(hook, /POS_DEBOUNCE_MS = 300/)
  assert.match(hook, /setTimeout\(\(\) => \{\s+setConsulta\(limpia\)\s+setPagina\(1\)/)
  assert.match(hook, /POS_TAMANO_PAGINA = 16/)
})

test('sin conexión o con error el hook se apaga y el POS usa el catálogo local', () => {
  assert.match(hook, /navigator\.onLine !== false/)
  assert.match(hook, /addEventListener\('offline'/)
  assert.match(hook, /\.catch\(\(\) => \{[^}]*setFallo\(true\)/s)
  assert.match(hook, /const activo = Boolean\(habilitado && conexion && !fallo && datos\)/)
})

test('el POS solo usa el servidor en cuenta real y conserva la lista completa para el resto', () => {
  assert.match(formulario, /habilitado: !esDemo && modoDatosActual\(\) === 'api'/)
  assert.match(formulario, /familiasVisibles=\{familiasServidor \?\? familiasVisibles\}/)
  assert.match(formulario, /const productos = getProductos\(\)\.filter\(p => p\.activo\)/)
})

test('PasoProductos ofrece Anterior / Siguiente de 44px con la página del servidor', () => {
  assert.match(paso, /data-testid="pos-catalogo-anterior"/)
  assert.match(paso, /data-testid="pos-catalogo-siguiente"/)
  assert.equal((paso.match(/min-h-11 min-w-11/g) || []).length, 2)
  assert.match(paso, /Página \$\{catalogoServidor\.pagina\} de \$\{catalogoServidor\.paginas\}/)
})
