import { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, ArrowUpRight, CheckCircle2, Clock3, Cloud, Database, RefreshCw, ServerCog, ShieldCheck, TriangleAlert, Wifi } from 'lucide-react'
import { APP_CREDIT, APP_CREDIT_URL, APP_VERSION } from '@/lib/brand'
import { publicUrls } from '@/lib/urls'

const platformServices = [
  { id: 'landing', group: 'Experiencia MobOS', name: 'Sitio web', detail: 'Landing y página pública de estado.', icon: Cloud, href: publicUrls.landing, mode: 'page' },
  { id: 'app', group: 'Experiencia MobOS', name: 'Aplicación web', detail: 'Acceso, POS y panel operativo.', icon: Activity, href: publicUrls.app, mode: 'page' },
  { id: 'api', group: 'Plataforma y datos', name: 'API MobOS', detail: 'Servicios operativos y autenticación.', icon: ServerCog, href: `${publicUrls.api}/api/health`, mode: 'health' },
  { id: 'database', group: 'Plataforma y datos', name: 'Base de datos', detail: 'Verificación en vivo desde el healthcheck del API.', icon: Database, mode: 'health' },
  { id: 'cloudflare', group: 'Infraestructura externa', name: 'DNS y CDN · Cloudflare', detail: 'Resolución y entrega del dominio.', icon: Wifi, href: 'https://www.cloudflarestatus.com/', mode: 'managed' },
  { id: 'hub', group: 'Infraestructura externa', name: 'OwnCoding Hub / Coolify', detail: 'Runtime, despliegues y registros del entorno.', icon: ServerCog, href: 'https://hub.owncoding.dev/', mode: 'managed' },
  { id: 'google', group: 'Servicios conectados', name: 'Acceso con Google', detail: 'Proveedor externo para iniciar sesión.', icon: ShieldCheck, href: 'https://www.google.com/appsstatus/dashboard/', mode: 'managed' },
]

