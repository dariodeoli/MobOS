import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api/client'
import { useSesion } from '@/lib/sesion'
import { getVendedores, addVendedor, updateVendedor, deleteVendedor, listVentas, productosById, refrescar } from '@/lib/storage'
import { totalesVendedor, ventasDelDia, comisionDeVentas, fechaClave, num, gs } from '@/utils/calculos'
import { Card, Button, ConfirmDialog, Input, Select, Badge, Label, EmptyState, MoneyInput, Modal, PinInput, FormField } from '@/components/ui'
import Avatar from '@/components/shared/Avatar'
import EmailField from '@/components/shared/EmailField'
import Cronologia from '@/components/shared/Cronologia'
import PanelDerecho from '@/components/shared/PanelDerecho'
import { ROLE_LABELS } from '@/lib/roles'
import { cn } from '@/lib/utils'

// PIN aleatorio de 4 a 6 dígitos (crypto): se muestra una sola vez al
// asignarlo y nunca se guarda en claro.
function pinAleatorio() {
  const largo = 4 + Math.floor(Math.random() * 3)
  const bytes = new Uint32Array(largo)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, valor => String(valor % 10)).join('')
}

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

// Equipo: integrantes activos/inactivos, metas, invitaciones e historial.
export default function Vendedores() {
  const navigate = useNavigate()
  const { esDemo, sesion } = useSesion()
  const vendedores = getVendedores()
  const ventas = listVentas()
  const prods = productosById()
  const [revision, setRevision] = useState(0)
  const [tabIntegrantes, setTabIntegrantes] = useState('activos')
  const [directo, setDirecto] = useState({ name: '', email: '', role: 'VENDEDOR', pin: '' })
  const [invitacion, setInvitacion] = useState({ name: '', email: '', role: 'VENDEDOR' })
  const [invitaciones, setInvitaciones] = useState([])
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmarEliminar, setConfirmarEliminar] = useState(null)
  const [cambioRol, setCambioRol] = useState(null)
  const [conflicto, setConflicto] = useState(null)
  const [horario, setHorario] = useState(null)
  const [historialDe, setHistorialDe] = useState(null)
  const [confirmarRevocar, setConfirmarRevocar] = useState(null)
  const [modoInvitacion, setModoInvitacion] = useState('correo')
  // Permisos por integrante: el rol define el máximo y acá se recorta.
  const [permisosDe, setPermisosDe] = useState(null)
  const [catalogo, setCatalogo] = useState(null)
  const [permisosSel, setPermisosSel] = useState([])
  const [permisosBusy, setPermisosBusy] = useState(false)
  // PIN del integrante: se genera al azar o se define a mano (4-6 dígitos).
  // Nunca se muestra el PIN guardado; el generado se enseña una sola vez.
  const [pinDe, setPinDe] = useState(null)
  const [pinModo, setPinModo] = useState('generar')
  const [pinGenerado, setPinGenerado] = useState('')
  const [pinNuevo, setPinNuevo] = useState('')
  const [pinConfirm, setPinConfirm] = useState('')
  const [pinBusy, setPinBusy] = useState(false)
  const [pinError, setPinError] = useState('')
  const [pinCopiado, setPinCopiado] = useState(false)

  const cargarInvitaciones = useCallback(async () => {
    if (esDemo) return
    try { setInvitaciones(await api.get('/api/user-invitations')) } catch (cause) { setError(cause?.message || 'No se pudieron cargar las invitaciones.') }
  }, [esDemo])
  useEffect(() => { cargarInvitaciones() }, [cargarInvitaciones])
  // Nombre de sucursal para la ficha: la API de usuarios solo trae branchId.
  const [sucursales, setSucursales] = useState([])
  useEffect(() => {
    if (esDemo) return undefined
    let vivo = true
    api.get('/api/branches').then(lista => { if (vivo) setSucursales(lista || []) }).catch(() => {})
    return () => { vivo = false }
  }, [esDemo])
  function notifySuccess(value) { setError(''); setMessage(value); window.setTimeout(() => setMessage(''), 4500) }
  async function refreshTeam() { if (!esDemo) await refrescar(); setRevision(value => value + 1) }

  async function crearDirecto(event) {
    event.preventDefault(); setError(''); setMessage('')
    const name = directo.name.trim()
    if (!name) return setError('Ingresá el nombre del integrante.')
    if (!esDemo && !/^\d{4,6}$/.test(directo.pin)) return setError('Ingresá un PIN de 4 a 6 dígitos.')
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
    setBusy(true)
    try {
      const result = await api.post('/api/user-invitations', { ...invitacion, name: invitacion.name.trim(), email: invitacion.email.trim().toLowerCase() })
      setInvitacion({ name: '', email: '', role: 'VENDEDOR' }); await cargarInvitaciones(); notifySuccess(result.deliveryState === 'sent' ? 'Invitación enviada correctamente.' : 'Invitación guardada. El correo quedó pendiente; volvé a intentar el reenvío en unos minutos.')
    } catch (cause) {
      if (cause?.details?.invitation) { setConflicto({ email: invitacion.email.trim().toLowerCase(), invitation: cause.details.invitation }); return }
      setError(cause?.message || 'No se pudo enviar la invitación.')
    }
    finally { setBusy(false) }
  }

  async function actualizarUsuario(id, changes) {
    setError('')
    try { if (esDemo) updateVendedor(id, changes); else await api.patch('/api/users', { id, ...changes }); await refreshTeam(); notifySuccess('Integrante actualizado.') }
    catch (cause) { setError(cause?.message || 'No se pudo actualizar el integrante.') }
  }

  function abrirPin(v) {
    setPinDe(v)
    setPinModo('generar')
    setPinGenerado('')
    setPinNuevo('')
    setPinConfirm('')
    setPinError('')
    setPinCopiado(false)
  }

  async function guardarPin() {
    const pin = pinModo === 'generar' ? pinGenerado : pinNuevo
    if (!/^\d{4,6}$/.test(pin)) return setPinError('El PIN debe tener entre 4 y 6 dígitos.')
    if (pinModo === 'manual' && pin !== pinConfirm) return setPinError('Los PIN no coinciden.')
    if (!pinDe) return
    setPinBusy(true)
    setPinError('')
    try {
      if (esDemo) updateVendedor(pinDe.id, { pin })
      else await api.patch('/api/users', { id: pinDe.id, resetPin: true, pin })
      setPinDe(null)
      await refreshTeam()
      notifySuccess(`PIN asignado a ${pinDe.nombre}. Ya puede entrar con ese PIN.`)
    } catch (cause) {
      setPinError(cause?.message || 'No se pudo asignar el PIN.')
    } finally {
      setPinBusy(false)
    }
  }

  async function copiarPin() {
    try {
      await navigator.clipboard.writeText(pinGenerado)
      setPinCopiado(true)
      window.setTimeout(() => setPinCopiado(false), 2500)
    } catch {
      setPinError('No se pudo copiar; anotá el PIN a mano.')
    }
  }

  async function aplicarCambioRol() {
    const target = cambioRol; if (!target) return
    setBusy(true); setError('')
    try {
      if (esDemo) updateVendedor(target.usuario.id, { role: target.nextRole })
      else await api.patch('/api/users', { id: target.usuario.id, role: target.nextRole })
      setCambioRol(null); await refreshTeam(); notifySuccess(`Rol actualizado a ${ROLE_LABELS[target.nextRole] || target.nextRole}.`)
    } catch (cause) { setError(cause?.message || 'No se pudo cambiar el rol.') }
    finally { setBusy(false) }
  }

  // Abre el editor de permisos con el catálogo real del backend; lo que el rol
  // tiene por defecto aparece marcado y lo desmarcado se aplica en el servidor.
  async function abrirPermisos(v) {
    setError(''); setPermisosDe(v); setPermisosSel([])
    try {
      const data = catalogo || await api.get('/api/permissions')
      setCatalogo(data)
      const delRol = (data.byRole?.[v.role] || []).map(item => item.id)
      const configurados = Array.isArray(v.permissions) ? v.permissions : null
      setPermisosSel(configurados ? delRol.filter(id => configurados.includes(id)) : delRol)
    } catch (cause) { setError(cause?.message || 'No se pudieron cargar los permisos.') }
  }
  async function guardarPermisos() {
    if (!permisosDe) return
    const delRol = (catalogo?.byRole?.[permisosDe.role] || []).map(item => item.id)
    const completo = delRol.length > 0 && delRol.every(id => permisosSel.includes(id))
    setPermisosBusy(true); setError('')
    try {
      await actualizarUsuario(permisosDe.id, { permissions: completo ? null : permisosSel })
      setPermisosDe(null)
    } finally { setPermisosBusy(false) }
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
      if (esDemo) updateVendedor(horario.userId, { accessSchedule: windows.length ? { timezone: horario.timezone || 'America/Asuncion', windows } : null })
      else await api.patch('/api/users', { id: horario.userId, accessSchedule: windows.length ? { timezone: horario.timezone || 'America/Asuncion', windows } : null })
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
  async function reactivarUsuario(v) {
    setBusy(true); setError('')
    try { if (esDemo) updateVendedor(v.id, { activo: true }); else await api.patch('/api/users', { id: v.id, status: 'ACTIVE' }); setTabIntegrantes('activos'); await refreshTeam(); notifySuccess(`${v.nombre} vuelve a estar activo y puede volver a operar.`) }
    catch (cause) { setError(cause?.message || 'No se pudo reactivar el integrante.') }
    finally { setBusy(false) }
  }
  async function resend(invite) {
    setBusy(true); setError('')
    try { const result = await api.post(`/api/user-invitations/${encodeURIComponent(invite.id)}/resend`, {}); setConflicto(null); await cargarInvitaciones(); notifySuccess(result.deliveryState === 'sent' ? 'Invitación reenviada.' : 'El correo sigue pendiente. Podés volver a intentar más tarde.') }
    catch (cause) { setError(cause?.message || 'No se pudo reenviar la invitación.') }
    finally { setBusy(false) }
  }
  async function revokeInvitation() {
    if (!confirmarRevocar) return
    setBusy(true); setError('')
    try { await api.post(`/api/user-invitations/${encodeURIComponent(confirmarRevocar.id)}/revoke`, {}); setConfirmarRevocar(null); setConflicto(null); await cargarInvitaciones(); notifySuccess('Invitación revocada.') }
    catch (cause) { setError(cause?.message || 'No se pudo revocar la invitación.') }
    finally { setBusy(false) }
  }
  function invitarDeNuevo(invite) {
    setInvitacion({ name: invite.name || '', email: invite.email, role: invite.role || 'VENDEDOR' })
    setModoInvitacion('correo'); setConflicto(null)
    irAlFormulario()
  }

  function irAlFormulario() {
    document.getElementById('equipo-form')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }

  const nombreById = Object.fromEntries(vendedores.map(v => [v.id, v.nombre]))
  const porMes = {}
  ventas.forEach(v => { const mes = (v.fecha || '').slice(0, 7); if (!mes) return; const vid = v.vendedorId || 'sin'; porMes[mes] ||= {}; porMes[mes][vid] ||= []; porMes[mes][vid].push(v) })
  const meses = Object.keys(porMes).sort().reverse()
  const [abiertos, setAbiertos] = useState(() => new Set(meses.slice(0, 1)))
  function toggleMes(mes) { setAbiertos(prev => { const next = new Set(prev); next.has(mes) ? next.delete(mes) : next.add(mes); return next }) }

  const fechaCortaInv = (valor) => (valor ? new Date(valor).toLocaleDateString('es-PY', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')
  const integrantesDeTab = tabIntegrantes === 'inactivos' ? vendedores.filter(v => !v.activo) : vendedores.filter(v => v.activo)

  // Formulario de alta del equipo: en escritorio vive en el panel derecho;
  // en móvil queda apilado y el botón de arriba lleva hasta él.
  const formularioSumar = (
    <Card className="space-y-3">
      <div>
        <h2 className="font-bold">Sumar integrante</h2>
        <p className="mt-1 text-sm text-mute">Por correo recibe un enlace seguro y elige su PIN; directo queda con un PIN temporal (4 a 6 dígitos).</p>
      </div>
      {!esDemo && (
        <div className="flex gap-1 rounded-xl border border-ink-600 bg-ink-800 p-1">
          {[['correo', 'Invitar por correo'], ['directo', 'Agregar directamente']].map(([key, label]) => (
            <button key={key} type="button" aria-pressed={modoInvitacion === key} onClick={() => setModoInvitacion(key)} className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${modoInvitacion === key ? 'bg-fono/15 text-fono-light' : 'text-mute hover:text-fore'}`}>{label}</button>
          ))}
        </div>
      )}
      {conflicto && (
        <div role="alert" className="rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm">
          <p className="font-semibold">Ya existe una invitación activa para {conflicto.email}.</p>
          {conflicto.invitation
            ? <p className="mt-1 text-xs text-mute">{conflicto.invitation.name} · {ROLE_LABELS[conflicto.invitation.role] || conflicto.invitation.role} · Creada {fechaCortaInv(conflicto.invitation.createdAt)} · Expira {fechaCortaInv(conflicto.invitation.expiresAt)}</p>
            : <p className="mt-1 text-xs text-mute">Actualizá el listado de invitaciones para verla, reenviarla o revocarla.</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {conflicto.invitation && <Button type="button" variant="outline" disabled={busy || (conflicto.invitation.resendAvailableAt && new Date(conflicto.invitation.resendAvailableAt) > new Date())} onClick={() => resend(conflicto.invitation)}>{conflicto.invitation.resendAvailableAt && new Date(conflicto.invitation.resendAvailableAt) > new Date() ? 'Reenvío en espera' : 'Reenviar invitación'}</Button>}
            {conflicto.invitation && <Button type="button" variant="ghost" disabled={busy} onClick={() => setConfirmarRevocar(conflicto.invitation)}>Revocar invitación</Button>}
            <Button type="button" variant="ghost" onClick={() => setConflicto(null)}>Cerrar aviso</Button>
          </div>
        </div>
      )}
      {esDemo || modoInvitacion === 'directo' ? (
        <form onSubmit={crearDirecto} className="space-y-3">
          <FormField label="Nombre" htmlFor="direct-name">
            <Input id="direct-name" value={directo.name} onChange={event => setDirecto({ ...directo, name: event.target.value })} required />
          </FormField>
          {!esDemo && <>
            <FormField label="Correo (opcional)" htmlFor="direct-email">
              <EmailField id="direct-email" value={directo.email} onChange={value => setDirecto({ ...directo, email: value })} />
            </FormField>
            <FormField label="Rol" htmlFor="direct-role">
              <Select id="direct-role" value={directo.role} onChange={event => setDirecto({ ...directo, role: event.target.value })}>{Object.entries(ROLE_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</Select>
            </FormField>
            <FormField label="PIN temporal (4 a 6 dígitos)" htmlFor="direct-pin">
              <Input id="direct-pin" inputMode="numeric" maxLength={6} value={directo.pin} onChange={event => setDirecto({ ...directo, pin: event.target.value.replace(/\D/g, '').slice(0, 6) })} required />
            </FormField>
          </>}
          <Button type="submit" className="w-full" disabled={busy}>Agregar</Button>
        </form>
      ) : (
        <form onSubmit={invitar} className="space-y-3">
          <FormField label="Nombre" htmlFor="invite-name">
            <Input id="invite-name" value={invitacion.name} onChange={event => setInvitacion({ ...invitacion, name: event.target.value })} onBlur={() => !invitacion.name.trim() && setError('Ingresá el nombre del integrante.')} required />
          </FormField>
          <FormField label="Correo" htmlFor="invite-email">
            <EmailField id="invite-email" value={invitacion.email} onChange={value => setInvitacion({ ...invitacion, email: value })} required />
          </FormField>
          <FormField label="Rol" htmlFor="invite-role">
            <Select id="invite-role" value={invitacion.role} onChange={event => setInvitacion({ ...invitacion, role: event.target.value })}>{Object.entries(ROLE_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</Select>
          </FormField>
          <Button type="submit" className="w-full" disabled={busy}>Enviar invitación</Button>
        </form>
      )}
    </Card>
  )

  return <div className="space-y-4" data-revision={revision}>
    {error && <p role="alert" className="rounded-lg border border-bad/30 bg-bad/10 p-3 text-sm text-bad">{error}</p>}
    {message && <p role="status" className="rounded-lg border border-ok/30 bg-ok/10 p-3 text-sm text-ok">{message}</p>}
    <div className="flex flex-wrap items-center justify-end gap-2 lg:hidden">
      <Button onClick={() => { setConflicto(null); setInvitacion({ name: '', email: '', role: 'VENDEDOR' }); irAlFormulario() }}>+ Invitar persona</Button>
    </div>

    <PanelDerecho id="equipo-form" panel={formularioSumar}>
    <>
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-bold mb-1">Funcionarios y metas</h2>
          <p className="text-sm text-mute">Administrá el estado del equipo y la meta diaria de cada vendedor.</p>
        </div>
        <div role="tablist" className="flex gap-1 rounded-xl border border-ink-600 bg-ink-800 p-1">
          {[['activos', 'Activos'], ['inactivos', 'Inactivos']].map(([clave, etiqueta]) => (
            <button key={clave} role="tab" aria-selected={tabIntegrantes === clave} onClick={() => setTabIntegrantes(clave)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${tabIntegrantes === clave ? 'bg-fono/15 text-fono-light' : 'text-mute hover:text-fore'}`}>{etiqueta} ({clave === 'activos' ? vendedores.filter(v => v.activo).length : vendedores.filter(v => !v.activo).length})</button>
          ))}
        </div>
      </div>
      <div className="space-y-2.5">
        {integrantesDeTab.map(v => { const t = totalesVendedor(ventas, v.id); const com = comisionDeVentas(ventasDelDia(ventas, fechaClave(), v.id), prods); return (
          <div key={v.id} data-testid="integrante-fila" className="rounded-2xl border border-ink-600 p-3 transition hover:border-fono/40">
            <span className="sr-only">{v.nombre}</span>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2.5">
                <Avatar user={{ id: v.id, name: v.nombre, hasAvatar: esDemo ? false : v.hasAvatar }} size="lg" />
                <div className="min-w-0">
                  <input aria-label={`Nombre de ${v.nombre}`} defaultValue={v.nombre} onBlur={event => { const name = event.target.value.trim(); if (name && name !== v.nombre) actualizarUsuario(v.id, esDemo ? { nombre: name } : { name }) }} className="min-h-7 min-w-0 max-w-[15rem] bg-transparent text-[13px] font-bold outline-none border-b border-transparent focus:border-fono" />
                  {v.email && <p className="truncate text-xs text-mute">{v.email}</p>}
                  <p className="truncate text-xs text-mute">{v.branchId ? (sucursales.find(s => s.id === v.branchId)?.name || 'Sucursal') : 'Sin sucursal'}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge color={v.activo ? 'green' : 'slate'}>{v.activo ? 'Activo' : 'Inactivo'}</Badge>
                <Select aria-label={`Rol de ${v.nombre}`} value={v.role || 'VENDEDOR'} onChange={event => setCambioRol({ usuario: v, nextRole: event.target.value })} className="h-8 w-auto py-0 text-xs">
                  {Object.entries(ROLE_LABELS).map(([valor, etiqueta]) => <option key={valor} value={valor}>{etiqueta}</option>)}
                </Select>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-ink-600/60 pt-2">
              <button type="button" onClick={() => setHistorialDe(v)} className="rounded-lg px-2 py-1 text-xs font-semibold text-mute transition hover:bg-ink-700 hover:text-fore" aria-label={`Historial de ${v.nombre}`}>Historial</button>
              <button type="button" onClick={() => abrirHorario(v)} className="rounded-lg px-2 py-1 text-xs font-semibold text-mute transition hover:bg-ink-700 hover:text-fore" aria-label={`Horario de ${v.nombre}`}>Horario</button>
              {!esDemo && <button type="button" onClick={() => abrirPin(v)} className="rounded-lg px-2 py-1 text-xs font-semibold text-mute transition hover:bg-ink-700 hover:text-fore" aria-label={`PIN de ${v.nombre}`} title="Asignar un PIN nuevo (nunca se muestra el actual)">PIN</button>}
              {!esDemo && v.role !== 'ADMIN' && <button type="button" onClick={() => abrirPermisos(v)} className="rounded-lg px-2 py-1 text-xs font-semibold text-mute transition hover:bg-ink-700 hover:text-fore" aria-label={`Permisos de ${v.nombre}`} title="Permisos por acción">Permisos</button>}
              {v.activo
                ? <button type="button" onClick={() => setConfirmarEliminar(v)} className="rounded-lg px-2 py-1 text-xs font-semibold text-bad transition hover:bg-bad/10" aria-label={`Desactivar a ${v.nombre} (conserva el historial)`}>Desactivar</button>
                : <button type="button" onClick={() => reactivarUsuario(v)} className="rounded-lg px-2 py-1 text-xs font-semibold text-ok transition hover:bg-ok/10" aria-label={`Volver a activar a ${v.nombre}`}>Volver a activar</button>}
            </div>
            <div className="mt-1 grid grid-cols-2 items-end gap-2 border-t border-ink-600/60 pt-2 md:grid-cols-4">
              <label className="col-span-2 block md:col-span-1"><span className="text-[10px] font-bold uppercase text-mute">Meta diaria Gs</span><MetaDiaria vendor={v} esDemo={esDemo} onGuardar={(meta) => actualizarUsuario(v.id, { dailyGoalPyg: meta })} /></label>
              <Mini label="Hoy" valor={t.hoy} /><Mini label="Comisión hoy" valor={com} /><Mini label="Mes" valor={t.mes} />
            </div>
          </div>
        )})}
        {!integrantesDeTab.length && (
          <EmptyState
            compact
            icon="users"
            title={tabIntegrantes === 'inactivos' ? 'No hay integrantes inactivos.' : 'Todavía no hay integrantes activos.'}
            description={tabIntegrantes === 'inactivos'
              ? 'Cuando desactives a alguien, va a aparecer acá con su historial intacto.'
              : 'Sumá a la primera persona del equipo para que pueda vender con su PIN.'}
            action={tabIntegrantes === 'activos' && !vendedores.length
              ? <Button type="button" onClick={() => { setConflicto(null); setInvitacion({ name: '', email: '', role: 'VENDEDOR' }); irAlFormulario() }}>+ Invitar persona</Button>
              : undefined}
          />
        )}
      </div>
    </Card>

    {meses.length > 0 && <Card><h2 className="font-bold mb-1">Historial mensual por vendedor</h2><div className="mt-4 space-y-4">{meses.map(mes => { const filas = Object.entries(porMes[mes]).map(([vid, lista]) => ({ vid, nombre: nombreById[vid] || 'Sin vendedor', total: lista.reduce((a, x) => a + num(x.precio), 0), com: comisionDeVentas(lista, prods), cant: lista.length })).sort((a, b) => b.total - a.total); const abierto = abiertos.has(mes); return <div key={mes} className="overflow-hidden rounded-xl border border-ink-600"><button type="button" onClick={() => toggleMes(mes)} className="flex min-h-11 w-full items-center justify-between gap-2 bg-ink-700 px-4 text-left"><span className="font-bold text-sm capitalize">{abierto ? '▼' : '▶'} {mesLabel(mes)}</span><Badge color="blue">Vendido {gs(filas.reduce((a, f) => a + f.total, 0))}</Badge></button>{abierto && <div className="divide-y divide-ink-600 border-t border-ink-600">{filas.map(f => <div key={f.vid} className="flex items-center justify-between gap-2 px-3 py-2.5"><div><div className="text-[13px] font-semibold">{f.nombre}</div><div className="text-xs text-mute">{f.cant} ventas</div></div><div className="text-right"><div className="font-bold text-fono">{gs(f.total)}</div><div className="text-xs text-ok">Comisión {gs(f.com)}</div></div></div>)}</div>}</div> })}</div></Card>}
    {!esDemo && sesion?.esPropietario && <Card>
      <h2 className="font-bold mb-1">Comisiones</h2>
      <p className="text-sm text-mute">Las reglas de comisión se administran desde Finanzas → Comisiones.</p>
      <Button type="button" variant="outline" className="mt-3" onClick={() => navigate('/finanzas/comisiones')}>Ir a Finanzas → Comisiones</Button>
    </Card>}
    </>

    {!esDemo && <Card>
      <h2 className="font-bold">Invitaciones</h2>
      {invitaciones.length > 0 ? (
        <div className="mt-4 space-y-2">{invitaciones.map(invite => {
          const [label, color] = INVITE_STATUS[invite.status] || [invite.status, 'slate']
          const canResend = invite.status === 'PENDING' && new Date(invite.resendAvailableAt) <= new Date()
          return <div key={invite.id} data-testid="invitacion-fila" className="flex flex-col gap-3 rounded-xl border border-ink-600 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <strong className="truncate text-[13px]">{invite.name || invite.email}</strong>
                <Badge color={color}>{label}</Badge>
                <Badge>{ROLE_LABELS[invite.role] || invite.role}</Badge>
              </div>
              <p className="mt-1 truncate text-xs text-mute">{invite.email}</p>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-mute">
                {invite.inviterName && <span>Invitó {invite.inviterName}</span>}
                <span>Creada {fechaCortaInv(invite.createdAt)}</span>
                {invite.status === 'EXPIRED' ? <span>Venció {fechaCortaInv(invite.expiresAt)}</span> : <span>Expira {fechaCortaInv(invite.expiresAt)}</span>}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {invite.status === 'PENDING' && <Button type="button" variant="outline" disabled={busy || !canResend} onClick={() => resend(invite)}>{canResend ? 'Reenviar' : 'Reenvío en espera'}</Button>}
              {invite.status === 'EXPIRED' && <Button type="button" variant="outline" disabled={busy} onClick={() => invitarDeNuevo(invite)}>Invitar de nuevo</Button>}
              {(invite.status === 'PENDING' || invite.status === 'EXPIRED') && <Button type="button" variant="ghost" disabled={busy} onClick={() => setConfirmarRevocar(invite)}>Revocar</Button>}
            </div>
          </div>
        })}</div>
      ) : (
        <p className="mt-3 text-sm text-mute">Todavía no hay invitaciones. Usá “+ Invitar persona” para sumar integrantes por correo.</p>
      )}
    </Card>}

    </PanelDerecho>
    <Modal open={permisosDe !== null} onClose={() => !permisosBusy && setPermisosDe(null)} title={`Permisos${permisosDe?.nombre ? ` · ${permisosDe.nombre}` : ''}`} className="max-w-lg">
      <div className="space-y-3">
        <p className="text-sm text-mute">El rol define el máximo; acá podés recortarlo. Lo que desmarques se rechaza también en el servidor, no solo en la pantalla.</p>
        {(catalogo?.byRole?.[permisosDe?.role] || []).length === 0 && <p className="rounded-lg border border-ink-600 px-3 py-2 text-xs text-mute">Este rol no tiene permisos recortables.</p>}
        <ul className="space-y-1.5">
          {(catalogo?.byRole?.[permisosDe?.role] || []).map(item => (
            <li key={item.id}>
              <label className="flex items-center gap-2 rounded-lg border border-ink-600/60 bg-ink-800/60 px-3 py-2 text-sm">
                <input type="checkbox" checked={permisosSel.includes(item.id)} onChange={() => setPermisosSel(sel => sel.includes(item.id) ? sel.filter(id => id !== item.id) : [...sel, item.id])} />
                <span>{item.label}</span>
              </label>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={guardarPermisos} disabled={permisosBusy}>{permisosBusy ? 'Guardando…' : 'Guardar permisos'}</Button>
          <Button type="button" variant="outline" onClick={() => setPermisosSel((catalogo?.byRole?.[permisosDe?.role] || []).map(item => item.id))}>Restaurar todo el rol</Button>
          <Button type="button" variant="ghost" disabled={permisosBusy} onClick={() => setPermisosDe(null)}>Cancelar</Button>
        </div>
      </div>
    </Modal>
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
    <Modal open={historialDe !== null} onClose={() => setHistorialDe(null)} title={`Historial de ${historialDe?.nombre || 'funcionario'}`}>
      {historialDe && <Cronologia endpoint={`/api/users/${historialDe.id}/history`} active={historialDe !== null} vacio="Sin actividad" descripcionVacio="El alta, los cambios de rol, sucursal o PIN, las comisiones y las ventas de este funcionario aparecerán acá." />}
    </Modal>

    <Modal open={pinDe !== null} onClose={() => !pinBusy && setPinDe(null)} title={`PIN de ${pinDe?.nombre || 'integrante'}`} className="max-w-md">
      <div className="space-y-4">
        <p className="text-sm text-mute">
          El PIN se guarda cifrado y <b className="text-fore">nunca se puede ver</b>. Asigná uno nuevo para esta persona
          (4 a 6 dígitos): puede entrar al POS con él. Tus credenciales de administración son la autenticación principal.
        </p>

        <div className="flex gap-1 rounded-xl border border-ink-600 bg-ink-800 p-1" role="tablist" aria-label="Forma de asignar el PIN">
          {[['generar', 'Generar aleatorio'], ['manual', 'Definir manual']].map(([clave, etiqueta]) => (
            <button
              key={clave}
              type="button"
              role="tab"
              aria-selected={pinModo === clave}
              onClick={() => { setPinModo(clave); setPinError('') }}
              className={cn('flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition', pinModo === clave ? 'bg-fono/15 text-fono-light' : 'text-mute hover:text-fore')}
            >
              {etiqueta}
            </button>
          ))}
        </div>

        {pinModo === 'generar' ? (
          pinGenerado ? (
            <div className="rounded-xl border border-ok/40 bg-ok/10 p-3">
              <p className="text-xs text-mute">Anotá este PIN ahora: no se vuelve a mostrar.</p>
              <div className="mt-2 flex items-center justify-between gap-3">
                <span data-testid="pin-generado" className="text-2xl font-bold tracking-[.3em]">{pinGenerado}</span>
                <Button type="button" variant="outline" onClick={copiarPin}>{pinCopiado ? 'Copiado' : 'Copiar'}</Button>
              </div>
            </div>
          ) : (
            <Button type="button" variant="outline" onClick={() => setPinGenerado(pinAleatorio())}>Generar PIN</Button>
          )
        ) : (
          <div className="grid gap-3">
            <div>
              <Label htmlFor="pin-staff">PIN (4 a 6 dígitos)</Label>
              <PinInput id="pin-staff" length={6} value={pinNuevo} onChange={next => { setPinNuevo(next); setPinError('') }} className="mt-2" />
            </div>
            <div>
              <Label htmlFor="pin-staff-confirm">Repetir PIN</Label>
              <PinInput id="pin-staff-confirm" length={6} value={pinConfirm} onChange={next => { setPinConfirm(next); setPinError('') }} className="mt-2" />
            </div>
          </div>
        )}

        {pinError && <p role="alert" className="rounded-lg border border-bad/30 bg-bad/10 p-3 text-sm text-bad">{pinError}</p>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" disabled={pinBusy} onClick={() => setPinDe(null)}>Cancelar</Button>
          <Button
            type="button"
            disabled={pinBusy || (pinModo === 'generar' ? !pinGenerado : pinNuevo.length < 4)}
            onClick={guardarPin}
          >
            {pinBusy ? 'Guardando…' : 'Asignar PIN'}
          </Button>
        </div>
      </div>
    </Modal>

    <ConfirmDialog open={Boolean(confirmarEliminar)} onCancel={() => setConfirmarEliminar(null)} onConfirm={eliminarUsuario} busy={busy} title={esDemo ? '¿Eliminar vendedor?' : '¿Desactivar integrante?'} description={esDemo ? `Se eliminará a ${confirmarEliminar?.nombre || 'este vendedor'}. Las ventas se conservan.` : `${confirmarEliminar?.nombre || 'Este integrante'} ya no podrá ingresar. Su historial se conserva y podés reactivarlo cuando quieras.`} confirmLabel={esDemo ? 'Eliminar vendedor' : 'Desactivar integrante'} variant="danger" />
    <ConfirmDialog open={Boolean(cambioRol)} onCancel={() => setCambioRol(null)} onConfirm={aplicarCambioRol} busy={busy} title="¿Cambiar el rol del integrante?" description={`${cambioRol?.usuario?.nombre || 'Este integrante'} pasará de ${ROLE_LABELS[cambioRol?.usuario?.role] || cambioRol?.usuario?.role || '—'} a ${ROLE_LABELS[cambioRol?.nextRole] || cambioRol?.nextRole}. El cambio queda auditado en su historial.`} confirmLabel="Cambiar rol" />
    <ConfirmDialog open={Boolean(confirmarRevocar)} onCancel={() => setConfirmarRevocar(null)} onConfirm={revokeInvitation} busy={busy} title="¿Revocar invitación?" description={`El enlace enviado a ${confirmarRevocar?.email || 'este correo'} dejará de funcionar.`} confirmLabel="Revocar invitación" variant="danger" />
  </div>
}

function Mini({ label, valor }) { return <div className="rounded-lg bg-ink-700 py-2 text-center"><div className="text-[10px] font-bold uppercase text-mute">{label}</div><div className="text-sm font-bold text-fono">{gs(valor)}</div></div> }
