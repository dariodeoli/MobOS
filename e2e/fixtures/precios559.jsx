import React, { useCallback, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { SesionProvider, useSesion } from '../../src/lib/sesion'
import FormularioVenta from '../../src/components/ventas/FormularioVenta'
import PasoProductos from '../../src/components/ventas/venta/PasoProductos'
import { resources } from '../../src/lib/api'
import '../../src/index.css'

// Transport injection only: production components still own context and quote rendering.
resources.priceLists.pricing = async params => {
  const response = await fetch(`/api/pricing?${new URLSearchParams(params)}`)
  if (!response.ok) throw new Error('Synthetic pricing unavailable')
  return response.json()
}
function Fixture() {
  const session = useSesion()
  const [customer, setCustomer] = useState('A')
  const [variant, setVariant] = useState(null)
  const [stockMode, setStockMode] = useState('normal')
  const quote = useCallback(async ids => {
    const response = await resources.priceLists.pricing({ productIds: ids.join(','), customerId: customer, quantity: '1', branch: session.sucursal?.id || '' })
    return Object.fromEntries(Object.entries(response.prices || {}).map(([id, info]) => [id, { ...info, priceList: response.priceList }]))
  }, [customer, session.sucursal?.id])
  if (session.estado !== 'dentro') return <p>Preparando demo</p>
  const branches = session.sucursales
  const items = [{ id: 'p1', nombre: 'Equipo 559', modelo: '128 GB', stock: stockMode === 'invalid' ? false : stockMode === 'zero' ? 0 : 3, branchId: branches[0]?.id, activo: true, precioVenta: 999999 }, { id: 'p2', nombre: 'Equipo 559', modelo: '256 GB', stock: stockMode === 'invalid' ? ' ' : stockMode === 'zero' ? 0 : 2, branchId: branches[1]?.id, activo: true, precioVenta: 999999 }]
  const family = { base: 'Equipo 559', items }
  return <main className="p-3">
    <div className="mb-3 flex flex-wrap gap-3">
      <button onClick={() => setStockMode('invalid')}>Stock inválido</button><button onClick={() => setStockMode('zero')}>Stock cero</button><button onClick={() => setCustomer('A')}>Cliente A</button><button onClick={() => setCustomer('B')}>Cliente B</button>
      {branches.slice(0, 2).map((branch, i) => <button key={branch.id} onClick={() => session.cambiarSucursal(branch.id)}>Sucursal {i + 1}</button>)}
    </div>
    {new URLSearchParams(location.search).has('form') ? <FormularioVenta /> : <PasoProductos productos={items} familiasVisibles={[family]} resolverPreciosCatalogo={quote} contextoPreciosCatalogo={`${session.empresa?.id}:${session.sucursal?.id}:${customer}`} nuevoProd={false} nombreProd="" nuevoDetalles={{}} colorInput="" coloresNuevos={[]} combos={[]} setBusquedaProducto={() => {}} setAccesorio={() => {}} agregarProducto={() => {}} variantePara={variant} onElegirVariante={(value, options) => options?.elegir ? setVariant(null) : setVariant(value)} onCerrarVariante={() => setVariant(null)} />}
  </main>
}
createRoot(document.getElementById('root')).render(<BrowserRouter><SesionProvider><Fixture /></SesionProvider></BrowserRouter>)
