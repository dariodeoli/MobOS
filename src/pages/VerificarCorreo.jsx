import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/lib/api'
import { consumeActionToken } from '@/lib/actionToken'
import { Card } from '@/components/ui'
import ProductFooter from '@/components/app/ProductFooter'
import PegarEnlaceToken from '@/components/shared/PegarEnlaceToken'
import ThemeLogo from '@/components/app/ThemeLogo'

let tokenLeido
const leerToken = () => (tokenLeido === undefined ? (tokenLeido = consumeActionToken()) : tokenLeido)

export default function VerificarCorreo() {
  const [token, setToken] = useState(leerToken)
  const [state, setState] = useState({ loading: true, error: '', message: '' })
  useEffect(() => {
    let active = true
    if (!/^[a-f0-9]{64}$/i.test(token)) return setState({ loading: false, error: '', message: '' }) && undefined
    api.post('/api/auth/email-verification/verify', { token }).then(result => active && setState({ loading: false, error: '', message: result.message })).catch(cause => active && setState({ loading: false, error: cause?.message || 'No se pudo verificar el correo.', message: '' }))
    return () => { active = false }
  }, [token])
  const sinToken = !/^[a-f0-9]{64}$/i.test(token)
  return <main className="flex min-h-dvh flex-col bg-paper text-fore"><div className="flex flex-1 items-center justify-center p-5"><Card className="w-full max-w-md"><ThemeLogo className="w-40" /><h1 className="mt-6 text-2xl font-bold">Verificación de correo</h1>{sinToken && !state.loading && <div className="mt-4 space-y-3"><p className="text-sm text-mute">No encontramos el código en el enlace. Pegá el enlace completo de tu correo:</p><PegarEnlaceToken onToken={(nuevo) => { setToken(nuevo); setState({ loading: true, error: '', message: '' }) }} /></div>}{state.loading && <p role="status" className="mt-4 text-sm text-mute">Verificando el enlace…</p>}{state.error && <p role="alert" className="mt-4 rounded-lg border border-bad/30 bg-bad/10 p-3 text-sm text-bad">{state.error}</p>}{state.message && <p role="status" className="mt-4 rounded-lg border border-ok/30 bg-ok/10 p-3 text-sm text-ok">{state.message}</p>}<Link to="/login" className="mt-5 inline-flex min-h-11 items-center text-sm font-semibold text-fono-dark hover:text-fore">Ir al acceso</Link></Card></div><ProductFooter /></main>
}
