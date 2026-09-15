import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '@/lib/api'
import { Button, Card, Input, Label, PasswordInput } from '@/components/ui'
import { APP_VERSION } from '@/lib/brand'
import ThemeLogo from '@/components/app/ThemeLogo'

export default function RecuperarContrasena() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const resetting = /^[a-f0-9]{64}$/i.test(token)

  async function submit(event) {
    event.preventDefault(); setError(''); setMessage(''); setSaving(true)
    try {
      if (resetting) {
        if (password.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres.')
        if (password !== confirm) throw new Error('Las contraseñas no coinciden.')
        const result = await api.post('/api/auth/password-reset', { token, password })
        setMessage(result.message)
      } else {
        const result = await api.post('/api/auth/password-recovery', { email })
        setMessage(result.message)
      }
    } catch (cause) { setError(cause?.message || 'No se pudo completar la solicitud.') } finally { setSaving(false) }
  }

  return <main className="flex min-h-dvh items-center justify-center bg-paper p-5 text-fore"><Card className="w-full max-w-md border-fore/10 bg-ink"><Link to="/login" className="text-sm font-semibold text-fono-dark hover:text-fore">← Volver al acceso</Link><ThemeLogo className="mt-6 w-40" /><h1 className="mt-6 text-2xl font-bold">{resetting ? 'Elegí una nueva contraseña' : 'Recuperá tu contraseña'}</h1><p className="mt-2 text-sm leading-6 text-mute">{resetting ? 'Usá al menos 8 caracteres. La nueva contraseña cerrará las sesiones activas de tu empresa.' : 'Te enviaremos un enlace de un solo uso si existe una cuenta con ese correo.'}</p><form onSubmit={submit} className="mt-6 space-y-4">{resetting ? <><div><Label htmlFor="new-password">Nueva contraseña</Label><PasswordInput id="new-password" minLength={8} maxLength={72} required autoComplete="new-password" value={password} onChange={event => { setPassword(event.target.value); setError('') }} /></div><div><Label htmlFor="confirm-password">Repetir contraseña</Label><PasswordInput id="confirm-password" minLength={8} maxLength={72} required autoComplete="new-password" value={confirm} onChange={event => { setConfirm(event.target.value); setError('') }} /></div></> : <div><Label htmlFor="recovery-email">Correo de la empresa</Label><Input id="recovery-email" type="email" required autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="vos@tutienda.com" /></div>}{error && <p role="alert" className="rounded-lg border border-bad/30 bg-bad/10 p-3 text-sm text-bad">{error}</p>}{message && <p role="status" className="rounded-lg border border-ok/30 bg-ok/10 p-3 text-sm text-ok">{message}</p>}<Button className="w-full" type="submit" disabled={saving}>{saving ? 'Procesando…' : resetting ? 'Actualizar contraseña' : 'Enviar instrucciones'}</Button></form><p className="mt-6 text-center text-xs text-mute">{APP_VERSION} · MobOS</p></Card></main>
}
