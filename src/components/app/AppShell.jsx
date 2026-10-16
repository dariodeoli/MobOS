import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { useTemaV2 } from '@/lib/temaV2'
import { Modal, Skeleton } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import PersonaChip from '@/components/shared/PersonaChip'
import SelectorSucursal from '@/components/shared/SelectorSucursal'
import SelectorEmpresa, { DialogosEmpresa, useCambioEmpresa } from '@/components/shared/SelectorEmpresa'
import ThemeToggle from '@/components/app/ThemeToggle'
import PanelNotificaciones from '@/components/app/PanelNotificaciones'
import ComoFuncionaDemo from '@/components/app/ComoFuncionaDemo'
import PanelColaOffline from '@/components/ventas/PanelColaOffline'
import SectionTabs from '@/components/app/SectionTabs'
import { claveBadge, useBadgesPestanas } from '@/lib/badgesPestanas'
import PageHeader from '@/components/app/PageHeader'
import { RecordSlotContext } from '@/components/app/RecordHeader'
import { SegmentosToolbarContext } from '@/components/app/SegmentosToolbar'
import DemoBanner from '@/components/app/DemoBanner'
import { usePantallaAngosta } from '@/hooks/usePantallaAngosta'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { useColaOffline } from '@/hooks/useColaOffline'
import { sincronizarEventosWebPush, sincronizarWebPush } from '@/lib/webPush'
import { usePresenceTracker, usePresentes } from '@/hooks/usePresence'
import { usePreferencias } from '@/hooks/usePreferencias'
import { useNotificaciones } from '@/hooks/useNotificaciones'
import { useSesion } from '@/lib/sesion'
import { APP_NAME, APP_VERSION } from '@/lib/brand'
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
  collapsed: plegadoPreferido = false,
  onToggleCollapsed,
  configMenu,
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
  // La guía de la demo aparece sola la primera vez por pestaña (#201), pero como
  // un aviso que se cierra (#461): nunca una ventana que tape la primera pantalla.
  const [avisoGuiaDemo, setAvisoGuiaDemo] = useState(false)
  useEffect(() => {
    if (!esDemo) return
    try {
      if (sessionStorage.getItem('mobos:demo-guia-vista') !== '1') {
        sessionStorage.setItem('mobos:demo-guia-vista', '1')
        setAvisoGuiaDemo(true)
      }
    } catch {
      /* sin storage: no se muestra solo */
    }
  }, [esDemo])
  // #448: entrar a una sección o cambiar de pestaña arranca siempre arriba de la
  // página, nunca en el scroll que dejó la pantalla anterior.
  useEffect(() => {
    try { window.scrollTo({ top: 0, left: 0, behavior: 'auto' }) } catch { /* entorno sin scroll */ }
  }, [active])
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
  const cambioEmpresa = useCambioEmpresa()
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
  const personasPresentes = usePresentes()
  const otrosPresentes = personasPresentes.filter(persona => persona.id !== usuarioActual?.id)
  const [equipoPresenteAbierto, setEquipoPresenteAbierto] = useState(false)
  const sections = shellNavigation(nav)
  const currentSection = activeShellSection(sections, active)
  const contextGroups = shellContextGroups(currentSection)
  const badgesPestanas = useBadgesPestanas()
  const currentGroup = contextGroups.find(group => group.items.some(([id]) => id === active))
  const currentId = currentSection?.id
  // #410: dentro de Configuración el menú principal se pliega a su columna de
  // íconos y el menú de Configuración ocupa la segunda columna. La preferencia
  // del usuario (`plegadoPreferido`) no se toca: al salir vuelve tal cual.
  const enConfigMenu = Boolean(configMenu) && currentId === 'configuracion'
  const collapsed = plegadoPreferido || enConfigMenu
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
  const equipoButton = (compact = false) => otrosPresentes.length > 0 && (
    <button
      type="button"
      data-testid={compact ? 'shell-equipo-online-mobile' : 'shell-equipo-online'}
      aria-label={`Equipo en línea: ${otrosPresentes.length} persona${otrosPresentes.length === 1 ? '' : 's'}`}
      aria-haspopup="dialog"
      aria-expanded={equipoPresenteAbierto}
      onClick={() => setEquipoPresenteAbierto(true)}
      className="flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-lg px-2 text-ok hover:bg-ink-700"
    >
      <Icon name="users" className="h-4 w-4" />
      <span className="text-xs font-semibold">{otrosPresentes.length}</span>
    </button>
  )
  const profileButton = (compact = false, { lateral = false } = {}) => (
    <button
      type="button"
      data-testid={compact ? 'shell-perfil-mobile' : 'shell-perfil'}
      aria-label={`Abrir perfil de ${nombreUsuario}${esOwner ? ' (Dueño)' : roleLabel ? ` (${roleLabel})` : ''}, ${enLinea ? 'en línea' : 'sin conexión'}`}
      title={lateral ? `${nombreUsuario}${esOwner ? ' (Dueño)' : roleLabel ? ` (${roleLabel})` : ''}` : undefined}
      aria-haspopup="dialog"
      aria-expanded={profileOpen}
      onClick={() => setProfileOpen(true)}
      className={cn(
        'flex min-h-11 min-w-11 items-center rounded-lg hover:bg-ink-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-fono',
        lateral && !collapsed ? 'w-full gap-2 px-2 text-left' : 'justify-center',
      )}
    >
      <PersonaChip
        user={{ ...usuarioActual, name: nombreUsuario }}
        picture={esOwner ? perfilEmpresa?.picture : undefined}
        nombre={false}
        size="md"
        estado={estadoPresencia}
        title={`${nombreUsuario} ${enLinea ? 'en línea' : 'sin conexión'}`}
        puntoClassName={cn('h-2.5 w-2.5 ring-2', compact || lateral ? 'ring-ink' : 'ring-paper')}
      />
      {lateral && !collapsed && (
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium leading-4 text-fore">{nombreUsuario}</span>
          <span className="block truncate text-xs leading-4 text-mute">{esOwner ? 'Dueño' : roleLabel}</span>
        </span>
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
          !compact && collapsed && 'px-0',
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
  const stockCompacto = ['unidades', 'inventario'].includes(active)
  const offlineButton = (testid, { compacto = false } = {}) =>
    avisoCola && (
      <button
        type="button"
        data-testid={testid}
        aria-label={avisoCola}
        title={avisoCola}
        onClick={() => setColaAbierta(true)}
        className={cn(
          'relative min-h-11 rounded-lg border px-2 text-xs',
          compacto && 'flex min-w-11 items-center justify-center px-0',
          colaUrgente ? 'border-bad text-bad' : 'border-warn text-warn',
        )}
      >
        {compacto ? (
          <>
            <Icon name={colaUrgente || colaOffline.pendientes === 0 ? 'alert' : 'upload'} className="h-[18px] w-[18px]" />
            {colaOffline.pendientes + colaOffline.conflictos > 0 && (
              <span aria-hidden className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-warn px-1 text-[10px] font-semibold leading-none text-white">
                {colaOffline.pendientes + colaOffline.conflictos}
              </span>
            )}
          </>
        ) : avisoColaCorto}
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

  const botonLateral = section =>
    sectionButton(section, {
      className: cn(
        'flex min-h-11 shrink-0 items-center gap-3 rounded-lg px-3 text-left text-mute hover:bg-ink-700 hover:text-fore',
        collapsed ? 'w-11 justify-center px-0' : 'lg:min-h-9',
        currentId === section.id && 'bg-ink-700 font-semibold text-fore',
      ),
      children: !collapsed && section.label,
    })

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
      items={groupTabs.map(group => ({ ...group, badge: badgesPestanas[claveBadge(currentSection.id, group.id)], badgeLabel: 'pendientes' }))}
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
      data-stock-compacto={stockCompacto ? '1' : undefined}
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
          'hidden w-[224px] shrink-0 flex-col gap-2 border-r border-ink-600 bg-ink p-2 lg:sticky lg:top-0 lg:flex lg:h-dvh',
          collapsed && 'lg:w-16 lg:items-center',
        )}
      >
        <div className={cn('flex min-h-11 items-center gap-2', collapsed && 'flex-col')}>
          <img src="/mobos-icon.svg" alt="" className="h-8 w-8 shrink-0" />
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="flex items-baseline gap-1.5"><strong data-testid="shell-tienda">{APP_NAME}</strong><span data-testid="shell-version" className="text-[10px] font-medium text-mute tabular-nums">{APP_VERSION}</span></p>
              <p className={CELDA_DATO}>{empresa?.nombre}</p>
            </div>
          )}
          {onToggleCollapsed && !enConfigMenu && (
            <button
              type="button"
              aria-label={collapsed ? 'Expandir menú' : 'Colapsar menú'}
              onClick={onToggleCollapsed}
              aria-expanded={!collapsed}
              title={collapsed ? 'Expandir menú' : 'Colapsar menú'}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-mute hover:bg-ink-700"
            >
              <Icon name="chevron" className={cn('h-4 w-4 transition-transform', collapsed ? '-rotate-90' : 'rotate-90')} />
            </button>
          )}
        </div>
        {searchButton()}
        <nav aria-label="Navegación principal" className={cn('flex min-h-0 flex-1 flex-col', collapsed && 'w-full items-center')}>
          <div className={cn('flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto', collapsed && 'w-full items-center')}>
            {sections.filter(section => section.id !== 'configuracion').map(section => botonLateral(section))}
          </div>
          {/* Configuración va abajo, separada: ahí se cambian ajustes, no se opera. */}
          {sections.filter(section => section.id === 'configuracion').map(section => (
            <div key={section.id} data-testid="shell-config-pie" className={cn('mt-1 flex shrink-0 flex-col gap-0.5 border-t border-ink-600 pt-1', collapsed && 'w-full items-center')}>
              {botonLateral(section)}
            </div>
          ))}
        </nav>
        <div className={cn('flex min-w-0 shrink-0 flex-col gap-0.5 border-t border-ink-600 pt-2', collapsed && 'w-full items-center')}>
          {offlineButton('shell-cola-offline', { compacto: collapsed })}
          <div className={cn('flex min-w-0 items-center', collapsed && 'flex-col')}>
            {profileButton(false, { lateral: true })}
            {equipoButton()}
          </div>
          {[configDestination, helpDestination].filter(Boolean).map(([id, label, icon]) => (
            <button
              key={id}
              type="button"
              data-testid={`shell-pie-${id}`}
              title={label}
              aria-label={label}
              onClick={() => navegar(id)}
              className={cn(
                'flex min-h-11 items-center gap-3 rounded-lg px-3 text-left text-mute hover:bg-ink-700 hover:text-fore',
                collapsed ? 'w-11 justify-center px-0' : 'lg:min-h-9',
              )}
            >
              <Icon name={icon || 'settings'} className="h-[18px] w-[18px] shrink-0" />
              {!collapsed && label}
            </button>
          ))}
        </div>
      </aside>
      {enConfigMenu && !angosta && (
        <aside
          data-testid="shell-config-menu"
          aria-label="Menú de Configuración"
          className="hidden w-[216px] shrink-0 flex-col border-r border-ink-600 bg-ink lg:sticky lg:top-0 lg:flex lg:h-dvh"
        >
          {configMenu}
        </aside>
      )}
      <div className="shell-body flex min-w-0 flex-1 flex-col" data-registro={recordActivo ? '1' : undefined}>
        <header
          data-testid="shell-mobile-header"
          className="sticky top-0 z-20 border-b border-ink-600 bg-ink pt-safe lg:hidden"
        >
          <div className="flex h-14 min-w-0 items-center gap-1 px-3">
            {esDemo && stockCompacto ? <button type="button" aria-label="Modo demo: cómo funciona" onClick={() => setComoFunciona(true)} className="min-h-11 min-w-11 text-[11px] font-semibold text-fore">Demo</button> : <img src="/mobos-icon.svg" alt="MobOS" className="h-7 w-7 shrink-0" />}
            <div data-testid="shell-sucursal-mobile" className="shell-header-selector flex min-w-0 flex-1 items-center">
              <SelectorSucursal className="max-w-full" />
            </div>
            {offlineButton('shell-cola-offline-pill')}
            {searchButton(true)}
            {alertsButton(true)}
            {equipoButton(true)}
            {profileButton(true)}
          </div>
        </header>
        {!enLinea && (
          <div role="status" className="bg-bad px-4 py-2 text-center text-onbrand">
            Sin conexión: los datos pueden estar desactualizados. Se sincroniza al reconectar.
          </div>
        )}
        <PageHeader
          title={title}
          subtitle={subtitle}
          actions={headerActions}
          aviso={esDemo && !(stockCompacto && angosta) ? <DemoBanner angosta={angosta} onComoFunciona={() => setComoFunciona(true)} onSalir={onLogout} /> : null}
          backTo={backTo}
          breadcrumb={breadcrumbs.join(' / ')}
          record={recordActivo}
          recordRef={setRecordSlot}
          utilities={
            <>
              <SelectorEmpresa control={cambioEmpresa} className="shell-header-selector shrink-0" />
              <div data-testid="shell-sucursal-desktop" className="shell-header-selector flex min-h-11 items-center">
                <SelectorSucursal />
              </div>
              {alertsButton()}
              <ThemeToggle data-testid="shell-tema" className="min-h-11 min-w-11" />
            </>
          }
        >
          {tabsNode}
          {!enToolbar && segmentsNode}
        </PageHeader>
        {esDemo && avisoGuiaDemo && (
          <div role="status" data-testid="demo-guia-aviso" className="mx-4 mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-info/30 bg-info/10 px-3 py-1.5 text-xs text-fore md:mx-6">
            <span className="min-w-0 flex-1">Es una tienda ficticia: probá lo que quieras, nada se guarda y se descarta al recargar.</span>
            <button type="button" className="min-h-9 font-semibold text-fono-light underline" onClick={() => { setAvisoGuiaDemo(false); setComoFunciona(true) }}>Ver cómo funciona</button>
            <button type="button" aria-label="Cerrar aviso de la demo" className="grid h-9 w-9 place-items-center rounded-lg text-base font-bold text-mute hover:bg-ink-700 hover:text-fore" onClick={() => setAvisoGuiaDemo(false)}>×</button>
          </div>
        )}
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
          {cambioEmpresa.visible && (
            <div data-testid="shell-empresas-movil" className="flex flex-col gap-1 py-1">
              <p className="text-[10px] font-bold uppercase tracking-[.14em] text-mute">Cambiar de empresa</p>
              <SelectorEmpresa control={cambioEmpresa} variante="lista" alElegir={() => setProfileOpen(false)} />
            </div>
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
      <Modal open={equipoPresenteAbierto} onClose={() => setEquipoPresenteAbierto(false)} title="Equipo en línea">
        {otrosPresentes.length ? (
          <ul className="space-y-3">
            {otrosPresentes.map(persona => (
              <li key={persona.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <PersonaChip user={persona} estado="en-linea" />
                <span className="text-xs text-mute">{persona.scope?.startsWith('pedidos/') ? 'Viendo un pedido' : 'En la tienda'}</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-mute">No hay otras personas en línea.</p>}
      </Modal>
      <DialogosEmpresa control={cambioEmpresa} />
    </div>
  )
}
