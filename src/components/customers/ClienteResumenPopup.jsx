import { Badge, Button, FilaDato, Modal } from '@/components/ui'
import Avatar from '@/components/shared/Avatar'
import Icon from '@/components/shared/Icon'
import WhatsAppMenu from '@/components/shared/WhatsAppMenu'
import { telefonoVisible } from '@/utils/telefono'
import { gs } from '@/utils/calculos'
import { fechaLegible } from '@/utils/pedido'
import { ULTIMA_PLANTILLA_CLIENTES } from './customerMessaging'
import { cn } from '@/lib/utils'

// Resumen rápido del cliente (#236, ajustado en #313): el «ojito» de la lista
// abre un vistazo de contacto + saldo + acciones. El contenido extenso (últimas
// compras, notas, seguro, tipo) vive en la ficha completa, para no repetir el
// detalle: acá solo está lo que se mira de paso.
const fechaDe = (valor) => (valor ? fechaLegible(valor) : '—')

export default function ClienteResumenPopup({ row, open, onClose, onDetalle, onEditar, templates }) {
  if (!row) return null
  const stats = row.stats || {}
  const contacto = row.phone || row.phones?.[0] || ''
  const telefono = telefonoVisible(contacto, row.countryCode)
  const deuda = Number(stats.pendingPyg || 0)
  // Avisos internos (#240 → seguimiento): lo que el cliente no abrió todavía.
  const sinVer = stats.sinVer || null

  return (
    <Modal open={open} onClose={onClose} title={`Cliente: ${row.name || 'Sin nombre'}`} size="amplio">
      <div className="space-y-4">
        {(sinVer?.mensajes > 0 || sinVer?.informes > 0) && (
          <p data-testid="popup-sin-ver" className="flex flex-wrap items-center gap-1.5 rounded-xl border border-warn/30 bg-warn/5 px-3 py-2 text-xs font-semibold text-warn">
            <Icon name="alert" className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              Sin ver:
              {sinVer.mensajes > 0 ? ` ${sinVer.mensajes} mensaje${sinVer.mensajes === 1 ? '' : 's'}` : ''}
              {sinVer.mensajes > 0 && sinVer.informes > 0 ? ' y' : ''}
              {sinVer.informes > 0 ? ` ${sinVer.informes} informe${sinVer.informes === 1 ? '' : 's'}` : ''}
              {' '}de la tienda
            </span>
          </p>
        )}
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

        <section className="grid gap-2 rounded-xl border border-ink-600 bg-ink-800/40 p-3 sm:grid-cols-3">
          <FilaDato etiqueta="Total gastado" valor={gs(stats.totalSpentPyg || 0)} />
          <FilaDato etiqueta="Pedidos" valor={stats.orders || 0} />
          <FilaDato etiqueta="Deuda" valor={deuda > 0 ? gs(deuda) : 'Sin deuda'} tono={deuda > 0 ? 'warn' : ''} />
        </section>

        <footer className={cn('flex flex-wrap items-center justify-end gap-2 border-t border-ink-600 pt-3')}>
          <Button type="button" variant="outline" onClick={() => onEditar?.(row)}>Editar</Button>
          <Button type="button" onClick={() => onDetalle?.(row)}>Ver detalle completo</Button>
        </footer>
      </div>
    </Modal>
  )
}
