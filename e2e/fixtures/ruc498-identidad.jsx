import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { SesionProvider, useSesion } from '../../src/lib/sesion'
import { ToastProvider, Button } from '../../src/components/ui'
import IdentidadCuenta from '../../src/components/control/config/IdentidadCuenta'
import DatosPrivados from '../../src/components/control/DatosPrivados'
import PaymentAccounts from '../../src/components/control/PaymentAccounts'
import CheckoutCustomer from '../../src/components/ventas/CheckoutCustomer'
import CustomerProfile from '../../src/components/customers/CustomerProfile'
import { checkoutBillingPayload } from '../../src/lib/checkoutIdentity'
import '../../src/index.css'

const client = { id: 'demo-fiscal-498', name: 'Cliente ficticio 498', demoProfile: { billingIdentities: [] } }
function Fixture() {
  const { esDemo, estado, empresa, actualizarEmpresa } = useSesion()
  const [value, setValue] = useState({ name: '', document: '', addresses: [] })
  const [billing, setBilling] = useState({ name: '', document: '' })
  const [open, setOpen] = useState(false)
  const [configRevision, setConfigRevision] = useState(0)
  const [verCuentas, setVerCuentas] = useState(false)
  const [customer, setCustomer] = useState(client)
  useEffect(() => {
    const change = () => setCustomer({ ...client, id: 'otro-cliente-498', name: 'Otra ficha' })
    window.addEventListener('qa-cambiar-cliente', change)
    return () => window.removeEventListener('qa-cambiar-cliente', change)
  }, [])
  if (!esDemo || estado !== 'dentro') return <p>Inicializando demo fiscal</p>
  if (new URLSearchParams(location.search).get('vista') === 'partes-cuentas') return <main className="mx-auto max-w-4xl p-4">
    <Button onClick={() => actualizarEmpresa({ id: 'empresa-qa-498' })}>Cambiar a empresa QA</Button>
    <output data-testid="empresa-activa">{empresa?.id}</output>
    <Button onClick={() => setVerCuentas(false)}>Abrir datos privados</Button>
    <Button onClick={() => setVerCuentas(true)}>Abrir cuentas</Button>
    {verCuentas ? <PaymentAccounts /> : <DatosPrivados />}
  </main>
  if (new URLSearchParams(location.search).get('vista') === 'config') return <main className="mx-auto max-w-4xl p-4">
    <Button onClick={() => setConfigRevision(value => value + 1)}>Reabrir configuración</Button>
    <section key={configRevision} data-testid="config-fiscal-demo">
      <IdentidadCuenta tenant={{ id: 'mobos-demo' }} />
      <DatosPrivados />
    </section>
  </main>
  return <main className="mx-auto max-w-4xl p-4">
    <Button onClick={() => setOpen(true)}>Abrir ficha fiscal</Button>
    <Button onClick={() => setCustomer({ ...client, id: 'otro-cliente-498', name: 'Otra ficha' })}>Cambiar ficha</Button>
    <CheckoutCustomer value={value} onChange={setValue} esDemo billingTo={billing} onBillingChange={setBilling} />
    <output data-testid="estado-fiscal" className="sr-only">{JSON.stringify({ value, billing, payload: checkoutBillingPayload(billing) })}</output>
    <CustomerProfile customer={customer} open={open} onClose={() => setOpen(false)} tabInicial="datos" />
  </main>
}
createRoot(document.getElementById('root')).render(<BrowserRouter><SesionProvider><ToastProvider><Fixture /></ToastProvider></SesionProvider></BrowserRouter>)
