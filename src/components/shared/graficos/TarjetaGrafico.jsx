import { Card } from '@/components/ui'
import { cn } from '@/lib/utils'
import './graficos.css'

// Tarjeta con encabezado uniforme para los gráficos y listados de Inicio y
// Análisis: título (16/24), una línea de contexto y acciones a la derecha.
export default function TarjetaGrafico({ titulo, detalle, acciones, nivel = 'h2', className, children, testId }) {
  const Titulo = nivel
  return (
    <Card className={cn('graf-card flex min-w-0 flex-col gap-3 p-4', className)} data-testid={testId}>
      <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <Titulo className="text-base font-semibold leading-6 text-fore">{titulo}</Titulo>
          {detalle && <p className="text-xs leading-4 text-mute">{detalle}</p>}
        </div>
        {acciones && <div className="flex shrink-0 flex-wrap items-center gap-2">{acciones}</div>}
      </header>
      {children}
    </Card>
  )
}
