import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
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
function Fixture() {
  const [visible, setVisible] = React.useState(true)
  const desmontable = new URLSearchParams(location.search).has('desmontable')
  return <BrowserRouter><SesionProvider>{desmontable && <button type="button" data-testid="desmontar-login" onClick={() => setVisible(false)}>Desmontar acceso de prueba</button>}{visible && <Login />}</SesionProvider></BrowserRouter>
}
const Contenedor = new URLSearchParams(location.search).has('strict') ? React.StrictMode : React.Fragment
createRoot(document.getElementById('root')).render(<Contenedor><Fixture /></Contenedor>)
