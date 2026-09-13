import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSesion } from '@/lib/sesion'
import { Button, Card, Input, Label, PasswordInput } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import { cn } from '@/lib/utils'
import { publicUrls } from '@/lib/urls'
import { sessionApi } from '@/lib/api/session'
import AuthLayout from '@/components/auth/AuthLayout'
import GoogleButton, { OAuthDivider } from '@/components/auth/GoogleButton'

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
  const [signupErrors, setSignupErrors] = useState({})
  const [signupTouched, setSignupTouched] = useState({})

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

  function signupFieldError(campo, value) {
    if (campo === 'nombreEmpresa') return value.trim() ? '' : 'Ingresá el nombre de tu tienda.'
    if (campo === 'correo') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) ? '' : 'Ingresá un correo válido.'
    if (campo === 'clave') {
      if (value.length < 8) return 'Usá al menos 8 caracteres.'
      if (new TextEncoder().encode(value).length > 72) return 'La contraseña puede tener hasta 72 caracteres.'
    }
    return ''
  }

  function validateSignup() {
    const next = Object.fromEntries(['nombreEmpresa', 'correo', 'clave'].map(campo => [campo, signupFieldError(campo, f[campo])]).filter(([, message]) => message))
    setSignupTouched({ nombreEmpresa: true, correo: true, clave: true })
    setSignupErrors(next)
    return Object.keys(next).length === 0
  }

  const set = (campo) => (e) => {
    const value = e.target.value
    setF((x) => ({ ...x, [campo]: value }))
    if (modo === 'crear' && signupTouched[campo]) setSignupErrors((errors) => ({ ...errors, [campo]: signupFieldError(campo, value) }))
  }

  const touchSignup = (campo) => () => {
    setSignupTouched((touched) => ({ ...touched, [campo]: true }))
    setSignupErrors((errors) => ({ ...errors, [campo]: signupFieldError(campo, f[campo]) }))
  }

  function cambiarModo(m) {
    setModo(m)
    setError('')
    setOk('')
    setSignupErrors({})
    setSignupTouched({})
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
      if (!googleReady && !validateSignup()) return
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
    <AuthLayout>
      <section className="login-panel mx-auto w-full max-w-[450px] rounded-[2rem] border border-white/10 bg-[#0b1822]/95 p-5 shadow-2xl shadow-[#15D7B8]/5 sm:p-6 lg:p-5">
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
        {!crear && <p className="mb-3 text-sm leading-5 text-mute">Con el correo y la contraseña que te dio el dueño de la tienda.</p>}

        <form onSubmit={enviar} className="space-y-2.5">
          {crear && <>
            <div><Label htmlFor="company-name">Nombre de la tienda</Label><Input id="company-name" required maxLength={100} value={f.nombreEmpresa} onChange={set('nombreEmpresa')} onBlur={touchSignup('nombreEmpresa')} aria-invalid={Boolean(signupErrors.nombreEmpresa)} aria-describedby={signupErrors.nombreEmpresa ? 'company-name-error' : undefined} autoComplete="organization" />{signupErrors.nombreEmpresa && <p id="company-name-error" role="alert" className="mt-1 text-xs text-bad">{signupErrors.nombreEmpresa}</p>}</div>
            {!googleReady && <div><Label htmlFor="new-email">Correo de acceso</Label><Input id="new-email" type="email" required value={f.correo} onChange={set('correo')} onBlur={touchSignup('correo')} aria-invalid={Boolean(signupErrors.correo)} aria-describedby={signupErrors.correo ? 'new-email-error' : undefined} autoComplete="email" />{signupErrors.correo && <p id="new-email-error" role="alert" className="mt-1 text-xs text-bad">{signupErrors.correo}</p>}</div>}
            {!googleReady && <div><Label htmlFor="new-password">Contraseña de empresa</Label><PasswordInput id="new-password" required minLength={8} maxLength={72} value={f.clave} onChange={set('clave')} onBlur={touchSignup('clave')} aria-invalid={Boolean(signupErrors.clave)} aria-describedby={signupErrors.clave ? 'new-password-error' : undefined} autoComplete="new-password" />{signupErrors.clave && <p id="new-password-error" role="alert" className="mt-1 text-xs text-bad">{signupErrors.clave}</p>}</div>}
          </>}

          {modo === 'entrar' && etapa === 'setup' ? (
            <><div className="rounded-xl border border-[#15D7B8]/20 bg-[#15D7B8]/5 px-4 py-3"><span className="text-xs text-slate-500">Tienda creada</span><strong className="mt-1 block text-sm text-[#15D7B8]">{nombreEmpresa || 'Tu tienda'}</strong></div><div><Label htmlFor="setup-pin">Elegí tu PIN de administrador</Label><PasswordInput id="setup-pin" autoFocus required inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={setupPin} onChange={(event) => { setError(''); setSetupPin(event.target.value.replace(/\D/g, '').slice(0, 4)) }} placeholder="4 dígitos" autoComplete="new-password" /></div><p className="text-xs leading-5 text-slate-500">Este PIN abre el modo ventas y te identifica en cada operación. El resto lo configurás dentro de la app.</p></>
          ) : modo === 'entrar' && etapa === 'vendedor' ? (
            <>
              <div className="rounded-xl border border-[#15D7B8]/20 bg-[#15D7B8]/5 px-4 py-3"><span className="text-xs text-slate-500">Empresa</span><strong className="mt-1 block text-sm text-[#15D7B8]">{nombreEmpresa || 'Tu empresa'}</strong></div><div><Label htmlFor="seller">Vendedor</Label><select id="seller" value={vendedorId} onChange={(e) => setVendedorId(e.target.value)} className="mt-1 w-full rounded-xl border border-ink-500 bg-ink px-3 py-3 text-white"><option value="">Seleccioná tu usuario</option>{vendedores.map((v) => <option key={v.id} value={v.id}>{v.name || v.nombre || v.email}</option>)}</select></div>
              <div><Label htmlFor="seller-pin">PIN del vendedor</Label><PasswordInput id="seller-pin" autoFocus inputMode="numeric" maxLength={4} value={pin} onChange={(e) => { setError(''); setPin(e.target.value.replace(/\D/g, '').slice(0, 4)) }} placeholder="4 dígitos" autoComplete="one-time-code" /></div>
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
            <PasswordInput
              id="pass"
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
    </AuthLayout>
  )
}
