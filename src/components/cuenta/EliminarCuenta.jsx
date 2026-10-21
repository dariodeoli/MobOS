import { useState } from 'react'
import { Aviso, Button, Card, Label, PasswordInput } from '@/components/ui'
import Popup from '@/components/shared/Popup'
import { sessionApi } from '@/lib/api/session'
import { iniciarSesionConApple } from '@/lib/nativo/apple'
import { isNativeIOS } from '@/lib/plataforma'
import { mensajeDeError } from '@/lib/cuentaEliminar'
import { PIE_ACCIONES } from '@/components/shared/formulario'

// Eliminar mi cuenta (Mi cuenta › Tu perfil). Obligatoria para la App Store
// (guía 5.1.1(v)) y visible también en la web. Pide volver a autenticarse:
// contraseña de la cuenta, o Apple en el iPhone. El dueño de una tienda no
// puede eliminar su cuenta mientras la tienda exista: el API lo rechaza y acá
// se explica el camino.

export default function EliminarCuenta({ esDemo = false }) {
  const [abierto, setAbierto] = useState(false)
  const [clave, setClave] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const ios = isNativeIOS()

  function cerrar() {
    if (busy) return
    setAbierto(false); setClave(''); setError(null)
  }

  async function eliminar(reauth) {
    setBusy(true); setError(null)
    try {
      await sessionApi.deleteAccount(reauth)
      window.location.assign('/login')
    } catch (cause) {
      setError(mensajeDeError(cause))
      setBusy(false)
    }
  }

  async function conApple() {
    setError(null)
    try {
      // Nonce 'reauth' del servidor; el API espera { apple: { identityToken, nonce } }.
      const { identityToken, nonce } = await iniciarSesionConApple({ purpose: 'reauth' })
      await eliminar({ apple: { identityToken, nonce } })
    } catch (cause) {
      if (!cause?.cancelado) setError({ dueno: false, texto: cause?.message || 'No se pudo confirmar con Apple.' })
    }
  }

  return (
    <Card className="space-y-3" data-testid="mi-cuenta-eliminar">
      <div>
        <h2 className="font-semibold">Eliminar mi cuenta</h2>
        <p className="mt-1 text-sm text-mute">Borra tu acceso y tus datos personales de MobOS. No se puede deshacer. Si sos el dueño de una tienda, primero transferila o eliminala.</p>
      </div>
      <div>
        <Button type="button" variant="danger" className="min-h-11" disabled={esDemo} onClick={() => setAbierto(true)} data-testid="eliminar-cuenta-abrir">Eliminar mi cuenta</Button>
        {esDemo && <p className="mt-2 text-xs text-mute">No disponible en la demo.</p>}
      </div>
      <Popup open={abierto} onClose={cerrar} title="¿Eliminar tu cuenta?" tamano="sm">
        <form onSubmit={(event) => { event.preventDefault(); if (clave) eliminar({ password: clave }) }} className="space-y-3">
          <p className="text-sm text-mute">Vamos a borrar tu acceso y tus datos personales. Para confirmar que sos vos, volvé a ingresar tu contraseña{ios ? ' o confirmá con Apple' : ''}.</p>
          <div>
            <Label htmlFor="eliminar-cuenta-clave">Contraseña de la cuenta</Label>
            <PasswordInput id="eliminar-cuenta-clave" autoComplete="current-password" value={clave} onChange={(event) => setClave(event.target.value)} disabled={busy} />
          </div>
          {error && (
            <Aviso como="div" role="alert" data-testid="eliminar-cuenta-error" className="px-3 py-2 text-sm">
              {error.texto}
            </Aviso>
          )}
          <div className={PIE_ACCIONES}>
            <Button type="button" variant="ghost" className="min-h-11" onClick={cerrar} disabled={busy}>Cancelar</Button>
            {ios && <Button type="button" variant="outline" className="min-h-11" onClick={conApple} disabled={busy} data-testid="eliminar-cuenta-apple">Confirmar con Apple</Button>}
            <Button type="submit" variant="danger" className="min-h-11" disabled={busy || !clave} data-testid="eliminar-cuenta-confirmar">{busy ? 'Eliminando…' : 'Eliminar mi cuenta'}</Button>
          </div>
        </form>
      </Popup>
    </Card>
  )
}
