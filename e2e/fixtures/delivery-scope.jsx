import React from 'react'
import { createRoot } from 'react-dom/client'
import { ToastProvider } from '../../src/components/ui/index.jsx'
import DeliveryOperations from '../../src/components/delivery/DeliveryOperations.jsx'
import '../../src/index.css'

// El test reemplaza solo useSesion. La instancia del componente permanece
// montada al cambiar empresa/sucursal/usuario para reproducir cargas pendientes.
const root = createRoot(document.getElementById('root'))
const render = () => root.render(<ToastProvider><DeliveryOperations /></ToastProvider>)
window.setDeliveryFixtureSession = session => { window.deliveryFixtureSession = session; render() }
window.unmountDeliveryFixture = () => root.unmount()
render()
