import { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, ArrowUpRight, CheckCircle2, Clock3, Database, Mail, RefreshCw, ServerCog, ShieldCheck, TriangleAlert, Wifi } from 'lucide-react'
import { checkMobosStatus, resumenEstadoPublico } from '@/lib/status/checks'
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

// #295: estados explícitos. «Requiere sesión» y «No verificable públicamente»
// no son degradación: la página no puede anunciar una caída que solo existe
// porque el chequeo no tenía permisos para mirar.
const labels = { operational: 'Operativo', degraded: 'Degradado', unverifiable: 'No verificable públicamente', restricted: 'Requiere sesión', checking: 'Verificando', external: 'Estado externo' }
const styles = { operational: 'bg-fono/10 text-fono-dark', degraded: 'bg-bad/10 text-bad', unverifiable: 'bg-info/10 text-info', restricted: 'bg-warn/10 text-warn', checking: 'bg-fore/10 text-mute', external: 'bg-info/10 text-info' }
const dot = { operational: 'bg-fono', degraded: 'bg-bad', unverifiable: 'bg-info', restricted: 'bg-warn', checking: 'animate-pulse bg-ink-500', external: 'bg-info' }
const formatTime = (date) => new Intl.DateTimeFormat('es-PY', { dateStyle: 'medium', timeStyle: 'short' }).format(date)

