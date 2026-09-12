import { useEffect, useState } from 'react'
import { useSesion } from '@/lib/sesion'
import { api } from '@/lib/api/client'
import { Button, Card, Badge, Input } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import PaymentAccounts from './PaymentAccounts'

function fmtDate(value) {
  return value ? new Date(value).toLocaleString('es-PY', { dateStyle: 'short', timeStyle: 'short' }) : '—'
}

export default function Config() {
  const { sesion, empresa, sucursal } = useSesion()
  const esDueno = sesion?.esPropietario
  const [account, setAccount] = useState(null)
  const [password, setPassword] = useState('')
  const [archiveReason, setArchiveReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [failure, setFailure] = useState('')

  const load = async () => {
    if (!esDueno) return
    setFailure('')
    try { setAccount(await api.get('/api/account')) } catch (error) { setFailure(error.message || 'No se pudo cargar la seguridad de la cuenta.') }
  }
  useEffect(() => { load() }, [esDueno])

  async function reauthenticate() {
    if (!password || busy) return
    setBusy(true); setFailure(''); setNotice('')
    try { const result = await api.post('/api/account', { password }); setPassword(''); setAccount(current => current ? { ...current, reauthValidUntil: result.validUntil } : current); setNotice('Contraseña verificada durante 10 minutos para acciones sensibles.') } catch (error) { setFailure(error.message || 'No se pudo reautenticar.') } finally { setBusy(false) }
  }
  async function revoke(sessionId) {
    if (busy || !window.confirm('¿Revocar esta sesión inmediatamente?')) return
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
    if (!window.confirm('La empresa se cerrará de forma recuperable y se revocarán todas las sesiones. ¿Continuar?')) return
    setBusy(true); setFailure(''); setNotice('')
    try { await api.patch('/api/account', { action: 'archive', reason: archiveReason.trim() }); window.location.assign('/login') } catch (error) { setFailure(error.message || 'No se pudo archivar la empresa.') } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      {esDueno && <PaymentAccounts />}
      <Card className="space-y-3"><div className="flex items-start gap-3"><div className="rounded-lg bg-fono/10 p-2 text-fono"><Icon name="user" className="h-5 w-5" /></div><div><h2 className="font-semibold">Sesión activa</h2><p className="mt-0.5 text-sm text-mute">{sesion?.correo || sesion?.nombre || 'Usuario de MobOS'}</p></div></div><div className="flex flex-wrap gap-2 text-sm"><Badge color="blue">{empresa?.nombre || 'Mi empresa'}</Badge>{sucursal?.nombre && <Badge color="slate">{sucursal.nombre}</Badge>}{sesion?.rol && <Badge color="slate">{sesion.rol}</Badge>}</div></Card>

      {esDueno && <>
        <Card className="space-y-3"><div><h2 className="font-semibold">Confirmar identidad</h2><p className="mt-1 text-sm text-mute">Pedimos tu contraseña antes de descargar datos, cerrar la empresa o revocar dispositivos. La autorización dura 10 minutos.</p></div><div className="flex flex-col gap-2 sm:flex-row"><Input aria-label="Contraseña para reautenticar" type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder="Contraseña de la empresa" /><Button onClick={reauthenticate} disabled={busy || !password}>Verificar contraseña</Button></div>{account?.reauthValidUntil && <p className="text-xs text-ok">Acciones sensibles habilitadas hasta {fmtDate(account.reauthValidUntil)}.</p>}</Card>

        <Card className="space-y-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="font-semibold">Sesiones activas</h2><p className="mt-1 text-sm text-mute">Cada dispositivo se puede cerrar de forma remota.</p></div><Button variant="outline" onClick={load} disabled={busy}>Actualizar</Button></div>{!account && !failure && <p className="text-sm text-mute">Cargando sesiones…</p>}{account?.sessions?.length === 0 && <p className="text-sm text-mute">No hay sesiones activas.</p>}<div className="space-y-2">{account?.sessions?.map(active => <div key={active.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-600 p-3"><div><p className="font-medium">{active.user?.name || 'Acceso de empresa'} {active.id === account.currentSessionId && <span className="ml-2 text-xs text-fono-light">Este dispositivo</span>}</p><p className="mt-1 text-xs text-mute">{active.user?.role || active.level} · {active.deviceId || 'Dispositivo no identificado'} · última actividad {fmtDate(active.lastSeenAt)}</p></div><Button variant="outline" onClick={() => revoke(active.id)} disabled={busy}>Revocar</Button></div>)}</div></Card>

        <Card className="space-y-3"><div><h2 className="font-semibold">Exportación básica</h2><p className="mt-1 text-sm text-mute">Descarga JSON de empresa, sucursales, equipo, clientes, productos, órdenes y pagos. Excluye credenciales, tokens, PIN y archivos de comprobantes.</p></div><Button variant="outline" onClick={exportData} disabled={busy}>Descargar mis datos</Button></Card>

        <Card className="space-y-3 border-bad/30"><div><h2 className="font-semibold text-bad">Archivar empresa</h2><p className="mt-1 text-sm text-mute">No borra ventas ni historial. Cierra sesiones y bloquea el acceso por contraseña hasta restaurarla con correo, contraseña y la confirmación RESTORE.</p></div><Input aria-label="Motivo de archivado" value={archiveReason} onChange={event => setArchiveReason(event.target.value)} placeholder="Motivo del archivado (mínimo 10 caracteres)" /><Button variant="outline" onClick={archive} disabled={busy || archiveReason.trim().length < 10} className="border-bad/50 text-bad hover:bg-bad/10">Archivar empresa</Button></Card>
        {failure && <p role="alert" className="rounded-xl border border-bad/30 bg-bad/10 p-3 text-sm text-bad">{failure}</p>}{notice && <p role="status" className="rounded-xl border border-ok/30 bg-ok/10 p-3 text-sm text-ok">{notice}</p>}
      </>}
      {esDueno && <Card className="space-y-2"><h2 className="font-semibold">Equipo y sucursales</h2><p className="text-sm text-mute">La gestión de usuarios, PIN, roles, horarios y sucursales usa la API propia de MobOS. No hay datos ni accesos alternativos en el navegador.</p></Card>}
    </div>
  )
}
