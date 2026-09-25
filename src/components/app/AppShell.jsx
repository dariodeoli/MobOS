import { Fragment, useEffect, useRef, useState } from 'react'
import { useTemaV2 } from '@/lib/temaV2'
import { cn } from '@/lib/utils'
import { Drawer, Skeleton } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import PersonaChip from '@/components/shared/PersonaChip'
import ThemeToggle from '@/components/app/ThemeToggle'
import PresencePill from '@/components/app/PresencePill'
import ProductFooter from '@/components/app/ProductFooter'
import MenuAcciones from '@/components/app/MenuAcciones'
import PanelNotificaciones from '@/components/app/PanelNotificaciones'
import ComoFuncionaDemo from '@/components/app/ComoFuncionaDemo'
import PanelColaOffline from '@/components/ventas/PanelColaOffline'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { useColaOffline } from '@/hooks/useColaOffline'
import { usePresenceTracker } from '@/hooks/usePresence'
import { useUltimoUsado } from '@/hooks/useUltimoUsado'
import { usePreferencias } from '@/hooks/usePreferencias'
import { useNotificaciones } from '@/hooks/useNotificaciones'
import { useSesion } from '@/lib/sesion'
import { APP_NAME } from '@/lib/brand'
import { CELDA_DATO } from '@/components/shared/tabla'

const NAV_GROUPS_DEFAULT = {}

