import { useEffect, useRef, useState } from 'react'
import { useSesion } from '@/lib/sesion'
import { Button, Card, Input, Label } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import { cn } from '@/lib/utils'
import { APP_VERSION } from '@/lib/brand'

export default function Login() {
  const { entrarEmpresa, entrarVendedor } = useSesion()
  const [modo, setModo] = useState('entrar') // entrar | crear
  const [f, setF] = useState({
    correo: '',
    clave: '',
    nombreEmpresa: '',
    nombrePersona: '',
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

  const set = (campo) => (e) => setF((x) => ({ ...x, [campo]: e.target.value }))

  function cambiarModo(m) {
    setModo(m)
    setError('')
    setOk('')
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
      setOk('La creación de cuentas está temporalmente disponible por contacto con el equipo de MobOS. No se envió ningún correo.')
      setCargando(false)
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
    <main className="relative min-h-dvh overflow-hidden bg-[#071018] text-white">
      <div className="pointer-events-none absolute -left-40 -top-40 h-96 w-96 rounded-full bg-[#15D7B8]/15 blur-3xl" />
      <div className="mx-auto grid min-h-dvh max-w-7xl items-center gap-12 px-5 py-10 lg:grid-cols-[1fr_440px] lg:px-10">
      <section className="hidden lg:block">
        <img src="/logo-dark.svg" alt="MobOS" className="h-10 w-auto" />
        <p className="mt-16 text-xs font-bold uppercase tracking-[.2em] text-[#15D7B8]">Sistema operativo para tiendas móviles</p>
        <h1 className="mt-5 max-w-xl text-6xl font-bold leading-[.94] tracking-[-.06em]">Vendé rápido.<br /><span className="text-[#15D7B8]">Controlá mejor.</span></h1>
        <p className="mt-7 max-w-lg text-lg leading-8 text-slate-400">POS, stock, caja y clientes conectados en una sola operación para que tu equipo se mueva con claridad.</p>
      </section>
      <section className="mx-auto w-full max-w-md rounded-[2rem] border border-white/10 bg-[#0b1822]/95 p-6 shadow-2xl shadow-[#15D7B8]/5 sm:p-8">
      <img src="/logo-dark.svg" alt="MobOS" className="mb-2 w-44" />
      <p className="mb-8 text-sm text-mute">Sistema de ventas para tiendas</p>

      <Card className="w-full max-w-md">
        <div className="mb-5 flex rounded-lg border border-ink-500 p-0.5">
          {[
            ['entrar', 'Entrar'],
            ['crear', 'Crear mi tienda'],
          ].map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => cambiarModo(k)}
              className={cn(
                'flex-1 rounded-[6px] py-2 text-sm font-medium transition',
                modo === k ? 'bg-fono text-white' : 'text-mute hover:text-white',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <h1 className="mb-1 text-lg font-semibold">
          {crear ? 'Creá la cuenta de tu tienda' : 'Entrá a tu tienda'}
        </h1>
        <p className="mb-5 text-sm text-mute">
          {crear
            ? 'Tu tienda arranca vacía y separada de cualquier otra. Nadie más ve tus datos.'
            : 'Con el correo y la contraseña que te dio el dueño de la tienda.'}
        </p>

        <form onSubmit={enviar} className="space-y-3.5">
          {crear && <div className="rounded-xl border border-[#15D7B8]/20 bg-[#15D7B8]/5 p-4 text-sm leading-6 text-slate-300">La creación de cuentas está temporalmente disponible por contacto con el equipo de MobOS. Este formulario no envía correos ni crea cuentas todavía.</div>}

          {modo === 'entrar' && etapa === 'vendedor' ? (
            <>
              <div className="rounded-xl border border-[#15D7B8]/20 bg-[#15D7B8]/5 px-4 py-3"><span className="text-xs text-slate-500">Empresa</span><strong className="mt-1 block text-sm text-[#15D7B8]">{nombreEmpresa || 'Tu empresa'}</strong></div><div><Label htmlFor="seller">Vendedor</Label><select id="seller" value={vendedorId} onChange={(e) => setVendedorId(e.target.value)} className="mt-1 w-full rounded-xl border border-ink-500 bg-ink px-3 py-3 text-white"><option value="">Seleccioná tu usuario</option>{vendedores.map((v) => <option key={v.id} value={v.id}>{v.name || v.nombre || v.email}</option>)}</select></div>
              <div><Label htmlFor="seller-pin">PIN del vendedor</Label><Input id="seller-pin" autoFocus type="password" inputMode="numeric" maxLength={4} value={pin} onChange={(e) => { setError(''); setPin(e.target.value.replace(/\D/g, '').slice(0, 4)) }} placeholder="4 dígitos" autoComplete="one-time-code" /></div>
              <button type="button" onClick={() => { setEtapa('empresa'); setPin(''); setError('') }} className="text-sm text-mute hover:text-white">← Volver a empresa</button>
            </>
          ) : <>
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
            {cargando ? 'Un momento…' : crear ? 'Crear mi tienda' : 'Continuar'}
          </Button>
        </form>
      </Card>

      <p className="mt-6 text-center text-xs text-slate-500">{APP_VERSION} · Tus datos quedan separados y protegidos.</p>
      </section>
      </div>
    </main>
  )
}
