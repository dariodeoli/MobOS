import { useEffect, useState } from 'react'
import { Navigate, NavLink, Outlet, useLocation, useSearchParams } from 'react-router-dom'
import { Activity, ArrowLeft, Building2, LayoutDashboard, ShieldCheck, Users } from 'lucide-react'
import { api } from '@/lib/api'
import ThemeToggle from '@/components/app/ThemeToggle'
import ThemeLogo from '@/components/app/ThemeLogo'
import { PERIODOS, periodoValido } from '@/lib/superadmin/formato'
import { cn } from '@/lib/utils'

const SECCIONES = [
  { to: '/superadmin', etiqueta: 'Resumen', Icono: LayoutDashboard, fin: true },
  { to: '/superadmin/empresas', etiqueta: 'Empresas', Icono: Building2 },
  { to: '/superadmin/usuarios', etiqueta: 'Usuarios', Icono: Users },
  { to: '/superadmin/verificaciones-imei', etiqueta: 'Verificaciones IMEI', corta: 'IMEI', id: 'imei', Icono: ShieldCheck },
  { to: '/superadmin/trafico', etiqueta: 'Tráfico y demo', corta: 'Tráfico', id: 'trafico', Icono: Activity, periodo: true },
]

function Enlace({ seccion, movil = false }) {
  const { Icono } = seccion
  return (
    <NavLink
      to={seccion.to} end={seccion.fin} data-testid={`nav-${seccion.id || seccion.etiqueta.toLowerCase()}`}
      className={({ isActive }) => cn(
        'inline-flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-fono',
        movil ? 'flex-1 flex-col justify-center gap-0.5 px-1 text-xs' : '',
        isActive ? 'bg-fono-soft text-fono-dark dark:text-fono' : 'text-fore hover:bg-ink-700',
      )}
    >
      <Icono className="h-5 w-5 shrink-0" aria-hidden="true" />
      {movil && seccion.corta ? seccion.corta : seccion.etiqueta}
    </NavLink>
  )
}

// Panel del dueño de la plataforma. Fuera de la app de las empresas: solo se
// dibuja cuando el API confirma el acceso; ante cualquier otra respuesta vuelve
// al inicio sin mostrar nada (no revela que el panel existe).
export default function SuperadminLayout() {
  const [acceso, setAcceso] = useState('verificando')
  const [params, setParams] = useSearchParams()
  const { pathname } = useLocation()
  const periodo = periodoValido(params.get('p'))

  useEffect(() => {
    let vivo = true
    api.get('/api/superadmin/access', { cacheMs: 0 })
      .then(() => { if (vivo) setAcceso('ok') })
      .catch(() => { if (vivo) setAcceso('denegado') })
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
      <aside className="hidden w-60 shrink-0 flex-col gap-1 border-r border-ink-600 bg-ink-800 p-3 lg:sticky lg:top-0 lg:flex lg:h-dvh" aria-label="Plataforma">
        <div className="flex min-h-11 items-center gap-2 px-2">
          <ThemeLogo className="h-6 w-auto" />
          <span className="rounded bg-fono-soft px-1.5 py-0.5 text-xs font-semibold text-fono-dark dark:text-fono">Plataforma</span>
        </div>
        <nav className="mt-2 flex flex-col gap-1" aria-label="Secciones">
          {SECCIONES.map(s => <Enlace key={s.to} seccion={s} />)}
        </nav>
        <div className="mt-auto flex flex-col gap-1">
          <a href="/" className="inline-flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm text-mute hover:bg-ink-700"><ArrowLeft className="h-5 w-5" aria-hidden="true" />Volver a la app</a>
          <ThemeToggle />
        </div>
      </aside>

      <div className="min-w-0 flex-1 pb-20 lg:pb-6">
        <header className="sticky top-0 z-10 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-ink-600 bg-paper/95 px-4 py-2 backdrop-blur lg:px-6">
          <div className="flex min-h-11 items-center gap-2 lg:hidden">
            <ThemeLogo className="h-6 w-auto" />
            <span className="hidden rounded bg-fono-soft px-1.5 py-0.5 text-xs font-semibold text-fono-dark dark:text-fono sm:inline">Plataforma</span>
          </div>
          <h1 className="min-w-0 text-lg font-semibold lg:text-xl" data-testid="superadmin-titulo">{titulo}</h1>
          <div className="ml-auto flex items-center gap-2 lg:hidden"><a href="/" aria-label="Volver a la app" className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-mute hover:bg-ink-700"><ArrowLeft className="h-5 w-5" /></a><ThemeToggle /></div>
          {conPeriodo && (
            <div role="group" aria-label="Período" className="flex w-full flex-wrap gap-1.5 lg:w-auto">
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
        <main className="p-4 lg:p-6">
          <Outlet context={{ periodo }} />
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-ink-600 bg-ink-800 px-2 pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Secciones">
        {SECCIONES.map(s => <Enlace key={s.to} seccion={s} movil />)}
      </nav>
    </div>
  )
}
