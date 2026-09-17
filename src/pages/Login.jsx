import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSesion } from '@/lib/sesion'
import { Button, Input, Label, PasswordInput, PinInput } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import EmailField from '@/components/shared/EmailField'
import { publicUrls } from '@/lib/urls'
import { sessionApi } from '@/lib/api/session'
import AuthLayout from '@/components/auth/AuthLayout'
import GoogleButton, { OAuthDivider } from '@/components/auth/GoogleButton'
import ThemeLogo from '@/components/app/ThemeLogo'

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
  const [tiendas, setTiendas] = useState([])
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
    setTiendas(result.stores || [])
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
      sessionApi.completeGoogle({ action: 'login' }).then(result => {
        if (result?.storeRequired) {
          setTiendas(result.stores || [])
          setModo('entrar'); setEtapa('tienda'); setGoogleReady(false); setError('')
        } else showCompany(result)
      }).catch(err => {
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

  async function elegirTienda(storeId) {
    if (cargando || !storeId) return
    setError('')
    setOk('')
    setCargando(true)
    try {
      const result = await sessionApi.completeGoogle({ action: 'login', storeId })
      if (result?.storeRequired) {
        setTiendas(result.stores || [])
        setEtapa('tienda')
        setError('Elegí una tienda para continuar.')
      } else showCompany(result)
    } catch (err) {
      setError(err?.message || 'No se pudo abrir la tienda elegida.')
    } finally { setCargando(false) }
  }

  useEffect(() => {
    if (modo !== 'entrar' || etapa !== 'vendedor' || pin.length !== 4 || cargando || pinSubmit.current) return
    pinSubmit.current = true
    setCargando(true)
    entrarVendedor(vendedorId ? { sellerId: vendedorId, pin } : { pin }).catch((err) => {
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
      <section className="login-panel mx-auto w-full max-w-[560px] rounded-[2rem] border border-fore/10 bg-ink/95 p-5 shadow-2xl shadow-fono/5 sm:p-6 lg:p-7">
        <a href={publicUrls.landing} className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-fono-dark transition hover:text-fore lg:mb-3">← Volver al inicio</a>
        <ThemeLogo className="mb-1 w-48" />
        <p className="mb-5 text-sm text-mute lg:mb-4">Sistema de ventas para tiendas</p>

        <h1 className="mb-1 text-2xl font-semibold sm:text-[1.7rem]">
          {crear ? 'Creá la cuenta de tu tienda' : 'Entrá a tu tienda'}
        </h1>
        {!crear && etapa !== 'tienda' && <p className="mb-5 text-sm leading-6 text-mute lg:mb-4">Usá Google o ingresá con el correo de tu tienda.</p>}
        {crear && <p className="mb-5 text-sm leading-6 text-mute lg:mb-4">Empezá con Google o creá tu acceso con correo.</p>}

        <form onSubmit={enviar} className="auth-form space-y-4 lg:space-y-3">
          {crear && !googleReady && <><GoogleButton create busy={cargando} onClick={() => iniciarGoogle(true)} /><OAuthDivider /></>}
          {!crear && etapa === 'empresa' && <><GoogleButton busy={cargando} onClick={() => iniciarGoogle()} /><OAuthDivider /></>}

          {crear && <>
            <div><Label htmlFor="company-name">Nombre de la tienda</Label><Input className="h-14 rounded-xl px-4 lg:h-12" id="company-name" required maxLength={100} value={f.nombreEmpresa} onChange={set('nombreEmpresa')} onBlur={touchSignup('nombreEmpresa')} aria-invalid={Boolean(signupErrors.nombreEmpresa)} aria-describedby={signupErrors.nombreEmpresa ? 'company-name-error' : undefined} autoComplete="organization" placeholder="Nombre de tu tienda" />{signupErrors.nombreEmpresa && <p id="company-name-error" role="alert" className="mt-1 text-xs text-bad">{signupErrors.nombreEmpresa}</p>}</div>
            {!googleReady && <div><Label htmlFor="new-email">Correo de acceso</Label><EmailField className="h-14 rounded-xl px-4 lg:h-12" id="new-email" required value={f.correo} onChange={(value) => { setF((x) => ({ ...x, correo: value })); if (modo === 'crear' && signupTouched.correo) setSignupErrors((errors) => ({ ...errors, correo: signupFieldError('correo', value) })) }} onBlur={touchSignup('correo')} aria-invalid={Boolean(signupErrors.correo)} aria-describedby={signupErrors.correo ? 'new-email-error' : undefined} autoComplete="email" placeholder="vos@tutienda.com" />{signupErrors.correo && <p id="new-email-error" role="alert" className="mt-1 text-xs text-bad">{signupErrors.correo}</p>}</div>}
            {!googleReady && <div><Label htmlFor="new-password">Contraseña de empresa</Label><PasswordInput className="h-14 rounded-xl px-4 pr-11 lg:h-12" id="new-password" required minLength={8} maxLength={72} value={f.clave} onChange={set('clave')} onBlur={touchSignup('clave')} aria-invalid={Boolean(signupErrors.clave)} aria-describedby={signupErrors.clave ? 'new-password-error' : undefined} autoComplete="new-password" placeholder="Mínimo 8 caracteres" /><p className="mt-1 text-xs text-mute">Establecé una contraseña de al menos 8 caracteres.</p>{signupErrors.clave && <p id="new-password-error" role="alert" className="mt-1 text-xs text-bad">{signupErrors.clave}</p>}</div>}
          </>}

          {modo === 'entrar' && etapa === 'setup' ? (
            <><div className="rounded-xl border border-fono-dark/20 bg-fono-dark/5 px-4 py-3"><span className="text-xs text-mute">Tienda creada</span><strong className="mt-1 block text-sm text-fono-dark">{nombreEmpresa || 'Tu tienda'}</strong></div><div className="pt-1"><h2 className="text-base font-semibold text-fore">Elegí tu PIN de administrador</h2><p className="mt-1 text-xs leading-5 text-mute">Este PIN abre el modo ventas y te identifica en cada operación. El resto lo configurás dentro de la app.</p><Label className="mt-4" htmlFor="setup-pin">PIN de 4 dígitos</Label><PinInput id="setup-pin" autoFocus value={setupPin} onChange={(next) => { setError(''); setSetupPin(next) }} className="mx-auto" /><p className="mt-2 text-center text-xs font-medium text-fono-dark">Usá solo 4 dígitos.</p></div></>
          ) : modo === 'entrar' && etapa === 'tienda' ? (
            <div className="space-y-2">
              <p className="text-sm leading-6 text-mute">Tu cuenta de Google tiene acceso a más de una tienda. Elegí con cuál querés entrar.</p>
              {tiendas.length === 0 && !cargando && <p className="text-sm text-mute">No se encontraron tiendas disponibles para esta cuenta.</p>}
              {tiendas.map((t) => (
                <button key={t.id} type="button" onClick={() => elegirTienda(t.id)} disabled={cargando} className="flex w-full items-center justify-between gap-3 rounded-xl border border-ink-500 bg-paper px-4 py-3 text-left transition hover:border-fono hover:bg-fono/5 disabled:cursor-not-allowed disabled:opacity-30">
                  <span className="min-w-0">
                    <strong className="block truncate text-sm text-fore">{t.name}</strong>
                    <span className="block truncate text-xs text-mute">{t.slug}</span>
                  </span>
                  <Icon name="chevron" className="h-4 w-4 shrink-0 -rotate-90 text-mute" />
                </button>
              ))}
              <button type="button" onClick={() => iniciarGoogle(true)} disabled={cargando} className="w-full rounded-xl border border-dashed border-ink-500 px-4 py-3 text-sm font-semibold text-fono-light transition hover:border-fono hover:bg-fono/5 disabled:cursor-not-allowed disabled:opacity-30">+ Crear otra tienda</button>
            </div>
          ) : modo === 'entrar' && etapa === 'vendedor' ? (
            <>
              <div className="rounded-xl border border-fono-dark/20 bg-fono-dark/5 px-4 py-3"><span className="text-xs text-mute">Empresa</span><strong className="mt-1 block text-sm text-fono-dark">{nombreEmpresa || 'Tu empresa'}</strong></div>
              <div><Label htmlFor="seller-pin">PIN de vendedor</Label><PinInput id="seller-pin" autoFocus value={pin} onChange={(next) => { setError(''); setPin(next) }} /><p className="mt-2 text-center text-xs text-mute">Tu PIN identifica tu usuario y tus permisos.</p></div>
              <details className="group">
                <summary className="cursor-pointer text-center text-xs text-mute hover:text-fore">¿No sabés tu PIN? Elegí tu usuario</summary>
                <select id="seller" value={vendedorId} onChange={(e) => setVendedorId(e.target.value)} className="mt-2 w-full rounded-xl border border-ink-500 bg-paper px-3 py-3 text-fore"><option value="">Seleccioná tu usuario</option>{vendedores.map((v) => <option key={v.id} value={v.id}>{v.name || v.nombre || v.email}</option>)}</select>
              </details>
              <button type="button" onClick={() => { setEtapa('empresa'); setPin(''); setError('') }} className="text-sm text-mute hover:text-fore">← Volver a empresa</button>
            </>
          ) : !crear && <>
          <div>
            <Label htmlFor="mail">Correo</Label>
            <EmailField
              className="h-14 rounded-xl px-4 lg:h-12"
              id="mail"
              value={f.correo}
              onChange={(value) => setF((x) => ({ ...x, correo: value }))}
              placeholder="vos@tutienda.com"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="email"
            />
          </div>

          <div>
            <Label htmlFor="pass">Contraseña</Label>
            <PasswordInput
              className="h-14 rounded-xl px-4 pr-11 lg:h-12"
              id="pass"
              value={f.clave}
              onChange={set('clave')}
              placeholder={crear ? 'Mínimo 8 caracteres' : '••••••••'}
              autoComplete={crear ? 'new-password' : 'current-password'}
            />
          </div>
          <div className="-mt-1 text-right"><Link to="/restablecer-contrasena" className="text-xs text-mute hover:text-fore">¿Olvidaste tu contraseña? Recuperar</Link></div>
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

          {etapa !== 'tienda' && <Button type="submit" className="h-14 w-full rounded-xl text-base" disabled={cargando || (modo === 'entrar' && etapa === 'vendedor')}>
            {cargando ? 'Un momento…' : crear ? 'Crear mi tienda' : etapa === 'setup' ? 'Activar mi tienda' : 'Continuar'}
          </Button>}
          {(crear || etapa === 'empresa') && <p className="pt-3 text-center text-sm text-mute">
            {crear ? <>¿Ya tenés una tienda? <button type="button" onClick={() => cambiarModo('entrar')} className="font-semibold text-fono-dark hover:text-fore hover:underline">Entrá a tu cuenta</button></> : <>¿Sos nuevo en MobOS? <button type="button" onClick={() => cambiarModo('crear')} className="font-semibold text-fono-dark hover:text-fore hover:underline">Creá tu tienda</button></>}
          </p>}
        </form>
      </section>
    </AuthLayout>
  )
}
