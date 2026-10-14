import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { usePantallaAngosta } from '@/hooks/usePantallaAngosta'
import Icon from '@/components/shared/Icon'
import { infoBadge, nombreConBadge } from './sectionTabsBadge'

// Section tabs, never a native dropdown.
//  - below lg: one horizontal scroll strip of 44px tabs with an edge fade;
//  - from lg: tabs inline, the ones that do not fit move to a measured "Más" popover;
//  - `variant="segmented"` is the second level: a compact pill group inside the page.
// Items are `{ id, label, badge?, badgeLabel? }` or `[id, label, badge?]`. `badge` is a
// count shown next to the label (hidden at 0) with an accessible name such as
// "3 pendientes" (`badgeLabel` is the plural noun, default "pendientes").
// Items are `{ id, label }` or `[id, label]`. Every tab carries `data-tab-id`
// and the active one `aria-current="page"` so specs click tabs by id.
const normalize = items =>
  items.map(item => (Array.isArray(item) ? { id: item[0], label: item[1], badge: item[2] } : item))

const TAB_BASE =
  'relative flex shrink-0 items-center whitespace-nowrap border-b-2 px-3 text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-fono'
const tabClass = (activo, extra) =>
  cn(
    TAB_BASE,
    'min-h-11 lg:min-h-10',
    activo ? 'border-fore font-semibold text-fore' : 'border-transparent text-mute hover:text-fore',
    extra,
  )

// Label plus count pill. The pill is decorative (aria-hidden): the button
// carries the full accessible name through aria-label.
function TabLabel({ item }) {
  const info = infoBadge(item)
  if (!info) return item.label
  return (
    <>
      {item.label}
      <span
        aria-hidden="true"
        data-tab-badge
        className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-fono px-1.5 text-[11px] font-bold leading-none tabular-nums text-white"
      >
        {info.texto}
      </span>
    </>
  )
}

