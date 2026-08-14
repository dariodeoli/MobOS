import { cn } from '@/lib/utils'

// ── Button ──────────────────────────────────────────────────────────
const VARIANTS = {
  primary: 'bg-fono text-white hover:bg-fono-dark',
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
