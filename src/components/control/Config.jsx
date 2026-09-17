import { useCallback, useEffect, useState } from 'react'
import { useSesion } from '@/lib/sesion'
import { api } from '@/lib/api/client'
import { getCompanyContext, sessionApi } from '@/lib/api/session'
import { Button, Card, Badge, ConfirmDialog, Eyebrow, FormField, Input, Label, Modal, PasswordInput, useToast } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import CityAutocomplete from '@/components/shared/CityAutocomplete'
import PhoneField, { parseTelefono, componerTelefono } from '@/components/shared/PhoneField'
import InstagramField, { normalizarInstagram } from '@/components/shared/InstagramField'
import { ROLE_LABELS } from '@/lib/roles'

function fmtDate(value) {
  return value ? new Date(value).toLocaleString('es-PY', { dateStyle: 'short', timeStyle: 'short' }) : '—'
}

async function copiarValor(toast, valor, etiqueta) {
  if (!valor) return
  let copiado = false
  try {
    await navigator.clipboard.writeText(valor)
    copiado = true
  } catch {
    const campo = document.createElement('textarea')
    campo.value = valor
    campo.setAttribute('readonly', '')
    campo.style.position = 'fixed'
    campo.style.opacity = '0'
    document.body.appendChild(campo)
    campo.select()
    try { copiado = document.execCommand('copy') } catch { copiado = false }
    document.body.removeChild(campo)
  }
  if (copiado) toast.success('Copiado', `${etiqueta} quedó en el portapapeles.`)
  else toast.error('No se pudo copiar', 'Seleccioná el valor y copialo manualmente.')
}

