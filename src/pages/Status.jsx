import { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, ArrowUpRight, CheckCircle2, Clock3, Database, Mail, RefreshCw, ServerCog, ShieldCheck, TriangleAlert, Wifi } from 'lucide-react'
import { checkMobosStatus } from '@/lib/status/checks'
import { publicUrls } from '@/lib/urls'
import ProductFooter from '@/components/app/ProductFooter'
import ThemeLogo from '@/components/app/ThemeLogo'

const definitions = [
  ['app', 'Experiencia MobOS', 'Aplicación web', 'Acceso, POS y panel operativo.', Activity, publicUrls.app],
  ['api', 'Plataforma y datos', 'API MobOS', 'Servicios operativos y autenticación.', ServerCog, `${publicUrls.api}/api/health`],
  ['database', 'Plataforma y datos', 'Base de datos', 'Conexión PostgreSQL confirmada desde el API.', Database],
  ['auth', 'Servicios conectados', 'Acceso con Google', 'Configuración real del proveedor OAuth.', ShieldCheck],
  ['email', 'Servicios conectados', 'Correo de recuperación', 'Proveedor de correo para restablecer contraseñas.', Mail],
  ['reservations', 'Operación', 'Reservas de inventario', 'Protegidas por sesión; se reporta su acceso público real.', Clock3],
  ['cloudflare', 'Infraestructura externa', 'DNS y CDN · Cloudflare', 'Estado publicado por el proveedor.', Wifi, 'https://www.cloudflarestatus.com/', true],
  ['hub', 'Infraestructura externa', 'OwnCoding Hub / Coolify', 'Runtime y despliegues del entorno.', ServerCog, 'https://hub.owncoding.dev/', true],
].map(([id, group, name, detail, icon, href, external]) => ({ id, group, name, detail, icon, href, external }))

const labels = { operational: 'Operativo', configured: 'Configurado', checking: 'Verificando', degraded: 'Degradado', restricted: 'Acceso requerido', external: 'Estado externo' }
const styles = { operational: 'bg-fono/10 text-fono-dark', configured: 'bg-sky-400/10 text-info', checking: 'bg-fore/10 text-mute', degraded: 'bg-red-400/10 text-bad', restricted: 'bg-amber-400/10 text-warn', external: 'bg-sky-400/10 text-info' }
const dot = { operational: 'bg-fono', configured: 'bg-sky-300', checking: 'animate-pulse bg-slate-300', degraded: 'bg-red-400', restricted: 'bg-amber-300', external: 'bg-sky-300' }
const formatTime = (date) => new Intl.DateTimeFormat('es-PY', { dateStyle: 'medium', timeStyle: 'short' }).format(date)