function Badge({ state, testid }) { return <span data-testid={testid} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${styles[state] || styles.unverifiable}`}><i className={`h-1.5 w-1.5 rounded-full ${dot[state] || dot.unverifiable}`} />{labels[state] || labels.unverifiable}</span> }

export default function Status() {
  const [report, setReport] = useState({ checkedAt: null, services: {} })
  const [checking, setChecking] = useState(true)
  const check = useCallback(async () => { setChecking(true); try { setReport(await checkMobosStatus()) } catch { setReport({ checkedAt: new Date(), services: {} }) } finally { setChecking(false) } }, [])
  useEffect(() => { check(); const timer = window.setInterval(check, 60_000); return () => window.clearInterval(timer) }, [check])
  const services = useMemo(() => definitions.map(item => ({ ...item, ...(item.external ? { state: 'external', checkDetail: 'Se abre la fuente de estado del proveedor.' } : report.services[item.id] || (checking ? { state: 'checking', detail: 'Esperando la primera comprobación.' } : { state: 'unverifiable', detail: 'No se pudo completar la comprobación desde este navegador.' })) })), [checking, report])
  const resumen = useMemo(() => resumenEstadoPublico(report.services), [report.services])
  const degradado = resumen.degradado
  // Sin ningún servicio verificado no se afirma «operativo» ni se inventa una
  // degradación: se informa que no se pudo verificar.
  const sinVerificar = !checking && !degradado && resumen.operativos === 0
  const titulo = checking ? 'Verificando servicios' : degradado ? 'Operación parcialmente degradada' : sinVerificar ? 'No pudimos verificar el estado desde este navegador' : 'Los servicios comprobables están operativos'
  const avisos = [
    resumen.restringidos ? `${resumen.restringidos} servicio${resumen.restringidos === 1 ? '' : 's'} requiere${resumen.restringidos === 1 ? '' : 'n'} sesión` : '',
    resumen.noVerificables ? `${resumen.noVerificables} no se puede${resumen.noVerificables === 1 ? '' : 'n'} verificar públicamente` : '',
  ].filter(Boolean).join(' y ')
  const detalle = checking
    ? 'Estamos consultando la app, el API y los servicios conectados.'
    : degradado
      ? `${resumen.degradados} servicio${resumen.degradados === 1 ? '' : 's'} no confirmó disponibilidad. Revisá el detalle antes de operar.`
      : sinVerificar
        ? 'Ninguna comprobación devolvió un resultado; reintentá con «Actualizar» o revisá tu conexión.'
        : `${avisos ? `${avisos}. ` : ''}Los proveedores externos conservan su propio estado y no cuentan como verificación de MobOS.`
  const groups = ['Experiencia MobOS', 'Plataforma y datos', 'Servicios conectados', 'Operación', 'Infraestructura externa']

  return <main className="min-h-dvh overflow-hidden bg-paper text-fore"><div className="pointer-events-none fixed inset-x-0 top-0 h-[26rem] bg-[radial-gradient(ellipse_at_top,rgb(var(--c-fono)/.15),transparent_68%)]" />
    <header className="relative border-b border-fore/[.07] bg-paper/75 backdrop-blur-xl"><div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-4"><a href={publicUrls.landing} className="flex items-center gap-3"><ThemeLogo className="h-8" /><span className="hidden border-l border-fore/10 pl-3 text-sm text-mute sm:block">Estado del sistema</span></a><a href={publicUrls.app} className="rounded-xl border border-fore/15 px-3.5 py-2 text-sm font-semibold text-fono-dark">Abrir MobOS <ArrowUpRight className="ml-1 inline" size={15} /></a></div></header>
    <section className="relative mx-auto max-w-5xl px-5 pb-10 pt-16 sm:pt-20"><p className="text-xs font-bold uppercase tracking-[.2em] text-fono-dark">Transparencia operativa</p><div className="mt-4 flex flex-col justify-between gap-6 sm:flex-row sm:items-end"><div><h1 className="max-w-2xl text-4xl font-bold tracking-[-.055em] sm:text-6xl">Estado de MobOS</h1><p className="mt-4 max-w-2xl text-base leading-7 text-mute">Cada estado proviene de una comprobación actual; no asumimos disponibilidad.</p></div><button onClick={check} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-fore/15 px-4 text-sm font-semibold text-fore hover:border-fono-dark/50"><RefreshCw size={16} className={checking ? 'animate-spin' : ''} />Actualizar</button></div>
      <div data-testid="estado-resumen" className={`mt-10 rounded-3xl border p-6 sm:p-8 ${degradado ? 'border-warn/30 bg-warn/[.07]' : 'border-fono-dark/25 bg-fono-dark/[.07]'}`}><div className="flex gap-4"><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${degradado ? 'bg-warn/15 text-warn' : 'bg-fono-dark/15 text-fono-dark'}`}>{degradado ? <TriangleAlert size={22} /> : <CheckCircle2 size={22} />}</span><div><h2 data-testid="estado-titulo" className="text-lg font-bold">{titulo}</h2><p className="mt-1 text-sm leading-6 text-mute">{detalle}</p></div></div></div></section>
    <section className="relative mx-auto max-w-5xl px-5 pb-16">{groups.map(group => <div key={group} className="mb-8"><h2 className="mb-3 text-xs font-bold uppercase tracking-[.18em] text-mute">{group}</h2><div className="overflow-hidden rounded-2xl border border-fore/[.09] bg-ink">{services.filter(item => item.group === group).map((service, index, list) => { const Icon = service.icon; return <div key={service.id} data-testid={`estado-servicio-${service.id}`} className={`flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between ${index < list.length - 1 ? 'border-b border-fore/[.07]' : ''}`}><div className="flex min-w-0 items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-fore/[.055] text-fono-dark"><Icon size={19} /></span><div><h3 className="text-sm font-bold">{service.name}</h3><p className="mt-1 text-sm text-mute">{service.detail}</p>{service.checkDetail && service.checkDetail !== service.detail && <p className="mt-1 text-xs text-mute">{service.checkDetail}</p>}</div></div><div className="flex shrink-0 items-center gap-3"><Badge state={service.state} testid={`estado-badge-${service.id}`} />{service.href && <a href={service.href} target="_blank" rel="noreferrer" aria-label={`Abrir ${service.name}`} className="rounded-lg p-2 text-mute hover:bg-fore/5 hover:text-fono-dark"><ArrowUpRight size={17} /></a>}</div></div> })}</div></div>)}
      <div className="mt-10 grid gap-4 rounded-2xl border border-fore/[.09] bg-fore/[.025] p-5 sm:grid-cols-[1fr_auto] sm:items-center"><div className="flex gap-3"><Clock3 className="mt-0.5 shrink-0 text-fono-dark" size={18} /><div><h2 className="text-sm font-bold">Última comprobación</h2><p className="mt-1 text-sm text-mute">{report.checkedAt ? formatTime(report.checkedAt) : 'Esperando respuesta…'} · Actualización automática cada minuto.</p></div></div><span className="text-xs text-mute">No se muestran datos de clientes ni tiendas.</span></div></section>
    <ProductFooter className="relative mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 border-fore/[.07] px-5 py-8 text-xs" leading={<span>Estado del sistema · </span>} /></main>
}
