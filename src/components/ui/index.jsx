import { cn } from '@/lib/utils'

// ── Button ──────────────────────────────────────────────────────────
const VARIANTS = {
  primary: 'bg-fono text-white hover:bg-fono-dark shadow-sm',
  success: 'bg-ok text-white hover:brightness-95',
  danger: 'bg-bad text-white hover:brightness-95',
  outline: 'bg-white text-fono border-2 border-fono hover:bg-fono-light',
  ghost: 'bg-transparent text-slate-600 hover:bg-slate-100',
}
export function Button({ className, variant = 'primary', ...props }) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl px-4 font-bold transition',
        'h-11 md:h-10 text-sm disabled:opacity-40 disabled:cursor-not-allowed active:scale-[.98]',
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
        'w-full rounded-xl border-2 border-slate-200 bg-white px-3.5',
        'h-11 md:h-10 text-base md:text-sm outline-none transition',
        'focus:border-fono placeholder:text-slate-400',
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
        'w-full rounded-xl border-2 border-slate-200 bg-white px-3',
        'h-11 md:h-10 text-base md:text-sm outline-none transition cursor-pointer',
        'focus:border-fono',
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
        'w-full rounded-xl border-2 border-slate-200 bg-white px-3.5 py-2.5',
        'text-base md:text-sm outline-none transition focus:border-fono',
        'placeholder:text-slate-400 resize-none',
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
        'block text-xs font-bold uppercase tracking-wide text-slate-500 mb-1.5',
        className,
      )}
      {...props}
    />
  )
}

// ── Card ────────────────────────────────────────────────────────────
export function Card({ className, ...props }) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-fono/10 bg-white p-5 shadow-card',
        className,
      )}
      {...props}
    />
  )
}

// ── Badge ───────────────────────────────────────────────────────────
const BADGE = {
  blue: 'bg-blue-100 text-blue-700',
  green: 'bg-emerald-100 text-emerald-700',
  red: 'bg-red-100 text-red-700',
  orange: 'bg-amber-100 text-amber-700',
  slate: 'bg-slate-100 text-slate-600',
}
export function Badge({ className, color = 'slate', ...props }) {
  return (
    <span
      className={cn(
        'inline-block rounded-full px-2.5 py-0.5 text-xs font-bold',
        BADGE[color],
        className,
      )}
      {...props}
    />
  )
}
