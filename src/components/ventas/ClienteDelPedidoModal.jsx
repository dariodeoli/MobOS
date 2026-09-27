import { useEffect, useState } from 'react'
import { Aviso, Button, Modal, useToast } from '@/components/ui'
import { PIE_ACCIONES } from '@/components/shared/formulario'
import { api } from '@/lib/api/client'
import CheckoutCustomer from './CheckoutCustomer'

// Cliente ocasional (#149): asignar o cambiar la ficha del pedido, y crear la
// ficha en un clic reutilizando el buscador y el alta rápida del POS.
const clienteVacio = () => ({ id: undefined, name: '', phone: '', countryCode: '+595', email: '', document: '', pricingTier: 'RETAIL', priceListId: null, creditLimitPyg: null, creditDays: null, addresses: [], billingName: '', billingDocument: '' })

export default function ClienteDelPedidoModal({ open, modo = 'asignar', order, onClose, onSaved }) {
  const toast = useToast()
  const [valor, setValor] = useState(clienteVacio())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setValor(clienteVacio())
    setBusy(false)
    setError('')
  }, [open, modo, order?.id])

  async function guardar() {
    if (busy || !order?.id) return
    setBusy(true); setError('')
    try {
      if (valor.id) {
        await api.patch(`/api/orders/${encodeURIComponent(order.id)}`, { action: 'setCustomer', customerId: valor.id })
        toast.success('Cliente vinculado al pedido', valor.name)
      } else {
        const { customer } = await api.patch(`/api/orders/${encodeURIComponent(order.id)}`, { action: 'createCustomer', customer: { name: valor.name, phone: valor.phone, countryCode: valor.countryCode, email: valor.email, document: valor.document } })
        toast.success('Ficha creada desde el pedido', customer?.name || valor.name)
      }
      onSaved?.()
    } catch (cause) {
      setError(cause?.message || 'No se pudo guardar el cliente del pedido.')
    } finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={() => !busy && onClose?.()} title={modo === 'crear' ? 'Crear ficha desde el pedido' : 'Cliente del pedido'} size="amplio">
      <div className="space-y-4" data-testid="cliente-del-pedido">
        <p className="text-sm text-mute">
          Buscá una ficha existente o cargá los datos para crear una nueva. El pedido queda vinculado y el cambio queda en la cronología y la auditoría.
        </p>
        <CheckoutCustomer value={valor} onChange={setValor} esDemo={false} />
        {valor.id && valor.name && (
          <Aviso tono="info" className="rounded-xl p-3 text-xs">
            Se vincula la ficha existente <b>{valor.name}</b>. Para crear una nueva, limpiá la búsqueda y cargá los datos.
          </Aviso>
        )}
        {error && <Aviso tono="error" className="rounded-xl p-3 text-sm">{error}</Aviso>}
        <div className={PIE_ACCIONES}>
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>Cancelar</Button>
          <Button type="button" disabled={busy || !String(valor.name || '').trim()} data-testid="cliente-del-pedido-guardar" onClick={guardar}>
            {busy ? 'Guardando…' : valor.id ? 'Vincular esta ficha' : 'Crear ficha y vincular'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
