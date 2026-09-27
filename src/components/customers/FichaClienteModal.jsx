import { useEffect, useState } from 'react'
import { Aviso, Button, Modal, useToast } from '@/components/ui'
import { PIE_ACCIONES } from '@/components/shared/formulario'
import CheckoutCustomer from '@/components/ventas/CheckoutCustomer'
import { resources } from '@/lib/api'

// Alta rápida de una ficha sin salir del flujo (#260): reutiliza el buscador y
// el formulario del POS. Si el contacto ya tenía ficha, la devuelve.
const clienteVacio = (nombre = '') => ({ id: undefined, name: nombre, phone: '', countryCode: '+595', email: '', document: '', pricingTier: 'RETAIL', priceListId: null, creditLimitPyg: null, creditDays: null, addresses: [], billingName: '', billingDocument: '' })

export default function FichaClienteModal({ open, nombreInicial = '', onClose, onCreada }) {
  const toast = useToast()
  const [valor, setValor] = useState(clienteVacio())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setValor(clienteVacio(nombreInicial))
    setBusy(false)
    setError('')
  }, [open, nombreInicial])

  async function guardar() {
    if (busy) return
    if (valor.id) { onCreada?.({ id: valor.id, name: valor.name }); return }
    setBusy(true); setError('')
    try {
      const ficha = await resources.customers.create({ name: valor.name, phone: valor.phone, countryCode: valor.countryCode, email: valor.email, document: valor.document })
      toast.success('Ficha creada', ficha?.name || valor.name)
      onCreada?.(ficha)
    } catch (cause) {
      setError(cause?.message || 'No se pudo crear la ficha.')
    } finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={() => !busy && onClose?.()} title="Crear ficha del cliente" size="amplio">
      <div className="space-y-4" data-testid="ficha-cliente">
        <p className="text-sm text-mute">
          Buscá una ficha existente o cargá los datos para crear una nueva sin salir de la cotización. Si el teléfono o el CI/RUC ya existen, se reutiliza la ficha.
        </p>
        <CheckoutCustomer value={valor} onChange={setValor} esDemo={false} />
        {valor.id && valor.name && <Aviso tono="info" className="rounded-xl p-3 text-xs">Ya existe la ficha <b>{valor.name}</b>: se va a usar esa.</Aviso>}
        {error && <Aviso tono="error" className="rounded-xl p-3 text-sm">{error}</Aviso>}
        <div className={PIE_ACCIONES}>
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>Cancelar</Button>
          <Button type="button" disabled={busy || !String(valor.name || '').trim()} data-testid="ficha-cliente-guardar" onClick={guardar}>
            {busy ? 'Guardando…' : valor.id ? 'Usar esta ficha' : 'Crear ficha'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
