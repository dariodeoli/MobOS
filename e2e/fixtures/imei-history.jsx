import React from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { ToastProvider } from '../../src/components/ui/index.jsx'
import UnidadDetalle from '../../src/components/inventory/UnidadDetalle.jsx'
import '../../src/index.css'

// Authenticated synthetic unit; requests are intercepted locally by the test.
const unit = {
  id: 'imei-history-fixture', productId: 'imei-history-product', serial: '111111111111119',
  status: 'AVAILABLE', condition: 'USED', costPyg: 0, branchId: 'fixture-branch', notes: '',
  product: { id: 'imei-history-product', name: 'iPhone fixture', model: 'iPhone 15', capacity: '128GB', color: 'Negro', pricePyg: 1 },
}
createRoot(document.getElementById('root')).render(<MemoryRouter><ToastProvider><UnidadDetalle unit={unit} canManage onClose={() => {}} /></ToastProvider></MemoryRouter>)