function MoreMenu({ items, value, onChange, label, activeInside }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const outside = event => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false)
    }
    const escape = event => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [open])
  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        data-tab-more
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Más ${label.toLowerCase()}`}
        aria-current={activeInside ? 'page' : undefined}
        onClick={() => setOpen(current => !current)}
        className={tabClass(activeInside, 'gap-1')}
      >
        Más
        <Icon name="chevron" className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div
          role="menu"
          aria-label={`Más ${label.toLowerCase()}`}
          className="absolute right-0 top-full z-40 mt-1 min-w-[200px] max-w-[280px] overflow-y-auto rounded-xl border border-ink-600 bg-ink py-1 shadow-xl"
        >
          {items.map(item => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              data-tab-id={item.id}
              aria-label={nombreConBadge(item)}
              aria-current={value === item.id ? 'page' : undefined}
              onClick={() => {
                setOpen(false)
                onChange(item.id)
              }}
              className={cn(
                'flex min-h-10 w-full items-center px-3 text-left text-sm hover:bg-ink-700',
                value === item.id ? 'font-semibold text-fore' : 'text-mute',
              )}
            >
              <TabLabel item={item} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function useVisibleCount(containerRef, measureRef, items, value, enabled) {
  const [count, setCount] = useState(items.length)
  const signature = items.map(item => `${item.id}:${item.label}:${infoBadge(item)?.texto || ''}`).join('|')
  useLayoutEffect(() => {
    if (!enabled) {
      setCount(items.length)
      return undefined
    }
    const container = containerRef.current
    const measure = measureRef.current
    if (!container || !measure) return undefined
    const compute = () => {
      const widths = [...measure.querySelectorAll('[data-measure-tab]')].map(el => el.offsetWidth)
      const moreWidth = measure.querySelector('[data-measure-more]')?.offsetWidth || 64
      const available = container.clientWidth
      const total = widths.reduce((sum, width) => sum + width, 0)
      if (!available || total <= available) {
        setCount(items.length)
        return
      }
      let used = moreWidth
      let fit = 0
      while (fit < widths.length && used + widths[fit] <= available) {
        used += widths[fit]
        fit += 1
      }
      setCount(Math.max(1, fit))
    }
    compute()
    const observer = new ResizeObserver(compute)
    observer.observe(container)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, signature, containerRef, measureRef])
  return count
}

export default function SectionTabs({
  items = [],
  value,
  onChange,
  label = 'Secciones',
  testId,
  variant = 'tabs',
  className,
}) {
  const list = normalize(items)
  const desktop = !usePantallaAngosta()
  const containerRef = useRef(null)
  const measureRef = useRef(null)
  const stripRef = useRef(null)
  const [fade, setFade] = useState({ left: false, right: false })
  const count = useVisibleCount(containerRef, measureRef, list, value, desktop && variant !== 'segmented' && variant !== 'vertical')

  // Below lg the strip scrolls: keep the active tab in view and show edge fades.
  useEffect(() => {
    const strip = stripRef.current
    if (!strip || desktop) return undefined
    const update = () =>
      setFade({
        left: strip.scrollLeft > 4,
        right: strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 4,
      })
    const active = strip.querySelector('[aria-current="page"]')
    if (active) {
      const left = active.offsetLeft - 16
      const right = active.offsetLeft + active.offsetWidth + 16
      if (left < strip.scrollLeft) strip.scrollLeft = Math.max(0, left)
      else if (right > strip.scrollLeft + strip.clientWidth)
        strip.scrollLeft = right - strip.clientWidth
    }
    update()
    strip.addEventListener('scroll', update, { passive: true })
    const observer = new ResizeObserver(update)
    observer.observe(strip)
    return () => {
      strip.removeEventListener('scroll', update)
      observer.disconnect()
    }
  }, [desktop, value, list.length])

  if (!list.length) return null

  if (variant === 'vertical' && desktop) {
    return (
      <nav
        aria-label={label}
        data-testid={testId}
        data-vertical
        className={cn('shell-section-tabs flex min-w-0 flex-col gap-1', className)}
      >
        {list.map(item => (
          <button
            key={item.id}
            type="button"
            data-tab-id={item.id}
            aria-label={nombreConBadge(item)}
            aria-current={value === item.id ? 'page' : undefined}
            onClick={() => onChange(item.id)}
            className={cn(
              'flex min-h-10 items-center rounded-lg px-3 text-left text-sm transition hover:bg-ink-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-fono',
              value === item.id ? 'bg-ink-700 font-semibold text-fore' : 'text-mute hover:text-fore',
            )}
          >
            <TabLabel item={item} />
          </button>
        ))}
      </nav>
    )
  }

  if (variant === 'segmented') {
    return (
      <nav
        aria-label={label}
        data-testid={testId}
        data-segmented
        className={cn('shell-section-tabs min-w-0', className)}
      >
        <div
          ref={stripRef}
          className="relative flex max-w-full gap-1 overflow-x-auto rounded-lg border border-ink-600 bg-ink-700 p-1 sm:w-fit"
        >
          {list.map(item => (
            <button
              key={item.id}
              type="button"
              data-tab-id={item.id}
              aria-label={nombreConBadge(item)}
              aria-current={value === item.id ? 'page' : undefined}
              onClick={() => onChange(item.id)}
              className={cn(
                'flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-md px-3 text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-fono lg:min-h-8',
                value === item.id
                  ? 'bg-ink font-semibold text-fore shadow-sm'
                  : 'text-mute hover:text-fore',
              )}
            >
              <TabLabel item={item} />
            </button>
          ))}
        </div>
      </nav>
    )
  }

  // Desktop overflow: the active tab always stays visible, swapping with the last slot.
  let visible = list
  let hidden = []
  if (desktop && count < list.length) {
    visible = list.slice(0, count)
    hidden = list.slice(count)
    const activeHidden = hidden.findIndex(item => item.id === value)
    if (activeHidden >= 0) {
      const [moved] = hidden.splice(activeHidden, 1)
      const last = visible[visible.length - 1]
      visible = [...visible.slice(0, -1), moved]
      hidden = [last, ...hidden]
    }
  }

  return (
    <nav
      aria-label={label}
      data-testid={testId}
      className={cn('shell-section-tabs relative min-w-0 border-b border-ink-600', className)}
    >
      <div ref={containerRef} className="relative min-w-0">
        {desktop ? (
          <div className="flex min-w-0 items-end">
            {visible.map(item => (
              <button
                key={item.id}
                type="button"
                data-tab-id={item.id}
                aria-label={nombreConBadge(item)}
                aria-current={value === item.id ? 'page' : undefined}
                onClick={() => onChange(item.id)}
                className={tabClass(value === item.id)}
              >
                <TabLabel item={item} />
              </button>
            ))}
            {hidden.length > 0 && (
              <MoreMenu
                items={hidden}
                value={value}
                onChange={onChange}
                label={label}
                activeInside={hidden.some(item => item.id === value)}
              />
            )}
          </div>
        ) : (
          <>
            <div
              ref={stripRef}
              className="relative flex min-w-0 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {list.map(item => (
                <button
                  key={item.id}
                  type="button"
                  data-tab-id={item.id}
                  aria-label={nombreConBadge(item)}
                  aria-current={value === item.id ? 'page' : undefined}
                  onClick={() => onChange(item.id)}
                  className={tabClass(value === item.id)}
                >
                  <TabLabel item={item} />
                </button>
              ))}
            </div>
            {fade.left && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-paper to-transparent"
              />
            )}
            {fade.right && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-paper to-transparent"
              />
            )}
          </>
        )}
        {/* Invisible row with every tab, used only to measure what fits. */}
        {desktop && (
          <div
            ref={measureRef}
            aria-hidden="true"
            className="pointer-events-none invisible absolute left-0 top-0 flex h-0 w-max overflow-hidden whitespace-nowrap"
          >
            {list.map(item => (
              <span key={item.id} data-measure-tab className={cn(TAB_BASE, 'px-3 text-sm font-semibold')}>
                <TabLabel item={item} />
              </span>
            ))}
            <span data-measure-more className={cn(TAB_BASE, 'gap-1 px-3 text-sm')}>
              Más
              <Icon name="chevron" className="h-3.5 w-3.5" />
            </span>
          </div>
        )}
      </div>
    </nav>
  )
}
