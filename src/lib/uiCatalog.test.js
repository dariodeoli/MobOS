import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const raiz = fileURLToPath(new URL('../..', import.meta.url))
const leer = ruta => readFileSync(new URL(ruta, `file://${raiz}/`), 'utf8')

test('la biblioteca visual existe solo en el entorno de desarrollo', () => {
  const app = leer('src/App.jsx')
  assert.match(app, /import\.meta\.env\.DEV && window\.location\.pathname === '\/biblioteca-ui'/)
  assert.match(app, /if \(import\.meta\.env\.DEV\) BibliotecaUI = lazy\(\(\) => import\('\@\/pages\/preview\/BibliotecaUI'\)\)/)
})

test('el catálogo compone objetos compartidos sin integrar lógica de negocio', () => {
  const catalogo = leer('src/pages/preview/BibliotecaUI.jsx')
  for (const componente of ['Button', 'IconAction', 'Input', 'EmailField', 'PhoneField', 'RucField', 'Select', 'PasswordInput', 'DataTable', 'Modal', 'Stat', 'EmptyState', 'ErrorState', 'Skeleton', 'Aviso']) {
    assert.match(catalogo, new RegExp(`\\b${componente}\\b`), `debe mostrar ${componente}`)
  }
  assert.match(catalogo, /from '\@\/components\/ui'/)
  assert.match(catalogo, /from '\@\/components\/shared\/Avatar'/)
  assert.doesNotMatch(catalogo, /@\/lib\/api|fetch\s*\(|axios|localStorage|sessionStorage/)
  assert.match(catalogo, /ejemplos son ficticios/)
})

test('el catálogo contempla tema claro/oscuro y grilla adaptable', () => {
  const catalogo = leer('src/pages/preview/BibliotecaUI.jsx')
  assert.match(catalogo, /setOscuro\(valor => !valor\)/)
  assert.match(catalogo, /document\.documentElement\.classList\.toggle\('dark', temaOriginal\)/)
  assert.match(catalogo, /sm:grid-cols-2/)
  assert.match(catalogo, /lg:grid-cols-2/)
  assert.match(catalogo, /overflow-x-auto/)
})
