import { useId, useMemo, useState } from 'react'
import { gs } from '@/utils/calculos'
import { abreviar, escalaLinda, etiquetaFecha, rutaArea, rutaLinea } from './datos.js'
import useAncho from './useAncho.js'
import './graficos.css'

const MARGEN = { izq: 46, der: 10, arriba: 10, abajo: 24 }

// Área/línea de ventas por día con comparación opcional contra el período
// anterior (alineada día a día). SVG a la medida del contenedor; foco con
// teclado (← → Inicio Fin), tooltip con importes completos y una tabla para
// lectores de pantalla con los mismos datos.
export default function GraficoArea({
  serie = [],
  previa = null,
  titulo,
  etiquetaSerie = 'Este período',
  etiquetaPrevia = 'Período anterior',
  formato = gs,
  alto = 220,
}) {
  const id = useId()
  const [ref, ancho] = useAncho(560)
  const [activo, setActivo] = useState(null)
  const n = serie.length
  const hayPrevia = Array.isArray(previa) && previa.length === n && n > 0

  const geo = useMemo(() => {
    const maxDato = Math.max(1, ...serie.map((p) => p.valor), ...(hayPrevia ? previa.map((p) => p.valor) : [0]))
    const escala = escalaLinda(maxDato)
    const w = Math.max(ancho - MARGEN.izq - MARGEN.der, 40)
    const h = alto - MARGEN.arriba - MARGEN.abajo
    const x = (i) => MARGEN.izq + (n === 1 ? w / 2 : (i * w) / (n - 1))
    const y = (v) => MARGEN.arriba + (1 - v / escala.max) * h
    return { escala, w, h, x, y, base: MARGEN.arriba + h }
  }, [serie, previa, hayPrevia, ancho, alto, n])

  if (!n) return null
  const puntos = serie.map((p, i) => [geo.x(i), geo.y(p.valor)])
  const puntosPrevia = hayPrevia ? previa.map((p, i) => [geo.x(i), geo.y(p.valor)]) : null
  const total = serie.reduce((s, p) => s + p.valor, 0)
  const totalPrevia = hayPrevia ? previa.reduce((s, p) => s + p.valor, 0) : null
  const mejor = serie.reduce((m, p) => (p.valor > m.valor ? p : m), serie[0])

  const paso = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(geo.w / 64))))
  const indicesEtiqueta = []
  for (let i = 0; i < n; i += paso) indicesEtiqueta.push(i)
  if (indicesEtiqueta[indicesEtiqueta.length - 1] !== n - 1) {
    const previo = indicesEtiqueta[indicesEtiqueta.length - 1]
    if (geo.x(n - 1) - geo.x(previo) >= 56) indicesEtiqueta.push(n - 1)
  }
  const resumen = `${titulo || 'Ventas por día'}: ${etiquetaFecha(serie[0].fecha)} al ${etiquetaFecha(serie[n - 1].fecha)}, total ${formato(total)}`
    + (hayPrevia ? `, ${etiquetaPrevia.toLowerCase()} ${formato(totalPrevia)}` : '')
    + `. Mejor día ${etiquetaFecha(mejor.fecha)} con ${formato(mejor.valor)}. Usá las flechas para recorrer los días.`

  const indiceDesdeX = (clientX, rect) => {
    const px = clientX - rect.left - MARGEN.izq
    const i = n === 1 ? 0 : Math.round((px / geo.w) * (n - 1))
    return Math.min(n - 1, Math.max(0, i))
  }
  const onTeclado = (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Escape'].includes(e.key)) return
    e.preventDefault()
    if (e.key === 'Escape') return setActivo(null)
    setActivo((i) => {
      if (e.key === 'Home') return 0
      if (e.key === 'End') return n - 1
      const base = i === null ? (e.key === 'ArrowRight' ? -1 : n) : i
      return Math.min(n - 1, Math.max(0, base + (e.key === 'ArrowRight' ? 1 : -1)))
    })
  }

  const sel = activo === null ? null : serie[activo]
  const selPrevia = activo !== null && hayPrevia ? previa[activo] : null
  const tx = sel ? geo.x(activo) : 0
  const izquierda = tx > ancho * 0.6

  return (
    <figure className="m-0 min-w-0" data-testid="grafico-area">
      <div
        ref={ref}
        role="img"
        aria-label={resumen}
        tabIndex={0}
        className="graf-foco relative w-full touch-pan-y select-none"
        style={{ height: alto }}
        onKeyDown={onTeclado}
        onFocus={() => setActivo((i) => (i === null ? n - 1 : i))}
        onBlur={() => setActivo(null)}
        onPointerMove={(e) => setActivo(indiceDesdeX(e.clientX, e.currentTarget.getBoundingClientRect()))}
        onPointerLeave={() => setActivo(null)}
      >
        <svg width={ancho} height={alto} viewBox={`0 0 ${ancho} ${alto}`} aria-hidden="true" focusable="false" style={{ display: 'block' }}>
          <defs>
            <linearGradient id={`${id}-rel`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="var(--g-1)" stopOpacity="0.32" />
              <stop offset="1" stopColor="var(--g-1)" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {geo.escala.ticks.map((t) => (
            <g key={t}>
              <line x1={MARGEN.izq} x2={MARGEN.izq + geo.w} y1={geo.y(t)} y2={geo.y(t)} className="graf-eje" strokeWidth="1" strokeDasharray={t === 0 ? undefined : '3 4'} />
              <text x={MARGEN.izq - 8} y={geo.y(t) + 4} textAnchor="end" fontSize="12" className="graf-tinta-mute">{abreviar(t)}</text>
            </g>
          ))}
          {indicesEtiqueta.map((i) => (
            <text key={serie[i].fecha} x={geo.x(i)} y={alto - 6} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} fontSize="12" className="graf-tinta-mute">{etiquetaFecha(serie[i].fecha)}</text>
          ))}
          {puntosPrevia && (
            <path d={rutaLinea(puntosPrevia)} fill="none" stroke="var(--g-previo)" strokeWidth="1.5" strokeDasharray="4 4" strokeLinejoin="round" strokeLinecap="round" />
          )}
          <path d={rutaArea(puntos, geo.base)} fill={`url(#${id}-rel)`} className="graf-entra-area" />
          <path d={rutaLinea(puntos)} fill="none" stroke="var(--g-1)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" pathLength="1" className="graf-entra-linea" />
          {n <= 31 && puntos.map(([x, y], i) => <circle key={serie[i].fecha} cx={x} cy={y} r={activo === i ? 4.5 : 2} fill="var(--g-1)" stroke={activo === i ? 'rgb(var(--c-paper))' : 'none'} strokeWidth="2" />)}
          {sel && (
            <g>
              <line x1={tx} x2={tx} y1={MARGEN.arriba} y2={geo.base} stroke="var(--g-1)" strokeWidth="1" opacity="0.5" />
              {selPrevia && <circle cx={tx} cy={geo.y(selPrevia.valor)} r="3.5" fill="var(--g-previo)" />}
              {n > 31 && <circle cx={tx} cy={geo.y(sel.valor)} r="4.5" fill="var(--g-1)" stroke="rgb(var(--c-paper))" strokeWidth="2" />}
            </g>
          )}
        </svg>
        {sel && (
          <div
            aria-hidden="true"
            data-testid="grafico-tooltip"
            className="graf-tooltip pointer-events-none absolute top-1 z-10 w-max max-w-[min(15rem,90%)] rounded-lg px-2.5 py-1.5 text-xs"
            style={izquierda ? { right: Math.max(ancho - tx + 10, 4) } : { left: tx + 10 }}
          >
            <div className="font-medium text-fore">{etiquetaFecha(sel.fecha)}</div>
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 text-mute"><i className="inline-block h-2 w-2 rounded-full" style={{ background: 'var(--g-1)' }} />{etiquetaSerie}</span>
              <strong className="tabular-nums text-fore">{formato(sel.valor)}</strong>
            </div>
            {selPrevia && (
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1.5 text-mute"><i className="inline-block h-2 w-2 rounded-full" style={{ background: 'var(--g-previo)' }} />{etiquetaPrevia}</span>
                <span className="tabular-nums text-mute">{formato(selPrevia.valor)}</span>
              </div>
            )}
          </div>
        )}
      </div>
      <figcaption className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-mute">
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-0.5 w-4 rounded" style={{ background: 'var(--g-1)' }} />{etiquetaSerie}: <strong className="tabular-nums text-fore">{formato(total)}</strong></span>
        {hayPrevia && <span className="inline-flex items-center gap-1.5"><i className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: 'var(--g-previo)' }} />{etiquetaPrevia}: <span className="tabular-nums">{formato(totalPrevia)}</span></span>}
      </figcaption>
      <table className="sr-only">
        <caption>{titulo || 'Ventas por día'}</caption>
        <thead>
          <tr><th scope="col">Día</th><th scope="col">{etiquetaSerie}</th>{hayPrevia && <th scope="col">{etiquetaPrevia}</th>}</tr>
        </thead>
        <tbody>
          {serie.map((p, i) => (
            <tr key={p.fecha}><th scope="row">{etiquetaFecha(p.fecha)}</th><td>{formato(p.valor)}</td>{hayPrevia && <td>{formato(previa[i].valor)}</td>}</tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}
