import { useState } from 'react'
import { Aviso, Button, PasswordInput } from '@/components/ui'
import { api } from '@/lib/api/client'
import { esReautenticacionRequerida, mensajeDeErrorDeGuardado, mensajeDeGuardado } from '@/utils/guardadoCuenta'

// Guardado de Configuración (#162 · lote F): un estado Guardado/Error por
// formulario y, cuando el API pide reautenticación reciente para una acción
// sensible (403), el pedido de contraseña ahí mismo: al verificarla el guardado
// sigue solo y los cambios del usuario no se pierden.
//
// Uso:
//   const guardado = useGuardadoCuenta({ id: 'datos-tienda', onReauth })
//   ...
//   const datos = await guardado.ejecutar(() => api.patch(…), { etiqueta: 'los datos de la tienda' })
//   ...
//   <EstadoGuardado testId="datos-tienda-estado" estado={guardado.estado} />
//   {guardado.panel}

export function useGuardadoCuenta({ id, onReauth } = {}) {
  const [estado, setEstado] = useState(null)
  const [pendiente, setPendiente] = useState(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function ejecutar(accion, { etiqueta = 'los cambios', exito } = {}) {
    setEstado(null)
    try {
      const resultado = await accion()
      setPendiente(null)
      const detalle = typeof exito === 'function' ? exito(resultado) : exito
      setEstado({ ok: true, texto: mensajeDeGuardado(detalle) })
      return resultado
    } catch (causa) {
      if (esReautenticacionRequerida(causa)) {
        setPendiente({ accion, etiqueta })
        setEstado({ ok: false, texto: 'Falta verificar tu contraseña: los cambios no se guardaron todavía.' })
      } else setEstado({ ok: false, texto: mensajeDeErrorDeGuardado(causa) })
      return null
    }
  }

  async function reintentar(evento) {
    evento?.preventDefault?.()
    if (busy || !password || !pendiente) return
    setBusy(true); setError('')
    try {
      const auth = await api.post('/api/account', { password })
      onReauth?.(auth?.validUntil)
      setPassword('')
      const { accion, etiqueta } = pendiente
      setPendiente(null)
      await ejecutar(accion, { etiqueta })
    } catch (causa) { setError(causa?.message || 'No se pudo verificar la contraseña.') } finally { setBusy(false) }
  }

  const panel = pendiente ? (
    <form
      onSubmit={reintentar}
      data-testid={id ? `${id}-reauth` : 'reauth-cambios'}
      className="space-y-3 rounded-xl border border-warn/40 bg-warn/5 p-3"
    >
      <div>
        <p className="text-sm font-semibold">Confirmá tu contraseña para guardar</p>
        <p className="mt-0.5 text-xs text-mute">Los cambios de {pendiente.etiqueta} son sensibles: al verificar tu contraseña el guardado sigue solo y la autorización queda habilitada por 10 minutos.</p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <PasswordInput aria-label="Contraseña para guardar los cambios" autoComplete="current-password" disabled={busy} value={password} onChange={evento => setPassword(evento.target.value)} placeholder="Contraseña de la empresa" className="min-w-0 flex-1" />
        <Button type="submit" disabled={busy || !password}>Verificar y guardar</Button>
      </div>
      {error && <Aviso tono="error" compact>{error}</Aviso>}
    </form>
  ) : null

  return { estado, setEstado, ejecutar, panel }
}

// Estado del guardado: el objeto visual vive en la biblioteca (#253, lote 36)
// y acá queda el hook con la API y la reautenticación. El re-export mantiene la
// ruta histórica para los consumidores.
export { EstadoGuardado } from 'owncoding-ui'