function formatTime(date) {
  return new Intl.DateTimeFormat('es-PY', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function StatusBadge({ state }) {
  const isOnline = state === 'operational'
  const isChecking = state === 'checking'
  const text = isOnline ? 'Operativo' : isChecking ? 'Verificando' : state === 'managed' ? 'Supervisión configurada' : 'Requiere atención'
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${isOnline ? 'bg-[#15D7B8]/10 text-[#40ead0]' : isChecking ? 'bg-white/8 text-slate-300' : state === 'managed' ? 'bg-sky-400/10 text-sky-300' : 'bg-red-400/10 text-red-300'}`}><i className={`h-1.5 w-1.5 rounded-full ${isOnline ? 'bg-[#15D7B8]' : isChecking ? 'animate-pulse bg-slate-300' : state === 'managed' ? 'bg-sky-300' : 'bg-red-400'}`}/>{text}</span>
}

export default function Status() {
  const [health, setHealth] = useState({ state: 'checking', checkedAt: null, database: 'checking' })

  const checkHealth = useCallback(async () => {
    setHealth((current) => ({ ...current, state: 'checking', database: 'checking' }))
    try {
      const response = await fetch(`${publicUrls.api}/api/health`, { cache: 'no-store' })
      const result = await response.json().catch(() => null)
      if (!response.ok || !result?.ok) throw new Error('Healthcheck unavailable')
      setHealth({ state: 'operational', checkedAt: new Date(), database: result.services?.database === 'operational' ? 'operational' : 'attention' })
    } catch {
      setHealth({ state: 'attention', checkedAt: new Date(), database: 'attention' })
    }
  }, [])

  useEffect(() => {
    checkHealth()
    const interval = window.setInterval(checkHealth, 60_000)
    return () => window.clearInterval(interval)
  }, [checkHealth])

  const services = useMemo(() => platformServices.map((service) => ({
    ...service,
    state: service.id === 'api' ? health.state : service.id === 'database' ? health.database : service.mode === 'page' ? 'operational' : 'managed',
  })), [health])
  const issue = health.state === 'attention' || health.database === 'attention'

  return <main className="min-h-dvh overflow-hidden bg-[#061019] text-white">
    <div className="pointer-events-none fixed inset-x-0 top-0 h-[26rem] bg-[radial-gradient(ellipse_at_top,rgba(21,215,184,.15),transparent_68%)]" />
    <header className="relative border-b border-white/[.07] bg-[#061019]/75 backdrop-blur-xl">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-4">
        <a href={publicUrls.landing} className="flex items-center gap-3"><img src="/logo-dark.svg" alt="MobOS" className="h-8" /><span className="hidden border-l border-white/10 pl-3 text-sm text-slate-400 sm:block">Estado del sistema</span></a>
        <a href={publicUrls.app} className="rounded-xl border border-white/15 px-3.5 py-2 text-sm font-semibold text-[#15D7B8]">Abrir MobOS <ArrowUpRight className="ml-1 inline" size={15}/></a>
      </div>
    </header>

    <section className="relative mx-auto max-w-5xl px-5 pb-10 pt-16 sm:pt-20">
      <p className="text-xs font-bold uppercase tracking-[.2em] text-[#15D7B8]">Transparencia operativa</p>
      <div className="mt-4 flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
        <div><h1 className="max-w-2xl text-4xl font-bold tracking-[-.055em] sm:text-6xl">Estado de MobOS</h1><p className="mt-4 max-w-2xl text-base leading-7 text-slate-400">Disponibilidad de los servicios que sostienen la operación de tu tienda.</p></div>
        <button onClick={checkHealth} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/15 px-4 text-sm font-semibold text-white hover:border-[#15D7B8]/50"><RefreshCw size={16} className={health.state === 'checking' ? 'animate-spin' : ''}/>Actualizar</button>
      </div>

      <div className={`mt-10 rounded-3xl border p-6 sm:p-8 ${issue ? 'border-red-400/30 bg-red-400/[.07]' : 'border-[#15D7B8]/25 bg-[#15D7B8]/[.07]'}`}>
        <div className="flex gap-4"><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${issue ? 'bg-red-400/15 text-red-300' : 'bg-[#15D7B8]/15 text-[#15D7B8]'}`}>{issue ? <TriangleAlert size={22}/> : <CheckCircle2 size={22}/>}</span><div><h2 className="text-lg font-bold">{issue ? 'Estamos revisando un componente' : health.state === 'checking' ? 'Verificando servicios' : 'Los servicios esenciales están operativos'}</h2><p className="mt-1 text-sm leading-6 text-slate-300">{issue ? 'El API o la base de datos no respondió a su verificación. El equipo puede consultar el detalle técnico en OwnCoding Hub.' : 'La comprobación en vivo valida el API y su conexión con la base de datos. Los proveedores externos mantienen su propio monitoreo.'}</p></div></div>
      </div>
    </section>

    <section className="relative mx-auto max-w-5xl px-5 pb-16">
      {['Experiencia MobOS', 'Plataforma y datos', 'Infraestructura externa', 'Servicios conectados'].map((group) => <div key={group} className="mb-8"><h2 className="mb-3 text-xs font-bold uppercase tracking-[.18em] text-slate-500">{group}</h2><div className="overflow-hidden rounded-2xl border border-white/[.09] bg-[#0a1923]">{services.filter((service) => service.group === group).map((service, index, list) => { const ServiceIcon = service.icon; return <div key={service.id} className={`flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between ${index < list.length - 1 ? 'border-b border-white/[.07]' : ''}`}><div className="flex min-w-0 items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/[.055] text-[#15D7B8]"><ServiceIcon size={19}/></span><div><h3 className="text-sm font-bold">{service.name}</h3><p className="mt-1 text-sm text-slate-400">{service.detail}</p></div></div><div className="flex shrink-0 items-center gap-3"><StatusBadge state={service.state}/>{service.href && <a href={service.href} target="_blank" rel="noreferrer" aria-label={`Abrir ${service.name}`} className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-[#15D7B8]"><ArrowUpRight size={17}/></a>}</div></div> })}</div></div>)}

      <div className="mt-10 grid gap-4 rounded-2xl border border-white/[.09] bg-white/[.025] p-5 sm:grid-cols-[1fr_auto] sm:items-center"><div className="flex gap-3"><Clock3 className="mt-0.5 shrink-0 text-[#15D7B8]" size={18}/><div><h2 className="text-sm font-bold">Última comprobación</h2><p className="mt-1 text-sm text-slate-400">{health.checkedAt ? formatTime(health.checkedAt) : 'Esperando respuesta del healthcheck…'} · Actualización automática cada minuto.</p></div></div><span className="text-xs text-slate-500">No se muestran datos de clientes ni de tiendas.</span></div>
    </section>
    <footer className="relative border-t border-white/[.07] px-5 py-8"><div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 text-xs text-slate-500"><span>MobOS · Estado del sistema · {APP_VERSION}</span><a href={APP_CREDIT_URL} target="_blank" rel="noreferrer" className="font-semibold text-[#15D7B8] hover:underline">{APP_CREDIT}</a></div></footer>
  </main>
}