export default function Config() {
  const { sesion, empresa, sucursal, perfilEmpresa } = useSesion()
  const esDueno = sesion?.esPropietario
  const [account, setAccount] = useState(null)
  const [password, setPassword] = useState('')
  const [archiveReason, setArchiveReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [failure, setFailure] = useState('')
  const [confirmar, setConfirmar] = useState(null)

  const load = useCallback(async () => {
    if (!esDueno) return
    setFailure('')
    try { setAccount(await api.get('/api/account')) } catch (error) { setFailure(error.message || 'No se pudo cargar la seguridad de la cuenta.') }
  }, [esDueno])
  useEffect(() => { load() }, [load])

  async function reauthenticate() {
    if (!password || busy) return
    setBusy(true); setFailure(''); setNotice('')
    try { const result = await api.post('/api/account', { password }); setPassword(''); setAccount(current => current ? { ...current, reauthValidUntil: result.validUntil } : current); setNotice('Contraseña verificada durante 10 minutos para acciones sensibles.') } catch (error) { setFailure(error.message || 'No se pudo reautenticar.') } finally { setBusy(false) }
  }
  async function revoke(sessionId) {
    if (busy) return
    setBusy(true); setFailure(''); setNotice('')
    try { const result = await api.patch('/api/account', { action: 'revokeSession', sessionId }); setNotice('Sesión revocada.'); await load(); if (result.revokedSessionId === account?.currentSessionId) window.location.assign('/login') } catch (error) { setFailure(error.message || 'No se pudo revocar la sesión.') } finally { setBusy(false) }
  }
  async function exportData() {
    if (busy) return
    setBusy(true); setFailure(''); setNotice('')
    try {
      const data = await api.get('/api/account/export')
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const href = URL.createObjectURL(blob); const link = document.createElement('a')
      link.href = href; link.download = `mobos-${account?.tenant?.slug || 'datos'}-${new Date().toISOString().slice(0, 10)}.json`; link.click()
      setTimeout(() => URL.revokeObjectURL(href), 1000); setNotice('Exportación descargada. No contiene claves, PIN, tokens ni archivos adjuntos.')
    } catch (error) { setFailure(error.message || 'No se pudo exportar.') } finally { setBusy(false) }
  }
  async function archive() {
    if (busy || archiveReason.trim().length < 10) { setFailure('Explicá el motivo del archivado en al menos 10 caracteres.'); return }
    setBusy(true); setFailure(''); setNotice('')
    try { await api.patch('/api/account', { action: 'archive', reason: archiveReason.trim() }); window.location.assign('/login') } catch (error) { setFailure(error.message || 'No se pudo archivar la empresa.') } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3"><div className="flex items-start gap-3">{perfilEmpresa?.picture ? <img src={perfilEmpresa.picture} referrerPolicy="no-referrer" alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" /> : <div className="rounded-lg bg-fono/10 p-2 text-fono"><Icon name="user" className="h-5 w-5" /></div>}<div className="min-w-0"><h2 className="font-semibold">Sesión activa</h2><p className="mt-0.5 truncate text-sm text-mute">{perfilEmpresa?.name || sesion?.correo || sesion?.nombre || 'Usuario de MobOS'}</p></div></div><div className="flex flex-wrap gap-2 text-sm"><Badge color="blue">{empresa?.nombre || 'Mi empresa'}</Badge>{sucursal?.nombre && <Badge color="slate">{sucursal.nombre}</Badge>}{sesion?.rol && <Badge color="slate">{sesion.rol}</Badge>}</div></Card>

      {esDueno && <>
        <MiIdentidad />
        <SeccionTiendas account={account} />
        <SeccionInvitaciones />
        <IdentidadCuenta reauthValidUntil={account?.reauthValidUntil} onReauthValid={(validUntil) => setAccount(current => current ? { ...current, reauthValidUntil: validUntil } : current)} />
        <Card className="space-y-3"><div><h2 className="font-semibold">Confirmar identidad</h2><p className="mt-1 text-sm text-mute">Pedimos tu contraseña antes de descargar datos, cerrar la empresa o revocar dispositivos. La autorización dura 10 minutos.</p></div><div className="flex flex-col gap-2 sm:flex-row"><PasswordInput aria-label="Contraseña para reautenticar" value={password} onChange={event => setPassword(event.target.value)} placeholder="Contraseña de la empresa" className="min-w-0 flex-1" /><Button onClick={reauthenticate} disabled={busy || !password}>Verificar contraseña</Button></div>{account?.reauthValidUntil && <p className="text-xs text-ok">Acciones sensibles habilitadas hasta {fmtDate(account.reauthValidUntil)}.</p>}</Card>

        <Card className="space-y-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="font-semibold">Sesiones activas</h2><p className="mt-1 text-sm text-mute">Cada dispositivo se puede cerrar de forma remota.</p></div><Button variant="outline" onClick={load} disabled={busy}>Actualizar</Button></div>{!account && !failure && <p className="text-sm text-mute">Cargando sesiones…</p>}{account?.sessions?.length === 0 && <p className="text-sm text-mute">No hay sesiones activas.</p>}<div className="space-y-2">{account?.sessions?.map(active => <div key={active.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-600 p-3"><div><p className="font-medium">{active.user?.name || 'Acceso de empresa'} {active.id === account.currentSessionId && <span className="ml-2 text-xs text-fono-light">Este dispositivo</span>}</p><p className="mt-1 text-xs text-mute">{active.user?.role || active.level} · {active.deviceId || 'Dispositivo no identificado'} · última actividad {fmtDate(active.lastSeenAt)}</p></div><Button variant="outline" onClick={() => setConfirmar({ tipo: 'revocar', sessionId: active.id })} disabled={busy}>Revocar</Button></div>)}</div></Card>

        <Card className="space-y-3"><div><h2 className="font-semibold">Exportación básica</h2><p className="mt-1 text-sm text-mute">Descarga JSON de empresa, sucursales, equipo, clientes, productos, órdenes y pagos. Excluye credenciales, tokens, PIN y archivos de comprobantes.</p></div><Button variant="outline" onClick={exportData} disabled={busy}>Descargar mis datos</Button></Card>

        <Card className="space-y-3 border-bad/30"><div><h2 className="font-semibold text-bad">Archivar empresa</h2><p className="mt-1 text-sm text-mute">No borra ventas ni historial. Cierra sesiones y bloquea el acceso por contraseña hasta restaurarla con correo, contraseña y la confirmación RESTORE.</p></div><Input aria-label="Motivo de archivado" value={archiveReason} onChange={event => setArchiveReason(event.target.value)} placeholder="Motivo del archivado (mínimo 10 caracteres)" /><Button variant="outline" onClick={() => setConfirmar({ tipo: 'archivar' })} disabled={busy || archiveReason.trim().length < 10} className="border-bad/50 text-bad hover:bg-bad/10">Archivar empresa</Button></Card>
        {failure && <p role="alert" className="rounded-xl border border-bad/30 bg-bad/10 p-3 text-sm text-bad">{failure}</p>}{notice && <p role="status" className="rounded-xl border border-ok/30 bg-ok/10 p-3 text-sm text-ok">{notice}</p>}
      </>}
      {esDueno && <SeccionSucursales />}
      <ConfirmDialog open={Boolean(confirmar)} onCancel={() => setConfirmar(null)} onConfirm={async () => { const actual = confirmar; setConfirmar(null); if (actual?.tipo === 'revocar') await revoke(actual.sessionId); if (actual?.tipo === 'archivar') await archive() }} title={confirmar?.tipo === 'archivar' ? '¿Archivar esta empresa?' : '¿Revocar esta sesión?'} description={confirmar?.tipo === 'archivar' ? 'La empresa quedará cerrada de forma recuperable y se revocarán todas las sesiones activas. Las ventas y el historial se conservan.' : 'El dispositivo perderá acceso inmediatamente y deberá iniciar sesión de nuevo.'} confirmLabel={confirmar?.tipo === 'archivar' ? 'Archivar empresa' : 'Revocar sesión'} variant="danger" />
    </div>
  )
}

