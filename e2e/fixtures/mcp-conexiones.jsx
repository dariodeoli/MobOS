import React from 'react'
import { createRoot } from 'react-dom/client'
import { ToastProvider } from '../../src/components/ui/index.jsx'
import McpConexiones from '../../src/components/control/config/McpConexiones.jsx'
import '../../src/index.css'

// The fixture renders the same authenticated (non-demo) component used by
// Configuración. The test replaces useSesion with a deterministic tenant
// session and mocks only the MCP API responses.
createRoot(document.getElementById('root')).render(<ToastProvider><McpConexiones /></ToastProvider>)
