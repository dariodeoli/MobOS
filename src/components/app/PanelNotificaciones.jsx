import Icon from '@/components/shared/Icon'
import { Aviso, Button, EmptyState, Modal, Skeleton } from '@/components/ui'
import { CELDA_DATO, CELDA_IDENTIDAD_GRANDE } from '@/components/shared/tabla'
import { cn } from '@/lib/utils'

const ICONO = {
  ENTREGA: 'truck',
  COBRO: 'money',
  PEDIDO: 'box',
  APROBACION: 'shield',
  APROBADA: 'check',
  RECHAZADA: 'alert',
  MENCION: 'megaphone',
  COMENTARIO: 'send',
}

function hace(at) {
  const fecha = new Date(at)
  if (Number.isNaN(fecha.getTime())) return ''
  const minutos = Math.round((Date.now() - fecha.getTime()) / 60000)
  if (minutos < 1) return 'ahora'
  if (minutos < 60) return `hace ${minutos} min`
  const horas = Math.round(minutos / 60)
  if (horas < 24) return `hace ${horas} h`
  return fecha.toLocaleDateString('es-PY', { day: '2-digit', month: 'short' })
}

// Panel de notificaciones: pedidos, aprobaciones, comentarios y menciones de
// la persona, con acceso directo a la pantalla donde se resuelve.
export default function PanelNotificaciones({ open, onClose, items, cargando, error, onRecargar, onAbrir, activas = true }) {
  return (
    <Modal open={open} onClose={onClose} title="Notificaciones" size="formulario">
      <div className="space-y-3" data-testid="notificaciones-panel">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-mute">
            {activas ? 'Últimos movimientos de tu operación (7 días).' : 'Las notificaciones están desactivadas en Preferencias.'}
          </p>
          <Button type="button" variant="ghost" className="h-8 px-2 text-xs" onClick={onRecargar} disabled={cargando}>
            Actualizar
          </Button>
        </div>

        {cargando && items.length === 0 && (
          <div className="space-y-2" aria-busy="true">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        )}

        {error && <Aviso tono="error" className="p-3">{error}</Aviso>}

        {!cargando && !error && items.length === 0 && (
          <EmptyState compact icon="bell" title="Sin novedades por ahora." description="Cuando haya pedidos, aprobaciones o comentarios para vos, aparecen acá." />
        )}

        <ul className="max-h-[26rem] space-y-1.5 overflow-auto">
          {items.map(item => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onAbrir(item.href)}
                className="flex w-full items-start gap-3 rounded-xl border border-ink-600 p-3 text-left transition hover:border-fono/40 hover:bg-ink-700"
              >
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-fono/10 text-fono-light">
                  <Icon name={ICONO[item.kind] || 'info'} className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className={CELDA_IDENTIDAD_GRANDE}>{item.title}</span>
                    <span className="shrink-0 text-[10px] text-mute">{hace(item.at)}</span>
                  </span>
                  <span className={cn('mt-0.5 block', CELDA_DATO)}>{item.detail}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  )
}
