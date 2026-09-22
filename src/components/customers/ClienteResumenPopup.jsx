import { useEffect, useState } from 'react'
import { Badge, Button, FilaDato, Modal, Skeleton } from '@/components/ui'
import Avatar from '@/components/shared/Avatar'
import WhatsAppMenu from '@/components/shared/WhatsAppMenu'
import { api } from '@/lib/api/client'
import { useSesion } from '@/lib/sesion'
import { buildDemoProfile } from '@/lib/demoClientes'
import { ESTADO_PEDIDO, tonoPedido } from '@/lib/estadosPedido'
import { telefonoVisible } from '@/utils/telefono'
import { formatPercent } from '@/components/shared/PercentField'
import { codigoPedido, fechaCompacta, fechaLegible } from '@/utils/pedido'
import { gs } from '@/utils/calculos'
import { ULTIMA_PLANTILLA_CLIENTES } from './customerMessaging'
import { notaInterna } from './ClientesTabla'
import { cn } from '@/lib/utils'

// Resumen rápido del cliente (#236): el «ojito» de la lista abre este popup
// rediseñado y reordenado (contacto, total gastado, pedidos, últimas compras,
// notas, seguro y tags) con acciones rápidas (WhatsApp, editar) y el botón
// para el detalle completo (CustomerProfile). Reusa los objetos de la
// biblioteca (Modal, Avatar, FilaDato, Badge, WhatsAppMenu).
const TONO_BADGE = { ok: 'green', bad: 'red', warn: 'orange', neutro: 'slate' }
const fechaDe = (valor) => (valor ? fechaLegible(valor) : '—')