function IdentidadCuenta({ reauthValidUntil, onReauthValid }) {
  const toast = useToast()
  const { empresa, actualizarEmpresa } = useSesion()
  const [editOpen, setEditOpen] = useState(false)
  const [form, setForm] = useState(null) // { name, email, password }
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const valores = [
    { etiqueta: 'Nombre de la tienda', valor: empresa?.nombre || null },
    { etiqueta: 'Correo de la empresa', valor: empresa?.email || null },
    { etiqueta: 'ID de la tienda', valor: empresa?.id || null },
  ]
  const reauthVigente = Boolean(reauthValidUntil && new Date(reauthValidUntil) > new Date())
  function abrir() {
    setForm({ name: empresa?.nombre || '', email: empresa?.email || '', password: '' })
    setError('')
    setEditOpen(true)
  }
  async function guardar(event) {
    event.preventDefault()
    if (busy) return
    const nombre = form?.name?.trim() || ''
    const correo = form?.email?.trim() || ''
    if (nombre.length < 2 || nombre.length > 120) { setError('El nombre de la tienda debe tener entre 2 y 120 caracteres.'); return }
    if (!/^\S+@\S+\.\S+$/.test(correo)) { setError('Ingresá un correo de empresa válido.'); return }
    if (!reauthVigente && !form?.password) { setError('Ingresá la contraseña de la empresa para confirmar el cambio.'); return }
    const cambios = {}
    if (nombre !== (empresa?.nombre || '')) cambios.name = nombre
    if (correo !== (empresa?.email || '')) cambios.email = correo
    setBusy(true); setError('')
    try {
      if (!reauthVigente) {
        const auth = await api.post('/api/account', { password: form.password })
        onReauthValid?.(auth.validUntil)
      }
      if (Object.keys(cambios).length) await api.patch('/api/account', { action: 'updateProfile', ...cambios })
      actualizarEmpresa?.(cambios)
      setEditOpen(false)
      toast.success('Datos de la tienda actualizados.')
    } catch (cause) { setError(cause?.message || 'No se pudieron actualizar los datos de la tienda.') } finally { setBusy(false) }
  }
  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Eyebrow>Identidad de la cuenta</Eyebrow>
          <p className="mt-1 text-sm text-mute">Los datos que identifican tu tienda ante MobOS.</p>
        </div>
        <Button type="button" variant="outline" onClick={abrir}><Icon name="edit" className="h-3.5 w-3.5" />Editar</Button>
      </div>
      <div className="space-y-2">
        {valores.map(({ etiqueta, valor }) => (
          <div key={etiqueta} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-600 p-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-mute">{etiqueta}</p>
              <p className="mt-0.5 truncate text-sm text-fore">{valor || '—'}</p>
            </div>
            <Button type="button" variant="outline" onClick={() => copiarValor(toast, valor, etiqueta)} disabled={!valor}>Copiar</Button>
          </div>
        ))}
      </div>
      <Modal open={editOpen} onClose={() => !busy && setEditOpen(false)} title="Editar datos de la tienda" className="max-w-xl">
        <form onSubmit={guardar} className="space-y-3">
          <FormField label="Nombre de la tienda" htmlFor="edit-nombre">
            <Input id="edit-nombre" autoFocus disabled={busy} value={form?.name || ''} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} placeholder="Nombre de la tienda" />
          </FormField>
          <FormField label="Correo de la empresa" htmlFor="edit-correo">
            <Input id="edit-correo" type="email" disabled={busy} value={form?.email || ''} onChange={event => setForm(current => ({ ...current, email: event.target.value }))} placeholder="Correo de la empresa" />
          </FormField>
          {reauthVigente ? (
            <p className="text-xs text-ok">Tu contraseña fue verificada hace menos de 10 minutos: no hace falta escribirla de nuevo.</p>
          ) : (
            <FormField label="Contraseña de la empresa" htmlFor="edit-password">
              <PasswordInput id="edit-password" autoComplete="current-password" disabled={busy} value={form?.password || ''} onChange={event => setForm(current => ({ ...current, password: event.target.value }))} placeholder="Para confirmar el cambio" />
            </FormField>
          )}
          {error && <p role="alert" className="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="ghost" disabled={busy} onClick={() => setEditOpen(false)}>Cancelar</Button><Button type="submit" disabled={busy || !form?.name?.trim() || !form?.email?.trim()}>{busy ? 'Guardando…' : 'Guardar cambios'}</Button></div>
        </form>
      </Modal>
    </Card>
  )
}

