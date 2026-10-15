import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { SesionProvider, useSesion } from '../../src/lib/sesion'
import { ToastProvider, Button } from '../../src/components/ui'
import CheckoutCustomer from '../../src/components/ventas/CheckoutCustomer'
import CustomerProfile from '../../src/components/customers/CustomerProfile'
import { checkoutBillingPayload } from '../../src/lib/checkoutIdentity'
import '../../src/index.css'

const client = { id: 'demo-fiscal-498', name: 'Cliente ficticio 498', demoProfile: { billingIdentities: [] } }
function Fixture() {
  const { esDemo, estado } = useSesion()
  const [value, setValue] = useState({ name: '', document: '', addresses: [] })
  const [billing, setBilling] = useState({ name: '', document: '' })
  const [open, setOpen] = useState(false)
  const [customer, setCustomer] = useState(client)
  useEffect(() => {
    const change = () => setCustomer({ ...client, id: 'otro-cliente-498', name: 'Otra ficha' })
    window.addEventListener('qa-cambiar-cliente', change)
    return () => window.removeEventListener('qa-cambiar-cliente', change)
  }, [])
  if (!esDemo || estado !== 'dentro') return <p>Inicializando demo fiscal</p>
  return <main className="mx-auto max-w-4xl p-4">
    <Button onClick={() => setOpen(true)}>Abrir ficha fiscal</Button>
    <Button onClick={() => setCustomer({ ...client, id: 'otro-cliente-498', name: 'Otra ficha' })}>Cambiar ficha</Button>
    <CheckoutCustomer value={value} onChange={setValue} esDemo billingTo={billing} onBillingChange={setBilling} />
    <output data-testid="estado-fiscal" className="sr-only">{JSON.stringify({ value, billing, payload: checkoutBillingPayload(billing) })}</output>
    <CustomerProfile customer={customer} open={open} onClose={() => setOpen(false)} tabInicial="datos" />
  </main>
}
createRoot(document.getElementById('root')).render(<BrowserRouter><SesionProvider><ToastProvider><Fixture /></ToastProvider></SesionProvider></BrowserRouter>)
