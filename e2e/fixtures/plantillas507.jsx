import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { SesionProvider, useSesion } from '../../src/lib/sesion'
import { ToastProvider, Button } from '../../src/components/ui'
import PlantillasImpresion from '../../src/components/control/PlantillasImpresion'
import EtiquetasProductoModal from '../../src/components/shared/EtiquetasProductoModal'
import EtiquetasStockPlantilla from '../../src/components/stock/EtiquetasStockPlantilla'
import TallerRack from '../../src/components/inventory/TallerRack'
import ComprobantePreview from '../../src/components/shared/ComprobantePreview'
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
const unidades = [1, 2].map(n => ({
  id: `unit-${n}`,
  serial: `35000000000000${n}`,
  condition: 'USED',
  product: { name: 'iPhone 15', model: 'iPhone 15' },
  supplier: { code: 'DEM', name: 'PRIVADO' },
  costPyg: 7,
}))
const orden = {
  id: 'pedido-507',
  orderNumber: 'QA-507-REAL',
  createdAt: '2026-10-15T12:00:00Z',
  status: 'PAID',
  totalPyg: 180000,
  paidPyg: 180000,
  items: [
    { description: 'Funda real del fixture', quantity: 1, unitPricePyg: 180000, totalPyg: 180000 },
  ],
  payments: [{ status: 'CONFIRMED', method: 'CASH', amountPyg: 180000 }],
  customer: { name: 'Cliente QA' },
}
function Fixture() {
  const { estado, actualizarEmpresa, empresa } = useSesion(),
    [open, setOpen] = useState(false),
    [stockOpen, setStockOpen] = useState(false),
    [receiptOpen, setReceiptOpen] = useState(false),
    [legacyCalls, setLegacyCalls] = useState(0)
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
      <Button onClick={() => setStockOpen(true)}>Etiquetas de Stock fixture</Button>
      <Button onClick={() => setReceiptOpen(true)}>Comprobante del pedido fixture</Button>
      <span data-testid="legacy-calls">{legacyCalls}</span>
      <TallerRack
        unidades={unidades}
        onEtiqueta={() => setLegacyCalls(n => n + 1)}
        onEtiquetasLote={() => setLegacyCalls(n => n + 1)}
      />
      {stockOpen && (
        <EtiquetasStockPlantilla
          filas={[...unidades, { sku: 'QA-CABLE', name: 'Cable QA', pricePyg: 50000, copies: 2 }]}
          onClose={() => setStockOpen(false)}
          onHabitual={() => setLegacyCalls(n => n + 1)}
        />
      )}
      <ComprobantePreview open={receiptOpen} onClose={() => setReceiptOpen(false)} order={orden} />
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
