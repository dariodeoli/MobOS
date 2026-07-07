import { listVentas, fraseDelDia } from '@/lib/storage'
import { totalesVendedor, semaforo, gs } from '@/utils/calculos'
import { Card } from '@/components/ui'

export default function ResumenWidgets({ vendedorId }) {
  const ventas = listVentas()
  const t = totalesVendedor(ventas, vendedorId)
  const sem = semaforo(t.hoy, t.ayer)

  const verde = sem.estado === 'verde'
  const rojo = sem.estado === 'rojo'

  return (
    <div className="space-y-3">
      {/* Contador en vivo */}
      <Card className="bg-gradient-to-br from-fono-dark via-fono to-fono-accent text-white border-0">
        <div className="text-xs font-bold uppercase tracking-wide opacity-75">
          📊 Ventas de hoy (tienda)
        </div>
        <div className="text-4xl font-extrabold mt-1 tracking-tight">{gs(t.hoy)}</div>
        <div className="mt-3 text-xs opacity-80">Esta semana: {gs(t.semana)}</div>
      </Card>

      {/* Semáforo hoy vs ayer */}
      <Card
        className={
          verde
            ? 'bg-emerald-50 border-emerald-300'
            : rojo
              ? 'bg-red-50 border-red-300'
              : 'bg-slate-50 border-slate-200'
        }
      >
        <div className="flex items-start gap-3">
          <div className="text-3xl">{verde ? '🟢' : rojo ? '🔴' : '⚪'}</div>
          <div className="flex-1">
            {verde && (
              <>
                <div className="font-extrabold text-emerald-700">
                  🎉 ¡Felicitaciones!
                </div>
                <div className="text-sm text-emerald-700 mt-0.5">
                  {sem.meta > 0
                    ? `Superaron lo de ayer (${gs(sem.meta)}). ¡Sigan así! 🚀`
                    : '¡Arrancó el día vendiendo! 🚀'}
                </div>
              </>
            )}
            {rojo && (
              <>
                <div className="font-extrabold text-red-700">
                  En camino a la meta del día
                </div>
                <div className="text-sm text-red-700 mt-0.5">
                  Faltan <strong>{gs(sem.falta)}</strong> para superar lo de ayer (
                  {gs(sem.meta)}). ¡Se puede! 💪
                </div>
              </>
            )}
            {sem.estado === 'neutro' && (
              <>
                <div className="font-extrabold text-slate-700">Meta del día</div>
                <div className="text-sm text-slate-500 mt-0.5">
                  Cargá tu primera venta para arrancar. ¡Hoy es un gran día! ☀️
                </div>
              </>
            )}
          </div>
        </div>
      </Card>

      {/* Frase motivadora */}
      <Card className="bg-fono-light border-fono/20">
        <div className="text-sm font-semibold text-fono">✨ {fraseDelDia()}</div>
      </Card>
    </div>
  )
}
