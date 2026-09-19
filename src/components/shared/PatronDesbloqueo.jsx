import { Button } from '@/components/ui'
import { agregarPuntoPatron } from '@/lib/servicioChecklist'

// Patrón de desbloqueo 3×3: el cliente lo dibuja al dejar el equipo y queda en
// la orden (cifrado en el servidor). Cada punto es un botón: se puede tocar en
// orden o arrastrar, y se puede deshacer o limpiar.
const PUNTOS = [1, 2, 3, 4, 5, 6, 7, 8, 9]

export default function PatronDesbloqueo({ value = [], onChange, disabled = false }) {
  const secuencia = Array.isArray(value) ? value : []
  const lineas = secuencia.slice(0, -1).map((punto, indice) => {
    const siguiente = secuencia[indice + 1]
    const centro = (n) => ({ x: ((n - 1) % 3) * 40 + 20, y: Math.floor((n - 1) / 3) * 40 + 20 })
    const desde = centro(punto)
    const hasta = centro(siguiente)
    return { key: `${punto}-${siguiente}`, x1: desde.x, y1: desde.y, x2: hasta.x, y2: hasta.y }
  })

  return (
    <div className="space-y-2">
      <div className="relative inline-block">
        <svg viewBox="0 0 120 120" className="h-28 w-28 rounded-xl border border-ink-600 bg-ink-800" role="img" aria-label={`Patrón de desbloqueo: ${secuencia.join(' → ') || 'sin puntos'}`}>
          {lineas.map((linea) => <line key={linea.key} x1={linea.x1} y1={linea.y1} x2={linea.x2} y2={linea.y2} stroke="var(--fono, #05f19c)" strokeWidth="3" strokeLinecap="round" />)}
          {PUNTOS.map((punto) => {
            const usado = secuencia.includes(punto)
            const x = ((punto - 1) % 3) * 40 + 20
            const y = Math.floor((punto - 1) / 3) * 40 + 20
            return <circle key={punto} cx={x} cy={y} r={usado ? 7 : 5} fill={usado ? 'var(--fono, #05f19c)' : 'transparent'} stroke={usado ? 'var(--fono, #05f19c)' : 'var(--mute, #7b8794)'} strokeWidth="2" />
          })}
        </svg>
        <div className="absolute inset-0 grid grid-cols-3 grid-rows-3">
          {PUNTOS.map((punto) => (
            <button
              key={punto}
              type="button"
              disabled={disabled}
              aria-label={`Punto ${punto}`}
              aria-pressed={secuencia.includes(punto)}
              onClick={() => onChange(agregarPuntoPatron(secuencia, punto))}
              className="h-full w-full rounded-md transition hover:bg-fono/10 disabled:opacity-40"
            />
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs tabular-nums text-mute">{secuencia.length ? secuencia.join(' → ') : 'Sin patrón'}</span>
        {secuencia.length > 0 && <Button type="button" variant="ghost" className="h-auto px-0 py-0.5 text-xs" disabled={disabled} onClick={() => onChange(secuencia.slice(0, -1))}>Deshacer</Button>}
        {secuencia.length > 0 && <Button type="button" variant="ghost" className="h-auto px-0 py-0.5 text-xs text-bad" disabled={disabled} onClick={() => onChange([])}>Limpiar</Button>}
      </div>
    </div>
  )
}
