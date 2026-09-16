import { useState } from 'react'
import { useSesion } from '@/lib/sesion'
import { listVentas, productosById } from '@/lib/storage'
import { gs } from '@/utils/calculos'
import { Button, Input, Select } from '@/components/ui'
import { SellerFeedback, SellerSection, useSellerData } from './SellerData'
import { api } from '@/lib/api/client'
import { printOrderReceipt } from '@/components/shared/OrderReceipt'

export const orderFields = (row) => ({
  id: row.id, sellerId: row.sellerId ?? row.vendedorId,
  number: row.orderNumber || row.codigo || row.id,
  customer: row.customer?.name || row.cliente || 'Sin cliente',
  date: row.createdAt || row.creadoEn || row.fecha,
  status: row.status || 'REGISTERED', paymentStatus: row.estadoPago || (Array.isArray(row.payments) ? (() => {
    const paid = row.payments.filter(p => p.status === 'CONFIRMED').reduce((sum, p) => sum + Number(p.amountPyg || 0), 0)
    return paid >= row.totalPyg ? 'Pagado' : paid > 0 ? 'Parcial' : 'Pendiente'
  })() : ''),
  total: row.totalPyg ?? row.total ?? row.precio, productId: row.productoId,
  products: Array.isArray(row.items) ? row.items.map((item) => item.description).filter(Boolean).join(', ') : row.productoNombre || '',
  fulfillmentStatus: row.fulfillmentStatus || row.entrega || 'PROCESSING', deliveryType: row.deliveryType, publicToken: row.publicToken,
  items: row.items || [], payments: row.payments || row.pagos || [], subtotalPyg: row.subtotalPyg, discountPyg: row.discountPyg, deliveryPyg: row.deliveryPyg,
})
const STATUS = { PENDING: 'Pendiente', COMPLETED: 'Completado', CANCELLED: 'Cancelado', REGISTERED: 'Registrado' }
const FULFILLMENT = { PROCESSING: 'Preparando', IN_TRANSIT: 'En camino', READY_FOR_PICKUP: 'Listo para retirar', DELIVERED: 'Entregado' }

export default function SellerOrders() {
  const { sesion, esDemo, usuario } = useSesion()
  const [query, setQuery] = useState('')
  const [savingId, setSavingId] = useState('')
  const [actionError, setActionError] = useState('')
  const products = esDemo ? productosById() : {}
  const data = useSellerData('/api/orders', orderFields, listVentas, esDemo)
  const veTodos = ['ADMIN', 'GERENTE'].includes(sesion?.rol || usuario?.role)
  const esAdminVentas = Boolean(sesion?.esPropietario || veTodos)
  const rows = data.rows.filter((row) => !veTodos && Boolean(sesion?.vendedorId) ? row.sellerId === sesion.vendedorId : true)
    .map((row) => ({ ...row, products: row.products || products[row.productId]?.nombre || products[row.productId]?.name || '' }))
    .filter((row) => `${row.number} ${row.customer} ${row.products}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
  async function updateFulfillment(row, fulfillmentStatus) {
    if (esDemo || savingId) return
    setSavingId(row.id); setActionError('')
    try { await api.patch(`/api/orders/${encodeURIComponent(row.id)}`, { fulfillmentStatus }); await data.refresh() } catch (error) { setActionError(error.message || 'No se pudo actualizar la entrega.') } finally { setSavingId('') }
  }
  return <SellerSection title={esAdminVentas ? 'Pedidos' : 'Mis pedidos'} description={esAdminVentas ? 'Todos los pedidos de la tienda, con su estado y entrega. La API devuelve hasta 100 pedidos recientes.' : 'Consultá los pedidos registrados con tu usuario y su estado. La API devuelve hasta 100 pedidos recientes.'}>
    <div className="flex gap-2"><Input aria-label="Buscar en mis pedidos" placeholder="Pedido, cliente o producto" value={query} onChange={(event) => setQuery(event.target.value)} />
      <Button onClick={data.refresh} disabled={data.loading}>Actualizar</Button></div>
    <SellerFeedback {...data} empty={!rows.length} />
    {actionError && <p role="alert" className="mt-3 text-sm text-red-300">{actionError}</p>}
    {!data.loading && !data.error && <ul className="space-y-3">{rows.map((row) => <li key={row.id} className="break-words rounded-2xl border border-fore/10 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">{row.number}</h2>
        <span className="rounded-full border border-fono/30 bg-fono/10 px-3 py-1 text-xs text-fono-light">{STATUS[row.status] || 'Estado no informado'}</span></div>
      <p className="mt-3">{row.customer}</p><p className="mt-1 text-mute">{row.products || 'Sin detalle de productos'}</p>
      <p className="mt-3 font-semibold text-fono-light">Total del pedido: {row.total != null && Number.isFinite(Number(row.total)) ? gs(row.total) : 'No disponible'}</p>
      {row.paymentStatus && <p className="mt-2 text-sm text-mute">Pago: {row.paymentStatus}</p>}
      <p className="mt-2 text-sm text-mute">Entrega: <strong className="text-fono-light">{FULFILLMENT[row.fulfillmentStatus] || row.fulfillmentStatus}</strong></p>
      <p className="mt-3 text-xs text-mute">{row.date && !Number.isNaN(Date.parse(row.date)) ? new Date(row.date).toLocaleDateString('es-PY') : 'Fecha no disponible'}</p>
      <div className="mt-4 flex flex-wrap gap-2"><Button type="button" onClick={() => printOrderReceipt(row)}>Imprimir comprobante</Button>{!esDemo && <label className="text-xs text-mute">Estado de entrega<Select aria-label={`Estado de entrega ${row.number}`} className="mt-1" value={row.fulfillmentStatus} disabled={savingId === row.id} onChange={event => updateFulfillment(row, event.target.value)}>{Object.entries(FULFILLMENT).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></label>}</div>
    </li>)}</ul>}
  </SellerSection>
}
