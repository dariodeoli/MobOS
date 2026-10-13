import { useState } from 'react'
import { useUrlState } from '@/hooks/useUrlState'
import { useUltimoUsado } from '@/hooks/useUltimoUsado'
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
  // Filtro de acciones: el último usado es el default (#209); el enlace
  // compartido con ?filtro= sigue mandando cuando viene en la URL.
  const [filtroRecordado, recordarFiltro] = useUltimoUsado('config:historial-filtro', 'todas', {
    valido: (valor) => FILTROS.some(([clave]) => clave === valor),
  })
  const [filtro, setFiltroUrl] = useUrlState('filtro', filtroRecordado)
  const setFiltro = (clave) => { recordarFiltro(clave); setFiltroUrl(clave) }
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
          <ul data-testid="historial-actividad" className="divide-y divide-ink-600">
            {items.map((m) => {
              const a = ACCION[m.accion] || { label: m.accion, color: 'slate', emoji: '•' }
              return (
                <li key={m.id} className="p-3">
                  {/* Móvil: autor y fecha arriba, detalle en su línea y el
                      importe completo en la suya (#30). Desde sm el importe va
                      a la derecha del detalle. */}
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Badge color={a.color} className="w-fit">
                      {a.emoji} {a.label}
                    </Badge>
                    <span className="text-[13px] font-bold">
                      {m.actorNombre}
                      {m.esPropietario && <span title="Dueño"></span>}
                    </span>
                    <time dateTime={m.creadoEn} className="text-xs text-mute sm:ml-auto">
                      {fechaHora(m.creadoEn)}
                    </time>
                  </div>
                  <div className="mt-1 sm:flex sm:items-baseline sm:justify-between sm:gap-3">
                    <p className="min-w-0 break-words text-xs text-mute">
                      {m.resumen?.cliente || '—'} · {m.resumen?.producto || '—'}
                    </p>
                    <p data-monto className="tabular-nums mt-0.5 whitespace-nowrap text-sm font-semibold text-fono sm:mt-0 sm:shrink-0">
                      {gs(m.resumen?.precio)}
                    </p>
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
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}
