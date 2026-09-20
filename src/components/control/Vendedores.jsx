import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api/client'
import { useSesion } from '@/lib/sesion'
import { getVendedores, addVendedor, updateVendedor, deleteVendedor, listVentas, productosById, refrescar } from '@/lib/storage'
import { totalesVendedor, ventasDelDia, comisionDeVentas, fechaClave, num, gs } from '@/utils/calculos'
import { Card, Button, ConfirmDialog, Input, Select, Badge, Label, EmptyState, MoneyInput, Modal, IconAction } from '@/components/ui'
import Avatar from '@/components/shared/Avatar'
import EmailField from '@/components/shared/EmailField'
import Cronologia from '@/components/shared/Cronologia'
import { ROLE_LABELS } from '@/lib/roles'

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const INVITE_STATUS = { PENDING: ['Pendiente', 'orange'], ACCEPTED: ['Aceptada', 'green'], EXPIRED: ['Vencida', 'slate'], REVOKED: ['Revocada', 'red'] }
function mesLabel(clave) { const [y, m] = (clave || '').split('-'); return `${MESES[Number(m) - 1] || m} ${y}` }
function fechaCorta(value) { return value && !Number.isNaN(Date.parse(value)) ? new Date(value).toLocaleString('es-PY', { dateStyle: 'short', timeStyle: 'short' }) : '—' }
function textoEspera(segundos) { const minutos = Math.max(1, Math.ceil(segundos / 60)); return `Reenviar en ${minutos} min` }

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

