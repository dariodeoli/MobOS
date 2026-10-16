import { useEffect, useRef } from 'react'
import { Popover } from 'owncoding-ui'
import Icon from '@/components/shared/Icon'
import { cn } from '@/lib/utils'

// #450 · El circuito de abastecimiento en una sola pieza: cada pestaña dice en
// una línea para qué sirve, tiene un «?» con antes/después/ejemplo y un
// recorrido (Por comprar → Centro → Preparar compra → Preparar lote →
// Recepción → Stock) que marca dónde está. Los textos viven acá para que las
// cinco pantallas no se contradigan.

export const PASOS_FLUJO = [
  { id: 'abastecimiento', corto: 'Por comprar', ruta: '/abastecimiento' },
  { id: 'compras-centro', corto: 'Centro', ruta: '/compras-centro' },
  { id: 'preparacion', corto: 'Preparar compra', ruta: '/preparacion' },
  { id: 'lotes', corto: 'Preparar lote', ruta: '/preparar-lote' },
  { id: 'recepcion', corto: 'Recepción', ruta: '/recepcion' },
  { id: 'stock', corto: 'Stock', ruta: '/stock/unidades' },
]

export const AYUDA_FLUJO = {
  abastecimiento: {
    titulo: 'Por comprar',
    linea: 'Lo que hay que comprar: pedidos sin stock, reservas y reposición. Al comprar, sale de acá y pasa al Centro.',
    detalle: [
      'Para qué sirve: juntar lo que falta y decidir qué se compra primero.',
      'Antes: ventas sin stock, reservas y stock bajo generan las necesidades. Después: lo comprado va a «Compras del Centro» y sus IMEI quedan pendientes en «Preparar compra».',
      'Ejemplo: un pedido de 2 iPhone 15 Pro sin stock → lo comprás → queda como CMP-AUR-0001 con 0/2 IMEI.',
    ],
  },
  'compras-centro': {
    titulo: 'Compras del Centro',
    linea: 'Todo lo comprado, con sus IMEI cargados y el estado de cada unidad (pendiente, recibido, verificado).',
    detalle: [
      'Para qué sirve: ver qué se compró, qué IMEI tiene cada línea y qué falta llegar.',
      'Antes: «Por comprar». Después: «Preparar compra» para cargar los IMEI y «Preparar lote» para despacharlos.',
      'Ejemplo: CMP-AUR-0001 · AirPods Pro 2 · 3/8 IMEI cargados, 0 recibidos.',
    ],
  },
  preparacion: {
    titulo: 'Preparar compra',
    linea: 'Cargá el IMEI de cada equipo comprado (escáner, cámara o pegado) antes de despacharlo.',
    detalle: [
      'Para qué sirve: dejar cada unidad identificada por IMEI antes de que viaje.',
      'Antes: la compra en el Centro. Después: se arma el lote en «Preparar lote» y se recibe en «Recepción».',
      'Ejemplo: escaneás el IMEI del iPhone y la línea pasa de 1/2 a 2/2; si te equivocás, lo quitás de la lista.',
    ],
  },
  lotes: {
    titulo: 'Preparar lote',
    linea: 'Armá el despacho: completá los IMEI que falten de las unidades que van en cada lote y sacá el manifiesto.',
    detalle: [
      'Para qué sirve: que el lote salga con todas sus unidades identificadas y con su manifiesto y etiquetas.',
      'Antes: «Preparar compra». Después: el lote viaja y se confirma en «Recepción».',
      'Ejemplo: el lote LOTE-AUR-0002 lleva 8 AirPods; cargás los 5 IMEI que faltan y lo despachás.',
    ],
  },
  recepcion: {
    titulo: 'Recepción',
    linea: 'Mercadería que viene en camino: de Estados Unidos (Miami) a la casa central y por AEX a la sucursal de Asunción. Acá confirmás qué llegó y entra al stock.',
    detalle: [
      'Para qué sirve: confirmar unidad por unidad lo que llegó; recién ahí entra al stock.',
      'Antes: «Preparar lote» (el lote tiene que estar en tránsito). Después: las unidades quedan en el depósito elegido, en Stock.',
      'Ejemplo: llegan 8 AirPods; escaneás 7, marcás 1 como faltante y confirmás: 7 entran al stock.',
    ],
  },
}

/** Recorrido con el paso actual marcado; los pasos con ruta se pueden abrir. */
export function RecorridoFlujo({ actual, onIr, className }) {
  const recorrido = useRef(null)
  useEffect(() => {
    const nav = recorrido.current
    const mostrarPaso = () => {
      const paso = nav?.querySelector('[aria-current="step"]')
      if (!paso) return
      const marco = nav.getBoundingClientRect()
      const activo = paso.getBoundingClientRect()
      if (activo.right > marco.right) nav.scrollLeft += activo.right - marco.right
      else if (activo.left < marco.left) nav.scrollLeft -= marco.left - activo.left
    }
    mostrarPaso()
    const observer = new ResizeObserver(mostrarPaso)
    if (nav) observer.observe(nav)
    return () => observer.disconnect()
  }, [actual])
  return (
    <nav ref={recorrido} aria-label="Recorrido del abastecimiento" data-testid="recorrido-abastecimiento" className={cn('flex min-w-0 items-center gap-1 overflow-x-auto text-xs sm:flex-wrap', className)}>
      {PASOS_FLUJO.map((paso, indice) => {
        const activo = paso.id === actual
        const clase = cn('inline-flex min-h-11 items-center whitespace-nowrap rounded-full border px-2.5 font-medium', activo ? 'border-fono bg-fono/10 text-fono-light' : 'border-ink-600 text-mute')
        return (
          <span key={paso.id} className="inline-flex shrink-0 items-center gap-1">
            {indice > 0 && <Icon name="arrowRight" className="h-3 w-3 text-mute" />}
            {activo || !onIr
              ? <span className={clase} aria-current={activo ? 'step' : undefined}>{paso.corto}</span>
              : <button type="button" className={cn(clase, 'hover:text-fore')} onClick={() => onIr(paso)}>{paso.corto}</button>}
          </span>
        )
      })}
    </nav>
  )
}

/** Encabezado de pestaña: línea corta + «?» con el detalle + recorrido. */
export default function EncabezadoFlujo({ paso, onIr, className }) {
  const ayuda = AYUDA_FLUJO[paso]
  if (!ayuda) return null
  return (
    <div className={cn('space-y-2', className)} data-testid="encabezado-flujo">
      <div className="flex min-w-0 items-center gap-2">
        <RecorridoFlujo actual={paso} onIr={onIr} className="flex-1" />
        <Popover
          label={`Ayuda: ${ayuda.titulo}`}
          side="bottom"
          align="end"
          trigger={(
            <button type="button" aria-label={`Ayuda: ${ayuda.titulo}`} data-testid="flujo-ayuda" className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-ink-600 text-mute hover:text-fore">
              <Icon name="info" className="h-4 w-4" />
            </button>
          )}
        >
          <div className="max-w-xs space-y-2 p-1 text-sm" data-testid="flujo-detalle">
            <p className="font-semibold">{ayuda.titulo}</p>
            {ayuda.detalle.map((texto) => <p key={texto} className="text-mute">{texto}</p>)}
          </div>
        </Popover>
      </div>
      <p className="hidden text-sm text-mute sm:block" data-testid="flujo-linea">{ayuda.linea}</p>
    </div>
  )
}
