import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import './index.css'
import { installErrorTracking } from './lib/errorTracking'
import './lib/qrLogoFuente'
import { isNativeIOS } from './lib/plataforma'
import { mostrarApp, prepararNativo } from './lib/nativo/arranque'
import { instalarEnfoque } from './lib/enfoque'

const nativo = isNativeIOS()
instalarEnfoque()

if (import.meta.env.PROD) {
  installErrorTracking()
  // El service worker es solo de la web: en la app de iPhone la UI viaja
  // empaquetada y se actualiza con cada versión de la App Store.
  if (!nativo) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    })
  }
}

// En la app, antes del primer render se lee la versión y el Keychain para que
// el primer pedido ya salga con su Bearer.
const listo = nativo ? prepararNativo().catch((error) => console.error('[nativo] arranque:', error)) : Promise.resolve()

listo.then(() => {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>,
  )
  if (nativo) requestAnimationFrame(() => { mostrarApp() })
})
