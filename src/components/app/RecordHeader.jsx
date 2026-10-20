import { createContext, useContext, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import Icon from '@/components/shared/Icon'

// Compact header for DETAIL pages (one record): the shell swaps its list header
// (H1 + section tabs) for a single row owned by the record itself:
// back (icon + list name) · title · status chip · key meta · actions.
// The shell exposes a slot through this context; `RecordHeader` portals into it
// and flags the shell while mounted, so lists keep the regular header.
export const RecordSlotContext = createContext(null)

export default function RecordHeader({ backLabel, onBack, title, mono = false, chip, meta, actions, metaEnLinea = false }) {
  const ctx = useContext(RecordSlotContext)
  const setActivo = ctx?.setActivo
  useLayoutEffect(() => {
    if (!setActivo) return undefined
    setActivo(true)
    return () => setActivo(false)
  }, [setActivo])
  if (!ctx?.slot) return null
  return createPortal(
    <div data-testid="record-header" className="flex min-h-11 min-w-0 flex-wrap items-center gap-x-3 gap-y-0">
      <button
        type="button"
        data-testid="record-header-back"
        onClick={onBack}
        aria-label={`Volver a ${backLabel.toLowerCase()}`}
        className="-ml-2 flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-lg px-2 text-sm font-medium text-mute hover:bg-ink-700 hover:text-fore focus-visible:outline focus-visible:outline-2 focus-visible:outline-fono"
      >
        <Icon name="back" className="h-4 w-4" />
        <span className="hidden sm:inline">{backLabel}</span>
      </button>
      <h1 className={`min-w-0 truncate text-[22px] font-semibold leading-7 tracking-tight ${mono ? 'font-mono' : ''}`}>{title}</h1>
      {chip}
      {meta && <p data-testid="record-header-meta" className={`order-last min-w-0 basis-full truncate pb-1 text-sm text-mute ${metaEnLinea ? '' : 'sm:order-none sm:basis-auto sm:pb-0'}`}>{meta}</p>}
      {actions && <div className="ml-auto flex min-h-11 max-w-full shrink-0 flex-wrap items-center justify-end gap-x-2">{actions}</div>}
    </div>,
    ctx.slot,
  )
}
