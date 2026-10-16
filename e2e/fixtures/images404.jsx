import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import FotoProducto from '../../src/components/shared/FotoProducto.jsx'
import { activarContextoSnapshots, invalidarSnapshotsPrivados } from '../../src/lib/offline/snapshot.js'
import { invalidarConsultas } from '../../src/lib/api/client.js'
import '../../src/index.css'

const source = '/api/products/fixture-product/images/fixture-image?size=thumb'
function Fixture() {
  const [instance, setInstance] = useState(0)
  return <main><button onClick={() => setInstance(n => n + 1)}>Volver a mostrar foto</button><FotoProducto key={instance} src={source} alt="Foto privada ficticia" size={64} /></main>
}
window.fixture404 = {
  source,
  async contexto(empresaId, rol = 'ADMIN', permisos = ['stock:read'], sucursalId = 'sucursal') {
    invalidarConsultas()
    await invalidarSnapshotsPrivados()
    if (empresaId) activarContextoSnapshots({ empresaId, sucursalId, userId: 'persona', rol, permisos })
  },
}
await window.fixture404.contexto('A')
createRoot(document.getElementById('root')).render(<Fixture />)
