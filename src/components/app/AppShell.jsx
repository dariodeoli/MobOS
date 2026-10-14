import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { useTemaV2 } from '@/lib/temaV2'
import { Modal, Skeleton } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import PersonaChip from '@/components/shared/PersonaChip'
import SelectorSucursal from '@/components/shared/SelectorSucursal'
import ThemeToggle from '@/components/app/ThemeToggle'
import PanelNotificaciones from '@/components/app/PanelNotificaciones'
import ComoFuncionaDemo from '@/components/app/ComoFuncionaDemo'
import PanelColaOffline from '@/components/ventas/PanelColaOffline'
import SectionTabs from '@/components/app/SectionTabs'
import PageHeader from '@/components/app/PageHeader'
import { RecordSlotContext } from '@/components/app/RecordHeader'
import { SegmentosToolbarContext } from '@/components/app/SegmentosToolbar'
import DemoBanner from '@/components/app/DemoBanner'
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
import {
  activeShellSection,
  shellBottomNav,
  shellContextGroups,
  shellNavigation,
  shellSegments,
  segmentosEnToolbar,
} from '@/lib/shellNavigation'
import './shellNavigation.css'

function textoColaOffline({ pendientes = 0, sinEmpresa = 0, conflictos = 0, otraEmpresa = 0, enLinea = true } = {}) {
  if (sinEmpresa > 0) return `${sinEmpresa} venta${sinEmpresa === 1 ? '' : 's'} sin empresa por confirmar`
  if (conflictos > 0) return `${conflictos} venta${conflictos === 1 ? '' : 's'} con conflicto`
  if (pendientes > 0) return `${pendientes} venta${pendientes === 1 ? '' : 's'} sin enviar`
  if (otraEmpresa > 0) return `${otraEmpresa} venta${otraEmpresa === 1 ? '' : 's'} pendiente${otraEmpresa === 1 ? '' : 's'} en otra empresa`
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
  backTo,
  pageTabs,
  perfilEmpresa,
  roleLabel = 'Vendedor',
  notificacionesActivas = false,
  onAbrirNotificacion,
}) {
  const temaV2 = useTemaV2()
  const [profileOpen, setProfileOpen] = useState(false)
  const [masOpen, setMasOpen] = useState(false)
  const [recordSlot, setRecordSlot] = useState(null)
  const [recordActivo, setRecordActivo] = useState(false)
  const recordCtx = useMemo(() => ({ slot: recordSlot, setActivo: setRecordActivo }), [recordSlot])
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
  const segments = shellSegments(currentGroup)
  const { bottom: bottomSections, more: moreSections } = shellBottomNav(sections)
  const showBottomNav = sections.length > 1
  const profileDestinations = nav
    .flatMap(group => group.items)
    .filter(([id]) => id === 'equipo' || id === 'ayuda')
  const nombreUsuario = sesionNombre || usuarioActual?.name || 'Usuario'
  const breadcrumbs = (breadcrumb || [currentSection?.label]).filter(text => text && text !== title)

  function navegar(id, opciones) {
    onNavigate?.(id, opciones)
    setProfileOpen(false)
    setMasOpen(false)
  }

  const sinLeer = preferencias.notificaciones ? notificaciones.nuevas.length : 0
  const estadoPresencia = enLinea ? 'en-linea' : 'offline'
  const profileButton = (compact = false) => (
    <button
      type="button"
      data-testid={compact ? 'shell-perfil-mobile' : 'shell-perfil'}
      aria-label={`Abrir perfil de ${nombreUsuario}${esOwner ? ' (Dueño)' : roleLabel ? ` (${roleLabel})` : ''}, ${enLinea ? 'en línea' : 'sin conexión'}`}
      aria-haspopup="dialog"
      aria-expanded={profileOpen}
      onClick={() => setProfileOpen(true)}
      className="flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-ink-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-fono"
    >
      <PersonaChip
        user={{ ...usuarioActual, name: nombreUsuario }}
        picture={esOwner ? perfilEmpresa?.picture : undefined}
        nombre={false}
        size="md"
        estado={estadoPresencia}
        title={`${nombreUsuario} ${enLinea ? 'en línea' : 'sin conexión'}`}
        puntoClassName={cn('h-2.5 w-2.5 ring-2', compact ? 'ring-ink' : 'ring-paper')}
      />
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
        aria-label={sinLeer ? `Notificaciones, ${sinLeer} sin leer` : 'Notificaciones'}
        aria-haspopup="dialog"
        className="relative flex min-h-11 min-w-11 items-center justify-center rounded-lg text-mute hover:bg-ink-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-fono"
      >
        <Icon name="bell" className="h-[18px] w-[18px]" />
        {sinLeer > 0 && (
          <span
            aria-hidden
            data-testid="notificaciones-contador"
            className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-bad px-1 text-[10px] font-semibold leading-none text-white"
          >
            {sinLeer}
          </span>
        )}
      </button>
    )
  const angosta = usePantallaAngosta()
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

  // Configuración ya es un destino principal del menú cuando el catálogo la trae.
  const configEsPrincipal = sections.some(section => section.id === 'configuracion')
  const configDestination = configEsPrincipal
    ? undefined
    : profileDestinations.find(([id]) => id === 'equipo')
  const helpDestination = profileDestinations.find(([id]) => id === 'ayuda')
  const sectionButton = (section, { children: label, ...extra } = {}) => (
    <button
      key={section.id}
      type="button"
      aria-label={section.label}
      title={section.label}
      aria-current={currentId === section.id ? 'page' : undefined}
      onClick={() => navegar(section.items[0][0])}
      {...extra}
    >
      <Icon
        name={section.icon}
        className={cn('h-[18px] w-[18px] shrink-0', currentId === section.id && 'text-fono-light')}
      />
      {label}
    </button>
  )

  const groupTabs = pageTabs ? null : contextGroups.length > 1 ? contextGroups : null
  const tabsNode = pageTabs ? (
    <SectionTabs
      testId="shell-pestanas"
      label={pageTabs.label}
      items={pageTabs.items}
      value={pageTabs.value}
      onChange={pageTabs.onChange}
    />
  ) : groupTabs ? (
    <SectionTabs
      testId="shell-contexto"
      label={`Secciones de ${currentSection.label}`}
      items={groupTabs}
      value={currentGroup?.id}
      onChange={id => navegar(contextGroups.find(group => group.id === id).items[0][0])}
    />
  ) : null
  const enToolbar = segmentosEnToolbar(currentGroup)
  const segmentsNode =
    segments.length > 1 ? (
      <SectionTabs
        variant="segmented"
        testId="shell-subcontexto"
        label={`Vistas de ${currentGroup.label}`}
        items={segments}
        value={active}
        onChange={navegar}
        className={enToolbar ? undefined : 'mt-2'}
      />
    ) : null

  return (
    <div
      data-testid="shell"
      data-tema-v2={temaV2 ? '1' : '0'}
      className={cn(
        'shell-nav-v2 flex min-h-dvh flex-col bg-paper text-sm text-fore lg:flex-row',
        temaV2 && 'tema-v2',
        !showBottomNav && 'shell-sin-nav',
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
        <nav aria-label="Navegación principal" className="flex flex-col gap-1 overflow-y-auto">
          {sections.map(section =>
            sectionButton(section, {
              className: cn(
                'flex min-h-10 shrink-0 items-center gap-3 rounded-lg px-3 text-left text-mute hover:bg-ink-700 hover:text-fore',
                currentId === section.id && 'bg-ink-700 font-semibold text-fore',
              ),
              children: !collapsed && section.label,
            }),
          )}
        </nav>
        <div className="mt-auto flex min-w-0 flex-col gap-1 border-t border-ink-600 pt-3">
          <div data-testid="shell-sucursal-desktop" className="mb-1">
            <SelectorSucursal className="max-w-full" abrirArriba />
          </div>
          {offlineButton('shell-cola-offline')}
          {[configDestination, helpDestination].filter(Boolean).map(([id, label, icon]) => (
            <button
              key={id}
              type="button"
              data-testid={`shell-pie-${id}`}
              title={label}
              onClick={() => navegar(id)}
              className="flex min-h-10 items-center gap-3 rounded-lg px-3 text-left text-mute hover:bg-ink-700 hover:text-fore"
            >
              <Icon name={icon || 'settings'} className="h-[18px] w-[18px] shrink-0" />
              {!collapsed && label}
            </button>
          ))}
        </div>
      </aside>
      <div className="shell-body flex min-w-0 flex-1 flex-col" data-registro={recordActivo ? '1' : undefined}>
        <header
          data-testid="shell-mobile-header"
          className="sticky top-0 z-20 border-b border-ink-600 bg-ink pt-safe lg:hidden"
        >
          <div className="flex h-14 min-w-0 items-center gap-1 px-3">
            <img src="/mobos-icon.svg" alt="MobOS" className="h-7 w-7 shrink-0" />
            <div data-testid="shell-sucursal-mobile" className="flex min-w-0 flex-1 items-center">
              <SelectorSucursal className="max-w-full" />
            </div>
            {offlineButton('shell-cola-offline-pill')}
            {searchButton(true)}
            {alertsButton(true)}
            {profileButton(true)}
          </div>
        </header>
        {!enLinea && (
          <div role="status" className="bg-bad px-4 py-2 text-center text-onbrand">
            Sin conexión: los datos pueden estar desactualizados. Se sincroniza al reconectar.
          </div>
        )}
        {esDemo && <DemoBanner angosta={angosta} onComoFunciona={() => setComoFunciona(true)} onSalir={onLogout} />}
        <PageHeader
          title={title}
          subtitle={subtitle}
          actions={headerActions}
          backTo={backTo}
          breadcrumb={breadcrumbs.join(' / ')}
          record={recordActivo}
          recordRef={setRecordSlot}
          utilities={
            <>
              {alertsButton()}
              {profileButton()}
            </>
          }
        >
          {tabsNode}
          {!enToolbar && segmentsNode}
        </PageHeader>
        <RecordSlotContext.Provider value={recordCtx}>
        <SegmentosToolbarContext.Provider value={enToolbar ? segmentsNode : null}>
          {loading ? (
            <main className="flex-1 px-4 pb-4 pt-1 md:px-6 lg:pt-4" aria-busy="true">
              <Skeleton className="h-40 w-full" />
            </main>
          ) : (
            children
          )}
        </SegmentosToolbarContext.Provider>
        </RecordSlotContext.Provider>
      </div>
      {showBottomNav && (
        <nav
          data-testid="shell-bottom-nav"
          aria-label="Navegación principal móvil"
          className="shell-bottom-nav fixed inset-x-0 bottom-0 z-30 flex border-t border-ink-600 bg-ink pb-safe lg:hidden"
        >
          {bottomSections.map(section =>
            sectionButton(section, {
              className: cn(
                'flex min-h-[55px] min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 text-[10px] text-mute',
                currentId === section.id && 'font-semibold text-fore',
              ),
              children: <span>{section.label}</span>,
            }),
          )}
          {moreSections.length > 0 && (
            <button
              type="button"
              data-testid="shell-mas"
              aria-label="Más"
              aria-haspopup="dialog"
              aria-current={moreSections.some(section => section.id === currentId) ? 'page' : undefined}
              onClick={() => setMasOpen(true)}
              className={cn(
                'flex min-h-[55px] min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 text-[10px] text-mute',
                moreSections.some(section => section.id === currentId) && 'font-semibold text-fore',
              )}
            >
              <Icon name="dots" className="h-[18px] w-[18px]" />
              <span>Más</span>
            </button>
          )}
        </nav>
      )}
      <Modal open={masOpen} onClose={() => setMasOpen(false)} title="Más secciones" size="corto">
        <div data-testid="shell-mas-hoja" className="flex flex-col gap-1">
          {moreSections.map(section =>
            sectionButton(section, {
              className: cn(
                'flex min-h-11 items-center gap-3 rounded-lg px-2 text-left hover:bg-ink-700',
                currentId === section.id && 'bg-ink-700 font-semibold',
              ),
              children: section.label,
            }),
          )}
          {[configDestination, helpDestination].filter(Boolean).map(([id, label, icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => navegar(id)}
              className="flex min-h-11 items-center gap-3 rounded-lg px-2 text-left hover:bg-ink-700"
            >
              <Icon name={icon || 'settings'} className="h-[18px] w-[18px] shrink-0" />
              {label}
            </button>
          ))}
        </div>
      </Modal>
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
