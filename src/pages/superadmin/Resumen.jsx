import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { api } from '@/lib/api'
import { formatGs } from '@/utils/moneda'
import { formatDelta, formatNumero } from '@/lib/superadmin/formato'
import { cn } from '@/lib/utils'
import { LineaDoble, Sparkline } from './Graficos'

const plural = (n, uno, varios) => `${formatNumero(n)} ${n === 1 ? uno : varios}`
const TONO = { sube: 'text-ok-text', baja: 'text-bad-text', neutro: 'text-mute' }

function valorKpi(kpi, valor) {
  return kpi.unidad === 'pyg' ? formatGs(valor) : formatNumero(valor)
}

function sinDatos(kpi) {
  return kpi.actual === 0 && kpi.previo === 0 && kpi.serie.every(p => p.valor === 0)
}

function TarjetaKpi({ kpi }) {
  const vacio = sinDatos(kpi)
  const delta = formatDelta(kpi.variacion)
  return (
    <section className="flex flex-col gap-2 rounded-xl border border-ink-600 bg-ink-800 p-4" data-testid={`kpi-${kpi.clave}`} aria-label={kpi.etiqueta}>
      <h2 className="text-sm font-medium text-mute">{kpi.etiqueta}</h2>
      {vacio ? (
        <p className="py-2 text-sm text-mute" data-testid={`kpi-${kpi.clave}-vacio`}>Sin datos todavía</p>
      ) : (
        <>
          <p className="text-2xl font-semibold tabular-nums text-fore" data-testid={`kpi-${kpi.clave}-valor`}>{valorKpi(kpi, kpi.actual)}</p>
          <p className="flex flex-wrap items-baseline gap-x-2 text-xs">
            <span className={cn('font-semibold', TONO[delta.tono])}>{delta.texto}</span>
            <span className="text-mute">vs {valorKpi(kpi, kpi.previo)} del período anterior</span>
          </p>
          <Sparkline serie={kpi.serie} />
        </>
      )}
      <p className="mt-auto text-xs text-mute" data-testid={`kpi-${kpi.clave}-fuente`}>{kpi.fuente}</p>
    </section>
  )
}

export default function Resumen() {
  const { periodo } = useOutletContext()
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let vivo = true
    setError('')
    api.get(`/api/superadmin/resumen?periodo=${encodeURIComponent(periodo)}`, { cacheMs: 0 })
      .then(res => { if (vivo) setDatos(res) })
      .catch(err => { if (vivo) { console.error('[superadmin] resumen:', err); setError('No se pudieron cargar las métricas.') } })
    return () => { vivo = false }
  }, [periodo])

  if (error) return <p role="alert" className="rounded-xl border border-bad/40 bg-ink-800 p-4 text-sm text-bad-text">{error}</p>
  if (!datos) return <p className="text-sm text-mute" role="status">Cargando métricas…</p>

  const pedidos = datos.kpis.find(k => k.clave === 'pedidos')
  const demo = datos.demo
  const hayDemo = demo.empresas + demo.usuarios + demo.pedidos > 0
  return (
    <div className="flex flex-col gap-4" data-testid="superadmin-resumen">
      {datos.sinDatos && <p className="rounded-xl border border-ink-600 bg-ink-800 p-4 text-sm text-mute" data-testid="resumen-sin-datos">Sin datos todavía: aún no hay empresas reales en la plataforma.</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {datos.kpis.map(kpi => <TarjetaKpi key={kpi.clave} kpi={kpi} />)}
      </div>
      {pedidos && !sinDatos(pedidos) && (
        <section className="rounded-xl border border-ink-600 bg-ink-800 p-4" aria-label="Pedidos por día">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-medium text-fore">Pedidos por día</h2>
            <p className="flex items-center gap-3 text-xs text-mute">
              <span className="inline-flex items-center gap-1"><span className="h-0.5 w-4 bg-fono-dark dark:bg-fono" />Período</span>
              <span className="inline-flex items-center gap-1"><span className="h-0 w-4 border-t-2 border-dashed border-mute" />Anterior</span>
            </p>
          </div>
          <LineaDoble serie={pedidos.serie} previa={pedidos.seriePrevia} etiqueta="Pedidos por día, período contra período anterior" />
          <p className="mt-1 text-xs text-mute">{pedidos.fuente}</p>
        </section>
      )}
      <p className="text-xs text-mute" data-testid="resumen-demo">
        {hayDemo
          ? `Empresas de demostración (excluidas de todas las cifras): ${plural(demo.empresas, 'empresa', 'empresas')} · ${plural(demo.usuarios, 'usuario', 'usuarios')} · ${plural(demo.pedidos, 'pedido', 'pedidos')}.`
          : 'No hay empresas de demostración registradas. Las demos nunca se suman a las cifras.'}
        {' '}Días agrupados en hora de Paraguay.
      </p>
    </div>
  )
}
