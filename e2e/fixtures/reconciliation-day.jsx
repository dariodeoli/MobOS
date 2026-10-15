import React from 'react'
import { createRoot } from 'react-dom/client'
import { ToastProvider } from '../../src/components/ui/index.jsx'
import ConciliacionDia from '../../src/components/control/ConciliacionDia.jsx'
import '../../src/index.css'
const root = createRoot(document.getElementById('root'))
window.setDaySession = value => { window.daySession = value; render() }
function render() { root.render(<ToastProvider><ConciliacionDia /></ToastProvider>) }
render()
