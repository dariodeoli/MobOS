import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { sessionApi } from '../../src/lib/api/session.js'
import { usarAlmacen } from '../../src/lib/api/nativo.js'
import { SesionProvider } from '../../src/lib/sesion.jsx'
import Login from '../../src/pages/Login.jsx'
import { aplicarTema } from '../../src/lib/tema.js'
import '../../src/index.css'
const ios = new URLSearchParams(location.search).get('plataforma') === 'ios'
Capacitor.getPlatform = () => ios ? 'ios' : 'web'
Capacitor.isNativePlatform = () => ios
const memoria = new Map()
usarAlmacen({ get: async key => memoria.get(key), set: async (key, value) => memoria.set(key, value), remove: async key => memoria.delete(key) })
document.documentElement.classList.toggle('app-ios', ios)
aplicarTema(localStorage.getItem('mobos:theme') === 'dark')
// Observación pasiva sólo para QA de desmontaje: devuelve exactamente la
// promesa del cliente real y no cambia argumentos, resultados ni errores.
if (new URLSearchParams(location.search).has('observarOAuth')) {
  const completar = sessionApi.completeGoogle
  let finalizados = 0
  const registrar = resultado => {
    document.documentElement.dataset.oauthFinalizado = String(++finalizados)
    document.documentElement.dataset.oauthResultado = resultado
  }
  sessionApi.completeGoogle = (...args) => {
    const pendiente = completar(...args)
    pendiente.then(() => registrar('OK'), error => registrar(error?.code || 'ERROR'))
    return pendiente
  }
}
function Fixture() {
  const [visible, setVisible] = React.useState(true)
  const desmontable = new URLSearchParams(location.search).has('desmontable')
  return <BrowserRouter><SesionProvider>{desmontable && <button type="button" data-testid="desmontar-login" onClick={() => setVisible(false)}>Desmontar acceso de prueba</button>}{visible && <Login />}</SesionProvider></BrowserRouter>
}
const Contenedor = new URLSearchParams(location.search).has('strict') ? React.StrictMode : React.Fragment
createRoot(document.getElementById('root')).render(<Contenedor><Fixture /></Contenedor>)
