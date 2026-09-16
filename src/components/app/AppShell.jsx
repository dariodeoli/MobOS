import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { Drawer, Eyebrow, Skeleton } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import ThemeToggle from '@/components/app/ThemeToggle'
import ProductFooter from '@/components/app/ProductFooter'
import { APP_NAME } from '@/lib/brand'

function NavGroup({ nav, active, onNavigate, collapsed = false, scrollable = true }) {
  return (
    <nav
      className={cn(
        'flex flex-col gap-7',
        scrollable && 'flex-1 overflow-y-auto p-4',
        collapsed && scrollable && 'lg:p-3',
      )}
    >
      {nav.map((g) => (
        <div key={g.titulo} className="flex flex-col gap-0.5">
          <Eyebrow className={cn('px-3 pb-1.5', collapsed && 'lg:hidden')}>{g.titulo}</Eyebrow>
          {g.items.map(([id, label, ico]) => {
            const activo = active === id
            return (
              <button
                key={id}
                onClick={() => onNavigate(id)}
                aria-current={activo ? 'page' : undefined}
                className={cn(
                  'group flex w-full items-center gap-2.5 rounded-[10px] border px-3 py-2.5 text-left transition',
                  collapsed && 'lg:justify-center lg:px-0',
                  activo
                    ? 'border-fono/35 bg-fono/[.14] font-medium text-fore'
                    : 'border-transparent text-mute hover:bg-ink-700 hover:text-fore',
                )}
              >
                <Icon name={ico} className={cn('h-4 w-4 shrink-0', activo && 'text-fono-light')} />
                <span className={cn('flex-1', collapsed && 'lg:hidden')}>{label}</span>
                {activo && <span className={cn('h-[5px] w-[5px] rounded-full bg-fono', collapsed && 'lg:hidden')} />}
                <span className="pointer-events-none absolute left-[68px] hidden rounded-md bg-ink-700 px-2 py-1 text-xs text-fore shadow-lg group-hover:lg:block">{label}</span>
              </button>
            )
          })}
        </div>
      ))}
    </nav>
  )
}

