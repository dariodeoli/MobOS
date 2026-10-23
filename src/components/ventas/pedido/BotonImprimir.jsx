import { MenuDesplegable } from '@/components/ui'
import Icon from '@/components/shared/Icon'

// «Imprimir» estilo Shopify: botón principal con el último formato usado por esta
// persona y un ▾ al lado para elegir otro (el elegido imprime y pasa a ser el
// último). «Vista previa y opciones» abre el comprobante completo (niveles,
// recibo de regalo, impresión directa).
export default function BotonImprimir({ formatoActual, etiquetaActual, formatos, imprimiendo = false, onImprimir, onVistaPrevia }) {
  return (
    <span className="inline-flex items-stretch" data-testid="pedido-imprimir">
      <button
        type="button"
        data-testid="pedido-imprimir-principal"
        aria-label={`Imprimir (${etiquetaActual})`}
        title={`Imprimir: ${etiquetaActual}`}
        disabled={imprimiendo}
        onClick={() => onImprimir(formatoActual)}
        className="inline-flex min-h-11 items-center gap-1 rounded-l-lg border border-ink-500 px-2.5 text-xs font-semibold leading-none text-fore transition hover:bg-ink-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-fono disabled:opacity-60"
      >
        <Icon name="printer" className="h-3.5 w-3.5" />
        <span>{imprimiendo ? 'Preparando…' : 'Imprimir'}</span>
      </button>
      <MenuDesplegable
        alineacion="right"
        ariaLabel="Elegir formato de impresión"
        className="-ml-px"
        trigger={(
          <span data-testid="pedido-imprimir-formato" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-r-lg border border-ink-500 px-2 text-fore lg:min-w-9 hover:bg-ink-700">
            <span className="sr-only">Elegir formato de impresión</span>
            <Icon name="chevron" className="h-3.5 w-3.5" />
          </span>
        )}
        items={[
          ...formatos.map(({ id, etiqueta }) => ({
            id,
            label: etiqueta,
            extra: id === formatoActual ? <Icon name="check" className="h-3.5 w-3.5 text-ok" /> : null,
            onClick: () => onImprimir(id),
          })),
          { separador: true },
          { id: 'vista-previa', label: 'Vista previa y opciones…', onClick: onVistaPrevia },
        ]}
      />
    </span>
  )
}
