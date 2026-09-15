import { useState } from 'react'
import { listAuditoria } from '@/lib/storage'
import { gs } from '@/utils/calculos'
import { Card, Badge, Input, EmptyState } from '@/components/ui'
import Icon from '@/components/shared/Icon'

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
                'rounded-full px-3 py-1.5 text-xs font-bold transition border-2 ' +
                (filtro === k
                  ? 'border-fono bg-fono text-onbrand'
                  : 'border-ink-600 text-mute hover:border-fono hover:text-fono')
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
          <div className="divide-y divide-ink-600">
            {items.map((m) => {
              const a = ACCION[m.accion] || { label: m.accion, color: 'slate', emoji: '•' }
              return (
                <div key={m.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge color={a.color}>
                          {a.emoji} {a.label}
                        </Badge>
                        <span className="font-bold text-sm">
                          {m.actorNombre}
                          {m.esPropietario && <span title="Dueño"></span>}
                        </span>
                      </div>
                      <div className="text-sm text-mute mt-1 truncate">
                        {m.resumen?.cliente || '—'} · {m.resumen?.producto || '—'} ·{' '}
                        <span className="font-semibold text-fono">{gs(m.resumen?.precio)}</span>
                      </div>
                    </div>
                    <div className="text-xs text-mute shrink-0 text-right">
                      {fechaHora(m.creadoEn)}
                    </div>
                  </div>

                  {m.cambios?.length > 0 && (
                    <div className="mt-2 rounded-lg bg-ink-700 p-2.5 space-y-1">
                      {m.cambios.map((c, i) => (
                        <div key={i} className="text-xs text-mute">
                          <span className="font-semibold text-mute">{c.campo}:</span>{' '}
                          <span className="line-through">{valorCambio(c.campo, c.de)}</span>{' '}
                          <span className="text-fore">{valorCambio(c.campo, c.a)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}