function Badge({ state }) { return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${styles[state] || styles.degraded}`}><i className={`h-1.5 w-1.5 rounded-full ${dot[state] || dot.degraded}`} />{labels[state] || labels.degraded}</span> }

export default function Status() {
  const [report, setReport] = useState({ checkedAt: null, services: {} })
  const [checking, setChecking] = useState(true)
  const check = useCallback(async () => { setChecking(true); try { setReport(await checkMobosStatus()) } catch { setReport({ checkedAt: new Date(), services: {} }) } finally { setChecking(false) } }, [])
  useEffect(() => { check(); const timer = window.setInterval(check, 60_000); return () => window.clearInterval(timer) }, [check])
  const services = useMemo(() => definitions.map(item => ({ ...item, ...(item.external ? { state: 'external', checkDetail: 'Se abre la fuente de estado del proveedor.' } : report.services[item.id] || (checking ? { state: 'checking', detail: 'Esperando la primera comprobación.' } : { state: 'degraded', detail: 'La comprobación no devolvió un resultado.' })) })), [checking, report])
  const degraded = services.some(service => ['degraded', 'restricted'].includes(service.state))
  const groups = ['Experiencia MobOS', 'Plataforma y datos', 'Servicios conectados', 'Operación', 'Infraestructura externa']

  return <main className="min-h-dvh overflow-hidden bg-paper text-fore"><div className="pointer-events-none fixed inset-x-0 top-0 h-[26rem] bg-[radial-gradient(ellipse_at_top,rgb(var(--c-fono)/.15),transparent_68%)]" />
    <header className="relative border-b border-fore/[.07] bg-paper/75 backdrop-blur-xl"><div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-4"><a href={publicUrls.landing} className="flex items-center gap-3"><ThemeLogo className="h-8" /><span className="hidden border-l border-fore/10 pl-3 text-sm text-mute sm:block">Estado del sistema</span></a><a href={publicUrls.app} className="rounded-xl border border-fore/15 px-3.5 py-2 text-sm font-semibold text-fono-dark">Abrir MobOS <ArrowUpRight className="ml-1 inline" size={15} /></a></div></header>
    <section className="relative mx-auto max-w-5xl px-5 pb-10 pt-16 sm:pt-20"><p className="text-xs font-bold uppercase tracking-[.2em] text-fono-dark">Transparencia operativa</p><div className="mt-4 flex flex-col justify-between gap-6 sm:flex-row sm:items-end"><div><h1 className="max-w-2xl text-4xl font-bold tracking-[-.055em] sm:text-6xl">Estado de MobOS</h1><p className="mt-4 max-w-2xl text-base leading-7 text-mute">Cada estado proviene de una comprobación actual; no asumimos disponibilidad.</p></div><button onClick={check} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-fore/15 px-4 text-sm font-semibold text-fore hover:border-fono-dark/50"><RefreshCw size={16} className={checking ? 'animate-spin' : ''} />Actualizar</button></div>
      <div className={`mt-10 rounded-3xl border p-6 sm:p-8 ${degraded ? 'border-amber-400/30 bg-amber-400/[.07]' : 'border-fono-dark/25 bg-fono-dark/[.07]'}`}><div className="flex gap-4"><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${degraded ? 'bg-amber-400/15 text-warn' : 'bg-fono-dark/15 text-fono-dark'}`}>{degraded ? <TriangleAlert size={22} /> : <CheckCircle2 size={22} />}</span><div><h2 className="text-lg font-bold">{checking ? 'Verificando servicios' : degraded ? 'Operación parcialmente degradada' : 'Los servicios comprobables están operativos'}</h2><p className="mt-1 text-sm leading-6 text-mute">{degraded ? 'Algún servicio no confirmó disponibilidad o requiere una sesión autenticada. Revisá el detalle antes de operar.' : 'Los proveedores externos conservan su propio estado y no cuentan como verificación de MobOS.'}</p></div></div></div></section>
    <section className="relative mx-auto max-w-5xl px-5 pb-16">{groups.map(group => <div key={group} className="mb-8"><h2 className="mb-3 text-xs font-bold uppercase tracking-[.18em] text-mute">{group}</h2><div className="overflow-hidden rounded-2xl border border-fore/[.09] bg-ink">{services.filter(item => item.group === group).map((service, index, list) => { const Icon = service.icon; return <div key={service.id} className={`flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between ${index < list.length - 1 ? 'border-b border-fore/[.07]' : ''}`}><div className="flex min-w-0 items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-fore/[.055] text-fono-dark"><Icon size={19} /></span><div><h3 className="text-sm font-bold">{service.name}</h3><p className="mt-1 text-sm text-mute">{service.detail}</p><p className="mt-1 text-xs text-mute">{service.checkDetail || service.detail}</p></div></div><div className="flex shrink-0 items-center gap-3"><Badge state={service.state} />{service.href && <a href={service.href} target="_blank" rel="noreferrer" aria-label={`Abrir ${service.name}`} className="rounded-lg p-2 text-mute hover:bg-fore/5 hover:text-fono-dark"><ArrowUpRight size={17} /></a>}</div></div> })}</div></div>)}
      <div className="mt-10 grid gap-4 rounded-2xl border border-fore/[.09] bg-fore/[.025] p-5 sm:grid-cols-[1fr_auto] sm:items-center"><div className="flex gap-3"><Clock3 className="mt-0.5 shrink-0 text-fono-dark" size={18} /><div><h2 className="text-sm font-bold">Última comprobación</h2><p className="mt-1 text-sm text-mute">{report.checkedAt ? formatTime(report.checkedAt) : 'Esperando respuesta…'} · Actualización automática cada minuto.</p></div></div><span className="text-xs text-mute">No se muestran datos de clientes ni tiendas.</span></div></section>
    <ProductFooter className="relative mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 border-fore/[.07] px-5 py-8 text-xs" leading={<span>Estado del sistema · </span>} /></main>
}
