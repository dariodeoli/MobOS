import { useId } from 'react'
import { rutaArea, rutaLinea } from './datos.js'
import useAncho from './useAncho.js'
import './graficos.css'

// Tendencia mínima para un indicador: una línea con relleno suave, sin ejes. El
// número exacto vive en el indicador; `etiqueta` la anuncia a lectores de pantalla.
// Ocupa el ancho disponible (hasta `anchoMax`) y se dibuja a esa medida.
export default function Sparkline({ valores = [], etiqueta, anchoMax = 240, alto = 28, color = 'var(--g-1)', className }) {
  const id = useId()
  const [ref, medido] = useAncho(120)
  const datos = valores.map((v) => (Number.isFinite(Number(v)) ? Number(v) : 0))
  if (datos.length < 2) return null
  const ancho = Math.min(medido, anchoMax)
  const max = Math.max(...datos, 1)
  const min = Math.min(...datos, 0)
  const rango = max - min || 1
  const pad = 3
  const puntos = datos.map((v, i) => [pad + (i * (ancho - pad * 2)) / (datos.length - 1), pad + (1 - (v - min) / rango) * (alto - pad * 2)])
  const decorativa = !etiqueta
  const ultimo = puntos[puntos.length - 1]
  return (
    <div ref={ref} className={className} style={{ width: '100%', maxWidth: anchoMax, height: alto, color }}>
      <svg
        viewBox={`0 0 ${ancho} ${alto}`}
        width={ancho}
        height={alto}
        role={decorativa ? undefined : 'img'}
        aria-label={decorativa ? undefined : etiqueta}
        aria-hidden={decorativa ? 'true' : undefined}
        focusable="false"
        data-testid="sparkline"
        style={{ display: 'block' }}
      >
        <defs>
          <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity="0.28" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={rutaArea(puntos, alto - pad)} fill={`url(#${id})`} className="graf-entra-area" />
        <path d={rutaLinea(puntos)} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" pathLength="1" className="graf-entra-linea" />
        <circle cx={ultimo[0]} cy={ultimo[1]} r="2.5" fill="currentColor" />
      </svg>
    </div>
  )
}
