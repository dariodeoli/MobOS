import { useState } from 'react'
import { useSesion } from '@/lib/sesion'
import { entrarConCorreo, registrarEmpresa } from '@/lib/storage'
import { Button, Card, Input, Label } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import { cn } from '@/lib/utils'

export default function Login() {
  const { entrar } = useSesion()
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

  const set = (campo) => (e) => setF((x) => ({ ...x, [campo]: e.target.value }))

  function cambiarModo(m) {
    setModo(m)
    setError('')
    setOk('')
  }

  async function enviar(e) {
    e.preventDefault()
    setError('')
    setOk('')

    if (!f.correo.trim() || !f.clave) {
      setError('Completá el correo y la contraseña.')
      return
    }
    if (modo === 'crear') {
      if (!f.nombreEmpresa.trim()) {
        setError('Poné el nombre de tu tienda.')
        return
      }
      if (f.clave.length < 8) {
        setError('La contraseña tiene que tener al menos 8 caracteres.')
        return
      }
    }

    setCargando(true)
    try {
      if (modo === 'entrar') {
        const r = await entrarConCorreo(f.correo, f.clave)
        if (r.error) {
          setError(r.error)
          return
        }
        await entrar(r.user)
      } else {
        const r = await registrarEmpresa({
          nombreEmpresa: f.nombreEmpresa,
          nombrePersona: f.nombrePersona,
          correo: f.correo,
          clave: f.clave,
        })
        if (r.error) {
          setError(r.error)
          return
        }
        if (!r.empresaId) {
          // Supabase quedó esperando que confirme el correo.
          setOk('Te mandamos un correo para confirmar la cuenta. Confirmalo y entrá.')
          cambiarModo('entrar')
          return
        }
        await entrar(r.user)
      }
    } catch (err) {
      setError(err?.message || 'No se pudo completar. Probá de nuevo.')
    } finally {
      setCargando(false)
    }
  }

  const crear = modo === 'crear'

  return (
    <div className="glow-blue relative flex min-h-dvh flex-col items-center justify-center bg-ink p-5 pt-safe pb-safe">
      <img src="/logo-dark.svg" alt="Fono" className="mb-2 w-44" />
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
          {crear && (
            <>
              <div>
                <Label htmlFor="emp">Nombre de la tienda</Label>
                <Input
                  id="emp"
                  value={f.nombreEmpresa}
                  onChange={set('nombreEmpresa')}
                  placeholder="Mi Tienda de Celulares"
                  autoCapitalize="words"
                />
              </div>
              <div>
                <Label htmlFor="per">Tu nombre</Label>
                <Input
                  id="per"
                  value={f.nombrePersona}
                  onChange={set('nombrePersona')}
                  placeholder="Esteban"
                  autoCapitalize="words"
                />
              </div>
            </>
          )}

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

          <Button type="submit" className="w-full" disabled={cargando}>
            {cargando ? 'Un momento…' : crear ? 'Crear mi tienda' : 'Entrar'}
          </Button>
        </form>
      </Card>

      <p className="mt-6 text-xs text-mute/60">Fono · v0.2</p>
    </div>
  )
}