// Configuración → Equipo: integrantes (foto, rol, horario, meta, historial) e
// invitaciones de la empresa (pendientes y vencidas, con reenvío y revocación).
// Las reglas de comisión viven en Finanzas → Comisiones desde #56.
export default function Vendedores() {
  const { esDemo, sesion } = useSesion()
  const navigate = useNavigate()
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
  const [filtro, setFiltro] = useState('activos')
  const [confirmarEliminar, setConfirmarEliminar] = useState(null)
  const [confirmarRol, setConfirmarRol] = useState(null)
  const [horario, setHorario] = useState(null)
  const [historialDe, setHistorialDe] = useState(null)
  const [confirmarRevocar, setConfirmarRevocar] = useState(null)
  const [invitarAbierto, setInvitarAbierto] = useState(false)
  const [modoInvitacion, setModoInvitacion] = useState('correo')
  const [conflicto, setConflicto] = useState(null)
  const [sucursales, setSucursales] = useState([])
  const [ahora, setAhora] = useState(() => Date.now())

  // Nombre de sucursal para la ficha: la API de usuarios solo trae branchId.
  useEffect(() => {
    if (esDemo) return undefined
    let vivo = true
    api.get('/api/branches').then(lista => { if (vivo) setSucursales(lista || []) }).catch(() => {})
    return () => { vivo = false }
  }, [esDemo])

  // Los enfriamientos de reenvío se muestran en minutos: refrescarlos cada 30 s
  // alcanza para que el botón se habilite sin recargar.
  useEffect(() => {
    const timer = window.setInterval(() => setAhora(Date.now()), 30000)
    return () => window.clearInterval(timer)
  }, [])

  const cargarInvitaciones = useCallback(async () => {
    if (esDemo) return []
    try {
      const next = await api.get('/api/user-invitations')
      const lista = next || []
      setInvitaciones(lista)
      return lista
    } catch (cause) { setError(cause?.message || 'No se pudieron cargar las invitaciones.'); return [] }
  }, [esDemo])
  useEffect(() => { cargarInvitaciones() }, [cargarInvitaciones])
  function notifySuccess(value) { setError(''); setMessage(value); window.setTimeout(() => setMessage(''), 4500) }
  async function refreshTeam() { if (!esDemo) await refrescar(); setRevision(value => value + 1) }

  function segundosParaReenviar(invite) {
    const restante = new Date(invite?.resendAvailableAt || 0).getTime() - ahora
    return restante > 0 ? Math.ceil(restante / 1000) : 0
  }

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
    event.preventDefault(); setError(''); setMessage(''); setConflicto(null)
    if (!invitacion.name.trim()) return setError('Ingresá el nombre del integrante.')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invitacion.email.trim())) return setError('Ingresá un correo válido.')
    const email = invitacion.email.trim().toLowerCase()
    const vencida = invitaciones.some(item => item.status === 'EXPIRED' && item.email?.toLowerCase() === email)
    setBusy(true)
    try {
      const result = await api.post('/api/user-invitations', { ...invitacion, name: invitacion.name.trim(), email })
      setInvitacion({ name: '', email: '', role: 'VENDEDOR' }); await cargarInvitaciones()
      notifySuccess(result.deliveryState === 'sent'
        ? (vencida ? 'La invitación anterior había vencido. Se envió una nueva.' : 'Invitación enviada correctamente.')
        : (vencida ? 'La invitación anterior había vencido. La nueva quedó guardada; el correo sigue pendiente.' : 'Invitación guardada. El correo quedó pendiente; volvé a intentar el reenvío en unos minutos.'))
    } catch (cause) {
      if (cause?.status === 409) {
        // Salida al callejón: mostrar la invitación activa con reenvío y revocación.
        const lista = await cargarInvitaciones()
        const existente = cause?.details?.invitation || lista.find(item => item.status === 'PENDING' && item.email?.toLowerCase() === email) || null
        setConflicto({ email, invitation: existente })
      } else { setError(cause?.message || 'No se pudo enviar la invitación.') }
    }
    finally { setBusy(false) }
  }

  async function actualizarUsuario(id, changes) {
    setError('')
    try { if (esDemo) updateVendedor(id, changes); else await api.patch('/api/users', { id, ...changes }); await refreshTeam(); notifySuccess('Integrante actualizado.') }
    catch (cause) { setError(cause?.message || 'No se pudo actualizar el integrante.') }
  }
  async function cambiarRol() {
    const target = confirmarRol; if (!target || busy) return
    setBusy(true); setError('')
    try {
      if (esDemo) updateVendedor(target.vendedor.id, { role: target.role })
      else await api.patch('/api/users', { id: target.vendedor.id, role: target.role })
      setConfirmarRol(null); await refreshTeam(); notifySuccess(`Rol actualizado a ${ROLE_LABELS[target.role] || target.role}.`)
    } catch (cause) { setError(cause?.message || 'No se pudo cambiar el rol.') } finally { setBusy(false) }
  }
  async function reactivarUsuario(v) {
    setError(''); setBusy(true)
    try {
      if (esDemo) updateVendedor(v.id, { activo: true }); else await api.patch('/api/users', { id: v.id, status: 'ACTIVE' })
      await refreshTeam(); setFiltro('activos'); notifySuccess(`${v.nombre} vuelve a estar activo con su historial intacto.`)
    } catch (cause) { setError(cause?.message || 'No se pudo reactivar al integrante.') } finally { setBusy(false) }
  }
  // Horario de acceso: el backend lo aplica al iniciar sesión (fuera de los
  // rangos, el integrante no puede entrar). Sin rangos queda libre.
  function abrirHorario(v) {
    setHorario({
      userId: v.id,
      nombre: v.nombre,
      timezone: v.accessSchedule?.timezone || 'America/Asuncion',
      windows: (v.accessSchedule?.windows || []).map(fila => ({ days: [...(fila.days || [])], start: fila.start || '', end: fila.end || '' })),
    })
  }
  async function guardarHorario(event) {
    event.preventDefault()
    if (!horario?.userId || busy) return
    setBusy(true); setError('')
    try {
      const windows = horario.windows.filter(fila => fila.days.length > 0 && fila.start && fila.end && fila.start !== fila.end)
      await api.patch('/api/users', { id: horario.userId, accessSchedule: windows.length ? { timezone: horario.timezone || 'America/Asuncion', windows } : null })
      setHorario(null); await refreshTeam(); notifySuccess(windows.length ? 'Horario de acceso actualizado.' : 'Horario quitado: el acceso queda libre.')
    } catch (cause) { setError(cause?.message || 'No se pudo guardar el horario.') } finally { setBusy(false) }
  }

  async function eliminarUsuario() {
    const target = confirmarEliminar; if (!target) return
    setBusy(true)
    try { if (esDemo) deleteVendedor(target.id); else await api.patch('/api/users', { id: target.id, status: 'INACTIVE' }); setConfirmarEliminar(null); await refreshTeam(); notifySuccess(esDemo ? 'Vendedor eliminado.' : 'Integrante desactivado; su historial se conserva.') }
    catch (cause) { setError(cause?.message || 'No se pudo completar la acción.') }
    finally { setBusy(false) }
  }
  async function resend(invite) {
    if (!invite) return
    setBusy(true); setError('')
    try {
      const result = await api.post(`/api/user-invitations/${encodeURIComponent(invite.id)}/resend`, {})
      await cargarInvitaciones(); setConflicto(null)
      notifySuccess(result.deliveryState === 'sent' ? 'Invitación reenviada.' : 'El correo sigue pendiente. Podés volver a intentar más tarde.')
    } catch (cause) { setError(cause?.message || 'No se pudo reenviar la invitación.') }
    finally { setBusy(false) }
  }
  async function revokeInvitation() {
    if (!confirmarRevocar) return
    setBusy(true); setError('')
    try {
      await api.post(`/api/user-invitations/${encodeURIComponent(confirmarRevocar.id)}/revoke`, {})
      setConfirmarRevocar(null); setConflicto(null); await cargarInvitaciones(); notifySuccess('Invitación revocada. Ya podés invitar de nuevo a ese correo.')
    } catch (cause) { setError(cause?.message || 'No se pudo revocar la invitación.') }
    finally { setBusy(false) }
  }
  function reinvitar(invite) {
    setConflicto(null); setError(''); setMessage('')
    setInvitacion({ name: invite.name || '', email: invite.email || '', role: invite.role || 'VENDEDOR' })
    setModoInvitacion('correo'); setInvitarAbierto(true)
  }

  const nombreById = Object.fromEntries(vendedores.map(v => [v.id, v.nombre]))
  const porMes = {}
  ventas.forEach(v => { const mes = (v.fecha || '').slice(0, 7); if (!mes) return; const vid = v.vendedorId || 'sin'; porMes[mes] ||= {}; porMes[mes][vid] ||= []; porMes[mes][vid].push(v) })
  const meses = Object.keys(porMes).sort().reverse()
  const [abiertos, setAbiertos] = useState(() => new Set(meses.slice(0, 1)))
  function toggleMes(mes) { setAbiertos(prev => { const next = new Set(prev); next.has(mes) ? next.delete(mes) : next.add(mes); return next }) }

  const visibles = vendedores.filter(v => filtro === 'todos' || (filtro === 'activos' ? v.activo : !v.activo))
  const cuentaActivos = vendedores.filter(v => v.activo).length
  const cuentaInactivos = vendedores.length - cuentaActivos

  return <div className="space-y-4" data-revision={revision}>
    {error && <p role="alert" className="rounded-lg border border-bad/30 bg-bad/10 p-3 text-sm text-bad">{error}</p>}
    {message && <p role="status" className="rounded-lg border border-ok/30 bg-ok/10 p-3 text-sm text-ok">{message}</p>}
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Button onClick={() => { setConflicto(null); setInvitacion({ name: '', email: '', role: 'VENDEDOR' }); setInvitarAbierto(true) }}>+ Invitar persona</Button>
    </div>

    <Card>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-bold mb-1">Funcionarios y metas</h2>
          <p className="text-sm text-mute">Foto, rol, estado, horario y meta diaria de cada integrante. El historial se conserva siempre.</p>
        </div>
        <div className="flex gap-1 rounded-xl border border-ink-600 bg-ink-800 p-1" role="tablist" aria-label="Filtrar integrantes">
          {[['activos', `Activos (${cuentaActivos})`], ['inactivos', `Inactivos (${cuentaInactivos})`], ['todos', 'Todos']].map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={filtro === id} onClick={() => setFiltro(id)} className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${filtro === id ? 'bg-fono/15 text-fono-light' : 'text-mute hover:text-fore'}`}>{label}</button>
          ))}
        </div>
      </div>
      {vendedores.length === 0 ? <EmptyState compact icon="users" title="Sin integrantes todavía." description="Invitá a la primera persona para que pueda ingresar." /> : visibles.length === 0 ? <EmptyState compact icon="users" title="No hay integrantes en este filtro." description="Cambiá el filtro para ver los demás integrantes." /> : <div className="space-y-2.5">{visibles.map(v => { const t = totalesVendedor(ventas, v.id); const com = comisionDeVentas(ventasDelDia(ventas, fechaClave(), v.id), prods); const role = v.role || 'VENDEDOR'; return <div key={v.id} data-testid="integrante-fila" className="rounded-2xl border border-ink-600 p-2.5 transition hover:border-fono/40">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <Avatar user={{ id: v.id, name: v.nombre, hasAvatar: esDemo ? false : v.hasAvatar }} size="lg" />
            <div className="min-w-0">
              <input aria-label={`Nombre de ${v.nombre}`} defaultValue={v.nombre} onBlur={event => { const name = event.target.value.trim(); if (name && name !== v.nombre) actualizarUsuario(v.id, esDemo ? { nombre: name } : { name }) }} className="min-h-11 min-w-0 max-w-[15rem] bg-transparent text-[13px] font-bold outline-none border-b border-transparent focus:border-fono" />
              {v.email && <div className="truncate text-xs text-mute">{v.email}</div>}
              <div className="truncate text-xs text-mute">{v.branchId ? (sucursales.find(s => s.id === v.branchId)?.name || 'Sucursal') : 'Sin sucursal'}</div>
              {v.id && <div className="text-[10px] text-mute" title={`ID del usuario: ${v.id}`}>ID: {v.id.slice(0, 8)}</div>}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <label className="flex items-center gap-1.5">
              <span className="sr-only">{`Rol de ${v.nombre}`}</span>
              <Select aria-label={`Rol de ${v.nombre}`} value={role} disabled={busy} onChange={event => { const next = event.target.value; if (next !== role) setConfirmarRol({ vendedor: v, role: next }) }} className="h-9 w-32 text-xs">
                {Object.entries(ROLE_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </Select>
            </label>
            <button type="button" onClick={() => abrirHorario(v)} className="flex min-h-11 items-center rounded-lg px-2 text-xs font-semibold text-mute hover:bg-ink-700 hover:text-fore" aria-label={`Horario de ${v.nombre}`} title="Horario de acceso">Horario</button>
            <IconAction icon="clock" label={`Historial de ${v.nombre}`} onClick={() => setHistorialDe(v)} />
            <button type="button" onClick={() => v.activo ? actualizarUsuario(v.id, esDemo ? { activo: false } : { status: 'INACTIVE' }) : reactivarUsuario(v)} className="flex min-h-11 items-center" aria-label={v.activo ? `Desactivar a ${v.nombre}` : `Reactivar a ${v.nombre}`} title={v.activo ? 'Desactivar (conserva el historial)' : 'Reactivar'}><Badge color={v.activo ? 'green' : 'slate'}>{v.activo ? 'Activo' : 'Inactivo'}</Badge></button>
            {v.activo
              ? <IconAction icon="trash" tone="bad" label={esDemo ? `Eliminar a ${v.nombre}` : `Desactivar a ${v.nombre} (conserva el historial)`} onClick={() => setConfirmarEliminar(v)} />
              : <IconAction icon="refresh" label={`Volver a activar a ${v.nombre}`} onClick={() => reactivarUsuario(v)} />}
          </div>
        </div>
        <div className="mt-1 grid grid-cols-2 items-end gap-2 border-t border-ink-600/60 pt-2 md:grid-cols-4"><label className="col-span-2 block md:col-span-1"><span className="text-[10px] font-bold uppercase text-mute">Meta diaria ₲</span><MetaDiaria vendor={v} esDemo={esDemo} onGuardar={(meta) => actualizarUsuario(v.id, { dailyGoalPyg: meta })} /></label><Mini label="Hoy" valor={t.hoy} /><Mini label="Comisión hoy" valor={com} /><Mini label="Mes" valor={t.mes} /></div>
      </div> })}</div>}
    </Card>

    {meses.length > 0 && <Card><h2 className="font-bold mb-1">Historial mensual por vendedor</h2><div className="mt-4 space-y-4">{meses.map(mes => { const filas = Object.entries(porMes[mes]).map(([vid, lista]) => ({ vid, nombre: nombreById[vid] || 'Sin vendedor', total: lista.reduce((a, x) => a + num(x.precio), 0), com: comisionDeVentas(lista, prods), cant: lista.length })).sort((a, b) => b.total - a.total); const abierto = abiertos.has(mes); return <div key={mes} className="overflow-hidden rounded-xl border border-ink-600"><button type="button" onClick={() => toggleMes(mes)} className="flex min-h-11 w-full items-center justify-between gap-2 bg-ink-700 px-4 text-left"><span className="font-bold text-sm capitalize">{abierto ? '▼' : '▶'} {mesLabel(mes)}</span><Badge color="blue">Vendido {gs(filas.reduce((a, f) => a + f.total, 0))}</Badge></button>{abierto && <div className="divide-y divide-ink-600 border-t border-ink-600">{filas.map(f => <div key={f.vid} className="flex items-center justify-between gap-2 px-3 py-2.5"><div><div className="text-[13px] font-semibold">{f.nombre}</div><div className="text-xs text-mute">{f.cant} ventas</div></div><div className="text-right"><div className="font-bold text-fono">{gs(f.total)}</div><div className="text-xs text-ok">Comisión {gs(f.com)}</div></div></div>)}</div>}</div> })}</div></Card>}

    {!esDemo && sesion?.esPropietario && <Card>
      <h2 className="font-bold mb-1">Comisiones</h2>
      <p className="text-sm text-mute mb-3">Las reglas de comisión por usuario o rol se movieron a <strong>Finanzas → Comisiones</strong>; acá quedan solo las personas, sus metas y horarios.</p>
      <Button type="button" variant="outline" onClick={() => navigate('/finanzas/comisiones')}>Ir a Finanzas → Comisiones</Button>
    </Card>}

    {!esDemo && <Card>
      <h2 className="font-bold mb-1">Invitaciones</h2>
      <p className="text-sm text-mute mb-4">Invitaciones de la empresa con su estado. Reenviá el enlace (con espera de 5 minutos entre envíos) o revocalo para liberar el correo.</p>
      {invitaciones.length === 0
        ? <EmptyState compact icon="send" title="Sin invitaciones todavía." description="Invitá a una persona por correo y su invitación aparecerá acá con estado pendiente." />
        : <div className="space-y-2">{invitaciones.map(invite => { const [label, color] = INVITE_STATUS[invite.status] || [invite.status, 'slate']; const espera = segundosParaReenviar(invite); return <div key={invite.id} data-testid="invitacion-fila" className="flex flex-col gap-3 rounded-xl border border-ink-600 p-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><strong className="truncate text-[13px]">{invite.name}</strong><Badge color={color}>{label}</Badge><Badge>{ROLE_LABELS[invite.role] || invite.role}</Badge></div>
            <p className="mt-1 truncate text-xs text-mute">{invite.email}</p>
            <p className="mt-0.5 text-[11px] text-mute">Invitó {invite.inviterName || '—'} · Creada {fechaCorta(invite.createdAt)} · {invite.status === 'EXPIRED' ? `Venció ${fechaCorta(invite.expiresAt)}` : `Expira ${fechaCorta(invite.expiresAt)}`}</p>
            {invite.status === 'ACCEPTED' && <p className="mt-0.5 text-[11px] text-ok">Aceptada {fechaCorta(invite.consumedAt)}</p>}
            {invite.status === 'REVOKED' && <p className="mt-0.5 text-[11px] text-bad">Revocada {fechaCorta(invite.revokedAt)}</p>}
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {invite.status === 'PENDING' && <>
              <Button type="button" variant="outline" disabled={busy || espera > 0} onClick={() => resend(invite)}>{espera > 0 ? textoEspera(espera) : 'Reenviar'}</Button>
              <Button type="button" variant="ghost" disabled={busy} onClick={() => setConfirmarRevocar(invite)}>Revocar</Button>
            </>}
            {(invite.status === 'EXPIRED' || invite.status === 'REVOKED') && <Button type="button" variant="outline" disabled={busy} onClick={() => reinvitar(invite)}>Invitar de nuevo</Button>}
          </div>
        </div> })}</div>}
    </Card>}

    <Modal open={horario !== null} onClose={() => !busy && setHorario(null)} title={`Horario de acceso${horario?.nombre ? ` · ${horario.nombre}` : ''}`} className="max-w-lg">
      <form onSubmit={guardarHorario} className="space-y-3">
        <p className="text-sm text-mute">Fuera de estos rangos el integrante no puede ingresar al sistema. Sin rangos, el acceso queda libre.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label htmlFor="horario-tz">Zona horaria</Label><Input id="horario-tz" value={horario?.timezone || 'America/Asuncion'} onChange={event => setHorario(current => ({ ...current, timezone: event.target.value }))} placeholder="America/Asuncion" /></div>
          <div className="flex items-end"><Button type="button" variant="outline" onClick={() => setHorario(current => ({ ...current, windows: [...(current?.windows || []), { days: [1, 2, 3, 4, 5], start: '08:00', end: '18:00' }] }))}>+ Rango</Button></div>
        </div>
        {(horario?.windows || []).length === 0 && <p className="rounded-lg border border-ink-600 px-3 py-2 text-xs text-mute">Sin rangos cargados: el integrante puede ingresar cualquier día y hora.</p>}
        {(horario?.windows || []).map((fila, index) => (
          <div key={index} className="grid gap-2 rounded-xl border border-ink-600 p-3 sm:grid-cols-[1fr_auto_auto_auto]">
            <div className="flex flex-wrap gap-1">{['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'].map((dia, day) => {
              const valor = day === 6 ? 0 : day + 1
              const activo = fila.days.includes(valor)
              return <button key={dia} type="button" aria-pressed={activo} aria-label={dia} className={`rounded-lg border px-2 py-1 text-xs transition ${activo ? 'border-fono bg-fono/15 text-fono-light' : 'border-ink-600 text-mute'}`} onClick={() => setHorario(current => ({ ...current, windows: current.windows.map((fila2, itemIndex) => itemIndex === index ? { ...fila2, days: fila2.days.includes(valor) ? fila2.days.filter(d => d !== valor) : [...fila2.days, valor] } : fila2) }))}>{dia}</button>
            })}</div>
            <Input type="time" value={fila.start} onChange={event => setHorario(current => ({ ...current, windows: current.windows.map((fila2, itemIndex) => itemIndex === index ? { ...fila2, start: event.target.value } : fila2) }))} aria-label="Desde" />
            <Input type="time" value={fila.end} onChange={event => setHorario(current => ({ ...current, windows: current.windows.map((fila2, itemIndex) => itemIndex === index ? { ...fila2, end: event.target.value } : fila2) }))} aria-label="Hasta" />
            <button type="button" className="self-center text-xs text-bad hover:underline" onClick={() => setHorario(current => ({ ...current, windows: current.windows.filter((_, itemIndex) => itemIndex !== index) }))}>Quitar</button>
          </div>
        ))}
        <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="ghost" disabled={busy} onClick={() => setHorario(null)}>Cancelar</Button><Button type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar horario'}</Button></div>
      </form>
    </Modal>
    <Modal open={invitarAbierto} onClose={() => !busy && setInvitarAbierto(false)} title="Invitar persona" className="max-w-2xl">
      <div className="space-y-3">
        <div className="flex gap-1 rounded-xl border border-ink-600 bg-ink-800 p-1">
          {[['correo', 'Invitar por correo'], ['directo', 'Agregar directamente']].map(([key, label]) => (
            <button key={key} type="button" onClick={() => setModoInvitacion(key)} className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${modoInvitacion === key ? 'bg-fono/15 text-fono-light' : 'text-mute hover:text-fore'}`}>{label}</button>
          ))}
        </div>

        {conflicto && <div role="alert" className="rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm">
          <p className="font-semibold">Ya existe una invitación activa para {conflicto.email}.</p>
          {conflicto.invitation
            ? <p className="mt-1 text-xs text-mute">{conflicto.invitation.name} · {ROLE_LABELS[conflicto.invitation.role] || conflicto.invitation.role} · Creada {fechaCorta(conflicto.invitation.createdAt)} · Expira {fechaCorta(conflicto.invitation.expiresAt)}</p>
            : <p className="mt-1 text-xs text-mute">Actualizá el listado de invitaciones para verla, reenviarla o revocarla.</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {conflicto.invitation && <Button type="button" variant="outline" disabled={busy || segundosParaReenviar(conflicto.invitation) > 0} onClick={() => resend(conflicto.invitation)}>{segundosParaReenviar(conflicto.invitation) > 0 ? textoEspera(segundosParaReenviar(conflicto.invitation)) : 'Reenviar invitación'}</Button>}
            {conflicto.invitation && <Button type="button" variant="ghost" disabled={busy} onClick={() => setConfirmarRevocar(conflicto.invitation)}>Revocar invitación</Button>}
            <Button type="button" variant="ghost" onClick={() => { setConflicto(null); setInvitarAbierto(false) }}>Ver todas las invitaciones</Button>
          </div>
        </div>}
        
        {modoInvitacion === 'correo' ? <>{!esDemo && <Card><h2 className="font-bold">Invitar por correo</h2><p className="mt-1 text-sm text-mute">La persona recibe un enlace seguro y elige su propio PIN. Nunca enviamos credenciales por correo.</p><form onSubmit={invitar} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(11rem,1.3fr)_minmax(13rem,1.5fr)_minmax(8rem,1fr)_auto]"><div><Label htmlFor="invite-name">Nombre</Label><Input id="invite-name" value={invitacion.name} onChange={event => setInvitacion({ ...invitacion, name: event.target.value })} onBlur={() => !invitacion.name.trim() && setError('Ingresá el nombre del integrante.')} required /></div><div><Label htmlFor="invite-email">Correo</Label><EmailField id="invite-email" value={invitacion.email} onChange={value => setInvitacion({ ...invitacion, email: value })} required /></div><div><Label htmlFor="invite-role">Rol</Label><Select id="invite-role" value={invitacion.role} onChange={event => setInvitacion({ ...invitacion, role: event.target.value })}>{Object.entries(ROLE_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</Select></div><div className="flex items-end"><Button type="submit" className="w-full" disabled={busy}>Enviar invitación</Button></div></form></Card>}</> : <><Card><h2 className="font-bold">Agregar directamente</h2><p className="mt-1 text-sm text-mute">{esDemo ? 'Agregá vendedores al entorno demo.' : 'Opción compatible para alta inmediata con un PIN definido por el administrador.'}</p><form onSubmit={crearDirecto} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(11rem,1.1fr)_minmax(13rem,1.3fr)_minmax(8rem,1fr)_minmax(7rem,0.7fr)_auto]"><div><Label htmlFor="direct-name">Nombre</Label><Input id="direct-name" value={directo.name} onChange={event => setDirecto({ ...directo, name: event.target.value })} required /></div>{!esDemo && <><div><Label htmlFor="direct-email">Correo</Label><EmailField id="direct-email" value={directo.email} onChange={value => setDirecto({ ...directo, email: value })} /></div><div><Label htmlFor="direct-role">Rol</Label><Select id="direct-role" value={directo.role} onChange={event => setDirecto({ ...directo, role: event.target.value })}>{Object.entries(ROLE_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</Select></div><div><Label htmlFor="direct-pin">PIN temporal</Label><Input id="direct-pin" inputMode="numeric" maxLength={4} value={directo.pin} onChange={event => setDirecto({ ...directo, pin: event.target.value.replace(/\D/g, '').slice(0, 4) })} required /></div></>}<div className="flex items-end"><Button type="submit" className="w-full" disabled={busy}>Agregar</Button></div></form></Card></>}
      </div>
    </Modal>
    <Modal open={historialDe !== null} onClose={() => setHistorialDe(null)} title={`Historial de ${historialDe?.nombre || 'funcionario'}`}>
      {historialDe && <Cronologia endpoint={`/api/users/${historialDe.id}/history`} active={historialDe !== null} vacio="Sin actividad" descripcionVacio="El alta, los cambios de rol, sucursal o PIN, las comisiones y las ventas de este funcionario aparecerán acá." />}
    </Modal>
    <ConfirmDialog open={Boolean(confirmarEliminar)} onCancel={() => setConfirmarEliminar(null)} onConfirm={eliminarUsuario} busy={busy} title={esDemo ? '¿Eliminar vendedor?' : '¿Desactivar integrante?'} description={esDemo ? `Se eliminará a ${confirmarEliminar?.nombre || 'este vendedor'}. Las ventas se conservan.` : `${confirmarEliminar?.nombre || 'Este integrante'} ya no podrá ingresar: se cierran sus sesiones. Su historial, ventas y comisiones se conservan y podés reactivarlo cuando quieras.`} confirmLabel={esDemo ? 'Eliminar vendedor' : 'Desactivar integrante'} variant="danger" />
    <ConfirmDialog open={Boolean(confirmarRol)} onCancel={() => setConfirmarRol(null)} onConfirm={cambiarRol} busy={busy} title="¿Cambiar el rol del integrante?" description={`${confirmarRol?.vendedor?.nombre || 'El integrante'} pasa de ${ROLE_LABELS[confirmarRol?.vendedor?.role || 'VENDEDOR'] || 'Vendedor'} a ${ROLE_LABELS[confirmarRol?.role] || ''}. Se cierran sus sesiones abiertas y el cambio queda auditado.`} confirmLabel="Cambiar rol" />
    <ConfirmDialog open={Boolean(confirmarRevocar)} onCancel={() => setConfirmarRevocar(null)} onConfirm={revokeInvitation} busy={busy} title="¿Revocar invitación?" description={`El enlace enviado a ${confirmarRevocar?.email || 'este correo'} dejará de funcionar y el correo queda libre para invitar de nuevo.`} confirmLabel="Revocar invitación" variant="danger" />
  </div>
}
function Mini({ label, valor }) { return <div className="rounded-lg bg-ink-700 py-2 text-center"><div className="text-[10px] font-bold uppercase text-mute">{label}</div><div className="text-sm font-bold text-fono">{gs(valor)}</div></div> }
