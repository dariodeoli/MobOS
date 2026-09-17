import { useState } from 'react'
import { Button, Input, Label } from '@/components/ui'
import { extractTokenFromUrl } from '@/lib/actionToken'

// Cuando la URL no trae el token (relays de correo, redirecciones que lo
// pierden), el usuario pega el enlace completo y el token se extrae solo.
export default function PegarEnlaceToken({ onToken }) {
  const [enlace, setEnlace] = useState('')
  const [error, setError] = useState('')

  function aplicar(event) {
    event.preventDefault(); setError('')
    const token = extractTokenFromUrl(enlace)
    if (!token) return setError('No encontramos el código en ese enlace. Pegá el enlace completo de tu correo.')
    onToken(token)
  }

  return (
    <form onSubmit={aplicar} className="space-y-3 rounded-xl border border-fono/25 bg-fono/5 p-4">
      <div>
        <Label htmlFor="pegar-enlace">Pegá tu enlace completo</Label>
        <Input
          id="pegar-enlace"
          value={enlace}
          onChange={(event) => { setEnlace(event.target.value); setError('') }}
          placeholder="https://…"
          autoComplete="off"
          className="mt-1.5"
        />
      </div>
      {error && <p role="alert" className="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
      <Button type="submit" disabled={!enlace.trim()}>Usar este enlace</Button>
    </form>
  )
}
