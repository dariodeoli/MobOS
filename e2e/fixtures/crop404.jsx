import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import GaleriaFotosProducto from '../../src/components/productos/GaleriaFotosProducto.jsx'
import { invalidarSnapshotsPrivados } from '../../src/lib/offline/snapshot.js'
import { Modal } from '../../src/components/ui/index.jsx'
import { aplicarTema } from '../../src/lib/tema.js'
import '../../src/index.css'
aplicarTema(localStorage.getItem('mobos:theme') === 'dark')
function Fixture() {
  const [id, setId] = useState(new URLSearchParams(location.search).has('alta') ? null : 'fixture-product')
  const [editable, setEditable] = useState(true)
  const [items, setItems] = useState([])
  const galeria = <GaleriaFotosProducto productId={id} puedeEditar={editable} onChange={setItems} />
  return <main><button onClick={() => setId('otro-producto')}>Cambiar producto</button><button onClick={() => setEditable(false)}>Retirar permiso</button><button onClick={() => invalidarSnapshotsPrivados()}>Cambiar contexto</button><output data-testid="pendientes-locales">{items.length}</output>{new URLSearchParams(location.search).has('modal') ? <Modal open title={id ? 'Ficha de producto' : 'Nuevo producto'} onClose={() => {}}>{galeria}</Modal> : galeria}</main>
}
createRoot(document.getElementById('root')).render(<Fixture />)
