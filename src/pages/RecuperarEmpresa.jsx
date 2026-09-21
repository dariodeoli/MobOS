import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { Aviso, Button, Card, Input, Label, PasswordInput } from '@/components/ui'
import EmailField from '@/components/shared/EmailField'
import ProductFooter from '@/components/app/ProductFooter'
import ThemeLogo from '@/components/app/ThemeLogo'

// Restauración del dueño para una empresa archivada. Las sesiones de una
// empresa archivada quedan revocadas, así que esta es la única vía desde la
// app: correo, contraseña de empresa y la confirmación RESTORE, dentro de la
// ventana recuperable (por defecto 30 días).
function correoInicial() {
  try { return new URLSearchParams(window.location.search).get('email') || '' } catch { return '' }
}

export default function RecuperarEmpresa() {
  const navigate = useNavigate()
  const [email, setEmail] = useState(correoInicial)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(event) {
    event.preventDefault(); setError(''); setSaving(true)
    try {
      await api.post('/api/account/recover', { email, password, confirmation })
      navigate('/login', { replace: true })
    } catch (cause) {
      setError(cause?.message || 'No se pudo recuperar la empresa.')
    } finally { setSaving(false) }
  }

  return <main className="flex min-h-dvh flex-col bg-paper text-fore"><div className="flex flex-1 items-center justify-center p-5"><Card className="w-full max-w-md border-fore/10 bg-ink"><Link to="/login" className="text-sm font-semibold text-fono-dark hover:text-fore">← Volver al acceso</Link><ThemeLogo className="mt-6 w-40" /><h1 className="mt-6 text-2xl font-bold">Recuperá tu empresa</h1><p className="mt-2 text-sm leading-6 text-mute">Si archivaste tu empresa, podés restaurarla con el correo y la contraseña de la cuenta. La información (productos, ventas, clientes y pagos) se conserva. Pasado el plazo de recuperación, escribinos.</p><form onSubmit={submit} className="mt-6 space-y-4"><div><Label htmlFor="recovery-email">Correo de la empresa</Label><EmailField id="recovery-email" required autoComplete="email" value={email} onChange={setEmail} placeholder="vos@tutienda.com" /></div><div><Label htmlFor="recovery-password">Contraseña de empresa</Label><PasswordInput id="recovery-password" required autoComplete="current-password" value={password} onChange={event => { setPassword(event.target.value); setError('') }} /></div><div><Label htmlFor="recovery-confirm">Escribí RESTORE para confirmar</Label><Input id="recovery-confirm" required value={confirmation} onChange={event => { setConfirmation(event.target.value); setError('') }} placeholder="RESTORE" autoComplete="off" /></div>{error && <Aviso tono="error" className="p-3">{error}</Aviso>}<Button className="w-full" type="submit" disabled={saving || !email || !password || confirmation.trim() !== 'RESTORE'}>{saving ? 'Procesando…' : 'Recuperar empresa'}</Button></form></Card></div><ProductFooter /></main>
}