function MiIdentidad() {
  const toast = useToast()
  const { usuario, empresa, perfilEmpresa } = useSesion()
  const valores = [
    { etiqueta: 'Correo del dueño', valor: empresa?.email || null },
    { etiqueta: 'ID del usuario', valor: usuario?.id || null },
  ]
  return (
    <Card className="space-y-3">
      <div>
        <Eyebrow>Mi identidad</Eyebrow>
        <p className="mt-1 text-sm text-mute">Tu persona dentro de MobOS: la cuenta Google dueña de esta tienda.</p>
      </div>
      <div className="flex items-start gap-3">
        {perfilEmpresa?.picture ? <img src={perfilEmpresa.picture} referrerPolicy="no-referrer" alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" /> : <div className="rounded-lg bg-fono/10 p-2 text-fono"><Icon name="user" className="h-5 w-5" /></div>}
        <div className="min-w-0">
          <h2 className="font-semibold">{perfilEmpresa?.name || usuario?.user_metadata?.nombre || 'Dueño de la tienda'}</h2>
          {usuario?.email && <p className="mt-0.5 truncate text-sm text-mute">{usuario.email}</p>}
        </div>
      </div>
      <div className="space-y-2">
        {valores.map(({ etiqueta, valor }) => (
          <div key={etiqueta} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-600 p-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-mute">{etiqueta}</p>
              <p className="mt-0.5 truncate text-sm text-fore">{valor || '—'}</p>
            </div>
            <Button type="button" variant="outline" onClick={() => copiarValor(toast, valor, etiqueta)} disabled={!valor}>Copiar</Button>
          </div>
        ))}
      </div>
    </Card>
  )
}

function SeccionTiendas({ account }) {
  const toast = useToast()
  const { salir } = useSesion()
  const [dialogo, setDialogo] = useState(null) // 'abandonar' | 'eliminar'
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const delContexto = getCompanyContext()?.stores || []
  const stores = Array.isArray(account?.stores) && account.stores.length ? account.stores : delContexto
  const otras = stores.filter((store) => !store.current)
  const hayOtra = otras.length > 0 || (stores.length > 1 && !stores.some((store) => store.current))

  async function crearOtra() {
    setError('')
    try { await sessionApi.startGoogle(true) } catch (cause) { setError(cause?.message || 'No se pudo abrir el acceso con Google.') }
  }

  async function abandonar() {
    if (busy) return
    setBusy(true); setError('')
    try {
      await api.patch('/api/account', { action: 'leaveStore', confirm: 'ABANDONAR' })
      setDialogo(null)
      await salir()
      window.location.assign('/login')
    } catch (cause) { setError(cause?.message || 'No se pudo abandonar la tienda.') } finally { setBusy(false) }
  }

  async function eliminar({ password }) {
    if (busy) return
    setBusy(true); setError('')
    try {
      await api.post('/api/account', { password })
      await api.patch('/api/account', { action: 'purgeStore', confirm: 'ELIMINAR' })
      setDialogo(null)
      await salir()
      window.location.assign('/login')
    } catch (cause) { setError(cause?.message || 'No se pudo eliminar la tienda.') } finally { setBusy(false) }
  }

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">Tiendas</h2>
          <p className="mt-1 text-sm text-mute">Las tiendas de las que sos dueño con esta cuenta de Google.</p>
        </div>
        <Button type="button" variant="outline" onClick={crearOtra}><Icon name="plus" className="h-3.5 w-3.5" />Crear otra tienda</Button>
      </div>
      {error && !dialogo && <p role="alert" className="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
      {stores.length === 0 ? <p className="text-sm text-mute">Todavía no se pudieron cargar tus tiendas. Recargá la página para volver a intentarlo.</p> : (
        <div className="space-y-2">
          {stores.map((store) => (
            <div key={store.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-600 p-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <b className="truncate text-sm">{store.name}</b>
                  {store.current && <Badge color="green">Actual</Badge>}
                </div>
                <p className="mt-1 truncate text-xs text-mute">ID: {store.id}</p>
              </div>
              <Button type="button" variant="outline" onClick={() => copiarValor(toast, store.id, 'ID de la tienda')} disabled={!store.id}>Copiar ID</Button>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {hayOtra && <Button type="button" variant="outline" onClick={() => { setError(''); setDialogo('abandonar') }} disabled={busy}>Abandonar tienda</Button>}
        <Button type="button" variant="outline" onClick={() => { setError(''); setDialogo('eliminar') }} disabled={busy} className="border-bad/50 text-bad hover:bg-bad/10">Eliminar tienda</Button>
      </div>
      <DialogoDestructivo
        open={dialogo === 'abandonar'}
        title="¿Abandonar esta tienda?"
        description="Dejarás de ser dueño de esta tienda y no podrás volver a entrar con esta cuenta. La tienda necesita al menos otro administrador para seguir funcionando, y podés seguir usando tus otras tiendas. Esta acción no se puede deshacer desde la app."
        palabra="ABANDONAR"
        confirmLabel="Abandonar tienda"
        busy={busy}
        error={error}
        onCancel={() => !busy && setDialogo(null)}
        onConfirm={abandonar}
      />
      <DialogoDestructivo
        open={dialogo === 'eliminar'}
        title="¿Eliminar esta tienda?"
        description="Se eliminará la tienda junto con toda su información: productos, ventas, clientes, pagos e integrantes. Esta acción es permanente e irreversible, y no se puede recuperar de ninguna forma. Para confirmar, escribí tu contraseña de empresa y la palabra ELIMINAR."
        palabra="ELIMINAR"
        necesitaClave
        confirmLabel="Eliminar tienda"
        busy={busy}
        error={error}
        onCancel={() => !busy && setDialogo(null)}
        onConfirm={eliminar}
      />
    </Card>
  )
}

function SeccionInvitaciones() {
  const toast = useToast()
  const { sesion } = useSesion()
  const [pendientes, setPendientes] = useState([])
  const [cargando, setCargando] = useState(true)
  const [elegida, setElegida] = useState(null)
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let vivo = true
    api.get('/api/user-invitations/pending').then((lista) => { if (vivo) setPendientes(Array.isArray(lista) ? lista : []) }).catch(() => {}).finally(() => { if (vivo) setCargando(false) })
    return () => { vivo = false }
  }, [])

  async function aceptar(event) {
    event.preventDefault(); setError('')
    if (!/^\d{4}$/.test(pin)) return setError('Elegí un PIN de exactamente 4 dígitos.')
    if (!elegida) return
    setBusy(true)
    try {
      const deviceId = localStorage.getItem('mobos:device-id') || crypto.randomUUID()
      localStorage.setItem('mobos:device-id', deviceId)
      await api.post('/api/user-invitations/accept-by-id', { id: elegida.id, pin, deviceId })
      toast.success('Invitación aceptada', `Ya sos parte de ${elegida.companyName}. Entrá a esa tienda con su correo y tu PIN.`)
      setPendientes((lista) => lista.filter((inv) => inv.id !== elegida.id))
      setElegida(null); setPin('')
    } catch (cause) { setError(cause?.message || 'No se pudo aceptar la invitación.') } finally { setBusy(false) }
  }

  if (cargando) return null
  if (!pendientes.length) return null
  const rolLabel = ROLE_LABELS

  return (
    <Card className="space-y-3 border-fono/30">
      <div>
        <h2 className="font-semibold">Invitaciones pendientes</h2>
        <p className="mt-1 text-sm text-mute">Tiendas que te invitaron con este correo ({sesion?.correo}). Aceptá con un PIN propio.</p>
      </div>
      <div className="space-y-2">
        {pendientes.map((inv) => (
          <div key={inv.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-fono/25 bg-fono/5 p-3">
            <div className="min-w-0">
              <b className="truncate text-sm">{inv.companyName}</b>
              <p className="mt-1 text-xs text-mute">{inv.inviterName} te invitó como {rolLabel[inv.role] || inv.role} · vence {new Date(inv.expiresAt).toLocaleDateString('es-PY')}</p>
            </div>
            <Button type="button" onClick={() => { setElegida(inv); setPin(''); setError('') }}>Aceptar</Button>
          </div>
        ))}
      </div>
      <Modal open={elegida !== null} onClose={() => !busy && setElegida(null)} title={`Unite a ${elegida?.companyName || 'la tienda'}`} className="max-w-sm">
        <form onSubmit={aceptar} className="space-y-4">
          <p className="text-sm text-mute">Elegí tu PIN de 4 dígitos para entrar a esta tienda. Podés usar el mismo que en tu tienda actual.</p>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="new-password"
            maxLength={4}
            autoFocus
            value={pin}
            onChange={(event) => { setPin(event.target.value.replace(/\D/g, '').slice(0, 4)); setError('') }}
            placeholder="••••"
            aria-label="PIN de 4 dígitos"
            className="mx-auto block h-20 w-48 rounded-2xl border border-ink-500 bg-paper text-center text-4xl font-bold tracking-[.5em] text-fore shadow-card transition-all duration-150 placeholder:text-mute/50 focus:scale-105 focus:border-fono focus:ring-2 focus:ring-fono/30 focus:outline-none"
          />
          {error && <p role="alert" className="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy || pin.length !== 4}>{busy ? 'Aceptando…' : 'Aceptar invitación'}</Button>
        </form>
      </Modal>
    </Card>
  )
}

function DialogoDestructivo({ open, title, description, palabra, necesitaClave = false, confirmLabel, busy, error, onCancel, onConfirm }) {
  const [palabraActual, setPalabraActual] = useState('')
  const [clave, setClave] = useState('')
  useEffect(() => { if (open) { setPalabraActual(''); setClave('') } }, [open])
  const lista = palabraActual.trim() === palabra && (!necesitaClave || clave)
  return (
    <Modal open={open} onClose={busy ? undefined : onCancel} title={title} className="max-w-md">
      <div className="space-y-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-bad/10 text-bad"><Icon name="alert" className="h-5 w-5" /></div>
        <p className="text-sm leading-6 text-mute">{description}</p>
        {necesitaClave && (
          <div>
            <Label htmlFor="dialogo-clave">Contraseña de la empresa</Label>
            <PasswordInput id="dialogo-clave" autoFocus disabled={busy} value={clave} onChange={(event) => setClave(event.target.value)} placeholder="Para verificar tu identidad" autoComplete="current-password" />
          </div>
        )}
        <div>
          <Label htmlFor="dialogo-palabra">Escribí {palabra} para confirmar</Label>
          <Input id="dialogo-palabra" autoFocus={!necesitaClave} disabled={busy} value={palabraActual} onChange={(event) => setPalabraActual(event.target.value)} placeholder={palabra} />
        </div>
        {error && <p role="alert" className="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>Cancelar</Button>
          <Button type="button" variant="danger" onClick={() => onConfirm(necesitaClave ? { password: clave } : {})} disabled={busy || !lista}>{busy ? 'Procesando…' : confirmLabel}</Button>
        </div>
      </div>
    </Modal>
  )
}

function SeccionSucursales() {
  const toast = useToast()
  const [branches, setBranches] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState(null) // { id?, name, address, city, department, phone, instagram }

  const cargar = async () => {
    setError('')
    try { setBranches(await api.get('/api/branches')) } catch (cause) { setError(cause?.message || 'No se pudieron cargar las sucursales.') }
  }
  useEffect(() => { cargar() }, [])

  function abrir(branch) {
    // El teléfono se guarda como string único: al abrir se separa en código de
    // país y número para editarlos con PhoneField.
    const telefono = parseTelefono(branch?.phone)
    setForm(branch
      ? { id: branch.id, name: branch.name, address: branch.address || '', city: branch.city || '', department: branch.department || '', countryCode: telefono.countryCode, phone: telefono.phone, instagram: normalizarInstagram(branch.instagram) }
      : { id: null, name: '', address: '', city: '', department: '', countryCode: '+595', phone: '', instagram: '' })
    setFormOpen(true)
  }

  async function guardar(event) {
    event.preventDefault()
    if (busy || !form?.name?.trim()) return
    setBusy(true); setError('')
    try {
      const payload = {
        name: form.name.trim(),
        address: form.address?.trim() || null,
        city: form.city?.trim() || null,
        department: form.department?.trim() || null,
        phone: componerTelefono({ countryCode: form.countryCode, phone: form.phone }),
        instagram: form.instagram?.trim() || null,
      }
      if (form.id) await api.patch('/api/branches', { id: form.id, ...payload })
      else await api.post('/api/branches', payload)
      setFormOpen(false)
      toast.success(form.id ? 'Sucursal actualizada.' : 'Sucursal creada.')
      await cargar()
    } catch (cause) { setError(cause?.message || 'No se pudo guardar la sucursal.') } finally { setBusy(false) }
  }

  async function alternar(branch) {
    setBusy(true); setError('')
    try {
      await api.patch('/api/branches', { id: branch.id, isActive: !branch.isActive })
      toast.success(branch.isActive ? 'Sucursal desactivada.' : 'Sucursal reactivada.')
      await cargar()
    } catch (cause) { setError(cause?.message || 'No se pudo actualizar la sucursal.') } finally { setBusy(false) }
  }

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">Sucursales</h2>
          <p className="mt-1 text-sm text-mute">Cada sucursal conserva su dirección, ciudad y datos de contacto. La ciudad completa el departamento automáticamente.</p>
        </div>
        <Button type="button" onClick={() => abrir(null)}>+ Nueva sucursal</Button>
      </div>
      {error && <p role="alert" className="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
      {branches === null ? <p className="text-sm text-mute">Cargando sucursales…</p> : branches.length === 0 ? <p className="text-sm text-mute">Todavía no hay sucursales. Creá la primera.</p> : <div className="space-y-2">{branches.map(branch => <article key={branch.id} className="rounded-xl border border-ink-600 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div className="min-w-0"><b className="text-sm">{branch.name}</b><p className="mt-1 text-xs text-mute">{[branch.city, branch.department].filter(Boolean).join(' · ')}{branch.address ? ` · ${branch.address}` : ''}{branch.phone ? ` · ${branch.phone}` : ''}{branch.instagram ? ` · @${branch.instagram}` : ''}</p></div><Badge color={branch.isActive ? 'green' : 'slate'}>{branch.isActive ? 'Activa' : 'Inactiva'}</Badge></div><div className="mt-2 flex gap-3"><button type="button" className="text-xs font-semibold text-fono-light hover:underline" disabled={busy} onClick={() => abrir(branch)}>Editar</button><button type="button" className="text-xs font-semibold text-mute hover:underline" disabled={busy} onClick={() => alternar(branch)}>{branch.isActive ? 'Desactivar' : 'Reactivar'}</button></div></article>)}</div>}
      <Modal open={formOpen} onClose={() => !busy && setFormOpen(false)} title={form?.id ? 'Editar sucursal' : 'Nueva sucursal'} className="max-w-xl">
        <form onSubmit={guardar} className="space-y-3">
          <Input required maxLength={100} autoFocus disabled={busy} value={form?.name || ''} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} placeholder="Nombre de la sucursal" />
          <div className="grid gap-3 sm:grid-cols-2">
            <PhoneField disabled={busy} countryCode={form?.countryCode || '+595'} phone={form?.phone || ''} onCountryCodeChange={countryCode => setForm(current => ({ ...current, countryCode }))} onChange={phone => setForm(current => ({ ...current, phone }))} placeholder="Teléfono (opcional)" />
            <InstagramField disabled={busy} value={form?.instagram || ''} onChange={instagram => setForm(current => ({ ...current, instagram }))} placeholder="Instagram (opcional)" />
          </div>
          <div className="space-y-1">
            <CityAutocomplete disabled={busy} value={form?.city || ''} onSelect={(city, department) => setForm(current => ({ ...current, city, department }))} placeholder="Ciudad" />
            {form?.department && <p className="px-1 text-xs text-fono-light">Departamento: {form.department}</p>}
          </div>
          <Input maxLength={200} disabled={busy} value={form?.address || ''} onChange={event => setForm(current => ({ ...current, address: event.target.value }))} placeholder="Dirección completa (opcional)" />
          <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="ghost" disabled={busy} onClick={() => setFormOpen(false)}>Cancelar</Button><Button type="submit" disabled={busy || !form?.name?.trim()}>{busy ? 'Guardando…' : form?.id ? 'Guardar cambios' : 'Crear sucursal'}</Button></div>
        </form>
      </Modal>
    </Card>
  )
}
