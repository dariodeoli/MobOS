import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { formatGs, formatGsInput, parseGsInput, formatUsdInput, parseUsdInput } from '@/utils/moneda'
import Icon from '@/components/shared/Icon'

// ── Button ──────────────────────────────────────────────────────────
const VARIANTS = {
  primary: 'bg-fono text-onbrand hover:bg-fono-light',
  success: 'bg-ok text-black hover:brightness-110',
  danger: 'bg-bad text-fore hover:brightness-110',
  outline: 'bg-transparent text-fore border border-ink-500 hover:border-fono hover:bg-fono/10',
  ghost: 'bg-transparent text-mute hover:bg-ink-700 hover:text-fore',
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
        'w-full rounded-lg border border-ink-500 bg-ink-800 px-3.5 text-fore',
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
        className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-lg text-mute transition hover:text-fore focus-visible:z-10"
        aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        aria-pressed={visible}
        title={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
      >
        <Icon name={visible ? 'eyeOff' : 'eye'} className="h-4 w-4" />
      </button>
    </div>
  )
}

// PIN de 4 dígitos: campo compacto y centrado tipo código, con animación de
// foco y avance automático al completar. Diseñado para no ocupar el ancho
// completo del formulario.
export function PinInput({ value, onChange, onComplete, autoFocus = false, disabled = false, inputRef, ariaLabel = 'PIN de 4 dígitos', className, id }) {
  return (
    <input
      ref={inputRef}
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={4}
      value={value}
      autoFocus={autoFocus}
      disabled={disabled}
      onChange={(event) => {
        const next = event.target.value.replace(/\D/g, '').slice(0, 4)
        onChange(next)
        if (next.length === 4) onComplete?.()
      }}
      placeholder="••••"
      aria-label={ariaLabel}
      className={cn(
        'mx-auto block h-16 w-44 rounded-2xl border border-ink-500 bg-paper text-center text-3xl font-bold tracking-[.45em] text-fore shadow-card transition-all duration-150 placeholder:text-mute/40 focus:scale-[1.03] focus:border-fono focus:ring-2 focus:ring-fono/30 focus:outline-none',
        className,
      )}
    />
  )
}

// Campo monetario central: PYG se escribe siempre con separador de miles;
// el resto de las monedas conserva 2 decimales (coma es-PY). Entrega el
// número limpio al formulario padre. `symbol` sobreescribe el prefijo cuando
// el campo muestra un importe en una moneda distinta a su etiqueta.
const MONEY_SYMBOL = { PYG: 'Gs.', USD: 'US$', BRL: 'R$', EUR: '€', USDT: 'USDT' }
export function MoneyInput({ currency = 'PYG', symbol, value, onValueChange, className, ...props }) {
  const isPyg = currency === 'PYG'
  const prefix = symbol || MONEY_SYMBOL[currency] || currency
  const display = isPyg ? formatGsInput(value) : formatUsdInput(value)
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3.5 top-1/2 z-10 -translate-y-1/2 text-xs font-semibold text-mute">
        {prefix}
      </span>
      <Input
        {...props}
        inputMode={isPyg ? 'numeric' : 'decimal'}
        value={display}
        onChange={(event) => {
          const next = event.target.value.replace(/[^\d.,]/g, '')
          onValueChange?.(isPyg ? (next.trim() ? parseGsInput(next) : '') : parseUsdInput(next))
        }}
        className={cn(prefix.length > 3 ? 'pl-14' : 'pl-12', 'tabular-nums', className)}
      />
    </div>
  )
}

