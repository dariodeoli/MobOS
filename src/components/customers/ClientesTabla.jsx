import { useEffect, useRef, useState } from 'react'
import { gs } from '@/utils/calculos'
import { normalizarBusqueda } from '@/utils/cliente'
import { internationalPhone } from '@/utils/telefono'
import { whatsappUrl, renderMessage, readCustomerMetadata } from './customerMessaging'
import Icon from '@/components/shared/Icon'
import { cn } from '@/lib/utils'

// Tabla de clientes alineada: una fila por persona, encabezados ordenables y
// acciones compactas (perfil al hacer clic, WhatsApp con plantilla).
const GRID = 'grid min-w-[58rem] grid-cols-[minmax(0,1.4fr)_6.5rem_9rem_3rem_7.5rem_6.5rem_4rem_8rem_3rem_5.5rem] items-center gap-x-3'
const ULTIMA_PLANTILLA = 'mobos:clientes:plantilla-wa'

const ciudadDe = (row) => row.addresses?.find(address => address.city)?.city || ''
export const notaInterna = (notes) => {
  if (typeof notes !== 'string' || !notes.trim()) return ''
  if (readCustomerMetadata(notes).phones.length) return ''
  return notes.trim()
}

export default function ClientesTabla({ rows, templates, onPerfil }) {
  const [orden, setOrden] = useState({ key: 'cliente', dir: 'asc' })
  const [plantillaId, setPlantillaId] = useState(() => localStorage.getItem(ULTIMA_PLANTILLA) || '')
  const [abierto, setAbierto] = useState(null)
  const popover = useRef(null)

  const plantilla = templates.find(item => item.id === plantillaId) || templates[0] || null
  useEffect(() => {
    if (plantilla?.id && plantilla.id !== plantillaId) setPlantillaId(plantilla.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plantilla?.id])
  useEffect(() => {
    if (!abierto) return undefined
    const cerrar = (event) => { if (!popover.current?.contains(event.target)) setAbierto(null) }
    document.addEventListener('mousedown', cerrar)
    return () => document.removeEventListener('mousedown', cerrar)
  }, [abierto])

  function elegirPlantilla(id) {
    setPlantillaId(id)
    localStorage.setItem(ULTIMA_PLANTILLA, id)
    setAbierto(null)
  }
  const ordenarPor = (key) => setOrden(current => current.key === key
    ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
    : { key, dir: key === 'pedidos' || key === 'total' ? 'desc' : 'asc' })
  const encabezado = (key, label, extra = '') => (
    <button type="button" onClick={() => ordenarPor(key)} className={cn('flex items-center gap-1 truncate text-left text-[10px] font-bold uppercase tracking-wider transition hover:text-fore', orden.key === key ? 'text-fono-light' : 'text-mute', extra)}>
      {label}<span className="shrink-0">{orden.key === key ? (orden.dir === 'asc' ? '↑' : '↓') : ''}</span>
    </button>
  )

  const filas = [...rows].sort((a, b) => {
    const factor = orden.dir === 'asc' ? 1 : -1
    if (orden.key === 'cliente') return normalizarBusqueda(a.name).localeCompare(normalizarBusqueda(b.name), 'es') * factor
    if (orden.key === 'tipo') return (Number(Boolean(b.wholesale)) - Number(Boolean(a.wholesale))) * factor
    if (orden.key === 'pedidos') return ((a.stats?.orders || 0) - (b.stats?.orders || 0)) * factor
    if (orden.key === 'total') return ((a.stats?.totalSpentPyg || 0) - (b.stats?.totalSpentPyg || 0)) * factor
    return 0
  })

  return (
    <div className="overflow-x-auto">
      <div className={cn(GRID, 'px-3.5 pb-2 pt-1')}>
        {encabezado('cliente', 'Cliente')}
        {encabezado('tipo', 'Tipo')}
        <span className="text-[10px] font-bold uppercase tracking-wider text-mute">Teléfono</span>
        <span className="text-center text-[10px] font-bold uppercase tracking-wider text-mute">Email</span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-mute">RUC</span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-mute">Ciudad</span>
        {encabezado('pedidos', 'Pedidos', 'justify-center')}
        {encabezado('total', 'Total gastado', 'justify-end')}
        <span className="text-center text-[10px] font-bold uppercase tracking-wider text-mute">Nota</span>
        <span className="text-right text-[10px] font-bold uppercase tracking-wider text-mute">Acciones</span>
      </div>
      <div className="space-y-2">
        {filas.map(row => {
          const nota = notaInterna(row.notes)
          const telefono = row.phones?.[0] || row.phone || ''
          const mensaje = plantilla ? renderMessage(plantilla, row) : ''
          return (
            <div
              key={row.id}
              data-testid="cliente-fila"
              role="button"
              tabIndex={0}
              onClick={() => onPerfil?.(row)}
              onKeyDown={event => { if (event.key === 'Enter') onPerfil?.(row) }}
              className={cn(GRID, 'cursor-pointer rounded-xl border border-fore/10 bg-ink-800/40 px-3.5 py-2.5 transition hover:border-fono/40 hover:bg-ink-700/50')}
            >
              <span className="truncate text-sm font-semibold" title={row.name}>{row.name || 'Sin nombre'}</span>
              <span className={cn('inline-block w-fit truncate rounded-md border px-1.5 py-0.5 text-[10px] font-bold', row.wholesale ? 'border-warn/30 bg-warn/10 text-warn' : 'border-ink-500 bg-ink-700/40 text-mute')}>
                {row.wholesale ? 'Mayorista' : 'Cliente final'}
              </span>
              <span className="truncate text-xs text-mute tabular-nums">{telefono ? internationalPhone(telefono, row.countryCode) : '—'}</span>
              <span className="text-center text-sm" title={row.email || undefined}>{row.email ? <span className="text-ok">✓</span> : <span className="text-mute">—</span>}</span>
              <span className="truncate text-xs text-mute tabular-nums">{row.document || '—'}</span>
              <span className="truncate text-xs text-mute">{ciudadDe(row) || '—'}</span>
              <span className="text-center text-xs font-semibold tabular-nums">{row.stats?.orders || 0}</span>
              <span className="truncate text-right text-sm font-bold tabular-nums text-fore">{gs(row.stats?.totalSpentPyg || 0)}</span>
              <span className="flex justify-center">
                {nota ? <span title={nota} aria-label={`Nota interna: ${nota}`} className="cursor-help text-sm">📝</span> : <span className="text-xs text-mute">—</span>}
              </span>
              <span className="flex items-center justify-end gap-1" ref={abierto === row.id ? popover : null}>
                {telefono ? (
                  <>
                    <a
                      href={mensaje ? whatsappUrl(telefono, mensaje, row.countryCode) : undefined}
                      onClick={event => { if (!mensaje) event.preventDefault(); event.stopPropagation() }}
                      target="_blank" rel="noopener noreferrer"
                      aria-label={`WhatsApp a ${row.name}`}
                      title={mensaje || 'Sin plantillas disponibles'}
                      className={cn('grid h-8 w-8 place-items-center rounded-lg transition', mensaje ? 'text-ok hover:bg-ok/10' : 'cursor-not-allowed text-mute')}
                    >
                      <Icon name="send" className="h-4 w-4" />
                    </a>
                    <button
                      type="button"
                      aria-label={`Elegir plantilla para ${row.name}`}
                      className="grid h-8 w-8 place-items-center rounded-lg text-mute transition hover:bg-fono/10 hover:text-fono-light"
                      onClick={event => { event.stopPropagation(); setAbierto(current => current === row.id ? null : row.id) }}
                    >
                      <Icon name="edit" className="h-3.5 w-3.5" />
                    </button>
                    {abierto === row.id && (
                      <div className="absolute z-30 mt-2 w-64 -translate-x-2/3 translate-y-6 rounded-xl border border-ink-500 bg-paper p-2 shadow-xl" onClick={event => event.stopPropagation()}>
                        <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-mute">Plantilla de WhatsApp</p>
                        {templates.length === 0 && <p className="px-2 py-1 text-xs text-mute">No hay plantillas cargadas.</p>}
                        {templates.map(item => (
                          <button key={item.id} type="button" onClick={() => elegirPlantilla(item.id)} className={cn('block w-full truncate rounded-lg px-2 py-1.5 text-left text-xs transition hover:bg-ink-700', item.id === plantilla?.id ? 'text-fono-light' : 'text-fore')}>
                            {item.name}
                          </button>
                        ))}
                        {mensaje && <p className="mt-1 rounded-lg bg-ink-800/60 px-2 py-1.5 text-[11px] leading-4 text-mute">{mensaje}</p>}
                      </div>
                    )}
                  </>
                ) : <span className="text-xs text-mute">—</span>}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
