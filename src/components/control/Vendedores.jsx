import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api/client'
import { useSesion } from '@/lib/sesion'
import { getVendedores, addVendedor, updateVendedor, deleteVendedor, listVentas, productosById, refrescar } from '@/lib/storage'
import { totalesVendedor, ventasDelDia, comisionDeVentas, fechaClave, num, gs } from '@/utils/calculos'
import { Card, Button, ConfirmDialog, Input, Select, Badge, Label, Skeleton, EmptyState, MoneyInput, useToast } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import { ROLE_LABELS } from '@/lib/roles'

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const INVITE_STATUS = { PENDING: ['Pendiente', 'orange'], ACCEPTED: ['Aceptada', 'green'], EXPIRED: ['Vencida', 'slate'], REVOKED: ['Revocada', 'red'] }
function mesLabel(clave) { const [y, m] = (clave || '').split('-'); return `${MESES[Number(m) - 1] || m} ${y}` }

// Meta diaria con separador de miles mientras se escribe; se guarda al salir.
// En modo API persiste en el backend (User.dailyGoalPyg); en demo queda local.
function MetaDiaria({ vendor, esDemo, onGuardar }) {
  const [value, setValue] = useState(String(vendor.metaDiaria || ''))
  const [guardando, setGuardando] = useState(false)
  return (
    <MoneyInput
      value={value}
      onValueChange={next => setValue(next === '' ? '' : String(next))}
      onBlur={async () => {
        if (!value.trim()) return
        if (esDemo) { updateVendedor(vendor.id, { metaDiaria: num(value) }); return }
        setGuardando(true)
        try { await onGuardar(num(value)); setValue(String(num(value))) } finally { setGuardando(false) }
      }}
      placeholder="0"
      disabled={guardando}
    />
  )
}

