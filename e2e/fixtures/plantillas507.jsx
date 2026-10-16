import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { SesionProvider, useSesion } from '../../src/lib/sesion'
import { ToastProvider, Button } from '../../src/components/ui'
import PlantillasImpresion from '../../src/components/control/PlantillasImpresion'
import EtiquetasProductoModal from '../../src/components/shared/EtiquetasProductoModal'
import '../../src/index.css'
document.documentElement.classList.toggle(
  'dark',
  new URLSearchParams(location.search).get('tema') === 'dark',
)
const productos = [
  {
    id: 'qa507',
    name: 'iPhone 15 · 128 GB Azul',
    sku: 'QA-507-001',
    precioPyg: 4850000,
    costPyg: 7,
    supplierName: 'PROVEEDOR PRIVADO',
  },
]
function Fixture() {
  const { estado, actualizarEmpresa, empresa } = useSesion(),
    [open, setOpen] = useState(false)
  if (estado !== 'dentro') return <p>Inicializando demo</p>
  return (
    <main className="mx-auto max-w-5xl p-4 space-y-4">
      <Button className="min-h-11" onClick={() => setOpen(true)}>
        Etiquetar producto real del fixture
      </Button>
      <Button
        className="min-h-11"
        onClick={() =>
          actualizarEmpresa({ id: empresa.id === 'mobos-demo' ? 'empresa-B' : 'mobos-demo' })
        }
      >
        Cambiar empresa fixture
      </Button>
      <PlantillasImpresion />
      <EtiquetasProductoModal
        open={open}
        onClose={() => setOpen(false)}
        productos={productos}
        seleccionInicial={['qa507']}
      />
    </main>
  )
}
createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <SesionProvider>
      <ToastProvider>
        <Fixture />
      </ToastProvider>
    </SesionProvider>
  </BrowserRouter>,
)
