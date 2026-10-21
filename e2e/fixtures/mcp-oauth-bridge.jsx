import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import McpAutorizar from '../../src/components/auth/McpAutorizar.jsx'
import '../../src/index.css'

createRoot(document.getElementById('root')).render(
  <BrowserRouter><McpAutorizar /></BrowserRouter>,
)
