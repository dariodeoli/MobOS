import { diaCorto, puntosSparkline } from '@/lib/superadmin/formato'

// Gráficos SVG livianos del panel de plataforma. Sin datos no dibujan nada:
// quien los usa muestra «Sin datos todavía».
export function Sparkline({ serie, className = '' }) {
  const puntos = puntosSparkline(serie, 120, 36)
  if (!puntos) return <div className={`h-9 ${className}`} aria-hidden="true" />
  return (
    <svg viewBox="0 0 120 36" className={`h-9 w-full text-fono-dark dark:text-fono ${className}`} preserveAspectRatio="none" role="img" aria-label="Tendencia del período" data-testid="sparkline">
      <polyline points={puntos} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

// Línea del período (sólida) contra el período anterior (punteada), alineados por día.
export function LineaDoble({ serie, previa, etiqueta }) {
  const ancho = 640
  const alto = 180
  const margen = { izq: 4, der: 4, arr: 8, abajo: 4 }
  const valores = [...serie, ...previa].map(p => p.valor)
  const max = Math.max(1, ...valores)
  const n = Math.max(serie.length, previa.length)
  if (n < 2 || valores.every(v => v === 0)) return null
  const x = i => margen.izq + (i * (ancho - margen.izq - margen.der)) / (n - 1)
  const y = v => alto - margen.abajo - (v / max) * (alto - margen.arr - margen.abajo)
  const camino = lista => lista.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.valor).toFixed(1)}`).join(' ')
  const marcas = [0, Math.floor((n - 1) / 2), n - 1]
  return (
    <div>
    <svg viewBox={`0 0 ${ancho} ${alto}`} preserveAspectRatio="none" className="h-40 w-full" role="img" aria-label={etiqueta} data-testid="linea-doble">
      <line x1={margen.izq} x2={ancho - margen.der} y1={alto - margen.abajo} y2={alto - margen.abajo} className="stroke-ink-600" strokeWidth="1" />
      {previa.length > 1 && <path d={camino(previa)} fill="none" className="stroke-mute" strokeWidth="2" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />}
      <path d={camino(serie)} fill="none" className="stroke-fono-dark dark:stroke-fono" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
    <div className="mt-1 flex justify-between text-xs text-mute" aria-hidden="true">
      {marcas.map(i => <span key={i}>{serie[i] ? diaCorto(serie[i].dia) : ''}</span>)}
    </div>
    </div>
  )
}