function NavGroup({ nav, active, onNavigate, collapsed = false, scrollable = true }) {
  // Grupos del menú plegados: último usado como predeterminado (#209).
  const [closedGroups, recordarClosedGroups] = useUltimoUsado('shell:nav-plegados', NAV_GROUPS_DEFAULT)

  function toggleGroup(titulo) {
    recordarClosedGroups((prev) => ({ ...prev, [titulo]: !prev[titulo] }))
  }

  return (
    <nav
      className={cn(
        'flex flex-col gap-2',
        scrollable && 'flex-1 overflow-y-auto p-2.5',
        collapsed && scrollable && 'lg:p-2',
      )}
    >
      {nav.map((g, groupIndex) => {
        const cerrado = Boolean(closedGroups[g.titulo])
        const tieneActivo = g.items.some(([id]) => id === active)
        return (
          <div key={g.titulo} className={cn('flex flex-col', groupIndex > 0 && !collapsed && 'border-t border-fore/[.07] pt-1.5')}>
            {!collapsed && (
              <button
                type="button"
                onClick={() => toggleGroup(g.titulo)}
                aria-expanded={!cerrado}
                className="mb-0.5 flex w-full items-center justify-between gap-1 rounded-md px-2.5 py-0.5 text-left transition hover:bg-fore/5"
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
                        aria-label={label}
                        title={label}
                        className={cn(
                        'group relative flex w-full items-center gap-2 overflow-visible rounded-[10px] border px-2.5 py-1 text-left text-[12.5px] leading-snug transition',
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
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-600 bg-ink/95 pb-safe shadow-card backdrop-blur lg:hidden" aria-label="Accesos rápidos">
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

// Acciones secundarias del shell (buscar, tema, atajos, salir). En pantallas
// chicas viven en el menú —arriba, a mano— para que el topbar no se sature ni
// desborde; en escritorio siguen en la barra superior.
function DrawerActions({ onSearch, onHelp, onLogout, onClose, className }) {
  const fila = 'flex min-h-11 w-full items-center gap-2.5 rounded-[10px] px-2.5 text-left text-[12.5px] leading-snug text-mute transition hover:bg-ink-700 hover:text-fore'
  if (!onSearch && !onHelp && !onLogout) return null
  return (
    <div data-testid="shell-drawer-acciones" className={cn('flex flex-col gap-0.5 p-2.5 pb-safe', className)}>
      <span className="px-2.5 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-[.16em] text-fono-light/75">Acciones</span>
      {onSearch && (
        <button type="button" className={fila} onClick={() => { onClose(); onSearch() }}>
          <Icon name="search" className="h-[15px] w-[15px] shrink-0" />
          <span className="min-w-0 flex-1 truncate">Buscar en toda la tienda</span>
          <kbd className="shrink-0 rounded border border-ink-500 bg-ink-700 px-1.5 py-0.5 text-[10px] font-semibold text-mute">Ctrl K</kbd>
        </button>
      )}
      <div className={cn(fila, 'hover:bg-transparent')}>
        <Icon name="eye" className="h-[15px] w-[15px] shrink-0" />
        <span className="min-w-0 flex-1 truncate">Tema claro / oscuro</span>
        <ThemeToggle />
      </div>
      {onHelp && (
        <button type="button" className={fila} onClick={() => { onClose(); onHelp() }}>
          <Icon name="info" className="h-[15px] w-[15px] shrink-0" />
          <span className="min-w-0 flex-1 truncate">Atajos de teclado</span>
        </button>
      )}
      {onLogout && (
        <button type="button" className={fila} onClick={() => { onClose(); onLogout() }}>
          <Icon name="logout" className="h-[15px] w-[15px] shrink-0" />
          <span className="min-w-0 flex-1 truncate">Cerrar sesión</span>
        </button>
      )}
    </div>
  )
}

// ── Aviso del modo offline del POS ──────────────────────────────────
// Con el navegador sin conexión o con ventas esperando sincronizarse, el shell
// lo muestra en el menú (escritorio) y en la barra (móvil), y abre la cola con
// su detalle. El POS ya tiene su indicador; esto lo lleva a todo el shell para
// que un vendedor no tenga que estar en la pantalla de venta para enterarse.
function textoColaOffline({ pendientes = 0, conflictos = 0, enLinea = true } = {}) {
  if (conflictos > 0) return `${conflictos} venta${conflictos === 1 ? '' : 's'} con conflicto`
  if (pendientes > 0) return `${pendientes} venta${pendientes === 1 ? '' : 's'} sin enviar`
  if (!enLinea) return 'POS sin conexión'
  return ''
}

function AvisoColaOffline({ texto, corto, urgente, onClick, pastilla = false, textoOcultoEnLg = false, testid, className }) {
  if (!texto) return null
  const tono = urgente
    ? 'border-bad/40 bg-bad/10 text-bad hover:bg-bad/15'
    : 'border-warn/40 bg-warn/10 text-warn hover:bg-warn/15'
  return (
    <button
      type="button"
      data-testid={testid}
      onClick={onClick}
      title={texto}
      aria-label={texto}
      className={cn(
        pastilla
          ? 'inline-flex h-[34px] shrink-0 items-center gap-1.5 rounded-[9px] border px-2.5 text-xs font-semibold transition lg:hidden'
          : 'flex min-h-11 w-full items-center gap-2 rounded-xl border px-3 text-left text-xs font-semibold transition',
        tono,
        className,
      )}
    >
      <Icon name="alert" className="h-3.5 w-3.5 shrink-0" />
      <span className={cn('min-w-0 truncate', textoOcultoEnLg && 'lg:hidden')}>{pastilla ? corto : texto}</span>
    </button>
  )
}

function SidebarFooter({ sesionNombre, esOwner, roleLabel = 'Vendedor', onSwitchUser, onLockRequest, onPerfil, collapsed, perfilEmpresa, usuario }) {
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

  // La persona de la barra es la de la sesión; el perfil de empresa (identidad
  // del dueño) solo aporta su foto de Google cuando quien opera es el dueño.
  const nombreUsuario = sesionNombre || perfilEmpresa?.name || 'Usuario'
  const fotoGoogle = esOwner ? perfilEmpresa?.picture : undefined

  return (
    <div className={cn('border-t border-ink-600 p-2.5 pb-safe', collapsed && 'lg:p-2')}>
      <div className={cn('mt-2 flex items-center gap-1.5', collapsed && 'lg:mt-1 lg:flex-col')}>
        <button
          type="button"
          onClick={manejarClicUsuario}
          className={cn(
            'flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-xl p-1.5 text-left transition hover:bg-fore/5',
            collapsed && 'lg:flex-none',
          )}
          title={nombreUsuario}
          aria-label={`Cambiar de vendedor (${nombreUsuario})`}
        >
          <PersonaChip
            user={{ id: usuario?.id, name: nombreUsuario }}
            picture={fotoGoogle}
            size="lg"
            nombre={false}
            title={nombreUsuario}
            className={cn('min-w-0 flex-1', collapsed && 'lg:flex-none')}
          >
            <span className={cn('flex min-w-0 flex-1 flex-col gap-0.5', collapsed && 'lg:hidden')}>
              <strong className="truncate text-[13px] font-medium leading-snug text-fore">{nombreUsuario}</strong>
              <small className="truncate text-[10px] uppercase leading-snug tracking-wider text-mute">
                {esOwner ? 'Dueño' : roleLabel}
              </small>
            </span>
          </PersonaChip>
          <Icon name="refresh" className={cn('ml-auto h-3 w-3 shrink-0 text-mute', collapsed && 'lg:hidden')} />
        </button>
      </div>
      {/* Perfil personal (#253): la identidad de la persona se edita desde su
          avatar (foto y nombre), no dentro de la Configuración de la tienda. */}
      {onPerfil && (
        <button
          type="button"
          data-testid="shell-mi-perfil"
          onClick={onPerfil}
          title="Mi perfil"
          aria-label="Mi perfil"
          className={cn(
            'mt-1 flex min-h-9 w-full items-center gap-2 rounded-xl px-2.5 text-left text-[12px] font-semibold text-mute transition hover:bg-fore/5 hover:text-fore',
            collapsed && 'lg:justify-center lg:px-0',
          )}
        >
          <Icon name="user" className="h-[15px] w-[15px] shrink-0" />
          <span className={cn('truncate', collapsed && 'lg:hidden')}>Mi perfil</span>
        </button>
      )}
    </div>
  )
}

function StatsPanel({ title = 'Vendido hoy', collapsed, onToggle, children }) {
  return (
    <div className="flex flex-col gap-1.5 border-t border-fono/20 p-2 pb-safe">
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
  esDemo = false,
  sesionNombre,
  esOwner = false,
  usuario,
  onSwitchUser,
  onLogout,
  onLockRequest,
  onPerfil,
  onSearch,
  onHelp,
  breadcrumb,
  sidebarStats,
  onStatsToggle,
  statsCollapsed,
  perfilEmpresa,
  roleLabel,
  menuAcciones = false,
  onAbrirNotificacion,
}) {
  const [menuAbierto, setMenuAbierto] = useState(false)
  const [comoFunciona, setComoFunciona] = useState(false)
  // La guía de la demo se abre sola la primera vez por pestaña (#201).
  useEffect(() => {
    if (!esDemo) return
    try {
      if (sessionStorage.getItem('mobos:demo-guia-vista') !== '1') {
        sessionStorage.setItem('mobos:demo-guia-vista', '1')
        setComoFunciona(true)
      }
    } catch { /* sin storage: no se abre sola */ }
  }, [esDemo])
  const { usuario: usuarioSesion } = useSesion()
  const usuarioActual = usuario || usuarioSesion
  const [preferencias] = usePreferencias(usuarioActual?.id)
  const notificaciones = useNotificaciones(usuarioActual?.id, { activo: menuAcciones && !esDemo })
  const [notificacionesAbiertas, setNotificacionesAbiertas] = useState(false)
  const enLinea = useOnlineStatus()
  // Modo offline del POS (#168): el shell muestra la cola pendiente en el menú
  // (escritorio) y en la barra (móvil), y la abre con su detalle. Solo lectura:
  // el POS sigue siendo quien sincroniza.
  const colaOffline = useColaOffline({ autoSincronizar: false })
  const [colaAbierta, setColaAbierta] = useState(false)
  const avisoCola = textoColaOffline(colaOffline)
  const avisoColaCorto = colaOffline.conflictos > 0
    ? `${colaOffline.conflictos} conflicto${colaOffline.conflictos === 1 ? '' : 's'}`
    : colaOffline.pendientes > 0
      ? `${colaOffline.pendientes} sin enviar`
      : 'Sin conexión'
  const colaUrgente = colaOffline.conflictos > 0
  // El rediseño es reactivo: el selector de Preferencias lo cambia al instante.
  const temaV2 = useTemaV2()
  usePresenceTracker()
  const [statsCollapsedInterno, recordarStats] = useUltimoUsado('shell:stats-plegado', false)
  const statsCerrado = onStatsToggle ? Boolean(statsCollapsed) : statsCollapsedInterno
  // El encabezado muestra siempre la marca (#223). El nombre de la tienda vive
  // en el menú (cajón en pantallas chicas) y en Configuración/Negocio.
  const nombreTienda = empresa?.nombre || APP_NAME
  // Contexto de navegación para la cabecera: a qué grupo pertenece la vista.
  const grupoActivo = nav.find(group => group.items.some(([id]) => id === active))?.titulo
  // Migas de la cabecera: el camino hasta la sección actual. La pantalla que se
  // está viendo va como título (h1), no repetida en la miga.
  const migas = (Array.isArray(breadcrumb) && breadcrumb.length ? breadcrumb : [grupoActivo]).filter(Boolean)

  function alternarStats() {
    const next = !statsCerrado
    if (onStatsToggle) { onStatsToggle(next); return }
    recordarStats(next)
  }

  function navegar(id, opciones) {
    onNavigate(id, opciones)
    setMenuAbierto(false)
  }

  return (
    <div
      data-testid="shell"
      data-tema-v2={temaV2 ? '1' : '0'}
      className={cn('flex min-h-dvh flex-col bg-paper text-sm text-fore lg:flex-row', temaV2 && 'tema-v2')}
    >
      <aside
        data-testid="shell-lateral"
        className={cn(
          'hidden w-[204px] shrink-0 flex-col border-r border-ink-600 bg-ink shadow-card transition-[width] duration-200 lg:sticky lg:top-0 lg:flex lg:h-dvh',
          collapsed && 'lg:w-[60px]',
        )}
      >
        <div className={cn('flex h-14 shrink-0 items-center gap-2.5 border-b border-ink-600 px-4 pt-safe', collapsed && 'lg:justify-center lg:px-2')}>
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
                <span data-testid="shell-tienda" className="truncate text-[15px] font-bold tracking-tight" title={APP_NAME}>{APP_NAME}</span>
                <span className="truncate text-[10px] text-mute">Operaciones</span>
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
        <AvisoColaOffline
          testid="shell-cola-offline"
          texto={avisoCola}
          urgente={colaUrgente}
          textoOcultoEnLg={collapsed}
          onClick={() => setColaAbierta(true)}
          className={cn('mx-2.5 mt-2', collapsed && 'lg:justify-center lg:px-0')}
        />
        <NavGroup nav={nav} active={active} onNavigate={navegar} collapsed={collapsed} />
        {sidebarStats && (
          <div className={cn(collapsed && 'lg:hidden')}>
            <StatsPanel collapsed={statsCerrado} onToggle={alternarStats}>
              {sidebarStats}
            </StatsPanel>
          </div>
        )}
        <SidebarFooter
          sesionNombre={sesionNombre}
          esOwner={esOwner}
          roleLabel={roleLabel}
          onSwitchUser={onSwitchUser}
          onLockRequest={onLockRequest}
          onPerfil={onPerfil}
          collapsed={collapsed}
          perfilEmpresa={perfilEmpresa}
          usuario={usuario}
        />
      </aside>

      <Drawer
        open={menuAbierto}
        onClose={() => setMenuAbierto(false)}
        title={nombreTienda}
        side="left"
      >
        <div className="-mx-4 -mt-2 sm:-mx-5">
          <DrawerActions
            onSearch={onSearch}
            onHelp={onHelp}
            onLogout={onLogout}
            onClose={() => setMenuAbierto(false)}
            className="border-b border-ink-600"
          />
        </div>
        <AvisoColaOffline
          testid="shell-cola-offline-menu"
          texto={avisoCola}
          urgente={colaUrgente}
          onClick={() => { setMenuAbierto(false); setColaAbierta(true) }}
          className="mx-2.5 mb-1 mt-2"
        />
        <NavGroup nav={nav} active={active} onNavigate={navegar} collapsed={false} scrollable={false} />
        {sidebarStats && (
          <div className="-mx-4 mt-4 border-t border-fono/20 sm:-mx-5">
            <StatsPanel collapsed={statsCerrado} onToggle={alternarStats}>
              {sidebarStats}
            </StatsPanel>
          </div>
        )}
        <div className="-mx-4 -mb-4 sm:-mx-5 sm:-mb-5">
          <SidebarFooter
            sesionNombre={sesionNombre}
            esOwner={esOwner}
            roleLabel={roleLabel}
            onSwitchUser={onSwitchUser}
            onLockRequest={onLockRequest}
            onPerfil={onPerfil ? () => { setMenuAbierto(false); onPerfil() } : undefined}
            collapsed={false}
            perfilEmpresa={perfilEmpresa}
            usuario={usuario}
          />
        </div>
      </Drawer>

      <div className="flex min-w-0 flex-1 flex-col pb-[72px] lg:pb-0">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-ink-600 bg-ink/85 px-4 pt-safe shadow-card backdrop-blur md:px-8">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <button
              onClick={() => setMenuAbierto(true)}
              className="-ml-1 shrink-0 rounded-lg p-2 text-mute transition hover:bg-ink-700 hover:text-fore lg:hidden"
              title="Menú"
              aria-label="Menú"
            >
              <Icon name="menu" className="h-5 w-5" />
            </button>
            <div className="flex min-w-0 flex-col justify-center">
              <nav
                data-testid="shell-breadcrumb"
                aria-label="Sección actual"
                className="flex min-w-0 items-center gap-1 overflow-hidden text-[10px] font-bold uppercase tracking-[.16em] text-mute"
              >
                <span data-testid="shell-miga-tienda" className="max-w-[7rem] shrink-0 truncate lg:hidden" title={APP_NAME}>{APP_NAME}</span>
                <span aria-hidden className="shrink-0 text-mute/50 lg:hidden">/</span>
                {migas.map((miga, indice) => (
                  <Fragment key={`${miga}-${indice}`}>
                    {indice > 0 && <span aria-hidden className="shrink-0 text-mute/50">/</span>}
                    <span className="min-w-0 truncate" title={miga}>{miga}</span>
                  </Fragment>
                ))}
              </nav>
              <h1 className="truncate text-base font-semibold tracking-tight sm:text-lg" title={title}>{title}</h1>
              {subtitle && <span className={CELDA_DATO}>{subtitle}</span>}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
            {onSearch && (
              <button
                type="button"
                data-testid="shell-buscar"
                onClick={onSearch}
                className="hidden h-9 items-center gap-2 rounded-lg border border-ink-500 bg-ink-800 px-2.5 text-mute transition hover:border-fono/50 hover:text-fore lg:inline-flex"
                title="Buscar en toda la tienda (Ctrl+K)"
                aria-label="Buscar en toda la tienda"
                aria-keyshortcuts="Control+K Meta+K"
              >
                <Icon name="search" className="h-4 w-4" />
                <span className="hidden text-[12.5px] 2xl:inline">Buscar…</span>
                <kbd className="hidden rounded border border-ink-500 bg-ink-700 px-1.5 py-0.5 text-[10px] font-semibold 2xl:inline">Ctrl K</kbd>
              </button>
            )}
            <PresencePill className="hidden lg:flex" />
            <AvisoColaOffline
              pastilla
              testid="shell-cola-offline-pill"
              texto={avisoCola}
              corto={avisoColaCorto}
              urgente={colaUrgente}
              onClick={() => setColaAbierta(true)}
            />
            {headerActions}
            {menuAcciones && (
              <>
                <button
                  type="button"
                  data-testid="notificaciones-aviso"
                  onClick={() => { setNotificacionesAbiertas(true); notificaciones.marcarVistas() }}
                  className="relative grid h-9 w-9 shrink-0 place-items-center rounded-lg text-mute transition hover:bg-ink-700 hover:text-fore"
                  title="Notificaciones"
                  aria-label={notificaciones.nuevas.length > 0 ? `Notificaciones (${notificaciones.nuevas.length} sin ver)` : 'Notificaciones'}
                >
                  <Icon name="bell" className="h-[18px] w-[18px]" />
                  {preferencias.notificaciones && notificaciones.nuevas.length > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-bad px-1 text-[9px] font-bold text-white">
                      {notificaciones.nuevas.length > 9 ? '9+' : notificaciones.nuevas.length}
                    </span>
                  )}
                </button>
                <MenuAcciones
                  onNavegar={(id, opciones) => navegar(id, opciones)}
                  onBloquear={onLockRequest}
                />
              </>
            )}
            {/* Tema y acciones secundarias: en el menú lateral con pantallas
                chicas, en la barra desde sm. */}
            <span className="hidden sm:contents">
              <ThemeToggle />
            </span>
            {onHelp && (
              <button
                type="button"
                onClick={onHelp}
                className="hidden h-9 w-9 shrink-0 place-items-center rounded-lg text-mute transition hover:bg-ink-700 hover:text-fore sm:grid"
                title="Atajos de teclado"
                aria-label="Atajos de teclado"
              >
                ?
              </button>
            )}
            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="hidden h-9 w-9 shrink-0 place-items-center rounded-lg text-mute transition hover:bg-ink-700 hover:text-fore sm:grid"
                title="Cerrar sesión"
                aria-label="Cerrar sesión"
              >
                <Icon name="logout" className="h-4 w-4" />
              </button>
            )}
          </div>
        </header>

        {!enLinea && (
          <div role="status" className="flex items-center justify-center gap-2 bg-bad px-4 py-2 text-center text-sm font-medium">
            <Icon name="alert" className="h-4 w-4" />
            Sin conexión: los datos pueden estar desactualizados. Se sincroniza al reconectar.
          </div>
        )}
        {esDemo && (
          <div role="status" className="flex flex-wrap items-center justify-center gap-2 bg-warn/15 px-4 py-2 text-center text-sm font-medium text-warn">
            <Icon name="alert" className="h-4 w-4" />
            <span>Modo demo: datos ficticios, no se guardan y se descartan al recargar.</span>
            <button
              type="button"
              data-testid="demo-como-funciona"
              onClick={() => setComoFunciona(true)}
              className="rounded-lg border border-warn/40 px-2 py-0.5 text-xs font-semibold transition hover:bg-warn/10"
            >
              Cómo funciona
            </button>
          </div>
        )}
        {loading ? (
          <main className="flex-1 p-4 md:p-8" aria-busy="true">
            <div className="space-y-4">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-8 w-56" />
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-24 w-full" />
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

      {esDemo && <ComoFuncionaDemo open={comoFunciona} onClose={() => setComoFunciona(false)} />}

      {/* Detalle de la cola offline del POS, desde el aviso del shell. */}
      {colaAbierta && <PanelColaOffline open onClose={() => setColaAbierta(false)} />}

      {menuAcciones && (
        <>
          <PanelNotificaciones
            open={notificacionesAbiertas}
            onClose={() => setNotificacionesAbiertas(false)}
            items={notificaciones.items}
            cargando={notificaciones.cargando}
            error={notificaciones.error}
            onRecargar={notificaciones.cargar}
            activas={preferencias.notificaciones}
            onAbrir={(href) => {
              setNotificacionesAbiertas(false)
              if (onAbrirNotificacion) onAbrirNotificacion(href)
              else window.location.assign(href)
            }}
          />
        </>
      )}
    </div>
  )
}
