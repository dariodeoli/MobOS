import { useState } from 'react'
import { useSesion } from '@/lib/sesion'
import { listVentas, productosById } from '@/lib/storage'
import { gs } from '@/utils/calculos'
import { buttonClass, fieldClass, SellerFeedback, SellerSection, useSellerData } from './SellerData'

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
})
const STATUS = { PENDING: 'Pendiente', COMPLETED: 'Completado', CANCELLED: 'Cancelado', REGISTERED: 'Registrado' }

export default function SellerOrders() {
  const { sesion, esDemo } = useSesion()
  const [query, setQuery] = useState('')
  const products = esDemo ? productosById() : {}
  const data = useSellerData('/api/orders', orderFields, listVentas, esDemo)
  const rows = data.rows.filter((row) => Boolean(sesion?.vendedorId) && row.sellerId === sesion.vendedorId)
    .map((row) => ({ ...row, products: row.products || products[row.productId]?.nombre || products[row.productId]?.name || '' }))
    .filter((row) => `${row.number} ${row.customer} ${row.products}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
  return <SellerSection title="Mis pedidos" description="Consultá los pedidos registrados con tu usuario y su estado. La API devuelve hasta 100 pedidos recientes.">
    <div className="flex gap-2"><input aria-label="Buscar en mis pedidos" className={fieldClass} placeholder="Pedido, cliente o producto" value={query} onChange={(event) => setQuery(event.target.value)} />
      <button className={buttonClass} onClick={data.refresh} disabled={data.loading}>Actualizar</button></div>
    <SellerFeedback {...data} empty={!rows.length} />
    {!data.loading && !data.error && <ul className="space-y-3">{rows.map((row) => <li key={row.id} className="break-words rounded-2xl border border-white/10 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">{row.number}</h2>
        <span className="rounded-full border border-fono/30 bg-fono/10 px-3 py-1 text-xs text-fono-light">{STATUS[row.status] || 'Estado no informado'}</span></div>
      <p className="mt-3">{row.customer}</p><p className="mt-1 text-slate-400">{row.products || 'Sin detalle de productos'}</p>
      <p className="mt-3 font-semibold text-fono-light">Total del pedido: {row.total != null && Number.isFinite(Number(row.total)) ? gs(row.total) : 'No disponible'}</p>
      {row.paymentStatus && <p className="mt-2 text-sm text-slate-400">Pago: {row.paymentStatus}</p>}
      <p className="mt-3 text-xs text-slate-400">{row.date && !Number.isNaN(Date.parse(row.date)) ? new Date(row.date).toLocaleDateString('es-PY') : 'Fecha no disponible'}</p>
    </li>)}</ul>}
  </SellerSection>
}
