import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { sessionApi } from '@/lib/api/session'
import { consumeActionToken } from '@/lib/actionToken'
import { Button, Card, Label, PasswordInput } from '@/components/ui'
import EmailField from '@/components/shared/EmailField'
import ProductFooter from '@/components/app/ProductFooter'
import ThemeLogo from '@/components/app/ThemeLogo'
import PegarEnlaceToken from '@/components/shared/PegarEnlaceToken'

export default function RecuperarContrasena() {
  const [token, setToken] = useState(() => consumeActionToken())
  const [email, setEmail] = useState('')
  const navigate = useNavigate()
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
        const result = await sessionApi.resetPassword({ token, password })
        if (result?.tenant) { navigate('/login', { replace: true }); return }
        setMessage(result.message)
      } else {
        const result = await api.post('/api/auth/password-recovery', { email })
        setMessage(result.message)
      }
    } catch (cause) { setError(cause?.message || 'No se pudo completar la solicitud.') } finally { setSaving(false) }
  }

  return <main className="flex min-h-dvh flex-col bg-paper text-fore"><div className="flex flex-1 items-center justify-center p-5"><Card className="w-full max-w-md border-fore/10 bg-ink"><Link to="/login" className="text-sm font-semibold text-fono-dark hover:text-fore">← Volver al acceso</Link><ThemeLogo className="mt-6 w-40" /><h1 className="mt-6 text-2xl font-bold">{resetting ? 'Elegí una nueva contraseña' : 'Recuperá tu contraseña'}</h1><p className="mt-2 text-sm leading-6 text-mute">{resetting ? 'Usá al menos 8 caracteres. La nueva contraseña cerrará las sesiones activas de tu empresa.' : 'Te enviaremos un enlace de un solo uso si existe una cuenta con ese correo.'}</p><form onSubmit={submit} className="mt-6 space-y-4">{resetting ? <><div><Label htmlFor="new-password">Nueva contraseña</Label><PasswordInput id="new-password" minLength={8} maxLength={72} required autoComplete="new-password" value={password} onChange={event => { setPassword(event.target.value); setError('') }} /></div><div><Label htmlFor="confirm-password">Repetir contraseña</Label><PasswordInput id="confirm-password" minLength={8} maxLength={72} required autoComplete="new-password" value={confirm} onChange={event => { setConfirm(event.target.value); setError('') }} /></div></> : <div><Label htmlFor="recovery-email">Correo de la empresa</Label><EmailField id="recovery-email" required autoComplete="email" value={email} onChange={setEmail} placeholder="vos@tutienda.com" /></div>}{error && <p role="alert" className="rounded-lg border border-bad/30 bg-bad/10 p-3 text-sm text-bad">{error}</p>}{message && <p role="status" className="rounded-lg border border-ok/30 bg-ok/10 p-3 text-sm text-ok">{message}</p>}<Button className="w-full" type="submit" disabled={saving}>{saving ? 'Procesando…' : resetting ? 'Actualizar contraseña' : 'Enviar instrucciones'}</Button></form>{!resetting && <div className="mt-5 border-t border-fore/10 pt-4"><p className="mb-3 text-xs text-mute">¿Ya tenés el enlace? Pegalo para continuar:</p><PegarEnlaceToken onToken={(nuevo) => { setToken(nuevo); setError(''); setMessage('') }} /></div>}</Card></div><ProductFooter /></main>
}
