import { useEffect, useState } from 'react'
import { Aviso, Button, useToast, useValidacionCampos } from '@/components/ui'
import { Modal } from '@/components/shared/popupKit'
import { obligatorio } from 'owncoding-ui/utils'
import { PIE_ACCIONES } from '@/components/shared/formulario'
import { api } from '@/lib/api/client'
import { asignarClienteVenta } from '@/lib/storage'
import { actualizarClienteDemo, buscarClienteDemo } from '@/lib/demoClientes'
import CheckoutCustomer from './CheckoutCustomer'

// Cliente ocasional (#149): asignar o cambiar la ficha del pedido, y crear la
// ficha en un clic reutilizando el buscador y el alta rápida del POS.
const clienteVacio = () => ({ id: undefined, name: '', phone: '', countryCode: '+595', email: '', document: '', pricingTier: 'RETAIL', priceListId: null, creditLimitPyg: null, creditDays: null, addresses: [], billingName: '', billingDocument: '' })

export default function ClienteDelPedidoModal({ open, modo = 'asignar', order, onClose, onSaved, esDemo = false }) {
  const toast = useToast()
  const [valor, setValor] = useState(clienteVacio())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // #323: el nombre se valida junto al campo y cerrar con datos cargados pide
  // confirmación antes de descartarlos.
  const { errorDe, validar, limpiar } = useValidacionCampos({
    nombre: [obligatorio('Escribí el nombre del cliente.')],
  })
  const sucio = Boolean(open) && !valor.id && JSON.stringify(valor) !== JSON.stringify(clienteVacio())

  useEffect(() => {
    if (!open) return
    setValor(clienteVacio())
    setBusy(false)
    setError('')
  }, [open, modo, order?.id])

  async function guardar() {
    if (busy || !order?.id) return
    if (!validar({ nombre: valor.name }).valido) return
    setBusy(true); setError('')
    try {
      if (esDemo) {
        // Demo: la ficha se busca o se crea en la sesión y el pedido pasa a ella.
        const ficha = valor.id
          ? buscarClienteDemo(valor.id)
          : actualizarClienteDemo({ id: `demo-cliente-${Date.now().toString(36)}`, name: valor.name.trim(), phone: valor.phone || '', countryCode: valor.countryCode || '+595', email: valor.email || '', document: valor.document || '', pricingTier: 'RETAIL', createdAt: new Date().toISOString() })
        if (!ficha) throw new Error('No se encontró la ficha del cliente.')
        asignarClienteVenta(order.id, ficha)
        toast.success(valor.id ? 'Cliente vinculado al pedido' : 'Ficha creada desde el pedido', ficha.name)
      } else if (valor.id) {
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
    <Modal open={open} onClose={() => !busy && onClose?.()} dirty={sucio} busy={busy} title={modo === 'crear' ? 'Crear ficha desde el pedido' : (order?.customer?.id ? 'Cambiar cliente' : 'Asignar cliente')} size="amplio">
      <div className="space-y-4" data-testid="cliente-del-pedido">
        <p className="text-sm text-mute">
          Buscá por nombre, teléfono, CI/RUC o correo, o cargá los datos para crear una ficha nueva. Los precios cobrados no cambian; el pedido pasa a la cronología del cliente nuevo y el cambio queda auditado.
        </p>
        <CheckoutCustomer value={valor} onChange={(siguiente) => { limpiar('nombre'); setValor(siguiente) }} esDemo={esDemo} errorNombre={errorDe('nombre')} />
        {valor.id && valor.name && (
          <Aviso tono="info" className="rounded-xl p-3 text-xs">
            Se vincula la ficha existente <b>{valor.name}</b>. Para crear una nueva, limpiá la búsqueda y cargá los datos.
          </Aviso>
        )}
        {error && <Aviso tono="error" className="rounded-xl p-3 text-sm">{error}</Aviso>}
        <div className={PIE_ACCIONES}>
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>Cancelar</Button>
          <Button type="button" disabled={busy} data-testid="cliente-del-pedido-guardar" onClick={guardar}>
            {busy ? 'Guardando…' : valor.id ? 'Vincular esta ficha' : 'Crear ficha y vincular'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