function SidebarFooter({ empresa, sucursal, sesionNombre, esOwner, onSwitchUser, onLogout, onLockRequest, collapsed }) {
  const clicsRef = useRef([])
  const clicsTimer = useRef(null)
  useEffect(() => () => clearTimeout(clicsTimer.current), [])

  function manejarClicUsuario() {
    const ahora = Date.now()
    clicsRef.current = clicsRef.current.filter((t) => ahora - t < 800)
    clicsRef.current.push(ahora)
    if (clicsRef.current.length >= 3) {
      clicsRef.current = []
      clearTimeout(clicsTimer.current)
      onLockRequest?.()
      return
    }
    clearTimeout(clicsTimer.current)
    clicsTimer.current = setTimeout(() => {
      clicsRef.current = []
      onSwitchUser?.()
    }, 300)
  }

  return (
    <div className={cn('border-t border-fore/10 p-3.5 pb-safe', collapsed && 'lg:p-3')}>
      <div
        className={cn(
          'mb-2 flex items-center gap-2 rounded-xl border border-fore/10 bg-fore/[.03] p-3',
          collapsed && 'lg:justify-center lg:border-0 lg:bg-transparent lg:p-0',
        )}
        title={empresa?.nombre || 'Empresa'}
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-fono/15 text-fono-light">
          <Icon name="store" className="h-4 w-4" />
        </span>
        <span className={cn('min-w-0', collapsed && 'lg:hidden')}>
          <strong className="block truncate text-xs text-fore">{empresa?.nombre || 'Mi tienda'}</strong>
          <small className="block truncate text-[10px] text-mute">{sucursal?.nombre || 'Todas las sucursales'}</small>
        </span>
      </div>
      <div className={cn('flex items-center gap-1', collapsed && 'lg:flex-col')}>
        <button
          type="button"
          onClick={manejarClicUsuario}
          className={cn(
            'flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl p-2 text-left transition hover:bg-fore/5',
            collapsed && 'lg:flex-none',
          )}
          title={sesionNombre || 'Usuario'}
          aria-label="Cambiar de vendedor"
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-fono text-sm font-bold text-onbrand">
            {(sesionNombre || 'U').charAt(0).toUpperCase()}
          </span>
          <span className={cn('min-w-0', collapsed && 'lg:hidden')}>
            <strong className="block truncate text-xs text-fore">{sesionNombre || 'Usuario'}</strong>
            <small className="block truncate text-[10px] uppercase tracking-wider text-mute">
              {esOwner ? 'Dueño' : 'Vendedor'}
            </small>
          </span>
          <Icon name="refresh" className={cn('ml-auto h-3.5 w-3.5 shrink-0 text-mute', collapsed && 'lg:hidden')} />
        </button>
        {onLogout && (
          <button
            type="button"
            onClick={onLogout}
            className={cn(
              'grid h-11 w-11 shrink-0 place-items-center rounded-xl text-mute transition hover:bg-fore/5 hover:text-fore',
              collapsed && 'lg:h-8 lg:w-8',
            )}
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
          >
            <Icon name="logout" className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )
}

function StatsPanel({ title = 'Vendido hoy', collapsed, onToggle, children }) {
  return (
    <div className="flex flex-col gap-2.5 border-t border-fono/20 p-3.5 pb-safe">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className="flex w-full items-center justify-between gap-2 rounded-lg px-1 py-0.5 text-left transition hover:bg-fore/5"
        title={collapsed ? `Mostrar ${title}` : `Ocultar ${title}`}
      >
        <span className="text-[10.5px] font-semibold uppercase tracking-[.08em] text-fore/60">{title}</span>
        <Icon
          name="chevron"
          className={cn('h-3.5 w-3.5 shrink-0 text-mute transition-transform duration-200', collapsed && '-rotate-90')}
        />
      </button>
      {!collapsed && (
        <div className="rounded-2xl border border-fono/20 bg-gradient-to-br from-fono/10 to-ink-800 p-4">
          {children}
        </div>
      )}
    </div>
  )
}

export default function AppShell({
  title,
  subtitle,
  nav = [],
  active,
  onNavigate,
  collapsed = false,
  onToggleCollapsed,
  children,
  headerActions,
  loading = false,
  empresa,
  sucursal,
  esDemo = false,
  sesionNombre,
  esOwner = false,
  onSwitchUser,
  onLogout,
  onLockRequest,
  sidebarStats,
  onStatsToggle,
  statsCollapsed,
}) {
  const [menuAbierto, setMenuAbierto] = useState(false)
  const [statsCollapsedInterno, setStatsCollapsedInterno] = useState(() => localStorage.getItem('mobos:stats-collapsed') === '1')
  const statsCerrado = onStatsToggle ? Boolean(statsCollapsed) : statsCollapsedInterno

  function alternarStats() {
    const next = !statsCerrado
    if (onStatsToggle) { onStatsToggle(next); return }
    setStatsCollapsedInterno(next)
    localStorage.setItem('mobos:stats-collapsed', next ? '1' : '0')
  }

  function navegar(id) {
    onNavigate(id)
    setMenuAbierto(false)
  }

  return (
    <div className="flex min-h-dvh flex-col bg-paper text-sm text-fore lg:flex-row">
      <aside
        className={cn(
          'hidden w-[264px] shrink-0 flex-col border-r border-fore/10 bg-ink-800 transition-[width] duration-200 lg:sticky lg:top-0 lg:flex lg:h-dvh',
          collapsed && 'lg:w-[76px]',
        )}
      >
        {onToggleCollapsed && (
          <button
            onClick={onToggleCollapsed}
            className="absolute right-2 top-2 z-10 hidden rounded-lg p-2 text-mute transition hover:bg-ink-700 hover:text-fore lg:inline-flex"
            title={collapsed ? 'Expandir menú' : 'Colapsar menú'}
            aria-label={collapsed ? 'Expandir menú' : 'Colapsar menú'}
          >
            <Icon name="menu" className="h-4 w-4" />
          </button>
        )}
        <div className={cn('flex h-20 items-center gap-3 border-b border-fore/10 px-5 pt-safe', collapsed && 'lg:justify-center lg:px-3')}>
          <img src="/mobos-icon.svg" alt="" className="h-10 w-10 shrink-0 rounded-xl" />
          <div className={cn('flex flex-col leading-tight', collapsed && 'lg:hidden')}>
            <span className="text-base font-bold tracking-tight">{APP_NAME}</span>
            <span className="text-[11px] text-mute">{esDemo ? 'Tienda de demostración' : 'Centro de operaciones'}</span>
          </div>
        </div>
        <NavGroup nav={nav} active={active} onNavigate={navegar} collapsed={collapsed} />
        {sidebarStats && (
          <div className={collapsed && 'lg:hidden'}>
            <StatsPanel collapsed={statsCerrado} onToggle={alternarStats}>
              {sidebarStats}
            </StatsPanel>
          </div>
        )}
        <SidebarFooter
          empresa={empresa}
          sucursal={sucursal}
          sesionNombre={sesionNombre}
          esOwner={esOwner}
          onSwitchUser={onSwitchUser}
          onLogout={onLogout}
          onLockRequest={onLockRequest}
          collapsed={collapsed}
        />
      </aside>

      <Drawer
        open={menuAbierto}
        onClose={() => setMenuAbierto(false)}
        title={empresa?.nombre || APP_NAME}
        side="left"
      >
        <NavGroup nav={nav} active={active} onNavigate={navegar} collapsed={false} scrollable={false} />
        {sidebarStats && (
          <div className="-mx-4 mt-4 border-t border-fono/20 sm:-mx-5">
            <StatsPanel collapsed={statsCerrado} onToggle={alternarStats}>
              {sidebarStats}
            </StatsPanel>
          </div>
        )}
        <div className="-mx-4 -mb-4 mt-4 sm:-mx-5 sm:-mb-5">
          <SidebarFooter
            empresa={empresa}
            sucursal={sucursal}
            sesionNombre={sesionNombre}
            esOwner={esOwner}
            onSwitchUser={onSwitchUser}
            onLogout={onLogout}
            onLockRequest={onLockRequest}
            collapsed={false}
          />
        </div>
      </Drawer>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-20 items-center justify-between gap-4 border-b border-fore/10 bg-paper/85 px-4 pt-safe backdrop-blur md:px-8">
          <div className="flex min-w-0 items-center gap-2">
            <button
              onClick={() => setMenuAbierto(true)}
              className="-ml-1 rounded-lg p-2 text-mute transition hover:bg-ink-700 hover:text-fore lg:hidden"
              title="Menú"
              aria-label="Menú"
            >
              <Icon name="menu" className="h-5 w-5" />
            </button>
            <div className="hidden sm:block">
              <Eyebrow>{APP_NAME}</Eyebrow>
              <span className="mt-1 block truncate text-lg font-semibold tracking-tight">{title}</span>
              {subtitle && <span className="mt-0.5 block truncate text-xs text-mute">{subtitle}</span>}
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {headerActions}
            <ThemeToggle />
          </div>
        </header>

        {loading ? (
          <main className="flex-1 p-4 md:p-8">
            <div className="space-y-3">
              <Skeleton className="h-8 w-1/3" />
              <Skeleton className="h-40 w-full" />
            </div>
          </main>
        ) : (
          children
        )}
        <ProductFooter className="shrink-0" />
      </div>
    </div>
  )
}
