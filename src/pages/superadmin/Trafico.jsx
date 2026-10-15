import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { api } from '@/lib/api'
import { BarraProgreso } from '@/components/ui'
import { formatNumero } from '@/lib/superadmin/formato'
import { TarjetaKpi } from './Resumen'

const ROL = { ADMIN: 'Dueño', GERENTE: 'Gerente', VENDEDOR: 'Vendedor', CAJERA: 'Caja', TECNICO: 'Técnico', REPARTIDOR: 'Delivery' }
const DISPOSITIVO = { mobile: 'Celular', tablet: 'Tablet', desktop: 'Computadora' }

function Seccion({ titulo, nota, children, testId }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-ink-600 bg-ink-800 p-4" aria-label={titulo} data-testid={testId}>
      <h2 className="text-sm font-medium text-fore">{titulo}</h2>
      {children}
      {nota && <p className="text-xs text-mute">{nota}</p>}
    </section>
  )
}

// Lista con barras proporcionales; vacía = «Sin datos todavía».
function Barras({ filas, etiqueta = c => c, testId }) {
  if (!filas?.length) return <p className="text-sm text-mute" data-testid={testId ? `${testId}-vacio` : undefined}>Sin datos todavía</p>
  const max = Math.max(...filas.map(f => f.n), 1)
  return (
    <ul className="flex flex-col gap-2" data-testid={testId}>
      {filas.map(f => (
        <li key={f.clave} className="flex flex-col gap-1 text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 break-words text-fore">{etiqueta(f.clave)}</span>
            <span className="shrink-0 tabular-nums text-mute">{formatNumero(f.n)}{f.porcentaje !== null && f.porcentaje !== undefined ? ` · ${f.porcentaje.toLocaleString('es-PY')} %` : ''}</span>
          </div>
          <BarraProgreso valor={f.n} max={max} tono="ok" alto="sm" etiqueta={`${etiqueta(f.clave)}: ${f.n}`} />
        </li>
      ))}
    </ul>
  )
}

export default function Trafico() {
  const { periodo } = useOutletContext()
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let vivo = true
    setError('')
    api.get(`/api/superadmin/trafico?periodo=${encodeURIComponent(periodo)}`, { cacheMs: 0 })
      .then(res => { if (vivo) setDatos(res) })
      .catch(err => { if (vivo) { console.error('[superadmin] tráfico:', err); setError('No se pudo cargar el tráfico.') } })
    return () => { vivo = false }
  }, [periodo])

  if (error) return <p role="alert" className="rounded-xl border border-bad/40 bg-ink-800 p-4 text-sm text-bad-text">{error}</p>
  if (!datos) return <p className="text-sm text-mute" role="status">Cargando tráfico…</p>
  const { landing, demo } = datos
  const conv = demo.conversion

  return (
    <div className="flex flex-col gap-6" data-testid="superadmin-trafico">
      <p className="text-xs text-mute">Medición propia y anónima (sin IP, sin cookies, respeta «No rastrear»). Es aparte de las cifras del negocio: las demos nunca se suman allá.</p>

      <div className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-fore">Landing</h2>
        {landing.sinDatos && <p className="rounded-xl border border-ink-600 bg-ink-800 p-4 text-sm text-mute" data-testid="landing-sin-datos">Sin datos todavía: aún no hay visitas registradas a la landing en este período.</p>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{landing.kpis.map(k => <TarjetaKpi key={k.clave} kpi={k} />)}</div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Seccion titulo={`Profundidad de scroll${landing.scroll.promedioPct !== null ? ` · promedio ${landing.scroll.promedioPct} %` : ''}`} nota={landing.scroll.fuente} testId="trafico-scroll">
            {landing.scroll.buckets.every(b => b.n === 0)
              ? <p className="text-sm text-mute">Sin datos todavía</p>
              : <Barras filas={landing.scroll.buckets.map(b => ({ clave: `${b.pct}`, n: b.n, porcentaje: b.porcentaje }))} etiqueta={c => `Llegaron al ${c} %`} />}
          </Seccion>
          <Seccion titulo="Páginas más vistas" nota={landing.notas.paginas} testId="trafico-paginas"><Barras filas={landing.paginas} /></Seccion>
          <Seccion titulo="Origen del tráfico" nota={landing.notas.fuentes} testId="trafico-fuentes"><Barras filas={landing.fuentes} etiqueta={c => (c === 'directo' ? 'Directo' : c)} /></Seccion>
          <Seccion titulo="Dispositivo" nota={landing.notas.dispositivos} testId="trafico-dispositivos"><Barras filas={landing.dispositivos} etiqueta={c => DISPOSITIVO[c] || c} /></Seccion>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-fore">Demo</h2>
        {demo.sinDatos && <p className="rounded-xl border border-ink-600 bg-ink-800 p-4 text-sm text-mute" data-testid="demo-sin-datos">Sin datos todavía: nadie inició la demo en este período.</p>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{demo.kpis.map(k => <TarjetaKpi key={k.clave} kpi={k} />)}</div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Seccion titulo="Rol de demo más usado" nota={demo.notas.roles} testId="trafico-roles"><Barras filas={demo.roles} etiqueta={c => ROL[c] || c} /></Seccion>
          <Seccion titulo="Módulos visitados en la demo" nota={demo.notas.modulos} testId="trafico-modulos"><Barras filas={demo.modulos} /></Seccion>
          <Seccion titulo="De la demo al registro" nota={demo.notas.conversion} testId="trafico-conversion">
            {conv.visitantes === 0
              ? <p className="text-sm text-mute">Sin datos todavía</p>
              : <p className="text-2xl font-semibold tabular-nums text-fore">{conv.porcentaje?.toLocaleString('es-PY')} % <span className="text-sm font-normal text-mute">({formatNumero(conv.convertidos)} de {formatNumero(conv.visitantes)} visitantes)</span></p>}
          </Seccion>
        </div>
      </div>
    </div>
  )
}
