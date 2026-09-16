import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/lib/api'
import { consumeActionToken } from '@/lib/actionToken'
import { Button, Card, Label } from '@/components/ui'
import ProductFooter from '@/components/app/ProductFooter'

function PinBox({ id, value, onChange, onComplete, autoFocus, inputRef }) {
  return (
    <input
      ref={inputRef}
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="new-password"
      maxLength={4}
      value={value}
      autoFocus={autoFocus}
      onChange={(event) => {
        const next = event.target.value.replace(/\D/g, '').slice(0, 4)
        onChange(next)
        if (next.length === 4) onComplete?.()
      }}
      className="mx-auto block h-20 w-48 rounded-2xl border border-ink-500 bg-paper text-center text-4xl font-bold tracking-[.5em] text-fore shadow-card transition-all duration-150 placeholder:text-mute/50 focus:scale-105 focus:border-fono focus:ring-2 focus:ring-fono/30 focus:outline-none"
      placeholder="••••"
      aria-label={id === 'invite-pin' ? 'PIN de 4 dígitos' : 'Repetir PIN'}
    />
  )
}

export default function AceptarInvitacion() {
  const [token] = useState(() => consumeActionToken())
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const confirmRef = useRef(null)

  useEffect(() => {
    if (pin.length === 4) confirmRef.current?.focus()
  }, [pin])

  // Al completar el segundo PIN la invitación se acepta sola.
  const autoRef = useRef(false)
  useEffect(() => {
    if (confirm.length === 4 && pin.length === 4 && !saving && !message) {
      if (autoRef.current) return
      autoRef.current = true
      const form = document.getElementById('invite-form')
      if (form) form.requestSubmit()
      else submit(new Event('submit'))
    }
  }, [confirm, pin, saving, message])

  async function submit(event) {
    event.preventDefault(); setError(''); setMessage('')
    if (!/^[a-f0-9]{64}$/i.test(token)) return setError('La invitación no es válida. Pedí que te la reenvíen desde Configuración → Equipo.')
    if (!/^\d{4}$/.test(pin)) return setError('Elegí un PIN de exactamente 4 dígitos.')
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
  }

  return (
    <main className="flex min-h-dvh flex-col bg-paper text-fore">
      <div className="flex flex-1 items-center justify-center p-5">
        <Card className="w-full max-w-md">
          <img src="/logo-dark.svg" alt="MobOS" className="hidden w-40 dark:block" />
          <img src="/logo.svg" alt="MobOS" className="w-40 dark:hidden" />
          <h1 className="mt-6 text-2xl font-bold">Sumate al equipo</h1>
          <p className="mt-2 text-sm leading-6 text-mute">
            Elegí tu propio PIN de acceso. Tu invitación no contiene contraseñas ni PIN temporales.
          </p>
          <form id="invite-form" onSubmit={submit} className="mt-6 space-y-5">
            <div>
              <Label htmlFor="invite-pin">PIN de 4 dígitos</Label>
              <PinBox id="invite-pin" autoFocus value={pin} onChange={(next) => { setPin(next); setError('') }} onComplete={() => confirmRef.current?.focus()} />
            </div>
            <div>
              <Label htmlFor="invite-pin-confirm">Repetir PIN</Label>
              <PinBox id="invite-pin-confirm" inputRef={confirmRef} value={confirm} onChange={(next) => { setConfirm(next); setError('') }} />
            </div>
            {error && <p role="alert" className="rounded-lg border border-bad/30 bg-bad/10 p-3 text-sm text-bad">{error}</p>}
            {message && <p role="status" className="rounded-lg border border-ok/30 bg-ok/10 p-3 text-sm text-ok">{message}</p>}
            <Button type="submit" className="w-full" disabled={saving || Boolean(message)}>
              {saving ? 'Aceptando…' : 'Aceptar invitación'}
            </Button>
          </form>
          <Link to="/login" className="mt-5 inline-flex min-h-11 items-center text-sm font-semibold text-fono-dark hover:text-fore">
            Ir al acceso
          </Link>
        </Card>
      </div>
      <ProductFooter />
    </main>
  )
}
