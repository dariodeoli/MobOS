import { useEffect, useState } from 'react'
import { Navigate, NavLink, Outlet, useLocation, useSearchParams } from 'react-router-dom'
import { Activity, ArrowLeft, Building2, ChevronLeft, ChevronRight, LayoutDashboard, LogOut, ShieldCheck, Users } from 'lucide-react'
import { api } from '@/lib/api'
import ThemeToggle from '@/components/app/ThemeToggle'
import ThemeLogo from '@/components/app/ThemeLogo'
import { PERIODOS, periodoValido } from '@/lib/superadmin/formato'
import { cn } from '@/lib/utils'
import { useSesion } from '@/lib/sesion'
import Avatar from '@/components/shared/Avatar'
import { Aviso } from '@/components/ui'

const SECCIONES = [
  { to: '/superadmin', etiqueta: 'Resumen', Icono: LayoutDashboard, fin: true },
  { to: '/superadmin/empresas', etiqueta: 'Empresas', Icono: Building2 },
  { to: '/superadmin/usuarios', etiqueta: 'Usuarios', Icono: Users },
  { to: '/superadmin/verificaciones-imei', etiqueta: 'Verificaciones IMEI', corta: 'IMEI', id: 'imei', Icono: ShieldCheck },
  { to: '/superadmin/trafico', etiqueta: 'Tráfico y demo', corta: 'Tráfico', id: 'trafico', Icono: Activity, periodo: true },
]

function Enlace({ seccion, movil = false, compacto = false, periodo }) {
  const { Icono } = seccion
  return (
    <NavLink
      to={`${seccion.to}?p=${periodo}`} end={seccion.fin} title={compacto ? seccion.etiqueta : undefined} aria-label={compacto ? seccion.etiqueta : undefined} data-testid={`nav-${seccion.id || seccion.etiqueta.toLowerCase()}`}
      className={({ isActive }) => cn(
        'inline-flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-fono',
        movil ? 'flex-1 flex-col justify-center gap-0.5 px-1 text-xs' : '',
        compacto && 'justify-center px-1',
        isActive ? 'bg-fono-soft text-fono-dark dark:text-fono' : 'text-fore hover:bg-ink-700',
      )}
    >
      <Icono className="h-5 w-5 shrink-0" aria-hidden="true" />
      {!compacto && (movil && seccion.corta ? seccion.corta : seccion.etiqueta)}
    </NavLink>
  )
}

