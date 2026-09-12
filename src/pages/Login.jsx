import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSesion } from '@/lib/sesion'
import { Button, Card, Input, Label } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import { cn } from '@/lib/utils'
import { publicUrls } from '@/lib/urls'
import { sessionApi } from '@/lib/api/session'

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 18 18" className="h-[18px] w-[18px] shrink-0">
      <path fill="#EA4335" d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.482h4.844a4.14 4.14 0 0 1-1.796 2.716v2.258h2.909c1.703-1.568 2.683-3.878 2.683-6.615Z" />
      <path fill="#4285F4" d="M9 18c2.43 0 4.467-.806 5.957-2.18l-2.91-2.258c-.806.54-1.836.86-3.047.86-2.344 0-4.328-1.584-5.037-3.71H.956v2.331A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.963 10.712A5.412 5.412 0 0 1 3.681 9c0-.594.102-1.171.282-1.712V4.957H.956A9 9 0 0 0 0 9c0 1.452.348 2.827.956 4.043l3.007-2.331Z" />
      <path fill="#34A853" d="M9 3.578c1.322 0 2.508.454 3.441 1.345l2.581-2.582C13.463.891 11.426 0 9 0A9 9 0 0 0 .956 4.957l3.007 2.331C4.672 5.162 6.656 3.578 9 3.578Z" />
    </svg>
  )
}

function OAuthDivider() {
  return <div className="flex items-center gap-3 py-0.5 text-[10px] font-semibold uppercase tracking-[.14em] text-slate-500"><span className="h-px flex-1 bg-white/10" />o continuá con<span className="h-px flex-1 bg-white/10" /></div>
}

function GoogleButton({ create, busy, onClick }) {
  const label = create ? 'Crear con Google' : 'Continuar con Google'
  return (
    <button type="button" onClick={onClick} disabled={busy} className="group relative flex h-10 w-full items-center justify-center rounded-lg border border-white/15 bg-white px-4 text-sm font-semibold text-slate-800 shadow-sm transition hover:-translate-y-px hover:border-white hover:bg-slate-50 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#15D7B8] disabled:cursor-wait disabled:opacity-70">
      {busy ? <span className="h-[18px] w-[18px] animate-spin rounded-full border-2 border-slate-300 border-t-[#4285F4]" /> : <GoogleMark />}
      <span className="ml-3">{busy ? 'Conectando con Google…' : label}</span>
      {!busy && <span aria-hidden="true" className="absolute right-4 text-base text-slate-400 transition-transform group-hover:translate-x-0.5">→</span>}
    </button>
  )
}

