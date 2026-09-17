import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { Badge, Drawer, Eyebrow, Skeleton } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import ThemeToggle from '@/components/app/ThemeToggle'
import ProductFooter from '@/components/app/ProductFooter'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { APP_NAME } from '@/lib/brand'

const NAV_GROUPS_KEY = 'mobos:nav-groups'

function readClosedGroups() {
  try { return JSON.parse(localStorage.getItem(NAV_GROUPS_KEY) || '{}') } catch { return {} }
}

function NavGroup({ nav, active, onNavigate, collapsed = false, scrollable = true }) {
  const [closedGroups, setClosedGroups] = useState(readClosedGroups)

  function toggleGroup(titulo) {
    setClosedGroups((prev) => {
      const next = { ...prev, [titulo]: !prev[titulo] }
      localStorage.setItem(NAV_GROUPS_KEY, JSON.stringify(next))
      return next
    })
  }

  return (
    <nav
      className={cn(
        'flex flex-col gap-4',
        scrollable && 'flex-1 overflow-y-auto p-3',
        collapsed && scrollable && 'lg:p-2',
      )}
    >
      {nav.map((g, groupIndex) => {
        const cerrado = Boolean(closedGroups[g.titulo])
        const tieneActivo = g.items.some(([id]) => id === active)
        return (
          <div key={g.titulo} className={cn('flex flex-col', groupIndex > 0 && !collapsed && 'border-t border-fore/[.07] pt-3')}>
            {!collapsed && (
              <button
                type="button"
                onClick={() => toggleGroup(g.titulo)}
                aria-expanded={!cerrado}
                className="mb-1 flex w-full items-center justify-between gap-1 rounded-md px-2.5 py-0.5 text-left transition hover:bg-fore/5"
                title={cerrado ? `Mostrar ${g.titulo}` : `Ocultar ${g.titulo}`}
              >
                <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[.16em] text-fono-light/75">
                  {g.titulo}
                  {cerrado && tieneActivo && <span className="h-1.5 w-1.5 rounded-full bg-fono" aria-hidden />}
                </span>
                <Icon
                  name="chevron"
                  className={cn('h-3 w-3 shrink-0 text-mute transition-transform duration-200', cerrado && '-rotate-90')}
                />
              </button>
            )}
            {(!cerrado || collapsed) && (
              <div className="flex flex-col gap-0.5">
                {g.items.map(([id, label, ico]) => {
                  const activo = active === id
                  return (
                    <button
                      key={id}
                      onClick={() => onNavigate(id)}
                      aria-current={activo ? 'page' : undefined}
                      className={cn(
                        'group relative flex w-full items-center gap-2.5 overflow-visible rounded-[10px] border px-2.5 py-[7px] text-left text-[13px] leading-snug transition',
                        collapsed && 'lg:justify-center lg:px-0',
                        activo
                          ? 'border-fono/30 bg-gradient-to-r from-fono/[.16] to-fono/[.05] font-semibold text-fore'
                          : 'border-transparent text-mute hover:bg-ink-700/70 hover:text-fore',
                      )}
                    >
                      {activo && <span aria-hidden className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-fono" />}
                      <Icon name={ico} className={cn('h-[15px] w-[15px] shrink-0 transition', activo ? 'text-fono-light' : 'group-hover:text-fore')} />
                      <span className={cn('flex-1 truncate', collapsed && 'lg:hidden')}>{label}</span>
                      {activo && <span className={cn('h-[5px] w-[5px] rounded-full bg-fono', collapsed && 'lg:hidden')} aria-hidden />}
                      <span className="pointer-events-none absolute left-[calc(100%+6px)] z-30 hidden whitespace-nowrap rounded-md border border-ink-500 bg-ink-700 px-2 py-1 text-xs text-fore shadow-lg group-hover:lg:block">{label}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </nav>
  )
}

// Barra inferior para móvil/tablet: accesos directos del rol + menú completo.
function BottomNav({ items, active, onNavigate, onOpenMenu, menuLabel }) {
  if (!items.length && !onOpenMenu) return null
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-fore/10 bg-ink-800/95 pb-safe backdrop-blur lg:hidden" aria-label="Accesos rápidos">
      <div className="mx-auto flex max-w-lg items-stretch justify-around">
        {items.map(([id, label, ico]) => {
          const activo = active === id
          return (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              aria-current={activo ? 'page' : undefined}
              className={cn('flex min-h-[54px] flex-1 flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-semibold transition', activo ? 'text-fono-light' : 'text-mute hover:text-fore')}
            >
              <Icon name={ico} className="h-[19px] w-[19px]" />
              <span className="truncate">{label}</span>
            </button>
          )
        })}
        {onOpenMenu && (
          <button
            onClick={onOpenMenu}
            className="flex min-h-[54px] flex-1 flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-semibold text-mute transition hover:text-fore"
            aria-label="Abrir menú completo"
          >
            <Icon name="menu" className="h-[19px] w-[19px]" />
            <span>{menuLabel || 'Menú'}</span>
          </button>
        )}
      </div>
    </nav>
  )
}

function CopiarIdTienda({ id, collapsed }) {
  const [copiado, setCopiado] = useState(false)
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])

  async function copiar() {
    let ok = false
    try {
      await navigator.clipboard.writeText(id)
      ok = true
    } catch {
      const campo = document.createElement('textarea')
      campo.value = id
      campo.setAttribute('readonly', '')
      campo.style.position = 'fixed'
      campo.style.opacity = '0'
      document.body.appendChild(campo)
      campo.select()
      try { ok = document.execCommand('copy') } catch { ok = false }
      document.body.removeChild(campo)
    }
    if (ok) {
      setCopiado(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopiado(false), 1500)
    }
  }

  return (
    <span className={cn('flex shrink-0 items-center gap-1', collapsed && 'lg:hidden')}>
      <span
        title={id}
        className="truncate rounded border border-ink-500 bg-ink-700 px-1 py-px font-mono text-[9px] tracking-tight text-mute"
      >
        ID {id.slice(0, 8)}…{id.slice(-4)}
      </span>
      <button
        type="button"
        onClick={copiar}
        title="Copiar ID de tienda"
        aria-label="Copiar ID de tienda"
        className="rounded p-0.5 text-mute transition hover:bg-fore/5 hover:text-fore"
      >
        <Icon name={copiado ? 'check' : 'copy'} className="h-3 w-3" />
      </button>
    </span>
  )
}

function SidebarFooter({ empresa, sucursal, sesionNombre, esOwner, esDemo, onSwitchUser, onLogout, onLockRequest, collapsed, perfilEmpresa }) {
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

  const nombreUsuario = perfilEmpresa?.name || sesionNombre || 'Usuario'

  return (
    <div className={cn('border-t border-fore/10 p-3 pb-safe', collapsed && 'lg:p-2')}>
      <div
        className={cn(
          'flex items-start gap-2.5 rounded-xl border border-fore/10 bg-fore/[.03] p-2.5',
          collapsed && 'lg:justify-center lg:border-0 lg:bg-transparent lg:p-0',
        )}
        title={empresa?.email ? `${empresa?.nombre || 'Empresa'} · ${empresa.email}` : empresa?.nombre || 'Empresa'}
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-fono/15 text-fono-light">
          <Icon name="store" className="h-4 w-4" />
        </span>
        <span className={cn('flex min-w-0 flex-1 flex-col gap-1', collapsed && 'lg:hidden')}>
          <span className="flex min-w-0 items-center gap-1.5">
            <strong className="min-w-0 truncate text-[13px] leading-snug text-fore">{empresa?.nombre || 'Mi tienda'}</strong>
            {esDemo && <Badge color="orange" className="shrink-0 px-1.5 py-px text-[9px] font-bold tracking-wider">DEMO</Badge>}
          </span>
          {empresa?.email ? (
            <small className="min-w-0 truncate text-[11px] leading-snug text-mute">{empresa.email}</small>
          ) : (
            sucursal?.nombre && <small className="min-w-0 truncate text-[11px] leading-snug text-mute">{sucursal.nombre}</small>
          )}
          {!esDemo && empresa?.id && <CopiarIdTienda id={empresa.id} collapsed={collapsed} />}
        </span>
      </div>
      <div className={cn('mt-2.5 flex items-center gap-1.5', collapsed && 'lg:mt-1 lg:flex-col')}>
        <button
          type="button"
          onClick={manejarClicUsuario}
          className={cn(
            'flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-xl p-1.5 text-left transition hover:bg-fore/5',
            collapsed && 'lg:flex-none',
          )}
          title={nombreUsuario}
          aria-label="Cambiar de vendedor"
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full bg-fono text-sm font-bold text-onbrand">
            {perfilEmpresa?.picture ? (
              <img src={perfilEmpresa.picture} referrerPolicy="no-referrer" alt="" className="h-8 w-8 rounded-full object-cover" />
            ) : (
              nombreUsuario.charAt(0).toUpperCase()
            )}
          </span>
          <span className={cn('flex min-w-0 flex-1 flex-col gap-0.5', collapsed && 'lg:hidden')}>
            <strong className="truncate text-[13px] font-medium leading-snug text-fore">{nombreUsuario}</strong>
            <small className="truncate text-[10px] uppercase leading-snug tracking-wider text-mute">
              {esOwner ? 'Dueño' : 'Vendedor'}
            </small>
          </span>
          <Icon name="refresh" className={cn('ml-auto h-3 w-3 shrink-0 text-mute', collapsed && 'lg:hidden')} />
        </button>
        {onLogout && (
          <button
            type="button"
            onClick={onLogout}
            className={cn(
              'grid h-11 w-10 shrink-0 place-items-center rounded-xl text-mute transition hover:bg-fore/5 hover:text-fore',
              collapsed && 'lg:h-8 lg:w-7',
            )}
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
          >
            <Icon name="logout" className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

function StatsPanel({ title = 'Vendido hoy', collapsed, onToggle, children }) {
  return (
    <div className="flex flex-col gap-2 border-t border-fono/20 p-2.5 pb-safe">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className="flex w-full items-center justify-between gap-2 rounded-lg px-1 py-0.5 text-left transition hover:bg-fore/5"
        title={collapsed ? `Mostrar ${title}` : `Ocultar ${title}`}
      >
        <span className="text-[10px] font-semibold uppercase tracking-[.08em] text-fore/60">{title}</span>
        <Icon
          name="chevron"
          className={cn('h-3 w-3 shrink-0 text-mute transition-transform duration-200', collapsed && '-rotate-90')}
        />
      </button>
      {!collapsed && (
        <div className="rounded-xl border border-fono/20 bg-gradient-to-br from-fono/10 to-ink-800 p-3">
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
  bottomNav = [],
  onOpenMenuLabel,
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
  perfilEmpresa,
}) {
  const [menuAbierto, setMenuAbierto] = useState(false)
  const enLinea = useOnlineStatus()
  const [statsCollapsedInterno, setStatsCollapsedInterno] = useState(() => localStorage.getItem('mobos:stats-collapsed') === '1')
  const statsCerrado = onStatsToggle ? Boolean(statsCollapsed) : statsCollapsedInterno
  // Contexto de navegación para la cabecera: a qué grupo pertenece la vista.
  const grupoActivo = nav.find(group => group.items.some(([id]) => id === active))?.titulo

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
          'hidden w-[204px] shrink-0 flex-col border-r border-fore/10 bg-ink-800 transition-[width] duration-200 lg:sticky lg:top-0 lg:flex lg:h-dvh',
          collapsed && 'lg:w-[60px]',
        )}
      >
        <div className={cn('flex h-14 shrink-0 items-center gap-2.5 border-b border-fore/10 px-4 pt-safe', collapsed && 'lg:justify-center lg:px-2')}>
          {collapsed ? (
            <button
              onClick={onToggleCollapsed}
              className="hidden h-8 w-8 shrink-0 place-items-center rounded-lg transition hover:bg-ink-700 lg:grid"
              title="Expandir menú"
              aria-label="Expandir menú"
            >
              <img src="/mobos-icon.svg" alt="" className="h-8 w-8 rounded-lg" />
            </button>
          ) : (
            <>
              <img src="/mobos-icon.svg" alt="" className="h-8 w-8 shrink-0 rounded-lg" />
              <div className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className="truncate text-[15px] font-bold tracking-tight">{APP_NAME}</span>
                <span className="truncate text-[10px] text-mute">{esDemo ? 'Tienda de demostración' : 'Centro de operaciones'}</span>
              </div>
              {onToggleCollapsed && (
                <button
                  onClick={onToggleCollapsed}
                  className="hidden shrink-0 rounded-md p-1.5 text-mute transition hover:bg-ink-700 hover:text-fore lg:inline-flex"
                  title="Colapsar menú"
                  aria-label="Colapsar menú"
                >
                  <Icon name="menu" className="h-4 w-4" />
                </button>
              )}
            </>
          )}
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
          esDemo={esDemo}
          onSwitchUser={onSwitchUser}
          onLogout={onLogout}
          onLockRequest={onLockRequest}
          collapsed={collapsed}
          perfilEmpresa={perfilEmpresa}
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
            esDemo={esDemo}
            onSwitchUser={onSwitchUser}
            onLogout={onLogout}
            onLockRequest={onLockRequest}
            collapsed={false}
            perfilEmpresa={perfilEmpresa}
          />
        </div>
      </Drawer>

      <div className="flex min-w-0 flex-1 flex-col pb-[72px] lg:pb-0">
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
              <Eyebrow>{grupoActivo ? `${grupoActivo} · ${APP_NAME}` : APP_NAME}</Eyebrow>
              <span className="mt-1 block truncate text-lg font-semibold tracking-tight">{title}</span>
              {subtitle && <span className="mt-0.5 block truncate text-xs text-mute">{subtitle}</span>}
            </div>
            <span className="min-w-0 truncate text-base font-semibold tracking-tight sm:hidden">{title}</span>
          </div>

          <div className="flex items-center gap-2.5">
            {headerActions}
            <ThemeToggle />
          </div>
        </header>

        {!enLinea && (
          <div role="status" className="flex items-center justify-center gap-2 bg-bad px-4 py-2 text-center text-sm font-medium">
            <Icon name="alert" className="h-4 w-4" />
            Sin conexión: los datos pueden estar desactualizados. Se sincroniza al reconectar.
          </div>
        )}
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

      <BottomNav
        items={bottomNav}
        active={active}
        onNavigate={navegar}
        onOpenMenu={onOpenMenuLabel ? () => setMenuAbierto(true) : null}
        menuLabel={onOpenMenuLabel}
      />
    </div>
  )
}
