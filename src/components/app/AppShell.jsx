import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { useTemaV2 } from '@/lib/temaV2'
import { Modal, Skeleton } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import PersonaChip from '@/components/shared/PersonaChip'
import SelectorSucursal from '@/components/shared/SelectorSucursal'
import ThemeToggle from '@/components/app/ThemeToggle'
import PresencePill from '@/components/app/PresencePill'
import PanelNotificaciones from '@/components/app/PanelNotificaciones'
import ComoFuncionaDemo from '@/components/app/ComoFuncionaDemo'
import PanelColaOffline from '@/components/ventas/PanelColaOffline'
import SectionSelector from '@/components/app/SectionSelector'
import { usePantallaAngosta } from '@/hooks/usePantallaAngosta'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { useColaOffline } from '@/hooks/useColaOffline'
import { sincronizarEventosWebPush, sincronizarWebPush } from '@/lib/webPush'
import { usePresenceTracker } from '@/hooks/usePresence'
import { usePreferencias } from '@/hooks/usePreferencias'
import { useNotificaciones } from '@/hooks/useNotificaciones'
import { useSesion } from '@/lib/sesion'
import { APP_NAME } from '@/lib/brand'
import { CELDA_DATO } from '@/components/shared/tabla'
import { activeShellSection, shellNavigation, shellContextGroups } from '@/lib/shellNavigation'
import './shellNavigation.css'