export default function Login() {
  const { entrarEmpresa, entrarVendedor } = useSesion()
  const [modo, setModo] = useState('entrar') // entrar | crear
  const [f, setF] = useState({
    correo: '',
    clave: '',
    nombreEmpresa: '',
  })
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [cargando, setCargando] = useState(false)
  const [etapa, setEtapa] = useState('empresa')
  const [vendedores, setVendedores] = useState([])
  const [vendedorId, setVendedorId] = useState('')
  const [pin, setPin] = useState('')
  const [nombreEmpresa, setNombreEmpresa] = useState('')
  const pinSubmit = useRef(false)
  const googleStarted = useRef(false)
  const [googleReady, setGoogleReady] = useState(false)
  const [setupPin, setSetupPin] = useState('')

  function showCompany(result) {
    const lista = result.sellers || []
    setNombreEmpresa(result.tenant?.name || '')
    setVendedores(lista)
    setVendedorId(lista.length === 1 ? lista[0].id : '')
    setModo('entrar'); setEtapa(result.onboardingRequired ? 'setup' : 'vendedor'); setGoogleReady(false)
    setError(lista.length ? '' : 'La empresa no tiene usuarios activos disponibles.')
  }

  useEffect(() => {
    if (googleStarted.current) return
    googleStarted.current = true
    const params = new URLSearchParams(window.location.search)
    if (params.has('auth_error')) {
      setError(params.get('auth_error') === 'cancelled' ? 'Cancelaste el acceso con Google. Podés volver a intentarlo.' : 'No se pudo verificar el acceso con Google. Volvé a intentarlo; si persiste, revisá la configuración del servidor.')
    }
    if (params.get('google') === 'ready') {
      setCargando(true)
      sessionApi.completeGoogle({ action: 'login' }).then(showCompany).catch(err => {
        if (err.code === 'onboarding_required') { setModo('crear'); setGoogleReady(true); setError('') }
        else if (err.code === 'start_create') { setModo('crear'); setGoogleReady(false); setError(''); setOk(err.message) }
        else setError(err.message || 'No se pudo completar el acceso con Google.')
      }).finally(() => setCargando(false))
    }
    if (params.has('google') || params.has('auth_error')) {
      params.delete('google'); params.delete('auth_error')
      window.history.replaceState({}, '', `${window.location.pathname}${params.size ? `?${params}` : ''}`)
    }
  }, [])

  const set = (campo) => (e) => setF((x) => ({ ...x, [campo]: e.target.value }))

  function cambiarModo(m) {
    setModo(m)
    setError('')
    setOk('')
  }

  async function iniciarGoogle(create = false) {
    setError('')
    setOk('')
    setCargando(true)
    try {
      await sessionApi.startGoogle(create)
    } catch (err) {
      setError(err?.message || 'No se pudo abrir el acceso con Google.')
      setCargando(false)
    }
  }

  useEffect(() => {
    if (modo !== 'entrar' || etapa !== 'vendedor' || pin.length !== 4 || !vendedorId || cargando || pinSubmit.current) return
    pinSubmit.current = true
    setCargando(true)
    entrarVendedor({ sellerId: vendedorId, pin }).catch((err) => {
      setError(err?.message || 'PIN inválido. Probá de nuevo.')
      setPin('')
    }).finally(() => { pinSubmit.current = false; setCargando(false) })
  }, [pin, vendedorId, etapa, modo, cargando, entrarVendedor])

  async function enviar(e) {
    e.preventDefault()
    setError('')
    setOk('')

    if (modo === 'crear') {
      setCargando(true)
      try {
        if (googleReady) showCompany(await sessionApi.completeGoogle({ action: 'create', companyName: f.nombreEmpresa }))
        else {
          const deviceId = localStorage.getItem('mobos:device-id') || crypto.randomUUID()
          localStorage.setItem('mobos:device-id', deviceId)
          showCompany(await sessionApi.registerCompany({ companyName: f.nombreEmpresa, email: f.correo.trim(), password: f.clave, deviceId }))
        }
      }
      catch (err) { setError(err.message || 'No se pudo crear la tienda.') }
      finally { setCargando(false) }
      return
    }
    if (etapa === 'setup') {
      if (setupPin.length !== 4 || !vendedorId) { setError('Elegí un PIN de 4 dígitos para activar tu tienda.'); return }
      setCargando(true)
      try {
        const result = await sessionApi.completeOnboarding({ pin: setupPin })
        await entrarVendedor({ sellerId: result.admin.id, pin: setupPin })
      } catch (err) {
        setError(err?.message || 'No se pudo activar el PIN. Probá nuevamente.')
        setSetupPin('')
      } finally { setCargando(false) }
      return
    }
    if (!f.correo.trim() || !f.clave) {
      setError('Completá el correo y la contraseña.')
      return
    }

    setCargando(true)
    try {
      if (modo === 'entrar') {
        const deviceId = localStorage.getItem('mobos:device-id') || crypto.randomUUID()
        localStorage.setItem('mobos:device-id', deviceId)
        const r = await entrarEmpresa({ email: f.correo.trim(), password: f.clave, deviceId })
        const lista = Array.isArray(r.sellers) ? r.sellers : []
        setNombreEmpresa(r.tenant?.name || r.tenant?.nombre || '')
        setVendedores(lista)
        setVendedorId(lista.length === 1 ? lista[0].id : '')
        setEtapa('vendedor')
        setError(lista.length ? '' : 'La empresa no devolvió vendedores disponibles.')
        return
      }
    } catch (err) {
      setError(err?.message || 'No se pudo completar. Probá de nuevo.')
    } finally {
      setCargando(false)
    }
  }

  const crear = modo === 'crear'

  return (
    <main className="relative min-h-[calc(100dvh-44px)] overflow-x-hidden bg-[#071018] text-white lg:h-[calc(100dvh-44px)] lg:overflow-hidden">
      <div className="pointer-events-none absolute -left-40 -top-40 h-96 w-96 rounded-full bg-[#15D7B8]/15 blur-3xl" />
      <div className="mx-auto grid min-h-[calc(100dvh-44px)] max-w-7xl items-center gap-8 px-5 py-6 lg:h-[calc(100dvh-44px)] lg:grid-cols-[1fr_410px] lg:px-10 lg:py-4">
      <section className="hidden lg:block">
        <img src="/logo-dark.svg" alt="MobOS" className="h-10 w-auto" />
        <p className="mt-10 text-xs font-bold uppercase tracking-[.2em] text-[#15D7B8]">Sistema operativo para tiendas móviles</p>
        <h1 className="mt-4 max-w-xl text-5xl font-bold leading-[.94] tracking-[-.06em] xl:text-6xl">Vendé rápido.<br /><span className="text-[#15D7B8]">Controlá mejor.</span></h1>
        <p className="mt-5 max-w-lg text-base leading-7 text-slate-400 xl:text-lg xl:leading-8">POS, stock, caja y clientes conectados en una sola operación para que tu equipo se mueva con claridad.</p>
      </section>
      <section className="mx-auto w-full max-w-[410px] rounded-[2rem] border border-white/10 bg-[#0b1822]/95 p-5 shadow-2xl shadow-[#15D7B8]/5 sm:p-6 lg:p-5">
      <a href={publicUrls.landing} className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-[#15D7B8] transition hover:text-white">← Volver al inicio</a>
      <img src="/logo-dark.svg" alt="MobOS" className="mb-1 w-36" />
      <p className="mb-4 text-sm text-mute">Sistema de ventas para tiendas</p>

      <Card className="w-full max-w-md p-4 lg:p-4">
        <div className="mb-3 flex rounded-lg border border-ink-500 p-0.5">
          {[
            ['entrar', 'Entrar'],
            ['crear', 'Crear mi tienda'],
          ].map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => cambiarModo(k)}
              className={cn(
                'flex-1 rounded-[6px] py-1.5 text-sm font-medium transition',
                modo === k ? 'bg-fono text-white' : 'text-mute hover:text-white',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <h1 className="mb-1 text-base font-semibold">
          {crear ? 'Creá la cuenta de tu tienda' : 'Entrá a tu tienda'}
        </h1>
        <p className="mb-3 text-sm leading-5 text-mute">
          {crear
            ? 'Tu tienda arranca vacía y separada de cualquier otra. Nadie más ve tus datos.'
            : 'Con el correo y la contraseña que te dio el dueño de la tienda.'}
        </p>

        <form onSubmit={enviar} className="space-y-2.5">
          {crear && <div className="rounded-xl border border-[#15D7B8]/20 bg-[#15D7B8]/5 p-3 text-xs leading-5 text-slate-300">{googleReady ? 'Solo falta ponerle un nombre a tu tienda. Después configurás tu PIN y el resto cuando ya estés dentro.' : 'Empezá con lo esencial. El PIN, perfil, sucursales y medios de pago los configurás después.'}</div>}
          {crear && <>
            <div><Label htmlFor="company-name">Nombre de la tienda</Label><Input id="company-name" required maxLength={100} value={f.nombreEmpresa} onChange={set('nombreEmpresa')} autoComplete="organization" /></div>
            {!googleReady && <div><Label htmlFor="new-email">Correo de acceso</Label><Input id="new-email" type="email" required value={f.correo} onChange={set('correo')} autoComplete="email" /></div>}
            {!googleReady && <div><Label htmlFor="new-password">Contraseña de empresa</Label><Input id="new-password" type="password" required minLength={12} maxLength={72} value={f.clave} onChange={set('clave')} autoComplete="new-password" /></div>}
          </>}

          {modo === 'entrar' && etapa === 'setup' ? (
            <><div className="rounded-xl border border-[#15D7B8]/20 bg-[#15D7B8]/5 px-4 py-3"><span className="text-xs text-slate-500">Tienda creada</span><strong className="mt-1 block text-sm text-[#15D7B8]">{nombreEmpresa || 'Tu tienda'}</strong></div><div><Label htmlFor="setup-pin">Elegí tu PIN de administrador</Label><Input id="setup-pin" autoFocus required type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={setupPin} onChange={(event) => { setError(''); setSetupPin(event.target.value.replace(/\D/g, '').slice(0, 4)) }} placeholder="4 dígitos" autoComplete="new-password" /></div><p className="text-xs leading-5 text-slate-500">Este PIN abre el modo ventas y te identifica en cada operación. El resto lo configurás dentro de la app.</p></>
          ) : modo === 'entrar' && etapa === 'vendedor' ? (
            <>
              <div className="rounded-xl border border-[#15D7B8]/20 bg-[#15D7B8]/5 px-4 py-3"><span className="text-xs text-slate-500">Empresa</span><strong className="mt-1 block text-sm text-[#15D7B8]">{nombreEmpresa || 'Tu empresa'}</strong></div><div><Label htmlFor="seller">Vendedor</Label><select id="seller" value={vendedorId} onChange={(e) => setVendedorId(e.target.value)} className="mt-1 w-full rounded-xl border border-ink-500 bg-ink px-3 py-3 text-white"><option value="">Seleccioná tu usuario</option>{vendedores.map((v) => <option key={v.id} value={v.id}>{v.name || v.nombre || v.email}</option>)}</select></div>
              <div><Label htmlFor="seller-pin">PIN del vendedor</Label><Input id="seller-pin" autoFocus type="password" inputMode="numeric" maxLength={4} value={pin} onChange={(e) => { setError(''); setPin(e.target.value.replace(/\D/g, '').slice(0, 4)) }} placeholder="4 dígitos" autoComplete="one-time-code" /></div>
              <button type="button" onClick={() => { setEtapa('empresa'); setPin(''); setError('') }} className="text-sm text-mute hover:text-white">← Volver a empresa</button>
            </>
          ) : !crear && <>
          <div>
            <Label htmlFor="mail">Correo</Label>
            <Input
              id="mail"
              type="email"
              value={f.correo}
              onChange={set('correo')}
              placeholder="vos@tutienda.com"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="email"
            />
          </div>

          <div>
            <Label htmlFor="pass">Contraseña</Label>
            <Input
              id="pass"
              type="password"
              value={f.clave}
              onChange={set('clave')}
              placeholder={crear ? 'Mínimo 8 caracteres' : '••••••••'}
              autoComplete={crear ? 'new-password' : 'current-password'}
            />
          </div>
          <div className="-mt-1 text-right"><Link to="/restablecer-contrasena" className="text-xs font-semibold text-[#15D7B8] hover:text-white">¿Olvidaste tu contraseña?</Link></div>
          </>}

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-bad/30 bg-bad/10 px-3.5 py-2.5 text-sm text-bad">
              <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {ok && (
            <div className="flex items-start gap-2 rounded-lg border border-ok/30 bg-ok/10 px-3.5 py-2.5 text-sm text-ok">
              <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{ok}</span>
            </div>
          )}

          <Button type="submit" className="w-full" disabled={cargando || (modo === 'entrar' && etapa === 'vendedor')}>
            {cargando ? 'Un momento…' : crear ? 'Crear mi tienda' : etapa === 'setup' ? 'Activar mi tienda' : 'Continuar'}
          </Button>
          {crear && !googleReady && <><OAuthDivider /><GoogleButton create busy={cargando} onClick={() => iniciarGoogle(true)} /></>}
          {!crear && etapa === 'empresa' && <><OAuthDivider /><GoogleButton busy={cargando} onClick={() => iniciarGoogle()} /></>}
          {(crear || etapa === 'empresa') && <p className="pt-1 text-center text-xs text-slate-400">
            {crear ? <>¿Ya tenés una tienda? <button type="button" onClick={() => cambiarModo('entrar')} className="font-semibold text-[#15D7B8] hover:text-white hover:underline">Entrá a tu cuenta</button></> : <>¿Sos nuevo en MobOS? <button type="button" onClick={() => cambiarModo('crear')} className="font-semibold text-[#15D7B8] hover:text-white hover:underline">Creá tu tienda</button></>}
          </p>}
        </form>
      </Card>

      </section>
      </div>
    </main>
  )
}
