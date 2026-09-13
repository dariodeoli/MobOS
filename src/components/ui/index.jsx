import { useEffect, useId, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { formatGsInput, parseGsInput } from '@/utils/moneda'
import Icon from '@/components/shared/Icon'

// ── Button ──────────────────────────────────────────────────────────
const VARIANTS = {
  primary: 'bg-fono text-ink hover:bg-fono-light',
  success: 'bg-ok text-black hover:brightness-110',
  danger: 'bg-bad text-white hover:brightness-110',
  outline: 'bg-transparent text-white border border-ink-500 hover:border-fono hover:bg-fono/10',
  ghost: 'bg-transparent text-mute hover:bg-ink-700 hover:text-white',
}
export function Button({ className, variant = 'primary', ...props }) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg px-4 font-semibold transition',
        'h-11 md:h-9 text-sm disabled:opacity-30 disabled:cursor-not-allowed active:scale-[.98]',
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  )
}

// ── Input ───────────────────────────────────────────────────────────
export function Input({ className, ...props }) {
  return (
    <input
      className={cn(
        'w-full rounded-lg border border-ink-500 bg-ink-800 px-3.5 text-white',
        'h-11 md:h-9 text-base md:text-sm outline-none transition',
        'focus:border-fono focus:ring-1 focus:ring-fono/40 placeholder:text-mute/60',
        className,
      )}
      {...props}
    />
  )
}

// Campo de contraseña reutilizable: mantiene el valor oculto por defecto y
// permite comprobarlo puntualmente sin perder foco ni accesibilidad.
export function PasswordInput({ className, ...props }) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <Input {...props} type={visible ? 'text' : 'password'} className={cn('pr-11', className)} />
      <button
        type="button"
        onClick={() => setVisible(current => !current)}
        className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-lg text-mute transition hover:text-white focus-visible:z-10"
        aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        aria-pressed={visible}
        title={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
      >
        <Icon name={visible ? 'eyeOff' : 'eye'} className="h-4 w-4" />
      </button>
    </div>
  )
}

// Campo monetario central: PYG se escribe siempre con separador de miles;
// USD conserva decimales. Entrega el número limpio al formulario padre.
export function MoneyInput({ currency = 'PYG', value, onValueChange, className, ...props }) {
  const isPyg = currency === 'PYG'
  const display = isPyg ? formatGsInput(value) : String(value ?? '')
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3.5 top-1/2 z-10 -translate-y-1/2 text-xs font-semibold text-mute">
        {isPyg ? 'Gs.' : 'US$'}
      </span>
      <Input
        {...props}
        inputMode={isPyg ? 'numeric' : 'decimal'}
        value={display}
        onChange={(event) => {
          const next = event.target.value
          onValueChange?.(isPyg ? (next.trim() ? parseGsInput(next) : '') : next.replace(/[^\d.,]/g, '').replace(',', '.'))
        }}
        className={cn('pl-12 tabular-nums', className)}
      />
    </div>
  )
}

// ── Select (nativo, estilizado) ─────────────────────────────────────
export function Select({ className, children, ...props }) {
  return (
    <select
      className={cn(
        'w-full rounded-lg border border-ink-500 bg-ink-800 px-3 text-white',
        'h-11 md:h-9 text-base md:text-sm outline-none transition cursor-pointer',
        'focus:border-fono focus:ring-1 focus:ring-fono/40',
        '[&>option]:bg-ink-800 [&>option]:text-white',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  )
}

// ── Textarea ────────────────────────────────────────────────────────
export function Textarea({ className, ...props }) {
  return (
    <textarea
      className={cn(
        'w-full rounded-lg border border-ink-500 bg-ink-800 px-3.5 py-2.5 text-white',
        'text-base md:text-sm outline-none transition focus:border-fono focus:ring-1 focus:ring-fono/40',
        'placeholder:text-mute/60 resize-none',
        className,
      )}
      {...props}
    />
  )
}

// ── Label ───────────────────────────────────────────────────────────
export function Label({ className, ...props }) {
  return (
    <label
      className={cn(
        'block text-[11px] font-medium uppercase tracking-wider text-mute mb-1.5',
        className,
      )}
      {...props}
    />
  )
}

// ── Card ────────────────────────────────────────────────────────────
export function Card({ className, ...props }) {
  return (
    <div className={cn('rounded-xl border border-fono/30 bg-ink-800 p-5', className)} {...props} />
  )
}

// Popup estándar: Esc, clic afuera, botón cerrar y cierre opcional al guardar.
export function Modal({ open, onClose, title, children, className }) {
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
      <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} className={cn('max-h-[min(90dvh,720px)] w-full max-w-lg overflow-y-auto rounded-2xl border border-ink-600 bg-ink-800 p-4 shadow-2xl sm:p-6', className)}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id={titleId} className="text-base font-bold text-white">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-mute hover:bg-ink-700 hover:text-white" aria-label="Cerrar">×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ── Badge ───────────────────────────────────────────────────────────
const BADGE = {
  blue: 'bg-fono/15 text-fono-light border-fono/25',
  green: 'bg-ok/15 text-ok border-ok/25',
  red: 'bg-bad/15 text-bad border-bad/25',
  orange: 'bg-warn/15 text-warn border-warn/25',
  slate: 'bg-ink-600 text-mute border-ink-500',
}
export function Badge({ className, color = 'slate', ...props }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium',
        BADGE[color],
        className,
      )}
      {...props}
    />
  )
}

// ── Punto de estado (semáforo minimalista) ──────────────────────────
const DOT = { green: 'bg-ok', red: 'bg-bad', blue: 'bg-fono', slate: 'bg-mute', orange: 'bg-warn' }
export function Dot({ color = 'slate', pulse = false, className }) {
  return (
    <span className={cn('relative inline-flex h-2 w-2 shrink-0', className)}>
      {pulse && (
        <span
          className={cn(
            'absolute inline-flex h-full w-full animate-ping rounded-full opacity-60',
            DOT[color],
          )}
        />
      )}
      <span className={cn('relative inline-flex h-2 w-2 rounded-full', DOT[color])} />
    </span>
  )
}

// ── Tarjeta de métrica (KPI con tendencia) ──────────────────────────
export function Stat({ label, valor, delta, sub, destacado = false, className }) {
  const sube = typeof delta === 'number' && delta >= 0
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl border p-4',
        destacado ? 'border-fono/30 bg-blue-blur' : 'border-ink-600 bg-ink-800',
        className,
      )}
    >
      <div className="text-[11px] font-medium uppercase tracking-wider text-mute">{label}</div>
      <div className="mt-1.5 text-2xl font-semibold tracking-tight text-white md:text-3xl">
        {valor}
      </div>
      <div className="mt-1.5 flex items-center gap-2 text-xs">
        {typeof delta === 'number' && (
          <span className={cn('font-medium', sube ? 'text-ok' : 'text-bad')}>
            {sube ? '' : ''} {Math.abs(delta).toFixed(1)}%
          </span>
        )}
        {sub && <span className="text-mute">{sub}</span>}
      </div>
    </div>
  )
}
