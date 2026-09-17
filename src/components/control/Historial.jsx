import { useState } from 'react'
import { listAuditoria } from '@/lib/storage'
import { gs } from '@/utils/calculos'
import { Card, Badge, Input, EmptyState } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import { cn } from '@/lib/utils'

// Tabla compacta del historial: una fila por movimiento y los cambios
// (antes → después) se despliegan en la misma fila.
const GRID_HISTORIAL = 'grid min-w-[46rem] grid-cols-[minmax(8rem,0.9fr)_minmax(7rem,0.9fr)_minmax(9rem,1.6fr)_7rem_6rem_1.5rem] items-center gap-x-2'
const CELDA_HIST = 'truncate text-[10px] font-bold uppercase tracking-wider text-mute'

const ACCION = {
  crear: { label: 'Creó', color: 'green', emoji: '🆕' },
  editar: { label: 'Editó', color: 'orange', emoji: '' },
  eliminar: { label: 'Eliminó', color: 'red', emoji: '' },
}

const FILTROS = [
  ['todas', 'Todo'],
  ['crear', '🆕 Cargas'],
  ['editar', 'Ediciones'],
  ['eliminar', 'Borrados'],
]

function fechaHora(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('es-PY', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Formatea el valor de un cambio (el precio va con formato ₲).
function valorCambio(campo, v) {
  if (v == null || v === '') return '—'
  if (campo === 'Precio' || campo === 'Delivery') return gs(v)
  return String(v)
}

// Normaliza para buscar sin importar acentos ni mayúsculas.
function norm(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export default function Historial() {
  const log = listAuditoria()
  const [filtro, setFiltro] = useState('todas')
  const [busqueda, setBusqueda] = useState('')
  const [abiertos, setAbiertos] = useState(() => new Set())

  const porAccion = filtro === 'todas' ? log : log.filter((x) => x.accion === filtro)
  const q = norm(busqueda.trim())
  const items = !q
    ? porAccion
    : porAccion.filter((m) => {
        const campos = [m.resumen?.cliente, m.resumen?.producto, m.actorNombre]
        return campos.some((c) => norm(c).includes(q))
      })

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-2xl">
            <Icon name="clock" className="h-4 w-4" />
          </span>
          <h2 className="font-bold">Historial de movimientos</h2>
        </div>
        <p className="text-sm text-mute mb-4">
          Cada vez que alguien carga, edita o elimina una venta queda registrado acá con su autor,
          fecha y hora. Es automático y no se puede modificar ni borrar.
        </p>
        <div className="relative mb-3">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-mute">
            <Icon name="search" className="h-4 w-4" />
          </span>
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por cliente, producto o vendedor…"
            autoCapitalize="none"
            autoCorrect="off"
            className="pl-9"
          />
          {busqueda && (
            <button
              onClick={() => setBusqueda('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-mute hover:text-mute"
              title="Limpiar"
            >
              <Icon name="close" className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {FILTROS.map(([k, label]) => (
            <button
              key={k}
              onClick={() => setFiltro(k)}
              className={
                'rounded-lg border px-3 py-1.5 text-xs font-semibold transition ' +
                (filtro === k
                  ? 'border-fono/40 bg-fono/15 text-fono-light'
                  : 'border-ink-600 text-mute hover:border-fono/40 hover:text-fore')
              }
            >
              {label}
            </button>
          ))}
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-ink-600">
          <h3 className="font-bold">Movimientos ({items.length})</h3>
        </div>

        {items.length === 0 ? (
          <EmptyState compact icon="clock" title="Todavía no hay movimientos registrados." />
        ) : (
          <div className="overflow-x-auto p-4" data-testid="historial-tabla">
            <div className={cn(GRID_HISTORIAL, 'px-3.5 pb-2 pt-1')}>
              <span className={CELDA_HIST}>Acción</span>
              <span className={CELDA_HIST}>Actor</span>
              <span className={CELDA_HIST}>Resumen</span>
              <span className={cn(CELDA_HIST, 'text-right')}>Monto</span>
              <span className={cn(CELDA_HIST, 'text-right')}>Fecha</span>
              <span />
            </div>
            <div className="space-y-1">
              {items.map((m) => {
                const a = ACCION[m.accion] || { label: m.accion, color: 'slate', emoji: '•' }
                const abierto = abiertos.has(m.id)
                const cambios = m.cambios || []
                const resumen = [m.resumen?.cliente, m.resumen?.producto].filter(Boolean).join(' · ') || '—'
                return <div key={m.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    data-testid="historial-fila"
                    onClick={() => setAbiertos(prev => { const next = new Set(prev); next.has(m.id) ? next.delete(m.id) : next.add(m.id); return next })}
                    onKeyDown={(event) => { if (event.key === 'Enter') setAbiertos(prev => { const next = new Set(prev); next.has(m.id) ? next.delete(m.id) : next.add(m.id); return next }) }}
                    className={cn(GRID_HISTORIAL, 'cursor-pointer rounded-xl border border-ink-600 bg-ink-800/40 px-3.5 py-2 transition hover:border-fono/40', abierto && 'border-fono/40')}
                  >
                    <span className="min-w-0"><Badge color={a.color} className="w-fit max-w-full truncate whitespace-nowrap px-1.5 py-0.5 text-[10px]">{a.emoji} {a.label}</Badge></span>
                    <span className="truncate text-[13px] font-semibold" title={m.actorNombre}>{m.actorNombre}{m.esPropietario ? ' (dueño)' : ''}</span>
                    <span className="truncate text-[11px] text-mute" title={resumen}>{resumen}</span>
                    <span className="truncate text-right text-[13px] font-semibold tabular-nums text-fono">{gs(m.resumen?.precio)}</span>
                    <span className="truncate text-right text-[11px] text-mute">{fechaHora(m.creadoEn)}</span>
                    <span className="flex justify-end">
                      {cambios.length > 0 && <Icon name="chevron" className={cn('h-3.5 w-3.5 shrink-0 text-mute transition', abierto ? 'rotate-180' : '-rotate-90')} />}
                    </span>
                  </div>
                  {abierto && cambios.length > 0 && (
                    <div className="mt-1 space-y-1 rounded-xl border border-ink-600 bg-ink-800/60 p-3">
                      {cambios.map((c, i) => (
                        <div key={i} className="text-xs text-mute">
                          <span className="font-semibold text-mute">{c.campo}:</span>{' '}
                          <span className="line-through">{valorCambio(c.campo, c.de)}</span>{' '}
                          <span className="text-fore">{valorCambio(c.campo, c.a)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              })}
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