export default function Vendedores() {
  const { esDemo, sesion } = useSesion()
  const vendedores = getVendedores()
  const ventas = listVentas()
  const prods = productosById()
  const [revision, setRevision] = useState(0)
  const [directo, setDirecto] = useState({ name: '', email: '', role: 'VENDEDOR', pin: '' })
  const [invitacion, setInvitacion] = useState({ name: '', email: '', role: 'VENDEDOR' })
  const [invitaciones, setInvitaciones] = useState([])
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmarEliminar, setConfirmarEliminar] = useState(null)
  const [confirmarRevocar, setConfirmarRevocar] = useState(null)

  const cargarInvitaciones = useCallback(async () => {
    if (esDemo) return
    try { setInvitaciones(await api.get('/api/user-invitations')) } catch (cause) { setError(cause?.message || 'No se pudieron cargar las invitaciones.') }
  }, [esDemo])
  useEffect(() => { cargarInvitaciones() }, [cargarInvitaciones])
  function notifySuccess(value) { setError(''); setMessage(value); window.setTimeout(() => setMessage(''), 4500) }
  async function refreshTeam() { if (!esDemo) await refrescar(); setRevision(value => value + 1) }

  async function crearDirecto(event) {
    event.preventDefault(); setError(''); setMessage('')
    const name = directo.name.trim()
    if (!name) return setError('Ingresá el nombre del integrante.')
    if (!esDemo && !/^\d{4}$/.test(directo.pin)) return setError('Ingresá un PIN de exactamente 4 dígitos.')
    setBusy(true)
    try {
      if (esDemo) addVendedor(name)
      else await api.post('/api/users', { ...directo, name, email: directo.email.trim().toLowerCase() || null })
      setDirecto({ name: '', email: '', role: 'VENDEDOR', pin: '' }); await refreshTeam(); notifySuccess('Integrante agregado correctamente.')
    } catch (cause) { setError(cause?.message || 'No se pudo agregar el integrante.') }
    finally { setBusy(false) }
  }

  async function invitar(event) {
    event.preventDefault(); setError(''); setMessage('')
    if (!invitacion.name.trim()) return setError('Ingresá el nombre del integrante.')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invitacion.email.trim())) return setError('Ingresá un correo válido.')
    setBusy(true)
    try {
      const result = await api.post('/api/user-invitations', { ...invitacion, name: invitacion.name.trim(), email: invitacion.email.trim().toLowerCase() })
      setInvitacion({ name: '', email: '', role: 'VENDEDOR' }); await cargarInvitaciones(); notifySuccess(result.deliveryState === 'sent' ? 'Invitación enviada correctamente.' : 'Invitación guardada. El correo quedó pendiente; volvé a intentar el reenvío en unos minutos.')
    } catch (cause) { setError(cause?.message || 'No se pudo enviar la invitación.') }
    finally { setBusy(false) }
  }

  async function actualizarUsuario(id, changes) {
    setError('')
    try { if (esDemo) updateVendedor(id, changes); else await api.patch('/api/users', { id, ...changes }); await refreshTeam(); notifySuccess('Integrante actualizado.') }
    catch (cause) { setError(cause?.message || 'No se pudo actualizar el integrante.') }
  }
  async function eliminarUsuario() {
    const target = confirmarEliminar; if (!target) return
    setBusy(true)
    try { if (esDemo) deleteVendedor(target.id); else await api.patch('/api/users', { id: target.id, status: 'INACTIVE' }); setConfirmarEliminar(null); await refreshTeam(); notifySuccess(esDemo ? 'Vendedor eliminado.' : 'Integrante desactivado.') }
    catch (cause) { setError(cause?.message || 'No se pudo completar la acción.') }
    finally { setBusy(false) }
  }
  async function resend(invite) {
    setBusy(true); setError('')
    try { const result = await api.post(`/api/user-invitations/${encodeURIComponent(invite.id)}/resend`, {}); await cargarInvitaciones(); notifySuccess(result.deliveryState === 'sent' ? 'Invitación reenviada.' : 'El correo sigue pendiente. Podés volver a intentar más tarde.') }
    catch (cause) { setError(cause?.message || 'No se pudo reenviar la invitación.') }
    finally { setBusy(false) }
  }
  async function revokeInvitation() {
    if (!confirmarRevocar) return
    setBusy(true); setError('')
    try { await api.post(`/api/user-invitations/${encodeURIComponent(confirmarRevocar.id)}/revoke`, {}); setConfirmarRevocar(null); await cargarInvitaciones(); notifySuccess('Invitación revocada.') }
    catch (cause) { setError(cause?.message || 'No se pudo revocar la invitación.') }
    finally { setBusy(false) }
  }

  const nombreById = Object.fromEntries(vendedores.map(v => [v.id, v.nombre]))
  const porMes = {}
  ventas.forEach(v => { const mes = (v.fecha || '').slice(0, 7); if (!mes) return; const vid = v.vendedorId || 'sin'; porMes[mes] ||= {}; porMes[mes][vid] ||= []; porMes[mes][vid].push(v) })
  const meses = Object.keys(porMes).sort().reverse()
  const [abiertos, setAbiertos] = useState(() => new Set(meses.slice(0, 1)))
  function toggleMes(mes) { setAbiertos(prev => { const next = new Set(prev); next.has(mes) ? next.delete(mes) : next.add(mes); return next }) }

  return <div className="space-y-4" data-revision={revision}>
    {error && <p role="alert" className="rounded-lg border border-bad/30 bg-bad/10 p-3 text-sm text-bad">{error}</p>}
    {message && <p role="status" className="rounded-lg border border-ok/30 bg-ok/10 p-3 text-sm text-ok">{message}</p>}
    {!esDemo && <Card><h2 className="font-bold">Invitar por correo</h2><p className="mt-1 text-sm text-mute">La persona recibe un enlace seguro y elige su propio PIN. Nunca enviamos credenciales por correo.</p><form onSubmit={invitar} className="mt-4 grid gap-3 md:grid-cols-4"><div><Label htmlFor="invite-name">Nombre</Label><Input id="invite-name" value={invitacion.name} onChange={event => setInvitacion({ ...invitacion, name: event.target.value })} onBlur={() => !invitacion.name.trim() && setError('Ingresá el nombre del integrante.')} required /></div><div><Label htmlFor="invite-email">Correo</Label><Input id="invite-email" type="email" value={invitacion.email} onChange={event => setInvitacion({ ...invitacion, email: event.target.value })} required /></div><div><Label htmlFor="invite-role">Rol</Label><Select id="invite-role" value={invitacion.role} onChange={event => setInvitacion({ ...invitacion, role: event.target.value })}>{Object.entries(ROLE_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</Select></div><div className="flex items-end"><Button type="submit" className="w-full" disabled={busy}>Enviar invitación</Button></div></form></Card>}

    <Card><h2 className="font-bold">Agregar directamente</h2><p className="mt-1 text-sm text-mute">{esDemo ? 'Agregá vendedores al entorno demo.' : 'Opción compatible para alta inmediata con un PIN definido por el administrador.'}</p><form onSubmit={crearDirecto} className="mt-4 grid gap-3 md:grid-cols-5"><div><Label htmlFor="direct-name">Nombre</Label><Input id="direct-name" value={directo.name} onChange={event => setDirecto({ ...directo, name: event.target.value })} required /></div>{!esDemo && <><div><Label htmlFor="direct-email">Correo</Label><Input id="direct-email" type="email" value={directo.email} onChange={event => setDirecto({ ...directo, email: event.target.value })} /></div><div><Label htmlFor="direct-role">Rol</Label><Select id="direct-role" value={directo.role} onChange={event => setDirecto({ ...directo, role: event.target.value })}>{Object.entries(ROLE_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</Select></div><div><Label htmlFor="direct-pin">PIN temporal</Label><Input id="direct-pin" inputMode="numeric" maxLength={4} value={directo.pin} onChange={event => setDirecto({ ...directo, pin: event.target.value.replace(/\D/g, '').slice(0, 4) })} required /></div></>}<div className="flex items-end"><Button type="submit" className="w-full" disabled={busy}>Agregar</Button></div></form></Card>

    {!esDemo && invitaciones.length > 0 && <Card><h2 className="font-bold">Invitaciones</h2><div className="mt-4 space-y-2">{invitaciones.map(invite => { const [label, color] = INVITE_STATUS[invite.status] || [invite.status, 'slate']; const canResend = invite.status === 'PENDING' && new Date(invite.resendAvailableAt) <= new Date(); return <div key={invite.id} className="flex flex-col gap-3 rounded-xl border border-ink-600 p-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><strong className="truncate text-sm">{invite.name}</strong><Badge color={color}>{label}</Badge><Badge>{ROLE_LABELS[invite.role] || invite.role}</Badge></div><p className="mt-1 truncate text-xs text-mute">{invite.email}</p></div>{invite.status === 'PENDING' && <div className="flex gap-2"><Button type="button" variant="outline" disabled={busy || !canResend} onClick={() => resend(invite)}>{canResend ? 'Reenviar' : 'Reenvío en espera'}</Button><Button type="button" variant="ghost" disabled={busy} onClick={() => setConfirmarRevocar(invite)}>Revocar</Button></div>}</div> })}</div></Card>}

    <Card><h2 className="font-bold mb-1">Funcionarios y metas</h2><p className="text-sm text-mute mb-4">Administrá el estado del equipo y la meta diaria de cada vendedor.</p><div className="space-y-2.5">{vendedores.map(v => { const t = totalesVendedor(ventas, v.id); const com = comisionDeVentas(ventasDelDia(ventas, fechaClave(), v.id), prods); return <div key={v.id} className="rounded-2xl border border-ink-600 p-2.5 transition hover:border-fono/40"><div className="mb-2 flex items-center justify-between gap-2"><div className="min-w-0"><input aria-label={`Nombre de ${v.nombre}`} defaultValue={v.nombre} onBlur={event => { const name = event.target.value.trim(); if (name && name !== v.nombre) actualizarUsuario(v.id, esDemo ? { nombre: name } : { name }) }} className="min-h-11 min-w-0 max-w-[15rem] bg-transparent text-sm font-bold outline-none border-b border-transparent focus:border-fono" /><div className="text-xs text-mute">{ROLE_LABELS[v.role] || 'Vendedor'}</div>{v.id && <div className="text-[10px] text-mute" title={`ID del usuario: ${v.id}`}>ID: {v.id.slice(0, 8)}</div>}</div><div className="flex items-center gap-2"><button type="button" onClick={() => actualizarUsuario(v.id, esDemo ? { activo: !v.activo } : { status: v.activo ? 'INACTIVE' : 'ACTIVE' })} className="flex min-h-11 items-center" aria-label={v.activo ? `Desactivar a ${v.nombre}` : `Activar a ${v.nombre}`}><Badge color={v.activo ? 'green' : 'slate'}>{v.activo ? 'Activo' : 'Inactivo'}</Badge></button><button type="button" onClick={() => setConfirmarEliminar(v)} className="grid h-11 w-11 place-items-center rounded-lg text-ink-500 hover:bg-bad/10 hover:text-bad" aria-label={esDemo ? `Eliminar a ${v.nombre}` : `Desactivar a ${v.nombre}`}><Icon name="trash" className="h-4 w-4" /></button></div></div><div className="mt-1 grid grid-cols-2 items-end gap-2 border-t border-ink-600/60 pt-2 md:grid-cols-4"><label className="col-span-2 block md:col-span-1"><span className="text-[10px] font-bold uppercase text-mute">Meta diaria ₲</span><MetaDiaria vendor={v} esDemo={esDemo} onGuardar={(meta) => actualizarUsuario(v.id, { dailyGoalPyg: meta })} /></label><Mini label="Hoy" valor={t.hoy} /><Mini label="Comisión hoy" valor={com} /><Mini label="Mes" valor={t.mes} /></div></div> })}</div></Card>

    {meses.length > 0 && <Card><h2 className="font-bold mb-1">Historial mensual por vendedor</h2><div className="mt-4 space-y-4">{meses.map(mes => { const filas = Object.entries(porMes[mes]).map(([vid, lista]) => ({ vid, nombre: nombreById[vid] || 'Sin vendedor', total: lista.reduce((a, x) => a + num(x.precio), 0), com: comisionDeVentas(lista, prods), cant: lista.length })).sort((a, b) => b.total - a.total); const abierto = abiertos.has(mes); return <div key={mes} className="overflow-hidden rounded-xl border border-ink-600"><button type="button" onClick={() => toggleMes(mes)} className="flex min-h-11 w-full items-center justify-between gap-2 bg-ink-700 px-4 text-left"><span className="font-bold text-sm capitalize">{abierto ? '▼' : '▶'} {mesLabel(mes)}</span><Badge color="blue">Vendido {gs(filas.reduce((a, f) => a + f.total, 0))}</Badge></button>{abierto && <div className="divide-y divide-ink-600 border-t border-ink-600">{filas.map(f => <div key={f.vid} className="flex items-center justify-between gap-2 px-4 py-3"><div><div className="font-semibold text-sm">{f.nombre}</div><div className="text-xs text-mute">{f.cant} ventas</div></div><div className="text-right"><div className="font-bold text-fono">{gs(f.total)}</div><div className="text-xs text-ok">Comisión {gs(f.com)}</div></div></div>)}</div>}</div> })}</div></Card>}
    {!esDemo && sesion?.esPropietario && <SeccionComisiones />}
    <ConfirmDialog open={Boolean(confirmarEliminar)} onCancel={() => setConfirmarEliminar(null)} onConfirm={eliminarUsuario} busy={busy} title={esDemo ? '¿Eliminar vendedor?' : '¿Desactivar integrante?'} description={esDemo ? `Se eliminará a ${confirmarEliminar?.nombre || 'este vendedor'}. Las ventas se conservan.` : `${confirmarEliminar?.nombre || 'Este integrante'} ya no podrá ingresar. Su historial se conserva.`} confirmLabel={esDemo ? 'Eliminar vendedor' : 'Desactivar integrante'} variant="danger" />
    <ConfirmDialog open={Boolean(confirmarRevocar)} onCancel={() => setConfirmarRevocar(null)} onConfirm={revokeInvitation} busy={busy} title="¿Revocar invitación?" description={`El enlace enviado a ${confirmarRevocar?.email || 'este correo'} dejará de funcionar.`} confirmLabel="Revocar invitación" variant="danger" />
  </div>
}
function Mini({ label, valor }) { return <div className="rounded-lg bg-ink-700 py-2 text-center"><div className="text-[10px] font-bold uppercase text-mute">{label}</div><div className="text-sm font-bold text-fono">{gs(valor)}</div></div> }

function SeccionComisiones() {
  const toast = useToast()
  const [reglas, setReglas] = useState(null)
  const [usuarios, setUsuarios] = useState([])
  const [nueva, setNueva] = useState({ userId: '', percentPyg: '' })
  const [editandoId, setEditandoId] = useState(null)
  const [borrador, setBorrador] = useState('')
  const [eliminando, setEliminando] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    setError('')
    try {
      const [nextReglas, nextUsuarios] = await Promise.all([api.get('/api/commission-rules'), api.get('/api/users')])
      setReglas(nextReglas || [])
      setUsuarios(nextUsuarios || [])
    } catch (cause) { setError(cause?.message || 'No se pudieron cargar las reglas de comisión.') }
  }, [])
  useEffect(() => { cargar() }, [cargar])

  async function crear(event) {
    event.preventDefault()
    if (!nueva.userId || ocupado) return
    setOcupado(true); setError('')
    try {
      await api.post('/api/commission-rules', { userId: nueva.userId, percentPyg: Number(nueva.percentPyg) })
      setNueva({ userId: '', percentPyg: '' })
      toast.success('Regla de comisión creada.')
      await cargar()
    } catch (cause) { setError(cause?.message || 'No se pudo crear la regla.') } finally { setOcupado(false) }
  }

  async function guardar(regla) {
    const percent = Number(borrador)
    if (!Number.isInteger(percent) || percent < 0 || percent > 100) { setError('El porcentaje debe ser un entero entre 0 y 100.'); return }
    setOcupado(true); setError('')
    try {
      await api.patch('/api/commission-rules', { id: regla.id, percentPyg: percent })
      setEditandoId(null)
      toast.success('Regla de comisión actualizada.')
      await cargar()
    } catch (cause) { setError(cause?.message || 'No se pudo actualizar la regla.') } finally { setOcupado(false) }
  }

  async function confirmarEliminar() {
    setOcupado(true); setError('')
    try {
      await api.delete('/api/commission-rules', { body: { id: eliminando.id } })
      setEliminando(null)
      toast.success('Regla de comisión eliminada.')
      await cargar()
    } catch (cause) { setError(cause?.message || 'No se pudo eliminar la regla.') } finally { setOcupado(false) }
  }

  const nombreUsuario = id => usuarios.find(usuario => usuario.id === id)?.name || 'Usuario eliminado'

  return (
    <Card>
      <h2 className="font-bold mb-1">Comisiones</h2>
      <p className="text-sm text-mute mb-4">
        Reglas de comisión sobre el <strong>margen</strong> de cada venta. La regla por usuario prevalece sobre la de rol.
      </p>
      <form onSubmit={crear} className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-end">
        <div className="flex-1">
          <span className="block text-[10px] font-bold uppercase text-mute mb-1">Vendedor</span>
          <Select value={nueva.userId} onChange={event => setNueva({ ...nueva, userId: event.target.value })} required>
            <option value="">Elegí el vendedor</option>
            {usuarios.map(usuario => <option key={usuario.id} value={usuario.id}>{usuario.name} · {usuario.role}</option>)}
          </Select>
        </div>
        <div className="sm:w-36">
          <span className="block text-[10px] font-bold uppercase text-mute mb-1">% comisión</span>
          <Input inputMode="numeric" min={0} max={100} value={nueva.percentPyg} onChange={event => setNueva({ ...nueva, percentPyg: event.target.value.replace(/\D/g, '').slice(0, 3) })} placeholder="0" required />
        </div>
        <Button type="submit" disabled={ocupado}>{ocupado ? 'Guardando…' : 'Agregar regla'}</Button>
      </form>
      {error && <p role="alert" className="mb-4 rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
      {reglas === null ? (
        <div className="space-y-2" aria-busy="true"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
      ) : reglas.length === 0 ? (
        <EmptyState compact icon="tag" title="Sin reglas de comisión." description="Agregá una regla para empezar a calcular comisiones por margen." />
      ) : (
        <div className="space-y-2">
          {reglas.map(regla => (
            <div key={regla.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-600 p-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{regla.userId ? (regla.user?.name || nombreUsuario(regla.userId)) : `Rol ${regla.role}`}</div>
                <div className="mt-0.5 text-xs text-mute">{regla.userId ? 'Regla por usuario' : 'Regla por rol'}</div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {editandoId === regla.id ? (
                  <>
                    <Input inputMode="numeric" value={borrador} onChange={event => setBorrador(event.target.value.replace(/\D/g, '').slice(0, 3))} className="h-8 w-20 px-2 text-right text-sm" aria-label="Porcentaje de comisión" />
                    <Button type="button" variant="success" disabled={ocupado} className="h-8 px-2 text-xs" onClick={() => guardar(regla)}>Guardar</Button>
                    <Button type="button" variant="ghost" className="h-8 px-2 text-xs" onClick={() => setEditandoId(null)}>Cancelar</Button>
                  </>
                ) : (
                  <>
                    <Badge color="green">{regla.percentPyg}%</Badge>
                    <button type="button" onClick={() => { setEditandoId(regla.id); setBorrador(String(regla.percentPyg)) }} className="text-mute hover:text-fore transition" title="Editar porcentaje"><Icon name="edit" className="h-4 w-4" /></button>
                    <button type="button" onClick={() => setEliminando(regla)} className="text-ink-500 hover:text-bad transition" title="Eliminar regla"><Icon name="trash" className="h-4 w-4" /></button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <ConfirmDialog
        open={Boolean(eliminando)}
        onCancel={() => setEliminando(null)}
        onConfirm={confirmarEliminar}
        busy={ocupado}
        title="¿Eliminar regla?"
        description="La regla dejará de aplicarse al calcular comisiones. Las ventas ya calculadas no cambian."
        confirmLabel="Eliminar regla"
        variant="danger"
      />
    </Card>
  )
}