// Panel del dueño de la plataforma. Fuera de la app de las empresas: solo se
// dibuja cuando el API confirma el acceso; ante cualquier otra respuesta vuelve
// al inicio sin mostrar nada (no revela que el panel existe).
export default function SuperadminLayout() {
  const [acceso, setAcceso] = useState('verificando')
  // Preferencia exclusiva de plataforma: no altera ni borra el lateral operativo.
  const [compacto, setCompacto] = useState(() => {
    try { return localStorage.getItem('mobos:plataforma-nav-compacto') === '1' } catch { return false }
  })
  const [saliendo, setSaliendo] = useState(false)
  const [errorSalida, setErrorSalida] = useState('')
  const { usuario, salir } = useSesion()
  const nombre = usuario?.user_metadata?.nombre || usuario?.name || usuario?.email || 'Sesión de plataforma'
  const cambiarDensidad = () => setCompacto(actual => {
    const siguiente = !actual
    try { localStorage.setItem('mobos:plataforma-nav-compacto', siguiente ? '1' : '0') } catch { /* preferencia opcional */ }
    return siguiente
  })
  const cerrarSesion = async () => {
    if (saliendo) return
    setSaliendo(true); setErrorSalida('')
    try { await salir() } catch { setErrorSalida('No se pudo cerrar sesión. Intentá de nuevo.'); setSaliendo(false) }
  }
  const [params, setParams] = useSearchParams()
  const { pathname } = useLocation()
  const periodo = periodoValido(params.get('p'))

  useEffect(() => {
    let vivo = true
    // Un 401 de otra consulta (p. ej. /api/auth/me sin sesión de tienda)
    // invalida las consultas en vuelo y esta vuelve con CONTEXT_CHANGED: eso no
    // es una denegación, se pregunta de nuevo (una vez) antes de echar.
    const consultar = (intento = 0) => api.get('/api/superadmin/access', { cacheMs: 0 })
      .then(() => { if (vivo) setAcceso('ok') })
      .catch(error => {
        if (!vivo) return
        if (error?.code === 'CONTEXT_CHANGED' && intento < 1) return consultar(intento + 1)
        setAcceso('denegado')
      })
    consultar()
    return () => { vivo = false }
  }, [])

  if (acceso === 'denegado') return <Navigate to="/" replace />
  if (acceso !== 'ok') return <div className="min-h-dvh bg-paper" aria-hidden="true" />

  const enResumen = pathname.replace(/\/$/, '') === '/superadmin'
  const conPeriodo = enResumen || pathname.startsWith('/superadmin/trafico')
  const titulo = SECCIONES.find(s => (s.fin ? enResumen : pathname.startsWith(s.to)))?.etiqueta || 'Resumen'
  const elegir = id => { const siguiente = new URLSearchParams(params); siguiente.set('p', id); setParams(siguiente, { replace: true }) }

  return (
    <div className="min-h-dvh bg-paper text-fore lg:flex" data-testid="superadmin-shell">
      <aside className={cn("hidden shrink-0 flex-col gap-1 border-r border-ink-600 bg-ink-800 p-3 lg:sticky lg:top-0 lg:flex lg:h-dvh", compacto ? "w-20" : "w-60")} aria-label="Plataforma" data-testid="plataforma-lateral" data-compacto={compacto}>
        <div className={cn("flex min-h-11 gap-2", compacto ? "flex-col items-center" : "items-center px-2")}>
          <ThemeLogo className={compacto ? "h-5 w-full object-contain" : "h-6 w-auto"} />
          {!compacto && <span className="rounded bg-fono-soft px-1.5 py-0.5 text-xs font-semibold text-fono-dark dark:text-fono">Global</span>}
        </div>
        <button type="button" onClick={cambiarDensidad} aria-expanded={!compacto} aria-controls="plataforma-secciones" aria-label={compacto ? "Expandir navegación de plataforma" : "Plegar navegación de plataforma"} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-ink-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-fono">{compacto ? <ChevronRight aria-hidden="true" className="h-5 w-5" /> : <ChevronLeft aria-hidden="true" className="h-5 w-5" />}</button>
        <nav id="plataforma-secciones" className="mt-2 flex flex-col gap-1" aria-label="Secciones">
          {SECCIONES.map(s => <Enlace key={s.to} seccion={s} compacto={compacto} periodo={periodo} />)}
        </nav>
        <div className="mt-auto flex flex-col gap-2 border-t border-ink-600 pt-3">
          <div className={cn("flex min-w-0 items-center gap-2", compacto && "justify-center")} data-testid="plataforma-identidad" title={nombre}>
            <Avatar user={usuario ? { ...usuario, name: nombre } : { name: nombre, hasAvatar: false }} size="lg" />
            {!compacto && <span className="min-w-0 break-words text-sm">{nombre}<span className="block text-xs text-mute">Vista global</span></span>}
          </div>
          <a href="/" aria-label="Volver a la app" title={compacto ? "Volver a la app" : undefined} className={cn("inline-flex min-h-11 items-center gap-3 rounded-lg text-sm text-mute hover:bg-ink-700", compacto ? "justify-center px-1" : "px-3")}><ArrowLeft className="h-5 w-5" aria-hidden="true" />{!compacto && "Volver a la app"}</a>
          <ThemeToggle />
        </div>
      </aside>

      <div className="min-w-0 flex-1 pb-20 lg:pb-6">
        <header className="sticky top-0 z-10 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-ink-600 bg-paper/95 px-4 py-2 backdrop-blur lg:px-6">
          <div className="flex min-h-11 items-center gap-2 lg:hidden">
            <ThemeLogo className="h-6 w-auto" />
            <span className="hidden rounded bg-fono-soft px-1.5 py-0.5 text-xs font-semibold text-fono-dark dark:text-fono sm:inline">Plataforma</span>
          </div>
          <div className="flex min-h-10 min-w-0 flex-wrap items-center gap-x-2" data-testid="plataforma-barra-titulo"><span className="text-xs text-mute">Centro de control</span><h1 className="min-w-0 text-base font-semibold" data-testid="superadmin-titulo">{titulo}</h1></div>
          <div className="ml-auto flex items-center gap-2 lg:hidden"><a href="/" aria-label="Volver a la app" className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-mute hover:bg-ink-700"><ArrowLeft className="h-5 w-5" /></a><ThemeToggle /></div>
          <button type="button" onClick={cerrarSesion} disabled={saliendo} aria-label="Cerrar sesión" title="Cerrar sesión" className="ml-auto lg:order-last inline-flex h-11 min-w-11 shrink-0 items-center justify-center rounded-lg border border-ink-600 text-fore disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-fono"><LogOut className="h-5 w-5" aria-hidden="true" /><span className="sr-only">{saliendo ? "Cerrando sesión…" : "Cerrar sesión"}</span></button>
          {conPeriodo && (
            <div role="group" aria-label="Período" className="order-last flex w-full flex-wrap gap-1.5 lg:order-none lg:w-auto">
              {PERIODOS.map(p => (
                <button
                  key={p.id} type="button" onClick={() => elegir(p.id)} aria-pressed={periodo === p.id} data-testid={`periodo-${p.id}`}
                  className={cn(
                    'min-h-11 rounded-full border px-3.5 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-fono',
                    periodo === p.id ? 'border-fono-dark bg-fono-soft text-fono-dark dark:border-fono dark:text-fono' : 'border-ink-600 bg-ink-800 text-fore hover:bg-ink-700',
                  )}
                >{p.etiqueta}</button>
              ))}
            </div>
          )}
        </header>
        {errorSalida && <div className="px-4 py-2"><Aviso tono="error">{errorSalida}</Aviso></div>}
        <main className="p-4 lg:p-6">
          <Outlet context={{ periodo }} />
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-ink-600 bg-ink-800 px-2 pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Secciones">
        {SECCIONES.map(s => <Enlace key={s.to} seccion={s} movil periodo={periodo} />)}
      </nav>
    </div>
  )
}
