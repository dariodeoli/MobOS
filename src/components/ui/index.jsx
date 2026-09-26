import { useEffect, useId, useRef } from 'react'
import {
  Input,
  LIMITE_MONTO_GENERAL,
  TAMANOS_CAMPO,
  excedeMonto,
  formatGsInput,
  formatUsdInput,
  largoMaximoMonto,
  limiteMonto,
  parseGsInput,
  parseUsdInput,
} from 'owncoding-ui'
import { cn } from '@/lib/utils'
import { TAMANO_MODAL_PREDETERMINADO, TAMANOS_MODAL } from '@/components/shared/modal'

// ── Kit compartido (#253) ───────────────────────────────────────────
// La mayoría de los objetos vive en `owncoding-ui` y acá se re-exporta para
// conservar la ruta histórica `@/components/ui`: los consumidores no cambian.
// Quedan locales solo los que tienen una decisión de diseño pendiente con DSN:
// `Card` (radio), `Modal`/`Drawer` (superficie), `MoneyInput` (símbolo «Gs.»)
// y `Stat` (delta sin flechas). Al resolverse, se puentean como el resto.
export {
  Aviso,
  Badge,
  BarraProgreso,
  Button,
  CeldaMoneda,
  ConfirmDialog,
  DataTable,
  Dot,
  EmptyState,
  ErrorState,
  Eyebrow,
  FilaDato,
  FormField,
  IconAction,
  Input,
  Label,
  Money,
  Nota,
  PageHeader,
  PasswordInput,
  PinInput,
  Select,
  Skeleton,
  Subtabs,
  Textarea,
  ToastProvider,
  useToast,
} from 'owncoding-ui'

// ── Card (local: radio del tema pendiente con DSN) ──────────────────
export function Card({ className, ...props }) {
  return (
    <div className={cn('rounded-xl border border-ink-600 bg-ink p-5 shadow-card', className)} {...props} />
  )
}

// ── MoneyInput (local: el símbolo «Gs.» espera decisión de diseño) ──
const MONEY_SYMBOL = { PYG: 'Gs.', USD: 'US$', BRL: 'R$', EUR: '€', USDT: 'USDT' }

export function MoneyInput({ currency = 'PYG', symbol, value, onValueChange, className, max = LIMITE_MONTO_GENERAL, maxLength, ...props }) {
  const isPyg = currency === 'PYG'
  const prefix = symbol || MONEY_SYMBOL[currency] || currency
  const display = isPyg ? formatGsInput(value) : formatUsdInput(value)
  const limite = limiteMonto(max)
  const excede = excedeMonto(value, limite)
  // Largo máximo del campo: el monto más grande documentado (con separadores)
  // entra completo y no se puede escribir de más; se puede pisar por prop.
  const topeLargo = maxLength ?? largoMaximoMonto(max, { decimales: !isPyg })
  // El prefijo es una ayuda visual, no parte del valor: va chico y claro para no
  // comerse el ancho del número (montos grandes se cortaban con «Gs.» a 12px y
  // pl-12; ahora pl-8/pl-11 con el prefijo a 9-10px). El valor conserva todo el
  // espacio posible del campo. El color queda en `text-mute` (el auditor AA
  // exige 4.5:1 en texto chico: atenuarlo más no pasa).
  const prefijoLargo = prefix.length > 3
  return (
    <div className="relative">
      <span className={cn('pointer-events-none absolute top-1/2 z-10 -translate-y-1/2 font-medium text-mute', prefijoLargo ? 'left-2 text-[9px]' : 'left-2.5 text-[10px]')}>
        {prefix}
      </span>
      <Input
        {...props}
        aria-invalid={excede || undefined}
        title={excede ? `El monto supera el máximo permitido (${limite.toLocaleString('es-PY')})` : props.title}
        inputMode={isPyg ? 'numeric' : 'decimal'}
        maxLength={topeLargo}
        value={display}
        onChange={(event) => {
          const next = event.target.value.replace(/[^\d.,]/g, '')
          onValueChange?.(isPyg ? (next.trim() ? parseGsInput(next) : '') : parseUsdInput(next))
        }}
        className={cn(TAMANOS_CAMPO.moneda, prefijoLargo ? 'pl-11' : 'pl-8', 'tabular-nums', className)}
      />
    </div>
  )
}

