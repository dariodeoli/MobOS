import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const leer = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8')

// Una vista lazy que falla al descargar (red cortada) no puede desmontar el
// shell: sin límite de error React deja la página en blanco (CI #349).
test('el límite de error captura fallos de render y registra el error', () => {
  const fuente = leer('./VistaErrorBoundary.jsx')
  assert.match(fuente, /getDerivedStateFromError/)
  assert.match(fuente, /console\.error\(/)
  assert.match(fuente, /role="alert"/)
})

test('PanelVendedor envuelve el Suspense de las vistas con el límite, dentro del shell', () => {
  const fuente = leer('../../pages/PanelVendedor.jsx')
  assert.match(
    fuente,
    /<AppShell[\s\S]*<main[\s\S]*<VistaErrorBoundary resetKey=\{vista\}>\s*<Suspense fallback=\{<VistaCargando \/>\}>/,
  )
})
