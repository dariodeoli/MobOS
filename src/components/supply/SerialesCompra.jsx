import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui'
import SearchField from '@/components/shared/SearchField'

// #450 · IMEI/seriales de una línea de compra con su estado (pendiente =
// comprado y cargado, todavía sin llegar; recibido = entró por una recepción;
// verificado = además tiene consulta IMEI exitosa) y buscador. Lo usa el
// detalle de la compra del Centro.
const COLOR = { pendiente: 'orange', recibido: 'blue', verificado: 'green' }
const ETIQUETA = { pendiente: 'Pendiente', recibido: 'Recibido', verificado: 'Verificado' }

export const normalizarSerialesLinea = (linea) => (linea?.serials || []).map((item) => (typeof item === 'string' ? { serial: item, estado: 'pendiente' } : { serial: item.serial, estado: item.estado || 'pendiente' }))

export default function SerialesCompra({ linea }) {
  const [busqueda, setBusqueda] = useState('')
  const seriales = useMemo(() => normalizarSerialesLinea(linea), [linea])
  const faltan = Math.max(0, Number(linea?.quantity || 0) - seriales.length)
  const termino = busqueda.trim().toUpperCase()
  const visibles = termino ? seriales.filter((item) => item.serial.includes(termino)) : seriales

  if (!seriales.length) {
    return <p className="text-xs text-mute" data-testid="seriales-compra-vacio">Sin IMEI cargados todavía{faltan > 0 ? ` (${faltan} pendiente${faltan === 1 ? '' : 's'} de cargar)` : ''}.</p>
  }
  return (
    <div className="space-y-1.5" data-testid="seriales-compra">
      {seriales.length > 1 && (
        <SearchField value={busqueda} onChange={(evento) => setBusqueda(evento.target.value)} placeholder="Buscar IMEI en esta línea" ariaLabel="Buscar IMEI en esta línea" className="min-h-11 w-full sm:max-w-xs" />
      )}
      <div className="max-h-64 space-y-1 overflow-y-auto">
        {visibles.map((item) => (
          <div key={item.serial} data-testid="serial-compra" className="flex min-h-11 items-center gap-2 rounded-md bg-ink-800/50 px-2.5 py-1 text-sm">
            <span className="min-w-0 flex-1 truncate font-mono">{item.serial}</span>
            <Badge color={COLOR[item.estado] || 'slate'}>{ETIQUETA[item.estado] || item.estado}</Badge>
          </div>
        ))}
        {termino && visibles.length === 0 && <p className="text-xs text-mute">Ningún IMEI coincide con «{busqueda}».</p>}
      </div>
      {faltan > 0 && <p className="text-xs text-warn">{faltan} IMEI pendiente{faltan === 1 ? '' : 's'} de cargar.</p>}
    </div>
  )
}
