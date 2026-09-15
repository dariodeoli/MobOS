import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/lib/api'
import { consumeActionToken } from '@/lib/actionToken'
import { Button, Card, Input, Label } from '@/components/ui'

export default function AceptarInvitacion() {
  const [token] = useState(() => consumeActionToken())
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  async function submit(event) {
    event.preventDefault(); setError(''); setMessage('')
    if (!/^[a-f0-9]{64}$/i.test(token)) return setError('La invitación no es válida.')
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
  return <main className="flex min-h-dvh items-center justify-center bg-[#071018] p-5 text-white"><Card className="w-full max-w-md border-white/10 bg-[#0b1822]"><img src="/logo-dark.svg" alt="MobOS" className="w-40" /><h1 className="mt-6 text-2xl font-bold">Sumate al equipo</h1><p className="mt-2 text-sm leading-6 text-mute">Elegí tu propio PIN de acceso. Tu invitación no contiene contraseñas ni PIN temporales.</p><form onSubmit={submit} className="mt-6 space-y-4"><div><Label htmlFor="invite-pin">PIN de 4 dígitos</Label><Input id="invite-pin" inputMode="numeric" autoComplete="new-password" maxLength={4} value={pin} onChange={event => { setPin(event.target.value.replace(/\D/g, '').slice(0, 4)); setError('') }} aria-describedby={error ? 'invite-error' : undefined} /></div><div><Label htmlFor="invite-pin-confirm">Repetir PIN</Label><Input id="invite-pin-confirm" inputMode="numeric" autoComplete="new-password" maxLength={4} value={confirm} onChange={event => { setConfirm(event.target.value.replace(/\D/g, '').slice(0, 4)); setError('') }} /></div>{error && <p id="invite-error" role="alert" className="rounded-lg border border-bad/30 bg-bad/10 p-3 text-sm text-bad">{error}</p>}{message && <p role="status" className="rounded-lg border border-ok/30 bg-ok/10 p-3 text-sm text-ok">{message}</p>}<Button type="submit" className="w-full" disabled={saving || Boolean(message)}>{saving ? 'Aceptando…' : 'Aceptar invitación'}</Button></form><Link to="/login" className="mt-5 inline-flex min-h-11 items-center text-sm font-semibold text-fono-light hover:text-white">Ir al acceso</Link></Card></main>
}
