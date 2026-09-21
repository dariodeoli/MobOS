import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/lib/api'
import { consumeActionToken } from '@/lib/actionToken'
import { Aviso, Badge, Button, Card, Label, PinInput } from '@/components/ui'
import ProductFooter from '@/components/app/ProductFooter'
import PegarEnlaceToken from '@/components/shared/PegarEnlaceToken'

const ESTADOS = {
  ACTIVE: { label: 'Invitación activa', color: 'green' },
  EXPIRED: { label: 'Invitación vencida', color: 'orange' },
  REVOKED: { label: 'Invitación revocada', color: 'red' },
  USED: { label: 'Invitación ya utilizada', color: 'slate' },
  INVALID: { label: 'Invitación no encontrada', color: 'red' },
}

export default function AceptarInvitacion() {
  const [token, setToken] = useState(() => consumeActionToken())
  const [estado, setEstado] = useState(null) // { status, companyName, email, role }
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const confirmRef = useRef(null)

  useEffect(() => {
    if (!token) return
    api.get(`/api/user-invitations/state?token=${encodeURIComponent(token)}`)
      .then((resultado) => setEstado(resultado))
      .catch(() => setEstado({ status: 'INVALID' }))
  }, [token])

  useEffect(() => {
    if (pin.length === 6) confirmRef.current?.focus()
  }, [pin])

  const submit = useCallback(async function submit(event) {
    event.preventDefault(); setError(''); setMessage('')
    if (!/^[a-f0-9]{64}$/i.test(token)) return setError('Pegá el enlace completo de tu correo para continuar.')
    if (!/^\d{4,6}$/.test(pin)) return setError('Elegí un PIN de 4 a 6 dígitos.')
    if (pin !== confirm) return setError('Los PIN no coinciden.')
    setSaving(true)
    try {
      const deviceId = localStorage.getItem('mobos:device-id') || crypto.randomUUID()
      localStorage.setItem('mobos:device-id', deviceId)
      const result = await api.post('/api/user-invitations/accept', { token, pin, deviceId })
      setMessage(result.message); setPin(''); setConfirm('')
      window.location.assign('/')
    }
    catch (cause) { setError(cause?.message || 'No se pudo aceptar la invitación.') }
    finally { setSaving(false) }
  }, [token, pin, confirm])

  // Al completar el segundo PIN la invitación se acepta sola (4 a 6 dígitos).
  const autoRef = useRef(false)
  useEffect(() => {
    if (confirm.length >= 4 && confirm === pin && pin.length >= 4 && !saving && !message) {
      if (autoRef.current) return
      autoRef.current = true
      const form = document.getElementById('invite-form')
      if (form) form.requestSubmit()
      else submit(new Event('submit'))
    }
  }, [confirm, pin, saving, message, submit])

  const activa = estado?.status === 'ACTIVE'
  const estadoInfo = estado ? ESTADOS[estado.status] || ESTADOS.INVALID : null

  return (
    <main className="flex min-h-dvh flex-col bg-paper text-fore">
      <div className="flex flex-1 items-center justify-center p-5">
        <Card className="w-full max-w-md">
          <img src="/logo-dark.svg" alt="MobOS" className="hidden w-40 dark:block" />
          <img src="/logo.svg" alt="MobOS" className="w-40 dark:hidden" />
          <h1 className="mt-6 text-2xl font-bold">{estado?.companyName ? `«${estado.companyName}» te invita a su equipo` : 'Sumate al equipo'}</h1>
          {estado?.email && <p className="mt-2 text-sm text-mute">Invitación enviada a <b className="text-fore">{estado.email}</b>{estado.role ? ` · rol: ${estado.role}` : ''}.</p>}
          {estadoInfo && <div className="mt-3"><Badge color={estadoInfo.color}>{estadoInfo.label}</Badge></div>}
          {estado && !activa && (
            <p className="mt-4 rounded-lg border border-warn/30 bg-warn/10 p-3 text-sm text-mute">
              {estado.status === 'EXPIRED' && 'Este enlace venció. Pedí que te reenvíen la invitación desde Configuración → Equipo.'}
              {estado.status === 'REVOKED' && 'Este enlace fue revocado. Pedí que te inviten de nuevo desde Configuración → Equipo.'}
              {estado.status === 'USED' && 'Este enlace ya fue utilizado. Si ya aceptaste, iniciá sesión con tu PIN.'}
              {estado.status === 'INVALID' && 'El enlace no es válido. Pedí que te reenvíen la invitación desde Configuración → Equipo.'}
            </p>
          )}
          {!/^[a-f0-9]{64}$/i.test(token) && (
            <div className="mt-6">
              <p className="text-sm text-mute">Pegá el enlace completo que te llegó por correo para sumarte al equipo.</p>
              <PegarEnlaceToken onToken={(nuevo) => { setToken(nuevo); setError('') }} />
            </div>
          )}
          {activa && (
            <>
              <p className="mt-2 text-sm leading-6 text-mute">
                Elegí tu propio PIN de acceso. Tu invitación no contiene contraseñas ni PIN temporales.
              </p>
              <form id="invite-form" onSubmit={submit} className="mt-6 space-y-5">
                <div>
                  <Label htmlFor="invite-pin">PIN de 4 a 6 dígitos</Label>
                  <PinInput id="invite-pin" length={6} autoFocus value={pin} onChange={(next) => { setPin(next); setError('') }} onComplete={() => confirmRef.current?.focus()} />
                </div>
                <div>
                  <Label htmlFor="invite-pin-confirm">Repetir PIN</Label>
                  <PinInput id="invite-pin-confirm" length={6} inputRef={confirmRef} ariaLabel="Repetir PIN" value={confirm} onChange={(next) => { setConfirm(next); setError('') }} />
                </div>
                {error && <Aviso tono="error" className="p-3">{error}</Aviso>}
                {message && <Aviso tono="ok" className="p-3">{message}</Aviso>}
                <Button type="submit" className="w-full" disabled={saving || Boolean(message)}>
                  {saving ? 'Aceptando…' : 'Aceptar invitación'}
                </Button>
              </form>
            </>
          )}
          <Link to="/login" className="mt-5 inline-flex min-h-11 items-center text-sm font-semibold text-fono-dark hover:text-fore">
            Ir al acceso
          </Link>
        </Card>
      </div>
      <ProductFooter />
    </main>
  )
}