// ── Modal (local: superficie pendiente con DSN) ─────────────────────
// Popup estándar: Esc, clic afuera, botón cerrar y cierre opcional al guardar.
export function Modal({ open, onClose, title, children, className, size = TAMANO_MODAL_PREDETERMINADO }) {
  const dialog = useRef(null)
  const close = useRef(onClose)
  close.current = onClose
  const titleId = useId()
  useEffect(() => {
    if (!open) return undefined
    const previous = document.activeElement
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.current?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') close.current?.()
      if (e.key !== 'Tab') return
      const nodes = [...(dialog.current?.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]') || [])].filter(el => el.getClientRects().length)
      const first = nodes[0], last = nodes[nodes.length - 1]
      if (!first) { e.preventDefault(); return }
      if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; previous?.focus?.() }
  }, [open])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} className={cn('max-h-[min(90dvh,720px)] w-full overflow-y-auto rounded-2xl border border-ink-600 bg-ink-800 p-4 shadow-float sm:p-6', TAMANOS_MODAL[size] || TAMANOS_MODAL[TAMANO_MODAL_PREDETERMINADO], className)}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id={titleId} className="text-base font-bold text-fore">{title}</h2>
          <button type="button" onClick={onClose} className="toque-44 rounded-lg p-2 text-mute hover:bg-ink-700 hover:text-fore" aria-label="Cerrar">×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ── Drawer (local: superficie pendiente con DSN) ────────────────────
// Cajón lateral: panel con overlay, foco atrapado, Esc y clic afuera.
export function Drawer({ open, onClose, title, children, side = 'right', className }) {
  const panel = useRef(null)
  const close = useRef(onClose)
  close.current = onClose
  const titleId = useId()
  useEffect(() => {
    if (!open) return undefined
    const previous = document.activeElement
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panel.current?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') close.current?.()
      if (e.key !== 'Tab') return
      const nodes = [...(panel.current?.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]') || [])].filter(el => el.getClientRects().length)
      const first = nodes[0], last = nodes[nodes.length - 1]
      if (!first) { e.preventDefault(); return }
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; previous?.focus?.() }
  }, [open])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 bg-black/60" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'absolute inset-y-0 flex max-h-full w-full max-w-md flex-col overflow-hidden border-ink-600 bg-ink-800 shadow-float',
          side === 'left' ? 'left-0 border-r' : 'right-0 border-l',
          className,
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-ink-600 p-4">
          <h2 id={titleId} className="text-base font-bold text-fore">{title}</h2>
          <button type="button" onClick={onClose} className="toque-44 rounded-lg p-2 text-mute hover:bg-ink-700 hover:text-fore" aria-label="Cerrar">×</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">{children}</div>
      </div>
    </div>
  )
}

// ── Stat (local: delta sin flechas, pendiente con DSN) ──────────────
export function Stat({ label, valor, delta, sub, destacado = false, className }) {
  const sube = typeof delta === 'number' && delta >= 0
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl border p-4',
        destacado ? 'border-fono/30 bg-gradient-to-br from-fono-dark via-fono to-fono' : 'border-ink-600 bg-ink-800',
        className,
      )}
    >
      <div className={cn('text-[11px] font-medium uppercase tracking-wider', destacado ? 'text-onbrand/75' : 'text-mute')}>{label}</div>
      <div className={cn('mt-1.5 text-2xl font-semibold tracking-tight tabular-nums md:text-3xl v2-numero', destacado ? 'text-onbrand' : 'text-fore')}>
        {valor}
      </div>
      <div className="mt-1.5 flex items-center gap-2 text-xs">
        {typeof delta === 'number' && (
          <span className={cn('font-medium', sube ? 'text-ok' : 'text-bad')}>
            {sube ? '' : ''} {Math.abs(delta).toFixed(1)}%
          </span>
        )}
        {sub && <span className={destacado ? 'text-onbrand/75' : 'text-mute'}>{sub}</span>}
      </div>
    </div>
  )
}