export default function ClienteResumenPopup({ row, open, onClose, onDetalle, onEditar, templates }) {
  const { esDemo } = useSesion()
  const [perfil, setPerfil] = useState(null)
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    if (!open || !row?.id || esDemo) return undefined
    let vigente = true
    setPerfil(null)
    setCargando(true)
    api.get(`/api/customers/${encodeURIComponent(row.id)}`)
      .then((data) => { if (vigente) { setPerfil(data); setCargando(false) } })
      .catch(() => { if (vigente) setCargando(false) })
    return () => { vigente = false }
  }, [open, row?.id, esDemo])

  // En demo los datos viven en el navegador: se resuelven en el render.
  const perfilDemo = esDemo && row ? buildDemoProfile(row) : null

  if (!row) return null
  const stats = row.stats || {}
  const contacto = row.phone || row.phones?.[0] || ''
  const telefono = telefonoVisible(contacto, row.countryCode)
  const deuda = Number(stats.pendingPyg || 0)
  const nota = notaInterna(row.notes)
  const publica = row.publicNote || (perfilDemo || perfil)?.customer?.publicNote || ''
  const ordenes = [...((perfilDemo || perfil)?.orders || [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 3)

  return (
    <Modal open={open} onClose={onClose} title={`Cliente: ${row.name || 'Sin nombre'}`} size="amplio">
      <div className="space-y-4">
        <header className="flex flex-wrap items-start gap-3">
          <Avatar user={{ name: row.name || 'Cliente', id: row.id }} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-bold">{row.name || 'Sin nombre'}</p>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-mute">
              <Badge color={row.wholesale ? 'orange' : 'slate'}>{row.wholesale ? 'Mayorista' : 'Cliente final'}</Badge>
              <span className="tabular-nums">{telefono || 'Sin teléfono'}</span>
              {row.email && <span className="truncate">{row.email}</span>}
            </p>
            <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-mute">
              {(row.document || row.billingDocument) && <span>{row.billingDocument ? `RUC ${row.billingDocument}` : row.document}</span>}
              {row.creditLimitPyg > 0 && <span>Crédito {gs(row.creditLimitPyg)}{row.creditDays ? ` · ${row.creditDays} días` : ''}</span>}
              <span>Cliente desde {fechaDe(row.createdAt)}</span>
            </p>
            {(row.tags || []).length > 0 && (
              <p className="mt-2 flex flex-wrap items-center gap-1">
                {(row.tags || []).map((tag) => <Badge key={tag} color="slate" className="px-1.5 py-0 text-[10px]">{tag}</Badge>)}
              </p>
            )}
          </div>
          {contacto && (
            <WhatsAppMenu
              telefono={contacto}
              countryCode={row.countryCode}
              category="CUSTOMERS"
              storageKey={ULTIMA_PLANTILLA_CLIENTES}
              plantillas={templates}
              title={row.name}
              contexto={{
                cliente: row.name || '',
                nombre: row.name || '',
                saldo_pendiente: deuda > 0 ? gs(deuda) : '',
                ultima_compra: stats.lastOrderAt ? fechaLegible(stats.lastOrderAt) : '',
              }}
            />
          )}
        </header>

        <section className="grid gap-2 rounded-xl border border-ink-600 bg-ink-800/40 p-3 sm:grid-cols-2 lg:grid-cols-3">
          <FilaDato etiqueta="Total gastado" valor={gs(stats.totalSpentPyg || 0)} />
          <FilaDato etiqueta="Pedidos" valor={stats.orders || 0} />
          <FilaDato etiqueta="Última compra" valor={stats.lastOrderAt ? fechaCompacta(stats.lastOrderAt) : 'Sin compras'} />
          <FilaDato etiqueta="Deuda" valor={deuda > 0 ? gs(deuda) : 'Sin deuda'} tono={deuda > 0 ? 'warn' : ''} />
          <FilaDato etiqueta="Seguro" valor={row.insuranceEnabled ? `Activo${row.insuranceRatePct !== null && row.insuranceRatePct !== undefined ? ` · ${formatPercent(row.insuranceRatePct)}%` : ' · % de la empresa'}` : 'Inactivo'} />
          <FilaDato etiqueta="Tipo" valor={row.wholesale ? 'Mayorista' : 'Cliente final'} />
        </section>

        <section className="space-y-2">
          <p className="text-sm font-semibold">Últimas compras</p>
          {cargando && <Skeleton className="h-16 w-full" />}
          {!cargando && !ordenes.length && <p className="text-sm text-mute">Sin compras registradas.</p>}
          {!cargando && ordenes.map((order) => (
            <div key={order.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink-600 bg-ink-800/40 px-3 py-2 text-sm">
              <span className="min-w-0">
                <b className="block truncate">{codigoPedido(order.orderNumber) || 'Pedido'}</b>
                <span className="text-xs text-mute">{fechaDe(order.createdAt)}</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="tabular-nums text-mute">{gs(order.totalPyg || 0)}</span>
                <Badge color={TONO_BADGE[tonoPedido(order.status)] || 'slate'}>{ESTADO_PEDIDO[order.status] || order.status || '—'}</Badge>
              </span>
            </div>
          ))}
        </section>

        {(nota || publica) && (
          <section className="grid gap-2 sm:grid-cols-2">
            {nota && <div className="rounded-xl border border-warn/30 bg-warn/5 p-3 text-sm"><p className="text-[11px] font-bold uppercase tracking-wider text-mute">Nota interna</p><p className="mt-1 whitespace-pre-wrap break-words">{nota}</p></div>}
            {publica && <div className="rounded-xl border border-ok/30 bg-ok/5 p-3 text-sm"><p className="text-[11px] font-bold uppercase tracking-wider text-mute">Nota pública (visible al cliente)</p><p className="mt-1 whitespace-pre-wrap break-words">{publica}</p></div>}
          </section>
        )}

        <footer className={cn('flex flex-wrap items-center justify-end gap-2 border-t border-ink-600 pt-3')}>
          <Button type="button" variant="outline" onClick={() => onEditar?.(row)}>Editar</Button>
          <Button type="button" onClick={() => onDetalle?.(row)}>Ver detalle completo</Button>
        </footer>
      </div>
    </Modal>
  )
}