function textoColaOffline({ pendientes = 0, conflictos = 0, enLinea = true } = {}) {
  if (conflictos > 0) return `${conflictos} venta${conflictos === 1 ? '' : 's'} con conflicto`
  if (pendientes > 0) return `${pendientes} venta${pendientes === 1 ? '' : 's'} sin enviar`
  if (!enLinea) return 'POS sin conexión'
  return ''
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
  esDemo = false,
  sesionNombre,
  esOwner = false,
  usuario,
  onMiCuenta,
  onLogout,
  onLockRequest,
  onSearch,
  onHelp,
  breadcrumb,
  perfilEmpresa,
  roleLabel = 'Vendedor',
  notificacionesActivas = false,
  onAbrirNotificacion,
}) {
  const temaV2 = useTemaV2()
  const [profileOpen, setProfileOpen] = useState(false)
  const [comoFunciona, setComoFunciona] = useState(false)
  // La guía de la demo se abre sola la primera vez por pestaña (#201).
  useEffect(() => {
    if (!esDemo) return
    try {
      if (sessionStorage.getItem('mobos:demo-guia-vista') !== '1') {
        sessionStorage.setItem('mobos:demo-guia-vista', '1')
        setComoFunciona(true)
      }
    } catch {
      /* sin storage: no se abre sola */
    }
  }, [esDemo])
  const { usuario: usuarioSesion } = useSesion()
  const usuarioActual = usuario || usuarioSesion
  const [preferencias] = usePreferencias(usuarioActual?.id)
  const notificaciones = useNotificaciones(usuarioActual?.id, {
    activo: notificacionesActivas && !esDemo,
    demo: esDemo && notificacionesActivas,
  })
  const [notificacionesAbiertas, setNotificacionesAbiertas] = useState(false)
  const enLinea = useOnlineStatus()
  // A1 (#279): si el dispositivo ya autorizó los avisos, se re-registra la
  // suscripción al arrancar (el endpoint puede cambiar). No pide permiso.
  useEffect(() => {
    if (esDemo || !usuario?.id) return
    sincronizarWebPush().catch(() => {})
    sincronizarEventosWebPush()
    const intervalo = window.setInterval(() => sincronizarEventosWebPush(), 5 * 60 * 1000)
    return () => window.clearInterval(intervalo)
  }, [esDemo, usuario?.id])
  // Modo offline del POS (#168): el shell muestra la cola pendiente en el menú
  // (escritorio) y en la barra (móvil), y la abre con su detalle. Solo lectura:
  // el POS sigue siendo quien sincroniza.
  const colaOffline = useColaOffline({ autoSincronizar: false })
  const [colaAbierta, setColaAbierta] = useState(false)
  const avisoCola = textoColaOffline(colaOffline)
  const avisoColaCorto =
    colaOffline.conflictos > 0
      ? `${colaOffline.conflictos} conflicto${colaOffline.conflictos === 1 ? '' : 's'}`
      : colaOffline.pendientes > 0
        ? `${colaOffline.pendientes} sin enviar`
        : 'Sin conexión'
  const colaUrgente = colaOffline.conflictos > 0
  // El rediseño es reactivo: el selector de Preferencias lo cambia al instante.
  usePresenceTracker()
  const sections = shellNavigation(nav)
  const currentSection = activeShellSection(sections, active)
  const contextGroups = shellContextGroups(currentSection)
  const currentGroup = contextGroups.find(group => group.items.some(([id]) => id === active))
  const currentId = currentSection?.id
  const profileDestinations = nav
    .flatMap(group => group.items)
    .filter(([id]) => id === 'equipo' || id === 'ayuda')
  const nombreUsuario = sesionNombre || usuarioActual?.name || 'Usuario'
  const breadcrumbs = (breadcrumb || [currentSection?.label]).filter(text => text && text !== title)

  function navegar(id, opciones) {
    onNavigate?.(id, opciones)
    setProfileOpen(false)
  }

  const profileButton = (compact = false) => (
    <button
      type="button"
      data-testid={compact ? 'shell-perfil-mobile' : 'shell-perfil'}
      aria-label={`Abrir perfil de ${nombreUsuario}`}
      aria-haspopup="dialog"
      aria-expanded={profileOpen}
      onClick={() => setProfileOpen(true)}
      className="flex min-h-11 min-w-11 items-center gap-2 rounded-lg p-1.5 text-left hover:bg-ink-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-fono"
    >
      <PersonaChip
        user={{ ...usuarioActual, name: nombreUsuario }}
        picture={esOwner ? perfilEmpresa?.picture : undefined}
        nombre={!compact && !collapsed}
        size="md"
      />
      {!compact && !collapsed && (
        <small className="text-mute">{esOwner ? 'Dueño' : roleLabel}</small>
      )}
    </button>
  )
  const searchButton = (compact = false) =>
    onSearch && (
      <button
        type="button"
        data-testid={compact ? 'shell-buscar-mobile' : 'shell-buscar'}
        aria-label="Buscar en toda la tienda"
        aria-keyshortcuts="Control+K Meta+K"
        onClick={onSearch}
        className={cn(
          'flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg text-mute hover:bg-ink-700',
          !compact && 'w-full border border-ink-600 px-2',
        )}
      >
        <Icon name="search" className="h-4 w-4 shrink-0" />
        {!compact && !collapsed && (
          <>
            <span className="flex-1 text-left">Buscar…</span>
            <kbd className="text-xs">⌘K</kbd>
          </>
        )}
      </button>
    )
  const alertsButton = (compact = false) =>
    notificacionesActivas && (
      <button
        type="button"
        data-testid={compact ? 'notificaciones-aviso-mobile' : 'notificaciones-aviso'}
        onClick={() => {
          setNotificacionesAbiertas(true)
          notificaciones.marcarVistas()
        }}
        aria-label={
          notificaciones.nuevas.length
            ? `Notificaciones (${notificaciones.nuevas.length} sin ver)`
            : 'Notificaciones'
        }
        className="relative flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg text-mute hover:bg-ink-700"
      >
        <Icon name="bell" className="h-[18px] w-[18px]" />
        {!compact && !collapsed && <span>Notificaciones</span>}
        {preferencias.notificaciones && notificaciones.nuevas.length > 0 && (
          <span className="rounded-full bg-bad px-1 text-xs text-white">
            {notificaciones.nuevas.length}
          </span>
        )}
      </button>
    )
  const angosta = usePantallaAngosta()
  const botonComoFunciona = (
    <button
      type="button"
      data-testid="demo-como-funciona"
      onClick={() => setComoFunciona(true)}
      className="min-h-11 shrink-0 px-2"
    >
      Cómo funciona
    </button>
  )
  const offlineButton = testid =>
    avisoCola && (
      <button
        type="button"
        data-testid={testid}
        aria-label={avisoCola}
        onClick={() => setColaAbierta(true)}
        className={cn(
          'min-h-11 rounded-lg border px-2 text-xs',
          colaUrgente ? 'border-bad text-bad' : 'border-warn text-warn',
        )}
      >
        {avisoColaCorto}
      </button>
    )

  return (
    <div
      data-testid="shell"
      data-tema-v2={temaV2 ? '1' : '0'}
      className={cn(
        'shell-nav-v2 flex min-h-dvh flex-col bg-paper text-sm text-fore lg:flex-row',
        temaV2 && 'tema-v2',
      )}
    >
      <aside
        data-testid="shell-lateral"
        className={cn(
          'hidden w-[232px] shrink-0 flex-col gap-3 border-r border-ink-600 bg-ink p-3 lg:sticky lg:top-0 lg:flex lg:h-dvh',
          collapsed && 'lg:w-[160px]',
        )}
      >
        <div className="flex min-h-11 items-center gap-2">
          <img src="/mobos-icon.svg" alt="" className="h-8 w-8 shrink-0" />
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <strong data-testid="shell-tienda">{APP_NAME}</strong>
              <p className={CELDA_DATO}>{empresa?.nombre}</p>
            </div>
          )}
          {onToggleCollapsed && (
            <button
              type="button"
              aria-label={collapsed ? 'Expandir menú' : 'Colapsar menú'}
              onClick={onToggleCollapsed}
              className="min-h-11 min-w-11"
            >
              <Icon name="chevron" className="h-4 w-4" />
            </button>
          )}
        </div>
        {searchButton()}
        <nav aria-label="Navegación principal" className="flex flex-col gap-1">
          {sections.map(section => (
            <button
              key={section.id}
              type="button"
              aria-label={section.label}
              title={section.label}
              aria-current={currentId === section.id ? 'page' : undefined}
              onClick={() => navegar(section.items[0][0])}
              className={cn(
                'flex min-h-11 items-center gap-3 rounded-lg px-3 text-left text-mute hover:bg-ink-700 hover:text-fore',
                currentId === section.id && 'bg-ink-700 font-semibold text-fore',
              )}
            >
              <Icon
                name={section.icon}
                className={cn(
                  'h-[18px] w-[18px] shrink-0',
                  currentId === section.id && 'text-fono-light',
                )}
              />
              {!collapsed && section.label}
            </button>
          ))}
        </nav>
        <div className="mt-auto flex min-w-0 flex-col gap-2 border-t border-ink-600 pt-3">
          <div data-testid="shell-sucursal-desktop">
            <SelectorSucursal className="max-w-full" abrirArriba />
          </div>
          {alertsButton()}
          {offlineButton('shell-cola-offline')}
          <PresencePill />
          {profileButton()}
        </div>
      </aside>
      <div className="shell-body flex min-w-0 flex-1 flex-col">
        <header
          data-testid="shell-mobile-header"
          className="sticky top-0 z-20 border-b border-ink-600 bg-ink pt-safe lg:hidden"
        >
          <div className="flex h-14 min-w-0 items-center gap-1 px-3">
            <img src="/mobos-icon.svg" alt="" className="h-7 w-7 shrink-0" />
            <strong className="min-w-0 flex-1 truncate">{APP_NAME}</strong>
            {searchButton(true)}
            {alertsButton(true)}
            {profileButton(true)}
          </div>
          <div
            data-testid="shell-sucursal-mobile"
            className="flex min-w-0 items-center justify-between gap-2 border-t border-ink-600 px-3 py-1"
          >
            <SelectorSucursal className="max-w-full shrink-0" />
            {/* #304: en móvil el aviso del demo comparte la fila de la sucursal
                (una sola barra en vez de dos) y deja más lugar al trabajo. */}
            {esDemo && angosta && (
              <div role="status" className="flex min-w-0 flex-1 items-center justify-end gap-1 text-[11px] leading-[14px] text-mute">
                <span className="line-clamp-2 min-w-0 text-right" title="Modo demo: datos ficticios, nada se guarda.">Demo: datos ficticios, nada se guarda.</span>
                {botonComoFunciona}
              </div>
            )}
            {offlineButton('shell-cola-offline-pill')}
          </div>
        </header>
        {!enLinea && (
          <div role="status" className="bg-bad px-4 py-2 text-center text-onbrand">
            Sin conexión: los datos pueden estar desactualizados. Se sincroniza al reconectar.
          </div>
        )}
        {esDemo && !angosta && (
          <div
            role="status"
            className="flex items-center justify-between gap-2 border-b border-ink-600 bg-ink px-4 py-1 text-xs text-mute"
          >
            <span>Demo: datos ficticios, nada se guarda.</span>
            {botonComoFunciona}
          </div>
        )}
        <div className="px-4 pt-3 md:px-8 md:pt-5">
          <nav
            data-testid="shell-breadcrumb"
            aria-label="Sección actual"
            className="text-xs text-mute"
          >
            {breadcrumbs.join(' / ')}
          </nav>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-[26px] font-semibold tracking-tight">{title}</h1>
            {headerActions}
          </div>
          {subtitle && <p className="text-sm text-mute">{subtitle}</p>}
          {currentSection && (contextGroups.length > 1 || currentGroup?.items.length > 1) && (
            <div className={cn('mt-2 lg:mt-3 lg:block', currentGroup?.items.length > 1 && 'grid grid-cols-2 gap-x-2')}>
              <SectionSelector
                testId="shell-contexto"
                label={`Áreas de ${currentSection.label}`}
                items={contextGroups}
                value={currentGroup?.id}
                onChange={id => navegar(contextGroups.find(group => group.id === id).items[0][0])}
              />
              {currentGroup?.items.length > 1 && (
                <SectionSelector
                  testId="shell-subcontexto"
                  label={`Destinos de ${currentGroup.label}`}
                  items={currentGroup.items}
                  value={active}
                  onChange={navegar}
                  dropdownOnly
                />
              )}
            </div>
          )}
        </div>
        {loading ? (
          <main className="flex-1 p-4 md:p-8" aria-busy="true">
            <Skeleton className="h-40 w-full" />
          </main>
        ) : (
          children
        )}
      </div>
      <nav
        data-testid="shell-bottom-nav"
        aria-label="Navegación principal móvil"
        className="shell-bottom-nav fixed inset-x-0 bottom-0 z-30 flex border-t border-ink-600 bg-ink pb-safe lg:hidden"
      >
        {sections.map(section => (
          <button
            key={section.id}
            type="button"
            aria-current={currentId === section.id ? 'page' : undefined}
            onClick={() => navegar(section.items[0][0])}
            className={cn(
              'flex min-h-[55px] min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 text-[10px] text-mute',
              currentId === section.id && 'font-semibold text-fore',
            )}
          >
            <Icon
              name={section.icon}
              className={cn('h-[18px] w-[18px]', currentId === section.id && 'text-fono-light')}
            />
            <span>{section.label}</span>
          </button>
        ))}
      </nav>
      <Modal
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        title="Perfil y preferencias"
        size="corto"
      >
        <div data-testid="shell-drawer-acciones" className="flex flex-col gap-1">
          <PersonaChip
            user={{ ...usuarioActual, name: nombreUsuario }}
            picture={esOwner ? perfilEmpresa?.picture : undefined}
          />
          {empresa?.nombre && (
            <p data-testid="shell-empresa" className="text-sm text-fore">{empresa.nombre}</p>
          )}
          {onMiCuenta && (
            <button
              type="button"
              className="min-h-11 text-left"
              onClick={() => {
                setProfileOpen(false)
                onMiCuenta()
              }}
            >
              Mi perfil
            </button>
          )}
          {profileDestinations.map(([id, label]) => (
            <button
              key={id}
              type="button"
              className="min-h-11 text-left"
              onClick={() => navegar(id)}
            >
              {label}
            </button>
          ))}
          <div className="flex min-h-11 items-center justify-between gap-3">
            <span>Tema claro / oscuro</span>
            <ThemeToggle />
          </div>
          {onHelp && (
            <button
              type="button"
              className="min-h-11 text-left"
              onClick={() => {
                setProfileOpen(false)
                onHelp()
              }}
            >
              Atajos de teclado
            </button>
          )}
          {onLockRequest && (
            <button
              type="button"
              data-testid="shell-bloquear"
              className="min-h-11 text-left"
              onClick={() => {
                setProfileOpen(false)
                onLockRequest()
              }}
            >
              Bloquear pantalla
            </button>
          )}
          {onLogout && (
            <button
              type="button"
              className="min-h-11 text-left text-bad"
              onClick={() => {
                setProfileOpen(false)
                onLogout()
              }}
            >
              Cerrar sesión
            </button>
          )}
        </div>
      </Modal>
      {esDemo && <ComoFuncionaDemo open={comoFunciona} onClose={() => setComoFunciona(false)} />}

      {/* Detalle de la cola offline del POS, desde el aviso del shell. */}
      {colaAbierta && <PanelColaOffline open onClose={() => setColaAbierta(false)} />}

      {notificacionesActivas && (
        <>
          <PanelNotificaciones
            open={notificacionesAbiertas}
            onClose={() => setNotificacionesAbiertas(false)}
            items={notificaciones.items}
            cargando={notificaciones.cargando}
            error={notificaciones.error}
            onRecargar={notificaciones.cargar}
            activas={preferencias.notificaciones}
            demo={esDemo}
            onAbrir={href => {
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
