import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSesion } from '@/lib/sesion'
import { api } from '@/lib/api/client'
import AttachmentInput from '@/components/shared/AttachmentInput'
import PhotoCropper from '@/components/shared/PhotoCropper'
import Avatar from '@/components/shared/Avatar'
import PanelDerecho from '@/components/shared/PanelDerecho'
import { Aviso, Button, Card, ConfirmDialog, FormField, Input, Skeleton, useToast } from '@/components/ui'
import { PreferenciasContenido } from '@/components/app/Preferencias'
import { getAvatarDataUrl, olvidarAvatar } from '@/lib/userAvatar'
import { copiarAlPortapapeles } from '@/utils/portapapeles'
import { fechaHora as fmtFecha } from '@/utils/fecha'

// Mi cuenta (#253): la superficie PERSONAL de cualquier rol. Perfil (nombre,
// correo y foto), preferencias del dispositivo (bloqueo por inactividad y
// avisos) y sesiones propias. No muestra datos de la empresa ni de otros
// integrantes: eso vive en Configuración (solo dueño) y Seguridad y auditoría.
const ETIQUETA_NIVEL = { COMPANY: 'Acceso de empresa', SELLER: 'Operación' }

export default function MiCuenta({ preferencias, onCambiarPreferencias }) {
  const toast = useToast()
  const { usuario, empresa, perfilEmpresa, actualizarNombreUsuario, esDemo, sesion } = useSesion()
  const [cuenta, setCuenta] = useState(null)
  const [error, setError] = useState('')
  const [nombre, setNombre] = useState('')
  const [guardandoNombre, setGuardandoNombre] = useState(false)
  const [foto, setFoto] = useState('')
  const [fotoError, setFotoError] = useState('')
  const [fotoBusy, setFotoBusy] = useState(false)
  const [fotoAConfirmar, setFotoAConfirmar] = useState(null)
  const [aRevocar, setARevocar] = useState(null)
  const [aRevocarDemas, setARevocarDemas] = useState(false)
  const [revocando, setRevocando] = useState(false)

  const cargar = useCallback(async () => {
    // Demo (#194): la cuenta se arma con los datos de la pestaña, sin API.
    if (esDemo) {
      const local = {
        perfil: {
          id: usuario?.id || 'demo-usuario',
          name: usuario?.user_metadata?.nombre || usuario?.name || perfilEmpresa?.name || 'Dueño de la tienda',
          email: usuario?.email || empresa?.email || null,
          role: usuario?.role || 'ADMIN',
          hasAvatar: Boolean(perfilEmpresa?.picture),
        },
        currentSessionId: 'demo-sesion',
        sessions: [{ id: 'demo-sesion', level: 'SELLER', deviceId: 'Este dispositivo', createdAt: null, lastSeenAt: new Date().toISOString() }],
      }
      setCuenta(local)
      setNombre(local.perfil.name)
      return
    }
    setError('')
    try {
      const data = await api.get('/api/mi-cuenta')
      setCuenta(data)
      setNombre(data?.perfil?.name || '')
    } catch (cause) {
      setError(cause?.message || 'No se pudo cargar tu cuenta.')
    }
  }, [esDemo, empresa?.email, perfilEmpresa?.name, perfilEmpresa?.picture, usuario?.email, usuario?.id, usuario?.name, usuario?.role, usuario?.user_metadata?.nombre])

  useEffect(() => { cargar() }, [cargar])

  useEffect(() => {
    if (!usuario?.id) return
    let vigente = true
    getAvatarDataUrl(usuario.id).then(data => { if (vigente) setFoto(data) })
    return () => { vigente = false }
  }, [usuario?.id])

  const perfil = cuenta?.perfil || null
  const sesiones = cuenta?.sessions || []
  const otrasSesiones = sesiones.filter(sesionActiva => sesionActiva.id !== cuenta?.currentSessionId)

  async function guardarNombre(event) {
    event.preventDefault()
    if (guardandoNombre || !perfil) return
    const nuevo = nombre.trim()
    if (nuevo.length < 2 || nuevo.length > 100) { toast.error('El nombre debe tener entre 2 y 100 caracteres.'); return }
    if (nuevo === perfil.name) return
    setGuardandoNombre(true)
    try {
      if (esDemo) {
        actualizarNombreUsuario(nuevo)
        setCuenta(current => current ? { ...current, perfil: { ...current.perfil, name: nuevo } } : current)
      } else {
        const data = await api.patch('/api/mi-cuenta', { action: 'updateName', name: nuevo })
        setCuenta(current => current ? { ...current, perfil: { ...current.perfil, name: data?.perfil?.name || nuevo } } : current)
        actualizarNombreUsuario(data?.perfil?.name || nuevo)
      }
      toast.success('Nombre actualizado', 'Se usa en tus ventas, reportes y comprobantes.')
    } catch (cause) {
      toast.error(cause?.message || 'No se pudo guardar tu nombre.')
    } finally { setGuardandoNombre(false) }
  }

  async function subirFoto(file) {
    if (fotoBusy || !usuario?.id) return
    if (esDemo) { setFotoError('La demo no guarda fotos; probá en tu tienda real.'); return }
    setFotoBusy(true); setFotoError('')
    try {
      const form = new FormData()
      form.append('avatar', file)
      await api.post(`/api/users/${encodeURIComponent(usuario.id)}/avatar`, form)
      olvidarAvatar(usuario.id)
      setFoto(await getAvatarDataUrl(usuario.id))
      setCuenta(current => current ? { ...current, perfil: { ...current.perfil, hasAvatar: true } } : current)
      toast.success('Foto actualizada.')
    } catch (cause) { setFotoError(cause?.message || 'No se pudo guardar la foto.') } finally { setFotoBusy(false) }
  }

  async function quitarFoto() {
    if (fotoBusy || !usuario?.id || esDemo) return
    setFotoBusy(true); setFotoError('')
    try {
      await api.delete(`/api/users/${encodeURIComponent(usuario.id)}/avatar`)
      olvidarAvatar(usuario.id)
      setFoto('')
      setCuenta(current => current ? { ...current, perfil: { ...current.perfil, hasAvatar: false } } : current)
    } catch (cause) { setFotoError(cause?.message || 'No se pudo quitar la foto.') } finally { setFotoBusy(false) }
  }

  async function copiar(valor, etiqueta) {
    if (!valor) return
    if (await copiarAlPortapapeles(valor)) toast.success(`${etiqueta} copiado`)
    else toast.error(`No se pudo copiar ${etiqueta.toLowerCase()}`, 'Seleccionalo y copialo manualmente.')
  }

  async function revocar(sessionId) {
    if (revocando) return
    setRevocando(true)
    try {
      await api.patch('/api/mi-cuenta', { action: 'revokeSession', sessionId })
      setCuenta(current => current ? { ...current, sessions: current.sessions.filter(s => s.id !== sessionId) } : current)
      toast.success('Sesión cerrada', 'Ese dispositivo tendrá que volver a ingresar.')
    } catch (cause) {
      toast.error(cause?.message || 'No se pudo cerrar la sesión.')
    } finally { setRevocando(false); setARevocar(null) }
  }

  async function revocarDemas() {
    if (revocando) return
    setRevocando(true)
    try {
      await api.patch('/api/mi-cuenta', { action: 'revokeOtherSessions' })
      setCuenta(current => current ? { ...current, sessions: current.sessions.filter(s => s.id === current.currentSessionId) } : current)
      toast.success('Listo', 'Quedó abierta solo esta sesión.')
    } catch (cause) {
      toast.error(cause?.message || 'No se pudieron cerrar las demás sesiones.')
    } finally { setRevocando(false); setARevocarDemas(false) }
  }

  if (error) return <Aviso tono="error" className="rounded-xl p-3">{error}</Aviso>
  if (!cuenta) return (
    <div className="space-y-4" aria-busy="true">
      <Skeleton className="h-32 rounded-2xl" />
      <Skeleton className="h-40 rounded-2xl" />
    </div>
  )

  return (
    <>
      <PanelDerecho
        panel={preferencias && onCambiarPreferencias ? (
          <Card className="p-4 md:p-5">
            <h2 className="font-semibold">Preferencias del dispositivo</h2>
            <p className="mt-1 text-sm text-mute">Bloqueo por inactividad y avisos de esta computadora o teléfono. Quedan guardados en este navegador, por persona.</p>
            <div className="mt-3"><PreferenciasContenido preferencias={preferencias} onCambiar={onCambiarPreferencias} /></div>
          </Card>
        ) : null}
      >
        <Card className="space-y-3" data-testid="mi-cuenta-perfil">
          <div>
            <h2 className="font-semibold">Tu perfil</h2>
            <p className="mt-1 text-sm text-mute">Así te ven tus compañeros y tus clientes en ventas, reportes y comprobantes.</p>
          </div>
          <div className="flex items-start gap-3">
            <Avatar user={{ id: perfil?.id, name: perfil?.name }} hasAvatar={Boolean(foto) || perfil?.hasAvatar} picture={perfilEmpresa?.picture} size="xl" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold">{perfil?.name || 'Tu nombre'}</h3>
                {sesion?.rol && <span className="rounded-md border border-ink-500 bg-ink-800 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-mute">{sesion.rol}</span>}
              </div>
              {perfil?.email && <p className="mt-0.5 truncate text-sm text-mute">{perfil.email}</p>}
            </div>
          </div>
          <form onSubmit={guardarNombre} className="space-y-3">
            <FormField label="Nombre" htmlFor="mi-cuenta-nombre">
              <Input id="mi-cuenta-nombre" data-testid="mi-cuenta-nombre" value={nombre} onChange={(event) => setNombre(event.target.value)} placeholder="Tu nombre" minLength={2} maxLength={100} required />
            </FormField>
            <Button type="submit" disabled={guardandoNombre || nombre.trim().length < 2 || nombre.trim() === (perfil?.name || '')}>
              {guardandoNombre ? 'Guardando…' : 'Guardar nombre'}
            </Button>
          </form>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-600 p-3">
            <div className="flex min-w-0 items-center gap-3">
              {foto ? <img src={foto} alt="Mi foto" className="h-10 w-10 shrink-0 rounded-full border border-ink-600 object-cover" /> : <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-ink-600 bg-ink-700 text-xs font-semibold text-mute">{(perfil?.name || 'Yo').trim().split(/\s+/).slice(0, 2).map(parte => parte[0] || '').join('').toUpperCase()}</span>}
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-mute">Mi foto</p>
                <p className="mt-0.5 text-sm text-mute">Aparece en la cronología de clientes y pedidos.</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <AttachmentInput onSelect={(file) => setFotoAConfirmar(file)} onError={setFotoError} accept="image/png,image/jpeg,image/webp" maxBytes={1024 * 1024} disabled={fotoBusy}>
                <Button type="button" variant="outline" disabled={fotoBusy}>{foto ? 'Reemplazar foto' : 'Subir foto'}</Button>
              </AttachmentInput>
              {foto && <Button type="button" variant="ghost" disabled={fotoBusy} onClick={quitarFoto}>Quitar</Button>}
            </div>
          </div>
          {fotoError && <p role="alert" className="text-sm text-bad">{fotoError}</p>}
          {fotoAConfirmar && <PhotoCropper file={fotoAConfirmar} onCancel={() => setFotoAConfirmar(null)} onCropped={async (recortada) => { setFotoAConfirmar(null); await subirFoto(recortada) }} />}
          <div className="space-y-2">
            {[{ etiqueta: perfil?.role === 'ADMIN' ? 'Correo de la cuenta' : 'Correo', valor: perfil?.email }, { etiqueta: 'ID de usuario', valor: perfil?.id }].map(({ etiqueta, valor }) => (
              <div key={etiqueta} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-600 p-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wider text-mute">{etiqueta}</p>
                  <p className="mt-0.5 truncate text-sm text-fore">{valor || '—'}</p>
                </div>
                <Button type="button" variant="outline" onClick={() => copiar(valor, etiqueta)} disabled={!valor}>Copiar</Button>
              </div>
            ))}
          </div>
        </Card>

        <Card className="space-y-3" data-testid="mi-cuenta-sesiones">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="font-semibold">Sesiones personales</h2>
              <p className="mt-1 text-sm text-mute">Tus accesos a MobOS.{sesion?.esPropietario ? <> Para ver o revocar los del resto del equipo andá a <Link to="/configuracion/seguridad" className="font-semibold text-fono-light hover:underline">Seguridad y auditoría</Link>.</> : ''}</p>
            </div>
            {otrasSesiones.length > 0 && !esDemo && (
              <Button variant="outline" onClick={() => setARevocarDemas(true)} disabled={revocando}>Cerrar las demás</Button>
            )}
          </div>
          <div className="space-y-2">
            {sesiones.map(activa => (
              <div key={activa.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-600 p-3">
                <div className="min-w-0">
                  <p className="font-medium">{activa.deviceId || 'Dispositivo sin identificar'} {activa.id === cuenta.currentSessionId && <span className="ml-2 text-xs font-semibold text-fono-light">Sesión actual</span>}</p>
                  <p className="mt-1 text-xs text-mute">{ETIQUETA_NIVEL[activa.level] || activa.level} · última actividad {fmtFecha(activa.lastSeenAt)}</p>
                </div>
                {activa.id !== cuenta.currentSessionId && (
                  <Button variant="outline" onClick={() => setARevocar(activa.id)} disabled={revocando || esDemo}>Revocar</Button>
                )}
              </div>
            ))}
          </div>
          {sesiones.length === 0 && <p className="text-sm text-mute">No hay sesiones activas.</p>}
        </Card>
      </PanelDerecho>

      <ConfirmDialog
        open={Boolean(aRevocar)}
        onCancel={() => setARevocar(null)}
        onConfirm={() => revocar(aRevocar)}
        title="¿Revocar esta sesión?"
        description="El dispositivo perderá acceso inmediatamente y deberá iniciar sesión de nuevo."
        confirmLabel="Revocar sesión"
        variant="danger"
        busy={revocando}
      />
      <ConfirmDialog
        open={aRevocarDemas}
        onCancel={() => setARevocarDemas(false)}
        onConfirm={revocarDemas}
        title="¿Cerrar las demás sesiones?"
        description="Se revocan todos tus accesos menos este dispositivo. Es el atajo cuando cambiaste de equipo o perdiste uno."
        confirmLabel="Cerrar las demás"
        variant="danger"
        busy={revocando}
      />
    </>
  )
}
