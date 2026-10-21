import { Badge, Button } from '@/components/ui'
import { disenosPro, clonarPlantilla } from '@/lib/printing/plantillas'
import { GRILLA_DOS_COLUMNAS } from '@/components/shared/formulario'
import { cn } from '@/lib/utils'

const COLOR = {
  brand: 'var(--color-fono, #3b82f6)',
  documentTitle: '#64748b',
  documentNumber: '#0f172a',
  date: '#94a3b8',
  customer: '#94a3b8',
  items: '#cbd5e1',
  payments: '#94a3b8',
  warranty: '#94a3b8',
  total: '#0f172a',
  nonFiscal: '#94a3b8',
  qr: '#0f172a',
  barcode: '#0f172a',
}

// Miniatura del diseño: cada elemento es una caja proporcional al papel. No
// reemplaza la vista previa real: sirve para distinguir los diseños de un vistazo.
export function MiniDiseno({ definition, nombre }) {
  const { widthMm, heightMm } = definition.page
  const alto = heightMm ?? Math.max(...definition.elements.map(e => e.yMm + e.heightMm)) + 2
  const escala = 120 / Math.max(widthMm, alto)
  const ancho = widthMm * escala
  const altoPx = alto * escala
  return (
    <svg
      role="img"
      aria-label={`Miniatura de ${nombre}`}
      viewBox={`0 0 ${ancho} ${altoPx}`}
      width={ancho}
      height={altoPx}
      className="shrink-0 rounded border border-ink-500 bg-white"
    >
      {definition.elements
        .filter(e => e.visible)
        .map(e => (
          <rect
            key={e.id}
            x={e.xMm * escala}
            y={e.yMm * escala}
            width={Math.max(1, e.widthMm * escala)}
            height={Math.max(1, e.type === 'text' ? Math.min(e.heightMm, e.fontSizePt * 0.5) * escala : e.heightMm * escala)}
            rx="0.6"
            fill={COLOR[e.binding] || '#cbd5e1'}
            opacity={e.type === 'block' ? 0.45 : 0.8}
          />
        ))}
    </svg>
  )
}

/**
 * Galería de diseños de Impresión Pro de un documento. «Usar» crea (una vez) la
 * plantilla de la empresa a partir del diseño y la deja como predeterminada; el
 * encabezado y el pie estándar quedan siempre. «Personalizar» abre el editor.
 */
export default function GaleriaPro({ kind, store, enUso, habitual, onPersonalizar, onUsar, onQuitar }) {
  const disenos = disenosPro(kind)
  return (
    <section className="space-y-3" aria-label="Galería de diseños Pro" data-testid="galeria-pro">
      <div>
        <h3 className="text-base font-semibold">Galería de diseños Pro</h3>
        <p className="text-sm text-mute">
          Todos conservan el encabezado y el pie estándar del comprobante premium (empresa, tipo de documento,
          número, fecha, leyenda no fiscal y QR). Elegí cuál se usa por defecto para este documento.
        </p>
      </div>
      <div role="list" className={cn(GRILLA_DOS_COLUMNAS, 'xl:grid-cols-3')}>
        <div
          role="listitem"
          className="flex min-w-0 flex-col gap-2 rounded-xl border border-ink-600 p-3"
          data-testid="diseno-habitual"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold">Formato habitual</p>
            {habitual && <Badge color="green">En uso</Badge>}
          </div>
          <p className="text-xs text-mute">El comprobante premium de siempre. No hace falta elegir nada.</p>
          <div className="mt-auto flex flex-wrap gap-2">
            <Button
              className="min-h-11"
              variant="ghost"
              disabled={!store.puedeEditar || store.busy || habitual}
              onClick={onQuitar}
            >
              Usar el habitual
            </Button>
          </div>
        </div>
        {disenos.map(diseno => {
          const activo = enUso === diseno.name
          return (
            <div
          role="listitem"
              key={diseno.name}
              className="flex min-w-0 flex-col gap-2 rounded-xl border border-ink-600 p-3"
              data-testid="diseno-pro"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 break-words font-semibold">{diseno.name}</p>
                {activo && <Badge color="green">En uso</Badge>}
              </div>
              <MiniDiseno definition={diseno.definition} nombre={diseno.name} />
              <p className="text-xs text-mute">
                {diseno.definition.page.widthMm} × {diseno.definition.page.heightMm ?? 'continuo'} mm
              </p>
              <div className="mt-auto flex flex-wrap gap-2">
                <Button
                  className="min-h-11"
                  disabled={!store.puedeEditar || store.busy || activo}
                  onClick={() => onUsar(diseno)}
                  aria-label={`Usar ${diseno.name}`}
                >
                  {activo ? 'En uso' : 'Usar este diseño'}
                </Button>
                <Button
                  className="min-h-11"
                  variant="ghost"
                  onClick={() => onPersonalizar({ ...clonarPlantilla(diseno), context: store.signature })}
                  aria-label={`Ver o personalizar ${diseno.name}`}
                >
                  Ver / personalizar
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