// ── Money ───────────────────────────────────────────────────────────
// Importe de solo lectura: guaraníes con el formato canónico del repo y
// dólares con separador en-US, sin convertir moneda. Un valor no finito
// se muestra como raya para no inventar cifras.
export function Money({ value, currency = 'PYG', className }) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return <span className={className}>—</span>
  return (
    <span className={className}>
      {currency === 'USD'
        ? `US$ ${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
        : formatGs(amount)}
    </span>
  )
}

// ── Select (nativo, estilizado) ─────────────────────────────────────
export function Select({ className, children, ...props }) {
  return (
    <select
      className={cn(
        'w-full rounded-lg border border-ink-500 bg-ink-800 px-3 text-fore',
        'h-11 md:h-9 text-base md:text-sm outline-none transition cursor-pointer',
        'focus:border-fono focus:ring-1 focus:ring-fono/40',
        '[&>option]:bg-ink-800 [&>option]:text-fore',
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
        'w-full rounded-lg border border-ink-500 bg-ink-800 px-3.5 py-2.5 text-fore',
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

// ── Eyebrow ─────────────────────────────────────────────────────────
// Etiqueta superior pequeña; la clase repetida del repo para secciones.
export function Eyebrow({ className, ...props }) {
  return (
    <div
      className={cn('text-xs font-bold uppercase tracking-[.18em] text-fono-light', className)}
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
          <h2 id={titleId} className="text-base font-bold text-fore">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-mute hover:bg-ink-700 hover:text-fore" aria-label="Cerrar">×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

// Confirmación propia de MobOS. Evita confirm()/alert() del navegador y
// conserva foco, Escape, clic afuera y lectura accesible en toda la app.
export function ConfirmDialog({
  open,
  onCancel,
  onConfirm,
  title = 'Confirmar acción',
  description,
  confirmLabel = 'Confirmar',
  variant = 'primary',
  busy = false,
}) {
  return (
    <Modal open={open} onClose={busy ? undefined : onCancel} title={title} className="max-w-md">
      <div className="space-y-5">
        <div className={cn('flex h-11 w-11 items-center justify-center rounded-2xl', variant === 'danger' ? 'bg-bad/10 text-bad' : 'bg-fono/10 text-fono-light')}>
          <Icon name={variant === 'danger' ? 'alert' : 'check'} className="h-5 w-5" />
        </div>
        <p className="text-sm leading-6 text-mute">{description}</p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>Cancelar</Button>
          <Button type="button" variant={variant} onClick={onConfirm} disabled={busy}>{busy ? 'Procesando…' : confirmLabel}</Button>
        </div>
      </div>
    </Modal>
  )
}

// ── Badge ───────────────────────────────────────────────────────────
const BADGE = {
  blue: 'bg-fono/15 text-fono-light border-fono/25',
  green: 'bg-ok/15 text-ok border-ok/25',
  red: 'bg-bad/15 text-bad border-bad/25',
  orange: 'bg-warn/15 text-warn border-warn/25',
  yellow: 'bg-warn/15 text-warn border-warn/25',
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

// ── Drawer ──────────────────────────────────────────────────────────
// Panel lateral móvil: overlay, foco atrapado, Esc y clic afuera. Mismo
// nivel de robustez que el Modal; entra deslizándose desde el costado.
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
          'absolute inset-y-0 flex max-h-full w-full max-w-md flex-col overflow-hidden border-ink-600 bg-ink-800 shadow-2xl',
          side === 'left' ? 'left-0 border-r' : 'right-0 border-l',
          className,
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-ink-600 p-4">
          <h2 id={titleId} className="text-base font-bold text-fore">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-mute hover:bg-ink-700 hover:text-fore" aria-label="Cerrar">×</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">{children}</div>
      </div>
    </div>
  )
}

// ── Toasts globales ─────────────────────────────────────────────────
const ToastContext = createContext(null)
let toastCounter = 0
const TOAST_ICON = { success: 'check', error: 'alert', info: 'info' }
const TOAST_TONE = { success: 'text-ok', error: 'text-bad', info: 'text-fono-light' }

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const dismiss = useCallback((id) => setToasts(current => current.filter(toast => toast.id !== id)), [])
  const toast = useCallback((variant, title, description) => {
    const id = `toast-${++toastCounter}`
    setToasts(current => [...current, { id, variant: TOAST_ICON[variant] ? variant : 'info', title, description }])
    setTimeout(() => dismiss(id), 4000)
  }, [dismiss])
  const value = useMemo(() => ({
    success: (title, description) => toast('success', title, description),
    error: (title, description) => toast('error', title, description),
    info: (title, description) => toast('info', title, description),
  }), [toast])
  if (!mounted) return children
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 left-4 right-4 z-[60] flex max-w-sm flex-col gap-2 sm:left-auto sm:w-full" aria-live="polite" role="status">
        {toasts.map(toast => (
          <div key={toast.id} className={cn('pointer-events-auto flex items-start gap-3 rounded-xl border bg-ink-700 p-3.5 shadow-card', toast.variant === 'error' ? 'border-bad/40' : toast.variant === 'success' ? 'border-ok/40' : 'border-ink-500')}>
            <Icon name={TOAST_ICON[toast.variant]} className={cn('mt-0.5 h-4 w-4', TOAST_TONE[toast.variant])} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-fore">{toast.title}</p>
              {toast.description && <p className="mt-0.5 text-xs text-mute">{toast.description}</p>}
            </div>
            <button type="button" onClick={() => dismiss(toast.id)} className="rounded-md p-1 text-mute transition hover:bg-ink-600 hover:text-fore" aria-label="Cerrar aviso">×</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) return { success: () => {}, error: () => {}, info: () => {} }
  return context
}

// ── Skeleton ────────────────────────────────────────────────────────
export function Skeleton({ className }) {
  return <div className={cn('animate-pulse rounded-lg bg-fore/5', className)} aria-hidden="true" />
}

// ── EmptyState ──────────────────────────────────────────────────────
export function EmptyState({ icon = 'box', title, description, action, compact = false, className }) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 text-center', compact ? 'py-6' : 'py-12', className)}>
      <div className="grid h-12 w-12 place-items-center rounded-2xl border border-ink-500 bg-ink-700 text-mute">
        <Icon name={icon} className="h-5 w-5" />
      </div>
      {title && <p className="mt-3 text-sm font-semibold text-fore">{title}</p>}
      {description && <p className="mt-1 max-w-xs text-xs leading-5 text-mute">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

// ── ErrorState ──────────────────────────────────────────────────────
export function ErrorState({ title = 'Algo salió mal', description, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-2xl border border-bad/25 bg-bad/10 text-bad">
        <Icon name="alert" className="h-5 w-5" />
      </div>
      <p className="mt-3 text-sm font-semibold text-fore">{title}</p>
      {description && <p className="mt-1 max-w-xs text-xs leading-5 text-mute">{description}</p>}
      {onRetry && (
        <Button type="button" variant="outline" onClick={onRetry} className="mt-4">
          Reintentar
        </Button>
      )}
    </div>
  )
}

// ── PageHeader ──────────────────────────────────────────────────────
export function PageHeader({ title, subtitle, actions, backTo, eyebrow }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        {backTo && (
          <button
            type="button"
            onClick={backTo}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-ink-500 text-mute transition hover:border-fono hover:bg-fono/10 hover:text-fore"
            aria-label="Volver"
          >
            <Icon name="back" className="h-4 w-4" />
          </button>
        )}
        <div className="min-w-0">
          {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
          <h1 className="truncate text-2xl font-bold">{title}</h1>
          {subtitle && <p className="mt-1 truncate text-sm text-mute">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

// ── DataTable ───────────────────────────────────────────────────────
// En md+ una tabla real con cabecera; en móvil tarjetas apiladas vía
// mobileCard(row). Sin mobileCard, el móvil muestra un EmptyState chico.
export function DataTable({ columns, rows, emptyLabel = 'Sin datos para mostrar.', loading = false, mobileCard, className }) {
  if (loading) {
    return (
      <div className={cn('space-y-2 p-4', className)} aria-busy="true">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    )
  }
  if (!rows?.length) return <EmptyState title={emptyLabel} description="" className={className} />
  return (
    <div className={className}>
      <div className="hidden max-h-[70vh] overflow-auto md:block">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-ink-800">
            <tr className="border-b border-ink-600 text-left text-xs uppercase tracking-wider text-mute">
              {columns.map(column => (
                <th key={column.key} className={cn('px-4 py-3 font-medium', column.align === 'right' && 'text-right', column.align === 'center' && 'text-center')}>{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.id ?? row.key ?? JSON.stringify(row)} className="border-b border-ink-600/60 last:border-0">
                {columns.map(column => (
                  <td key={column.key} className={cn('px-4 py-3 text-fore', column.align === 'right' && 'text-right', column.align === 'center' && 'text-center')}>
                    {column.render ? column.render(row) : row[column.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid grid-cols-1 gap-3 p-4 md:hidden">
        {mobileCard
          ? rows.map(row => <div key={row.id ?? row.key ?? JSON.stringify(row)}>{mobileCard(row)}</div>)
          : <EmptyState icon="filter" title={emptyLabel} />}
      </div>
    </div>
  )
}

// ── FormField ───────────────────────────────────────────────────────
export function FormField({ label, hint, error, children, htmlFor }) {
  return (
    <div>
      {label && <Label htmlFor={htmlFor}>{label}</Label>}
      {children}
      {error ? <p role="alert" className="mt-1.5 text-xs text-bad">{error}</p> : hint ? <p className="mt-1.5 text-xs text-mute">{hint}</p> : null}
    </div>
  )
}

// ── Tarjeta de métrica (KPI con tendencia) ──────────────────────────
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
      <div className={cn('mt-1.5 text-2xl font-semibold tracking-tight md:text-3xl', destacado ? 'text-onbrand' : 'text-fore')}>
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
