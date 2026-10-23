import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import PantallaBloqueada from '../../src/components/app/PantallaBloqueada.jsx'
import '../../src/index.css'
function Prueba() {
 const caso = new URLSearchParams(location.search).get('estado')
 const [pin, setPin] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [abierto, setAbierto] = useState(true), [intentos, setIntentos] = useState(0), [identificado, setIdentificado] = useState(caso === 'exito' ? { id: 'u2', name: 'Lucía Gómez' } : null)
 function cambiar(next) {
  setPin(next); setError('')
  if (next.length !== 4) return
  setIntentos(n=>n+1); setBusy(true)
  setTimeout(()=>{ setBusy(false); setPin(''); if(next === '3001') { setIdentificado({ id: 'u2', name: 'Lucía Gómez' }); setTimeout(()=>{ setAbierto(false); setIdentificado(null) }, 400) } else setError('PIN inválido. Probá de nuevo.') }, 100)
 }
 return <><output data-testid="intentos">{intentos}</output><button type="button" onClick={()=>{setAbierto(true);setPin('')}}>Volver a bloquear</button><PantallaBloqueada abierto={abierto} empresa="Mi tienda" sucursal="Asunción" usuario={{id:'demo',name:'Dario'}} tecladoTactil pin={pin} onPinChange={cambiar} error={error} busy={busy || caso === 'busy'} identificado={identificado} faceId={caso === 'faceid' ? {onReintentar:()=>{}} : null} esDemo onCambiarUsuario={()=>{}} onSalir={()=>{}} /></>
}
createRoot(document.getElementById('root')).render(<Prueba />)
