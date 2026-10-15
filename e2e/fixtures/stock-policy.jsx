import React from 'react'
import { createRoot } from 'react-dom/client'
import { ToastProvider } from '../../src/components/ui/index.jsx'
import PoliticaVerificacion from '../../src/components/stock/PoliticaVerificacion.jsx'
import '../../src/index.css'
createRoot(document.getElementById('root')).render(<ToastProvider><PoliticaVerificacion /></ToastProvider>)
