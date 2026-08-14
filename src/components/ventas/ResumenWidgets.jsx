import { listVentas, fraseDelDia } from '@/lib/storage'
import { totalesVendedor, semaforo, gs } from '@/utils/calculos'
import { Card, Dot } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import { cn } from '@/lib/utils'

export default function ResumenWidgets({ vendedorId }) {
  const ventas = listVentas()
  const t = totalesVendedor(ventas, vendedorId)
  const sem = semaforo(t.hoy, t.ayer)
  const verde = sem.estado === 'verde'
  const rojo = sem.estado === 'rojo'

  // Progreso hacia la meta (lo de ayer). Se topea en 100%.
  const pct = sem.meta > 0 ? Math.min((t.hoy / sem.meta) * 100, 100) : t.hoy > 0 ? 100 : 0

  return (
    <div className="space-y-3">
      {/* ── Facturado de hoy ─────────────────────────────────────── */}
      <div className="glow-blue relative overflow-hidden rounded-xl border border-fono/25 bg-blue-blur p-5">
        <div className="relative">
          <div className="text-[11px] font-medium uppercase tracking-wider text-white/60">
            Ventas de hoy
          </div>
          <div className="mt-1 text-4xl font-semibold tracking-tight">{gs(t.hoy)}</div>
          <div className="mt-2 text-xs text-white/60">Esta semana {gs(t.semana)}</div>
        </div>
      </div>

      {/* ── Semáforo (meta del día) ──────────────────────────────── */}
      <Card>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Dot color={verde ? 'green' : rojo ? 'red' : 'slate'} pulse={!verde && sem.meta > 0} />
            <span className="text-sm font-medium">
              {verde ? 'Meta superada' : rojo ? 'En camino a la meta' : 'Meta del día'}
            </span>
          </div>
          <span
            className={cn(
              'text-sm font-semibold',
              verde ? 'text-ok' : rojo ? 'text-bad' : 'text-mute',
            )}
          >
            {Math.round(pct)}%
          </span>
        </div>

        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink-600">
          <div
            className={cn('h-full rounded-full transition-all', verde ? 'bg-ok' : 'bg-blue-line')}
            style={{ width: `${pct}%` }}
          />
        </div>

        <p className="mt-2.5 text-xs text-mute">
          {sem.meta > 0
            ? verde
              ? `Superaron los ${gs(sem.meta)} de ayer.`
              : `Faltan ${gs(sem.falta)} para igualar ayer (${gs(sem.meta)}).`
            : 'Cargá la primera venta para arrancar el día.'}
        </p>
      </Card>

      {/* ── Frase del día ────────────────────────────────────────── */}
      <Card className="flex items-start gap-2.5">
        <Icon name="sparkles" className="mt-0.5 h-4 w-4 text-fono-light" />
        <p className="text-sm text-mute">{fraseDelDia()}</p>
      </Card>
    </div>
  )
}
