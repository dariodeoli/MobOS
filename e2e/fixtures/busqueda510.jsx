import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { SesionProvider, useSesion } from '../../src/lib/sesion'
import GlobalSearch from '../../src/components/app/GlobalSearch'
import '../../src/index.css'
function Fixture() {
  const { estado } = useSesion(),
    [destination, setDestination] = useState('')
  const params = new URLSearchParams(location.search),
    role = params.get('role') || 'VENDEDOR'
  const vistas =
    role === 'ADMIN'
      ? ['clientes', 'productos', 'pedidos', 'cotizaciones', 'garantias', 'compras', 'inventario']
      : role === 'TECNICO'
        ? ['servicio']
        : ['clientes', 'productos', 'pedidos', 'cotizaciones']
  const vistasActuales =
    params.get('vistas') === 'null'
      ? null
      : params.get('vistas') === 'undefined'
        ? undefined
        : vistas
  if (estado !== 'dentro') return <p>Preparando sesión ficticia</p>
  return (
    <>
      <output data-testid="destino">{destination}</output>
      <GlobalSearch
        open
        onClose={() => {}}
        vistas={vistasActuales}
        esOwner={role === 'ADMIN'}
        onNavigate={(view, values) => setDestination(JSON.stringify({ view, values }))}
      />
    </>
  )
}
createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <SesionProvider>
      <Fixture />
    </SesionProvider>
  </BrowserRouter>,
)
