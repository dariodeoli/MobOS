import { useState } from 'react'
import { gs } from '@/utils/calculos'
import { normalizarBusqueda } from '@/utils/cliente'
import { readCustomerMetadata } from './customerMessaging'
import Icon from '@/components/shared/Icon'
import WhatsAppMenu from '@/components/shared/WhatsAppMenu'
import { cn } from '@/lib/utils'

// Tabla de clientes alineada: una fila por persona, encabezados ordenables y
// acciones compactas (perfil al hacer clic, WhatsApp con plantilla). Entra sin
// scroll horizontal en desktop: todo trunca y el espacio se reparte con
// prioridad Cliente → Total gastado → Teléfono → Tipo → resto.
const GRID = 'grid min-w-[64rem] grid-cols-[minmax(0,1.6fr)_minmax(0,0.8fr)_minmax(0,1fr)_2.5rem_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.45fr)_minmax(0,1.15fr)_2.5rem_minmax(0,0.7fr)] items-center gap-x-2'
const ULTIMA_PLANTILLA = 'mobos:clientes:plantilla-wa'

const ciudadDe = (row) => row.addresses?.find(address => address.city)?.city || ''
// Teléfono visible: código de país + número local, agrupado 3-3-3 cuando tiene
// 9 dígitos (formato Paraguay). No se usa para wa.me (ahí va internationalPhone).
export const telefonoVisible = (phone, countryCode = '+595') => {
  const code = String(countryCode || '+595').replace(/\D/g, '') || '595'
  let digits = String(phone || '').replace(/\D/g, '')
  if (digits.startsWith(code)) digits = digits.slice(code.length)
  if (digits.startsWith('0')) digits = digits.slice(1)
  if (!digits) return ''
  const local = digits.length === 9 ? `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}` : digits
  return `+${code} ${local}`
}
export const notaInterna = (notes) => {
  if (typeof notes !== 'string' || !notes.trim()) return ''
  if (readCustomerMetadata(notes).phones.length) return ''
  return notes.trim()
}

export default function ClientesTabla({ rows, templates, onPerfil }) {
  const [orden, setOrden] = useState({ key: 'cliente', dir: 'asc' })

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
        <span className="truncate text-[10px] font-bold uppercase tracking-wider text-mute">Teléfono</span>
        <span className="text-center text-[10px] font-bold uppercase tracking-wider text-mute">Email</span>
        <span className="truncate text-[10px] font-bold uppercase tracking-wider text-mute">RUC</span>
        <span className="truncate text-[10px] font-bold uppercase tracking-wider text-mute">Ciudad</span>
        {encabezado('pedidos', 'Pedidos', 'justify-center')}
        {encabezado('total', 'Total gastado', 'justify-end')}
        <span className="text-center text-[10px] font-bold uppercase tracking-wider text-mute">Nota</span>
        <span className="text-right text-[10px] font-bold uppercase tracking-wider text-mute">Acciones</span>
      </div>
      <div className="space-y-2">
        {filas.map(row => {
          const nota = notaInterna(row.notes)
          const telefono = row.phones?.[0] || row.phone || ''
          const telefonoMostrado = telefonoVisible(telefono, row.countryCode)
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
              <span className={cn('inline-block w-fit max-w-full truncate rounded-md border px-1.5 py-0.5 text-[10px] font-bold', row.wholesale ? 'border-warn/30 bg-warn/10 text-warn' : 'border-ink-500 bg-ink-700/40 text-mute')}>
                {row.wholesale ? 'Mayorista' : 'Cliente final'}
              </span>
              <span className="truncate text-xs text-mute tabular-nums" title={telefono || undefined}>{telefonoMostrado || '—'}</span>
              <span className="flex justify-center">
                {row.email
                  ? <Icon name="check" role="img" title="Con correo" aria-label="Con correo" aria-hidden={false} className="h-4 w-4 text-ok" />
                  : <Icon name="close" role="img" title="Sin correo" aria-label="Sin correo" aria-hidden={false} className="h-3.5 w-3.5 text-mute" />}
              </span>
              <span className="truncate text-xs text-mute tabular-nums">{row.document || '—'}</span>
              <span className="truncate text-xs text-mute">{ciudadDe(row) || '—'}</span>
              <span className="truncate text-center text-xs font-semibold tabular-nums">{row.stats?.orders || 0}</span>
              <span className="truncate text-right text-sm font-bold tabular-nums text-fore">{gs(row.stats?.totalSpentPyg || 0)}</span>
              <span className="flex justify-center">
                {nota
                  ? <Icon name="report" role="img" title={nota} aria-label={`Nota interna: ${nota}`} aria-hidden={false} className="h-4 w-4 cursor-help text-fono-light" />
                  : <span className="text-xs text-mute">—</span>}
              </span>
              <span className="flex items-center justify-end gap-1">
                {telefono ? (
                  <WhatsAppMenu
                    telefono={telefono}
                    countryCode={row.countryCode}
                    category="CUSTOMERS"
                    storageKey={ULTIMA_PLANTILLA}
                    plantillas={templates}
                    title={row.name}
                    contexto={{
                      cliente: row.name || '',
                      nombre: row.name || '',
                      ultima_compra: row.stats?.lastOrderAt ? new Date(row.stats.lastOrderAt).toLocaleDateString('es-PY') : '',
                    }}
                  />
                ) : <span className="text-xs text-mute">—</span>}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
