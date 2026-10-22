import { useState } from 'react'
import Icon from '@/components/shared/Icon'
import { cn } from '@/lib/utils'
import { estadoApartado, formatoContador, segundosRestantes } from '@/lib/posRetencion'
import { useRetencion } from '../usePosRetencion'

const TONO = {
  ok: 'border-info/40 bg-info/10 text-info',
  aviso: 'border-warn/50 bg-warn/10 text-warn',
  vencido: 'border-bad/50 bg-bad/10 text-bad',
  sinConexion: 'border-warn/40 bg-warn/5 text-warn',
}

// Estado del apartado del IMEI en la línea del carrito: contador «Apartado · 4:12»
// (advertencia por debajo de 1 min), aviso al vencer con «Renovar», y el aviso
// honesto cuando no hay conexión. Sin retención del carrito no pinta nada.
export default function ChipApartado({ serial }) {
  const retencion = useRetencion()
  const [renovando, setRenovando] = useState(false)
  const [mensaje, setMensaje] = useState('')
  if (!retencion || !serial) return null
  const hold = retencion.holds[serial]
  const perdida = retencion.perdidas[serial]
  const segundos = hold ? segundosRestantes(hold.venceLocal, retencion.ahora) : null

  async function renovar() {
    setRenovando(true); setMensaje('')
    const resultado = await retencion.renovar(serial)
    if (!resultado.ok) setMensaje(resultado.mensaje)
    setRenovando(false)
  }

  if (hold && segundos > 0) {
    const estado = estadoApartado(segundos)
    return (
      <span data-testid="chip-apartado" data-estado={estado} role="timer" aria-label={`Apartado, quedan ${formatoContador(segundos)}`} title="Este equipo queda apartado para tu carrito mientras armás la venta"
        className={cn('inline-flex min-h-11 items-center gap-1 rounded-lg border px-1.5 text-[11px] font-semibold tabular-nums md:min-h-0 md:py-0.5', TONO[estado])}>
        <Icon name="clock" className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Apartado · {formatoContador(segundos)}
      </span>
    )
  }
  if (hold || perdida) {
    const texto = mensaje || (perdida?.motivo === 'tomada' ? perdida.mensaje : 'El apartado venció')
    return (
      <span data-testid="chip-apartado" data-estado="vencido" role="alert" className={cn('inline-flex min-h-11 flex-wrap items-center gap-1.5 rounded-lg border px-1.5 text-[11px] font-semibold md:min-h-0 md:py-0.5', TONO.vencido)}>
        <Icon name="clock" className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="whitespace-normal">{texto}</span>
        <button type="button" disabled={renovando} onClick={renovar} className="min-h-11 rounded-md border border-bad/50 px-2 font-bold hover:bg-bad/10 disabled:opacity-60 md:min-h-0 md:py-0.5">
          {renovando ? 'Renovando…' : 'Renovar'}
        </button>
      </span>
    )
  }
  if (!retencion.enLinea) {
    return (
      <span data-testid="chip-apartado" data-estado="sin-conexion" role="status" className={cn('inline-flex min-h-11 items-center gap-1 whitespace-normal rounded-lg border px-1.5 text-[11px] font-semibold md:min-h-0 md:py-0.5', TONO.sinConexion)}>
        <Icon name="alert" className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Sin conexión: el equipo no queda retenido
      </span>
    )
  }
  return null
}
