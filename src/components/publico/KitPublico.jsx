import { useState } from 'react'
import { cn } from '@/lib/utils'
import { gs } from '@/utils/calculos'
import { whatsappUrl } from '@/utils/telefono'
import { copiarAlPortapapeles } from '@/utils/portapapeles'
import { FilaDato } from '@/components/ui'

// Piezas compartidas por las páginas públicas para clientes (#403). Mismo
// lenguaje que el comprobante premium (OrderReceipt): encabezado con logo y
// tienda, estado como protagonista, importes alineados con el Total grande.
// Reglas: una columna en móvil, objetivos táctiles de 44 px, texto >= 12 px.

export const BOTON_PUBLICO = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fono/60'

// Encabezado de la tienda: logo (si hay), nombre, sucursal y estado a la derecha.
export function CabeceraTienda({ logo, logoClaro, empresa, detalle, etiqueta, children }) {
  const [logoOk, setLogoOk] = useState(true)
  return (
    <header className="rounded-2xl border border-ink-600 bg-ink-900 p-4" data-testid="cabecera-tienda">
      <div className="flex items-start gap-3">
        {logo && logoOk && (
          <>
            <img src={logo} alt={`Logo de ${empresa || 'la tienda'}`} onError={() => setLogoOk(false)} className="h-11 w-auto max-w-[120px] shrink-0 object-contain print:hidden" />
            <img src={logoClaro || logo} alt="" className="hidden h-11 w-auto max-w-[120px] shrink-0 object-contain print:block" />
          </>
        )}
        <div className="min-w-0 flex-1">
          {empresa && <p className="text-base font-bold leading-tight [overflow-wrap:anywhere]">{empresa}</p>}
          {detalle && <p className="mt-0.5 text-xs leading-snug text-mute [overflow-wrap:anywhere]">{detalle}</p>}
        </div>
        {etiqueta}
      </div>
      {children}
    </header>
  )
}

// Línea de tiempo del estado: pasos con marca, nombre y fecha, legible en 360 px.
// Cada paso: { key, label, hecho, actual, at }. En móvil va en vertical (una
// columna) y desde sm en horizontal.
export function LineaTiempo({ pasos, formatoFecha, etiqueta = 'Progreso' }) {
  if (!pasos?.length) return null
  return (
    <ol aria-label={etiqueta} data-testid="linea-tiempo" style={{ '--pasos': pasos.length }} className="flex flex-col sm:grid sm:gap-2 sm:[grid-template-columns:repeat(var(--pasos),minmax(0,1fr))]">
      {pasos.map((paso, index) => (
        <li key={paso.key} aria-current={paso.actual ? 'step' : undefined} className="flex items-start gap-3 sm:block sm:text-center">
          <span aria-hidden="true" className="flex flex-col items-center self-stretch sm:hidden">
            <span className={cn('mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 text-xs font-bold leading-none', paso.hecho ? 'border-fono-light bg-fono-light text-ink-950' : 'border-ink-500 bg-ink-900', paso.actual && 'ring-4 ring-fono/30')}>{paso.hecho ? '✓' : ''}</span>
            {index < pasos.length - 1 && <span className={cn('my-1 min-h-3 w-0.5 flex-1', paso.hecho ? 'bg-fono-light' : 'bg-ink-600')} />}
          </span>
          <span aria-hidden="true" className={cn('hidden h-2 rounded-full sm:block', paso.hecho ? 'bg-fono-light' : 'bg-ink-600', paso.actual && 'ring-2 ring-fono/40')} />
          <span className="min-w-0 pb-3 sm:block sm:pb-0">
            <span className={cn('block text-sm font-semibold leading-tight sm:mt-2 sm:text-xs', paso.hecho ? 'text-fore' : 'text-mute')}>{paso.label}</span>
            {paso.at && formatoFecha && <span className="block text-xs text-mute">{formatoFecha(paso.at)}</span>}
          </span>
        </li>
      ))}
    </ol>
  )
}

// Botón de WhatsApp de la tienda: siempre a mano. Sin teléfono no se dibuja.
export function BotonWhatsApp({ telefono, codigoPais, mensaje, etiqueta = 'Escribir por WhatsApp', className }) {
  const href = whatsappUrl(telefono, mensaje, codigoPais)
  if (!href) return null
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" data-testid="boton-whatsapp" className={cn(BOTON_PUBLICO, 'border-ok/50 bg-ok/10 text-ok hover:bg-ok/20', className)}>
      {etiqueta}
    </a>
  )
}

// Copiar un dato (alias, cuenta, enlace) con confirmación visible.
export function BotonCopiar({ valor, etiqueta = 'Copiar', className }) {
  const [copiado, setCopiado] = useState(false)
  async function copiar() {
    if (await copiarAlPortapapeles(String(valor ?? ''))) {
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    }
  }
  return (
    <button type="button" onClick={copiar} className={cn(BOTON_PUBLICO, 'border-ink-500 bg-ink-800 text-fore hover:border-fono', className)}>
      <span aria-live="polite">{copiado ? 'Copiado' : etiqueta}</span>
    </button>
  )
}

// Totales: importes alineados a la derecha en guaraníes completos y el Total
// grande al final (igual que el comprobante). `filas`: [{ etiqueta, valor, tono }].
export function ResumenTotales({ filas = [], total, etiquetaTotal = 'Total', pendiente }) {
  return (
    <div data-testid="resumen-totales">
      {filas.length > 0 && (
        <dl className="space-y-1.5 text-sm">
          {filas.map(fila => (
            <FilaDato key={fila.etiqueta} etiqueta={fila.etiqueta} etiquetaComo="dt" valorComo="dd" valor={fila.valor} tono={fila.tono} />
          ))}
        </dl>
      )}
      <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-ink-600 pt-3">
        <span className="text-sm font-bold uppercase tracking-wider text-mute">{etiquetaTotal}</span>
        <span className="text-right text-2xl font-extrabold tabular-nums tracking-tight">{typeof total === 'number' ? gs(total) : total}</span>
      </div>
      {pendiente != null && (
        <p className={cn('mt-1 text-right text-sm font-bold tabular-nums', Number(pendiente) > 0 ? 'text-warn' : 'text-ok')}>
          {Number(pendiente) > 0 ? `Saldo pendiente ${gs(pendiente)}` : 'Pagado por completo'}
        </p>
      )}
    </div>
  )
}
