import { useCallback, useEffect, useState } from 'react'
import { useSesion } from '@/lib/sesion'
import { api } from '@/lib/api/client'
import PhotoCropper from '@/components/shared/PhotoCropper'
import AttachmentInput from '@/components/shared/AttachmentInput'
import { getLogoDataUrl, olvidarLogo } from '@/lib/tenantLogo'
import { getAvatarDataUrl, olvidarAvatar } from '@/lib/userAvatar'
import { promptLogo } from '@/lib/logoPrompt'
import { getCompanyContext, sessionApi } from '@/lib/api/session'
import { comprimirImagen } from '@/utils/imagen'
import { Button, Card, Badge, ConfirmDialog, Eyebrow, FormField, Input, Label, Modal, MoneyInput, PasswordInput, PinInput, Toggle, useToast } from '@/components/ui'
import { formatGs } from '@/utils/moneda'
import Icon from '@/components/shared/Icon'
import EmailField from '@/components/shared/EmailField'
import CityAutocomplete from '@/components/shared/CityAutocomplete'
import PhoneField, { parseTelefono, componerTelefono } from '@/components/shared/PhoneField'
import RucField from '@/components/shared/RucField'
import PercentField, { parsePercent } from '@/components/shared/PercentField'
import InstagramField, { normalizarInstagram } from '@/components/shared/InstagramField'
import PanelDerecho from '@/components/shared/PanelDerecho'
import Avatar from '@/components/shared/Avatar'
import UsoEquipo from '@/components/control/UsoEquipo'
import DatosPrivados from '@/components/control/DatosPrivados'
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



export default function Config({ seccion = 'negocio' } = {}) {
  const { sesion, empresa, sucursal, perfilEmpresa, actualizarEmpresa } = useSesion()
  const toast = useToast()
  const esDueno = sesion?.esPropietario
  const [account, setAccount] = useState(null)
  const [logos, setLogos] = useState({ light: '', dark: '' })
  const [logoError, setLogoError] = useState('')
  const [logoBusy, setLogoBusy] = useState(false)
  const [prefijo, setPrefijo] = useState('')
  const [inicio, setInicio] = useState('')
  const [limiteGasto, setLimiteGasto] = useState('')
  const [limiteCompra, setLimiteCompra] = useState('')
  const [limiteBajoLista, setLimiteBajoLista] = useState('')
  const [limiteFidelizacion, setLimiteFidelizacion] = useState('')
  const [limiteMora, setLimiteMora] = useState('')
  const [seguroPct, setSeguroPct] = useState('')
  const [password, setPassword] = useState('')
  const [archiveReason, setArchiveReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [failure, setFailure] = useState('')
  const [confirmar, setConfirmar] = useState(null)
  const [cerrarCuentaAbierto, setCerrarCuentaAbierto] = useState(false)
  const [eliminarAbierto, setEliminarAbierto] = useState(false)

  const load = useCallback(async () => {
    if (!esDueno) return
    setFailure('')
    try { setAccount(await api.get('/api/account')) } catch (error) { setFailure(error.message || 'No se pudo cargar la seguridad de la cuenta.') }
  }, [esDueno])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!account?.tenant?.logo?.updatedAt) { setLogos({ light: '', dark: '' }); return }
    let vigente = true
    Promise.all([getLogoDataUrl('light'), getLogoDataUrl('dark')]).then(([light, dark]) => { if (vigente) setLogos({ light, dark }) })
    return () => { vigente = false }
  }, [account?.tenant?.logo?.updatedAt])

  async function subirLogo(file, variant = 'light') {
    if (logoBusy) return
    setLogoBusy(true); setLogoError('')
    try {
      const form = new FormData()
      form.append('logo', await comprimirImagen(file, { maxLado: 1200 }))
      form.append('variant', variant)
      await api.post('/api/tenant/logo', form)
      olvidarLogo(variant)
      const data = await getLogoDataUrl(variant)
      setLogos((actuales) => ({ ...actuales, [variant]: data }))
      setAccount(await api.get('/api/account'))
    } catch (cause) { setLogoError(cause?.message || 'No se pudo guardar el logo.') } finally { setLogoBusy(false) }
  }

  async function copiarPrompt() {
    try {
      await navigator.clipboard.writeText(promptLogo(account?.tenant?.name || 'mi empresa'))
      toast.success('Prompt copiado', 'Pegalo en tu ChatGPT para generar las dos versiones del logo.')
    } catch { toast.error('No se pudo copiar el prompt') }
  }

  async function quitarLogo(variant = 'light') {
    if (logoBusy) return
    setLogoBusy(true); setLogoError('')
    try {
      await api.delete(`/api/tenant/logo?variant=${encodeURIComponent(variant)}`)
      olvidarLogo(variant)
      setLogos((actuales) => ({ ...actuales, [variant]: '' }))
      setAccount(await api.get('/api/account'))
    } catch (cause) { setLogoError(cause?.message || 'No se pudo quitar el logo.') } finally { setLogoBusy(false) }
  }

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
  async function cerrarCuenta({ password }) {
    if (busy) return
    setBusy(true); setFailure('')
    try {
      await api.patch('/api/account', { action: 'closeAccount', confirm: 'CERRAR', password })
      await sessionApi.logout().catch(() => {})
      window.location.assign('/login')
    } catch (error) { setFailure(error.message || 'No se pudo cerrar la cuenta.') } finally { setBusy(false) }
  }

  async function eliminarEmpresa({ password }) {
    if (busy) return
    setBusy(true); setFailure('')
    try {
      await api.patch('/api/account', { action: 'purgeStore', confirm: 'ELIMINAR', password })
      await sessionApi.logout().catch(() => {})
      window.location.assign('/login')
    } catch (error) { setFailure(error.message || 'No se pudo eliminar la empresa.') } finally { setBusy(false) }
  }

  async function archive() {
    if (busy || archiveReason.trim().length < 10) { setFailure('Explicá el motivo del archivado en al menos 10 caracteres.'); return }
    setBusy(true); setFailure(''); setNotice('')
    try { await api.patch('/api/account', { action: 'archive', reason: archiveReason.trim() }); window.location.assign('/login') } catch (error) { setFailure(error.message || 'No se pudo archivar la empresa.') } finally { setBusy(false) }
  }

  useEffect(() => {
    if (!account?.tenant) return
    setPrefijo(account.tenant.orderPrefix || '')
    setInicio(account.tenant.orderNextNumber ? String(account.tenant.orderNextNumber) : '')
    setLimiteGasto(String(account.tenant.expenseLimitPyg ?? 1000000))
    setLimiteCompra(String(account.tenant.purchaseCreditLimitPyg ?? 5000000))
    setLimiteBajoLista(String(account.tenant.belowListPct ?? 10))
    setLimiteFidelizacion(String(account.tenant.loyaltyPct ?? 0))
    setLimiteMora(account.tenant.collectionLateFeeBpPerDay ? String(account.tenant.collectionLateFeeBpPerDay / 100).replace('.', ',') : '')
    setSeguroPct(account.tenant.insurancePct ? String(account.tenant.insurancePct) : '')
  }, [account])

  // Seguro de ventas de la empresa (#162): % sobre el costo que se suma al
  // costo real de cada venta nueva y afecta el margen.
  async function guardarSeguro() {
    if (busy) return
    setBusy(true); setFailure(''); setNotice('')
    try {
      const data = await api.patch('/api/account', { action: 'updateLimits', insurancePct: seguroPct.trim() === '' ? null : Number(seguroPct) })
      setAccount(current => current ? { ...current, tenant: { ...current.tenant, insurancePct: data.insurancePct ?? null } } : current)
      setNotice('Seguro de ventas guardado.')
    } catch (error) { setFailure(error?.message || 'No se pudo guardar el seguro.') } finally { setBusy(false) }
  }

  async function guardarNumeracion() {
    if (busy) return
    setBusy(true); setFailure(''); setNotice('')
    try {
      const data = await api.patch('/api/account', { action: 'orderNumbering', prefix: prefijo, start: Number(inicio) })
      setAccount(current => current ? { ...current, tenant: { ...current.tenant, orderPrefix: data.prefix, orderNextNumber: data.nextNumber } } : current)
      setNotice(`Numeración guardada: ${data.preview}.`)
    } catch (error) { setFailure(error?.message || 'No se pudo guardar la numeración.') } finally { setBusy(false) }
  }

  async function guardarLimites() {
    if (busy) return
    const gasto = Number(limiteGasto)
    const compra = Number(limiteCompra)
    const bajoLista = parsePercent(limiteBajoLista)
    const fidelizacion = parsePercent(limiteFidelizacion)
    if (!Number.isSafeInteger(gasto) || gasto < 0 || !Number.isSafeInteger(compra) || compra < 0) { setFailure('Los límites deben ser enteros no negativos.'); return }
    if (!Number.isSafeInteger(bajoLista) || bajoLista < 0 || bajoLista > 100) { setFailure('El porcentaje bajo lista debe ser un entero entre 0 y 100.'); return }
    if (!Number.isSafeInteger(fidelizacion) || fidelizacion < 0 || fidelizacion > 100) { setFailure('El porcentaje de fidelización debe ser un entero entre 0 y 100.'); return }
    const mora = limiteMora.trim() === '' ? null : Number(limiteMora.replace(',', '.'))
    if (mora !== null && (!Number.isFinite(mora) || mora < 0 || mora > 100)) { setFailure('El recargo por mora debe ser un porcentaje entre 0 y 100.'); return }
    setBusy(true); setFailure(''); setNotice('')
    try {
      await api.patch('/api/account', { action: 'updateLimits', expenseLimitPyg: gasto, purchaseCreditLimitPyg: compra, belowListPct: bajoLista, loyaltyPct: fidelizacion, collectionLateFeeBpPerDay: limiteMora.trim() })
      const moraBp = mora === null || mora === 0 ? null : Math.round(mora * 100)
      setAccount(current => current ? { ...current, tenant: { ...current.tenant, expenseLimitPyg: gasto, purchaseCreditLimitPyg: compra, belowListPct: bajoLista, loyaltyPct: fidelizacion, collectionLateFeeBpPerDay: moraBp } } : current)
      actualizarEmpresa?.({ expenseLimitPyg: gasto, purchaseCreditLimitPyg: compra, belowListPct: bajoLista, loyaltyPct: fidelizacion })
      setNotice('Límites de autorización guardados.')
    } catch (error) { setFailure(error?.message || 'No se pudieron guardar los límites.') } finally { setBusy(false) }
  }
  return (
    <div className="space-y-4">
      {failure && <p role="alert" className="rounded-xl border border-bad/30 bg-bad/10 p-3 text-sm text-bad">{failure}</p>}{notice && <p role="status" className="rounded-xl border border-ok/30 bg-ok/10 p-3 text-sm text-ok">{notice}</p>}
      {seccion === 'negocio' && <>
      <Card className="space-y-3">
        <div>
          <h2 className="font-semibold">Identificador de pedidos</h2>
          <p className="mt-1 text-sm text-mute">Formato visible de los pedidos: prefijo de 2 o 3 letras y número inicial. Ejemplo: <b className="text-fore">{prefijo || 'MOB'} #{inicio || '310840'}</b>.</p>
          <p className="mt-1 text-xs text-mute">Ahora está configurado así: <b className="text-fono-light tabular-nums">{account?.tenant?.orderPrefix || 'MOB'}-#{String(account?.tenant?.orderNextNumber || 1).padStart(4, '0')}</b> (el próximo pedido sale con ese número; el prefijo solo admite 2 o 3 letras, así que el <b className="text-fore">#</b> no puede duplicarse).</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="block w-24 space-y-1 text-xs text-mute"><span>Prefijo</span><Input aria-label="Prefijo de pedidos" maxLength={3} disabled={busy} value={prefijo} onChange={event => setPrefijo(event.target.value.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 3))} placeholder="MOB" /></label>
          <label className="block w-32 space-y-1 text-xs text-mute"><span>Número inicial</span><Input aria-label="Número inicial de pedidos" inputMode="numeric" disabled={busy} value={inicio} onChange={event => setInicio(event.target.value.replace(/\D/g, '').slice(0, 8))} placeholder="310840" /></label>
          <Button type="button" disabled={busy || !/^[A-Z]{2,3}$/.test(prefijo) || !Number(inicio)} onClick={guardarNumeracion}>Guardar numeración</Button>
        </div>
        <p className="text-xs text-mute">Los pedidos ya creados conservan su número; los nuevos siguen esta secuencia.</p>
      </Card>
        {esDueno && <Card className="space-y-3">
          <div>
            <h2 className="font-semibold">Límites de autorización</h2>
            <p className="mt-1 text-sm text-mute">Por encima de estos montos, los roles operativos (cajera, vendedor) necesitan una autorización aprobada de gerencia para registrar un gasto o una compra a crédito. La venta bajo lista hasta el porcentaje indicado no pide autorización; más abajo, sí. El dueño y gerencia no la necesitan. La fidelización acredita al cliente, por cada venta, el porcentaje indicado del total como puntos canjeables por saldo a favor (1 punto = 1 Gs.); 0 la apaga.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Gasto sin autorización (Gs.)" htmlFor="limite-gasto">
              <MoneyInput id="limite-gasto" disabled={busy} value={limiteGasto} onValueChange={setLimiteGasto} placeholder="1.000.000" />
            </FormField>
            <FormField label="Compra a crédito sin autorización (Gs.)" htmlFor="limite-compra">
              <MoneyInput id="limite-compra" disabled={busy} value={limiteCompra} onValueChange={setLimiteCompra} placeholder="5.000.000" />
            </FormField>
            <FormField label="Bajo lista sin autorización (%)" htmlFor="limite-bajo-lista">
              <PercentField id="limite-bajo-lista" max={100} disabled={busy} value={limiteBajoLista} onChange={setLimiteBajoLista} placeholder="10" />
            </FormField>
            <FormField label="Fidelización: puntos por venta (%)" hint="Porcentaje del total de cada venta que queda como puntos canjeables (1 punto = 1 Gs.). 0 la apaga." htmlFor="limite-fidelizacion">
              <PercentField id="limite-fidelizacion" max={100} disabled={busy} value={limiteFidelizacion} onChange={setLimiteFidelizacion} placeholder="0" />
            </FormField>
            <FormField label="Recargo por mora (% diario)" htmlFor="limite-mora" hint="Vacío o 0 = sin recargo; solo se informan los días de atraso en Cobranzas.">
              <PercentField id="limite-mora" disabled={busy} value={limiteMora} onChange={setLimiteMora} placeholder="0,5" />
            </FormField>
          </div>
          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-ink-600/70 bg-ink-800/30 p-3">
            <span className="flex items-center gap-2 text-sm"><Toggle id="seguro-toggle" checked={seguroPct.trim() !== '' && Number(seguroPct) > 0} onChange={(on) => setSeguroPct(on ? (seguroPct && Number(seguroPct) > 0 ? seguroPct : '25') : '')} label="Aplica seguro" /><span>Seguro de ventas</span></span>
            <FormField label="Porcentaje sobre el costo (%)" htmlFor="seguro-pct" hint="Costo real = costo + seguro. Ej.: costo 100.000 y 25% → 125.000; el margen baja en 25.000.">
              <PercentField id="seguro-pct" max={100} disabled={busy || seguroPct.trim() === ''} value={seguroPct} onChange={setSeguroPct} placeholder="25" />
            </FormField>
            <Button type="button" variant="outline" disabled={busy} onClick={guardarSeguro}>Guardar seguro</Button>
            <p className="text-xs text-mute">Se aplica a las ventas nuevas; el producto o la categoría pueden tener su propio porcentaje.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" disabled={busy || !limiteGasto || !limiteCompra || limiteBajoLista === '' || limiteFidelizacion === ''} onClick={guardarLimites}>Guardar límites</Button>
            <p className="text-xs text-mute">Actual: gasto {formatGs(account?.tenant?.expenseLimitPyg ?? 1000000)} · compra a crédito {formatGs(account?.tenant?.purchaseCreditLimitPyg ?? 5000000)} · bajo lista {account?.tenant?.belowListPct ?? 10}% · fidelización {account?.tenant?.loyaltyPct ?? 0}% · mora {account?.tenant?.collectionLateFeeBpPerDay ? `${account.tenant.collectionLateFeeBpPerDay / 100}% diario` : 'sin recargo'}.</p>
          </div>
        </Card>}
        {esDueno && <Card className="space-y-3">
          <div>
            <h2 className="font-semibold">Logo de la empresa</h2>
            <p className="mt-1 text-sm text-mute">Se muestra en el encabezado de los comprobantes. Recomendado: PNG con <b className="text-fore">fondo transparente</b>, 1024×1024 px (1600×600 si es horizontal) y hasta 1 MiB. Para modo claro y oscuro conviene el <b className="text-fore">logo oscuro</b> en fondo claro y el <b className="text-fore">logo claro</b> en fondo oscuro.</p>
            <Button type="button" variant="ghost" className="mt-1 h-auto px-0 py-1 text-xs text-fono-light" onClick={copiarPrompt}><Icon name="copy" className="h-3.5 w-3.5" />Copiar prompt para generar el logo</Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[['light', 'Modo claro', 'Logo oscuro, para fondos claros'], ['dark', 'Modo oscuro', 'Logo claro, para fondos oscuros']].map(([variant, titulo, ayuda]) => (
              <div key={variant} className="rounded-xl border border-ink-600 p-3">
                <p className="text-sm font-medium">{titulo}</p>
                <p className="mt-0.5 text-xs text-mute">{ayuda}</p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <div className="flex gap-2">
                    {[['Fondo claro', 'bg-white'], ['Fondo oscuro', 'bg-ink-950']].map(([etiqueta, fondo]) => (
                      <div key={etiqueta} className="text-center">
                        <div className={`grid h-14 w-20 place-items-center overflow-hidden rounded-lg border border-ink-600 ${fondo}`}>
                          {logos[variant] ? <img src={logos[variant]} alt={`${titulo} sobre ${etiqueta.toLowerCase()}`} className="max-h-12 max-w-16 object-contain" /> : <span className="text-[10px] text-mute">—</span>}
                        </div>
                        <span className="mt-0.5 block text-[10px] text-mute">{etiqueta}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <AttachmentInput onSelect={(file) => subirLogo(file, variant)} onError={setLogoError} accept="image/png,image/jpeg,image/webp" maxBytes={1024 * 1024} disabled={logoBusy}>
                      <Button type="button" variant="outline" disabled={logoBusy}>{logos[variant] ? 'Reemplazar' : 'Subir logo'}</Button>
                    </AttachmentInput>
                    {logos[variant] && <Button type="button" variant="ghost" disabled={logoBusy} onClick={() => quitarLogo(variant)}>Quitar</Button>}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {logoError && <p role="alert" className="text-sm text-bad">{logoError}</p>}
        </Card>}
        {esDueno && <DatosPrivados />}
        <SeccionTiendas account={account} />
        <SeccionInvitaciones />
        <IdentidadCuenta tenant={account?.tenant} reauthValidUntil={account?.reauthValidUntil} onReauthValid={(validUntil) => setAccount(current => current ? { ...current, reauthValidUntil: validUntil } : current)} />
      </>}
      {seccion === 'sucursales' && <>
        {esDueno && <SeccionSucursales />}
        <SeccionTiendas account={account} />
      </>}
      {seccion === 'seguridad' && <>
      <Card className="space-y-3"><div className="flex items-start gap-3">{perfilEmpresa?.picture ? <img src={perfilEmpresa.picture} referrerPolicy="no-referrer" alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" /> : <div className="rounded-lg bg-fono/10 p-2 text-fono"><Icon name="user" className="h-5 w-5" /></div>}<div className="min-w-0"><h2 className="font-semibold">Sesión activa</h2><p className="mt-0.5 truncate text-sm text-mute">{perfilEmpresa?.name || sesion?.correo || sesion?.nombre || 'Usuario de MobOS'}</p></div></div><div className="flex flex-wrap gap-2 text-sm"><Badge color="blue">{empresa?.nombre || 'Mi empresa'}</Badge>{sucursal?.nombre && <Badge color="slate">{sucursal.nombre}</Badge>}{sesion?.rol && <Badge color="slate">{sesion.rol}</Badge>}</div></Card>
        <Card className="space-y-3"><div><h2 className="font-semibold">Confirmar identidad</h2><p className="mt-1 text-sm text-mute">Pedimos tu contraseña antes de descargar datos, cerrar la empresa o revocar dispositivos. La autorización dura 10 minutos.</p></div><div className="flex flex-col gap-2 sm:flex-row"><PasswordInput aria-label="Contraseña para reautenticar" value={password} onChange={event => setPassword(event.target.value)} placeholder="Contraseña de la empresa" className="min-w-0 flex-1" /><Button onClick={reauthenticate} disabled={busy || !password}>Verificar contraseña</Button></div>{account?.reauthValidUntil && <p className="text-xs text-ok">Acciones sensibles habilitadas hasta {fmtDate(account.reauthValidUntil)}.</p>}</Card>

        <Card className="space-y-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="font-semibold">Sesiones activas</h2><p className="mt-1 text-sm text-mute">Cada dispositivo se puede cerrar de forma remota.</p></div><span className="flex flex-wrap items-center gap-2"><Button variant="outline" onClick={load} disabled={busy}>Actualizar</Button><Button variant="outline" className="border-bad/50 text-bad hover:bg-bad/10" onClick={() => { setFailure(''); setCerrarCuentaAbierto(true) }} disabled={busy}>Cerrar mi cuenta</Button></span></div>{!account && !failure && <p className="text-sm text-mute">Cargando sesiones…</p>}{account?.sessions?.length === 0 && <p className="text-sm text-mute">No hay sesiones activas.</p>}<div className="space-y-2">{account?.sessions?.map(active => <div key={active.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-600 p-3"><div><p className="font-medium">{active.user?.name || 'Acceso de empresa'} {active.id === account.currentSessionId && <span className="ml-2 text-xs text-fono-light">Este dispositivo</span>}</p><p className="mt-1 text-xs text-mute">{active.user?.role || active.level} · {active.deviceId || 'Dispositivo no identificado'} · última actividad {fmtDate(active.lastSeenAt)}</p></div><Button variant="outline" onClick={() => setConfirmar({ tipo: 'revocar', sessionId: active.id })} disabled={busy}>Revocar</Button></div>)}</div></Card>

        {esDueno && <UsoEquipo />}
        <Card className="space-y-3"><div><h2 className="font-semibold">Exportación básica</h2><p className="mt-1 text-sm text-mute">Descarga JSON de empresa, sucursales, equipo, clientes, productos, órdenes y pagos. Excluye credenciales, tokens, PIN y archivos de comprobantes.</p></div><Button variant="outline" onClick={exportData} disabled={busy}>Descargar mis datos</Button></Card>

        <Card className="space-y-3 border-bad/30"><div><h2 className="font-semibold text-bad">Archivar empresa</h2><p className="mt-1 text-sm text-mute">No borra ventas ni historial. Cierra sesiones y bloquea el acceso hasta restaurarla con correo, contraseña y la confirmación RESTORE, durante los 30 días posteriores al archivado.</p></div><Input aria-label="Motivo de archivado" value={archiveReason} onChange={event => setArchiveReason(event.target.value)} placeholder="Motivo del archivado (mínimo 10 caracteres)" /><Button variant="outline" onClick={() => setConfirmar({ tipo: 'archivar' })} disabled={busy || archiveReason.trim().length < 10 || !account?.reauthValidUntil} className="border-bad/50 text-bad hover:bg-bad/10">Archivar empresa</Button></Card>

        {esDueno && <Card className="space-y-3 border-bad/30"><div><h2 className="font-semibold text-bad">Eliminar empresa definitivamente</h2><p className="mt-1 text-sm text-mute">Borra la empresa y todo su historial: ventas, clientes, pagos, stock, integrantes y auditoría. No se puede deshacer ni recuperar. Si solo querés dejar de usarla por un tiempo, usá <b className="text-fore">Archivar empresa</b>: se conserva todo y podés restaurarla.</p></div><Button variant="outline" onClick={() => { setFailure(''); setEliminarAbierto(true) }} disabled={busy || !account?.reauthValidUntil} className="border-bad/50 text-bad hover:bg-bad/10">Eliminar empresa</Button></Card>}
        {esDueno && !account?.reauthValidUntil && <p className="text-xs text-mute">Confirmá tu identidad arriba para habilitar el archivado y la eliminación de la empresa.</p>}
      </>}
      <DialogoDestructivo
        open={cerrarCuentaAbierto}
        title="¿Cerrar tu cuenta?"
        description="Dejarás de entrar a MobOS: se revocan tus sesiones y se desactiva tu usuario, pero la historia de cada tienda se conserva. Cada tienda necesita otro administrador activo. Para confirmar, escribí tu contraseña de empresa y la palabra CERRAR."
        palabra="CERRAR"
        necesitaClave
        confirmLabel="Cerrar mi cuenta"
        busy={busy}
        error={failure}
        onCancel={() => !busy && setCerrarCuentaAbierto(false)}
        onConfirm={cerrarCuenta}
      />
      <ConfirmDialog open={Boolean(confirmar)} onCancel={() => setConfirmar(null)} onConfirm={async () => { const actual = confirmar; setConfirmar(null); if (actual?.tipo === 'revocar') await revoke(actual.sessionId); if (actual?.tipo === 'archivar') await archive() }} title={confirmar?.tipo === 'archivar' ? '¿Archivar esta empresa?' : '¿Revocar esta sesión?'} description={confirmar?.tipo === 'archivar' ? 'La empresa quedará cerrada de forma recuperable durante 30 días y se revocarán todas las sesiones activas. Las ventas y el historial se conservan; podés restaurarla con la confirmación RESTORE.' : 'El dispositivo perderá acceso inmediatamente y deberá iniciar sesión de nuevo.'} confirmLabel={confirmar?.tipo === 'archivar' ? 'Archivar empresa' : 'Revocar sesión'} variant="danger" />
      <DialogoDestructivo
        open={eliminarAbierto}
        title="¿Eliminar la empresa para siempre?"
        description="Se borran la empresa y todo su historial: ventas, clientes, pagos, stock, integrantes y auditoría. Esta acción es irreversible y no tiene ventana de recuperación. Para confirmar, escribí tu contraseña de empresa y la palabra ELIMINAR."
        palabra="ELIMINAR"
        necesitaClave
        confirmLabel="Eliminar empresa"
        busy={busy}
        error={failure}
        onCancel={() => !busy && setEliminarAbierto(false)}
        onConfirm={eliminarEmpresa}
      />
    </div>
  )
}

function IdentidadCuenta({ reauthValidUntil, onReauthValid, tenant }) {
  const toast = useToast()
  const { empresa, actualizarEmpresa, usuario } = useSesion()
  const [foto, setFoto] = useState('')
  const [fotoError, setFotoError] = useState('')
  const [fotoBusy, setFotoBusy] = useState(false)
  const [fotoAConfirmar, setFotoAConfirmar] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const formulario = () => ({
    name: empresa?.nombre || '',
    email: empresa?.email || '',
    password: '',
    address: tenant?.address || '',
    city: tenant?.city || '',
    department: tenant?.department || '',
    countryCode: parseTelefono(tenant?.phone).countryCode,
    phone: parseTelefono(tenant?.phone).phone,
    ruc: tenant?.ruc || '',
  })
  const [form, setForm] = useState(formulario)
  const valores = [
    { etiqueta: 'Nombre de la tienda', valor: empresa?.nombre || null },
    { etiqueta: 'Correo de la empresa', valor: empresa?.email || null },
    { etiqueta: 'Dirección', valor: tenant?.address || null },
    { etiqueta: 'Ciudad', valor: [tenant?.city, tenant?.department].filter(Boolean).join(' · ') || null },
    { etiqueta: 'Teléfono', valor: tenant?.phone || null },
    { etiqueta: 'RUC', valor: tenant?.ruc || null },
    { etiqueta: 'ID de la tienda', valor: empresa?.id || null },
  ]
  const reauthVigente = Boolean(reauthValidUntil && new Date(reauthValidUntil) > new Date())
  useEffect(() => {
    if (!usuario?.id) return
    let vigente = true
    getAvatarDataUrl(usuario.id).then(data => { if (vigente) setFoto(data) })
    return () => { vigente = false }
  }, [usuario?.id])
  // Los datos del panel siguen a la ficha (carga inicial y tras guardar) sin
  // pisar lo que la persona está escribiendo: solo se rellenan cuando cambian
  // los valores guardados.
  useEffect(() => {
    setForm(formulario())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant?.id, tenant?.address, tenant?.city, tenant?.department, tenant?.phone, tenant?.ruc, empresa?.nombre, empresa?.email])

  async function subirFoto(file) {
    if (fotoBusy || !usuario?.id) return
    setFotoBusy(true); setFotoError('')
    try {
      const form = new FormData()
      form.append('avatar', file)
      await api.post(`/api/users/${encodeURIComponent(usuario.id)}/avatar`, form)
      olvidarAvatar(usuario.id)
      setFoto(await getAvatarDataUrl(usuario.id))
      toast.success('Foto actualizada.')
    } catch (cause) { setFotoError(cause?.message || 'No se pudo guardar la foto.') } finally { setFotoBusy(false) }
  }

  async function quitarFoto() {
    if (fotoBusy || !usuario?.id) return
    setFotoBusy(true); setFotoError('')
    try {
      await api.delete(`/api/users/${encodeURIComponent(usuario.id)}/avatar`)
      olvidarAvatar(usuario.id)
      setFoto('')
    } catch (cause) { setFotoError(cause?.message || 'No se pudo quitar la foto.') } finally { setFotoBusy(false) }
  }

  function irAlFormulario() {
    document.getElementById('cuenta-form')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }

  function restablecer() {
    setForm(formulario())
    setError('')
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
    const perfil = {
      address: (form?.address || '').trim(),
      city: (form?.city || '').trim(),
      department: (form?.department || '').trim(),
      phone: componerTelefono(form?.countryCode, form?.phone),
      ruc: (form?.ruc || '').trim(),
    }
    if (perfil.address !== (tenant?.address || '')) cambios.address = perfil.address
    if (perfil.city !== (tenant?.city || '')) cambios.city = perfil.city
    if (perfil.department !== (tenant?.department || '')) cambios.department = perfil.department
    if (perfil.phone !== (tenant?.phone || '')) cambios.phone = perfil.phone
    if (perfil.ruc !== (tenant?.ruc || '')) cambios.ruc = perfil.ruc
    setBusy(true); setError('')
    try {
      if (!reauthVigente) {
        const auth = await api.post('/api/account', { password: form.password })
        onReauthValid?.(auth.validUntil)
      }
      if (Object.keys(cambios).length) await api.patch('/api/account', { action: 'updateProfile', ...cambios })
      actualizarEmpresa?.(cambios)
      setForm(formulario())
      toast.success('Datos de la tienda actualizados.')
    } catch (cause) { setError(cause?.message || 'No se pudieron actualizar los datos de la tienda.') } finally { setBusy(false) }
  }
  return (
    <PanelDerecho
      id="cuenta-form"
      panel={
        <Card className="space-y-3">
          <div>
            <h2 className="font-semibold">Datos de la tienda</h2>
            <p className="mt-1 text-sm text-mute">Se usan en comprobantes, portal y reportes.</p>
          </div>
          <form onSubmit={guardar} className="space-y-3">
            <FormField label="Nombre de la tienda" htmlFor="edit-nombre">
              <Input id="edit-nombre" disabled={busy} value={form?.name || ''} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} placeholder="Nombre de la tienda" />
            </FormField>
            <FormField label="Correo de la empresa" htmlFor="edit-correo">
              <EmailField id="edit-correo" disabled={busy} value={form?.email || ''} onChange={value => setForm(current => ({ ...current, email: value }))} placeholder="Correo de la empresa" />
            </FormField>
            <FormField label="Dirección" htmlFor="edit-direccion">
              <Input id="edit-direccion" maxLength={400} disabled={busy} value={form?.address || ''} onChange={event => setForm(current => ({ ...current, address: event.target.value }))} placeholder="Dirección del negocio (para el comprobante)" />
            </FormField>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Ciudad" hint={form?.department ? `Departamento: ${form.department}` : undefined}>
                <CityAutocomplete disabled={busy} value={form?.city || ''} onSelect={(city, department) => setForm(current => ({ ...current, city, department }))} placeholder="Ciudad del negocio" />
              </FormField>
              <FormField label="Teléfono">
                <PhoneField disabled={busy} countryCode={form?.countryCode || '+595'} phone={form?.phone || ''} onCountryCodeChange={countryCode => setForm(current => ({ ...current, countryCode }))} onChange={phone => setForm(current => ({ ...current, phone }))} placeholder="Teléfono del negocio" />
              </FormField>
            </div>
            <FormField label="RUC" htmlFor="edit-ruc">
              <RucField id="edit-ruc" value={form?.ruc || ''} onChange={ruc => setForm(current => ({ ...current, ruc }))} disabled={busy} placeholder="RUC del negocio (opcional)" autoComplete="off" />
            </FormField>
            {reauthVigente ? (
              <p className="text-xs text-ok">Tu contraseña fue verificada hace menos de 10 minutos: no hace falta escribirla de nuevo.</p>
            ) : (
              <FormField label="Contraseña de la empresa" htmlFor="edit-password">
                <PasswordInput id="edit-password" autoComplete="current-password" disabled={busy} value={form?.password || ''} onChange={event => setForm(current => ({ ...current, password: event.target.value }))} placeholder="Para confirmar el cambio" />
              </FormField>
            )}
            {error && <p role="alert" className="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="ghost" disabled={busy} onClick={restablecer}>Restablecer</Button>
              <Button type="submit" disabled={busy || !form?.name?.trim() || !form?.email?.trim()}>{busy ? 'Guardando…' : 'Guardar cambios'}</Button>
            </div>
          </form>
        </Card>
      }
    >
      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <Eyebrow>Identidad de la cuenta</Eyebrow>
            <p className="mt-1 text-sm text-mute">Los datos que identifican tu tienda ante MobOS.</p>
          </div>
          <Button type="button" variant="outline" className="lg:hidden" onClick={irAlFormulario}><Icon name="edit" className="h-3.5 w-3.5" />Editar</Button>
        </div>
        {usuario?.id && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-600 p-3">
          <div className="flex min-w-0 items-center gap-3">
            {foto ? <img src={foto} alt="Mi foto" className="h-10 w-10 shrink-0 rounded-full border border-ink-600 object-cover" /> : <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-ink-600 bg-ink-700 text-xs font-semibold text-mute">{(usuario?.name || 'Yo').trim().split(/\s+/).slice(0, 2).map(parte => parte[0] || '').join('').toUpperCase()}</span>}
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
        </div>}
        {fotoError && <p role="alert" className="text-sm text-bad">{fotoError}</p>}
        {fotoAConfirmar && <PhotoCropper file={fotoAConfirmar} onCancel={() => setFotoAConfirmar(null)} onCropped={async (recortada) => { setFotoAConfirmar(null); await subirFoto(recortada) }} />}
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
    </PanelDerecho>
  )
}

export function MiIdentidad() {
  const toast = useToast()
  const { usuario, empresa, perfilEmpresa, actualizarNombreUsuario } = useSesion()
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [guardandoNombre, setGuardandoNombre] = useState(false)
  const nombreActual = perfilEmpresa?.name || usuario?.user_metadata?.nombre || 'Dueño de la tienda'
  const valores = [
    { etiqueta: 'Correo del dueño', valor: empresa?.email || null },
    { etiqueta: 'ID del usuario', valor: usuario?.id || null },
  ]
  useEffect(() => { setNuevoNombre(nombreActual) }, [nombreActual])

  function irAlFormulario() {
    document.getElementById('identidad-form')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }

  async function guardarNombre(event) {
    event.preventDefault(); setGuardandoNombre(true)
    try {
      const nombre = nuevoNombre.trim()
      if (nombre.length < 2 || nombre.length > 100) throw new Error('El nombre debe tener entre 2 y 100 caracteres.')
      await api.patch('/api/users', { id: usuario.id, name: nombre })
      actualizarNombreUsuario(nombre)
      toast.success('Nombre actualizado', 'Tu nombre ahora aparece en ventas, reportes y comprobantes.')
    } catch (cause) { toast.error(cause?.message || 'No se pudo actualizar el nombre.') } finally { setGuardandoNombre(false) }
  }

  return (
    <PanelDerecho
      id="identidad-form"
      panel={
        <Card className="space-y-3">
          <div>
            <h2 className="font-semibold">Tu nombre de vendedor</h2>
            <p className="mt-1 text-sm text-mute">Se usa en tus ventas, reportes y comprobantes.</p>
          </div>
          <form onSubmit={guardarNombre} className="space-y-3">
            <FormField label="Nombre" htmlFor="identidad-nombre">
              <Input id="identidad-nombre" value={nuevoNombre} onChange={(event) => setNuevoNombre(event.target.value)} placeholder="Tu nombre" minLength={2} maxLength={100} required />
            </FormField>
            <Button type="submit" className="w-full" disabled={guardandoNombre || nuevoNombre.trim().length < 2}>{guardandoNombre ? 'Guardando…' : 'Guardar nombre'}</Button>
          </form>
        </Card>
      }
    >
      <Card className="space-y-3">
        <div>
          <p className="text-sm text-mute">Tu persona dentro de MobOS: la cuenta dueña de esta tienda.</p>
        </div>
        <div className="flex items-start gap-3">
          <Avatar user={{ id: usuario?.id, name: nombreActual }} picture={perfilEmpresa?.picture} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold">{nombreActual}</h2>
              <Button type="button" variant="outline" className="h-7 px-2 text-xs lg:hidden" onClick={irAlFormulario}>Editar nombre</Button>
            </div>
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
    </PanelDerecho>
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

  async function archivar({ password }) {
    if (busy) return
    setBusy(true); setError('')
    try {
      // Archivar por defecto: conserva el historial y solo soporte restaura.
      await api.patch('/api/account', { action: 'archiveStore', confirm: 'ARCHIVAR', password })
      setDialogo(null)
      await salir()
      window.location.assign('/login')
    } catch (cause) { setError(cause?.message || 'No se pudo archivar la tienda.') } finally { setBusy(false) }
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
        <Button type="button" variant="outline" onClick={() => { setError(''); setDialogo('archivar') }} disabled={busy} className="border-bad/50 text-bad hover:bg-bad/10">Archivar tienda</Button>
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
        open={dialogo === 'archivar'}
        title="¿Archivar esta tienda?"
        description="La tienda queda archivada y no se puede entrar hasta restaurarla durante los 30 días posteriores; se conserva toda su información (productos, ventas, clientes, pagos e integrantes). Para confirmar, escribí tu contraseña de empresa y la palabra ARCHIVAR."
        palabra="ARCHIVAR"
        necesitaClave
        confirmLabel="Archivar tienda"
        busy={busy}
        error={error}
        onCancel={() => !busy && setDialogo(null)}
        onConfirm={archivar}
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
    if (!/^\d{4,6}$/.test(pin)) return setError('Elegí un PIN de 4 a 6 dígitos.')
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
          <p className="text-sm text-mute">Elegí tu PIN de 4 a 6 dígitos para entrar a esta tienda. Podés usar el mismo que en tu tienda actual.</p>
          <PinInput autoFocus length={6} value={pin} onChange={(next) => { setPin(next); setError('') }} />
          {error && <p role="alert" className="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy || pin.length < 4}>{busy ? 'Aceptando…' : 'Aceptar invitación'}</Button>
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
  const formVacio = () => ({ id: null, name: '', address: '', city: '', department: '', countryCode: '+595', phone: '', instagram: '' })
  const [form, setForm] = useState(formVacio)

  const cargar = async () => {
    setError('')
    try { setBranches(await api.get('/api/branches')) } catch (cause) { setError(cause?.message || 'No se pudieron cargar las sucursales.') }
  }
  useEffect(() => { cargar() }, [])

  function irAlFormulario() {
    document.getElementById('sucursal-form')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }

  function abrir(branch) {
    // El teléfono se guarda como string único: al abrir se separa en código de
    // país y número para editarlos con PhoneField.
    const telefono = parseTelefono(branch?.phone)
    setForm(branch
      ? { id: branch.id, name: branch.name, address: branch.address || '', city: branch.city || '', department: branch.department || '', countryCode: telefono.countryCode, phone: telefono.phone, instagram: normalizarInstagram(branch.instagram) }
      : formVacio())
    setError('')
    if (branch) irAlFormulario()
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
      setForm(formVacio())
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
    <PanelDerecho
      id="sucursal-form"
      panel={
        <Card className="space-y-3">
          <div>
            <h2 className="font-semibold">{form?.id ? 'Editar sucursal' : 'Nueva sucursal'}</h2>
            <p className="mt-1 text-sm text-mute">La ciudad completa el departamento automáticamente.</p>
          </div>
          <form onSubmit={guardar} className="space-y-3">
            <FormField label="Nombre" htmlFor="sucursal-nombre">
              <Input id="sucursal-nombre" required maxLength={100} disabled={busy} value={form?.name || ''} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} placeholder="Nombre de la sucursal" />
            </FormField>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Teléfono (opcional)">
                <PhoneField disabled={busy} countryCode={form?.countryCode || '+595'} phone={form?.phone || ''} onCountryCodeChange={countryCode => setForm(current => ({ ...current, countryCode }))} onChange={phone => setForm(current => ({ ...current, phone }))} placeholder="Teléfono" />
              </FormField>
              <FormField label="Instagram (opcional)">
                <InstagramField disabled={busy} value={form?.instagram || ''} onChange={instagram => setForm(current => ({ ...current, instagram }))} placeholder="Instagram" />
              </FormField>
            </div>
            <FormField label="Ciudad" hint={form?.department ? `Departamento: ${form.department}` : undefined}>
              <CityAutocomplete disabled={busy} value={form?.city || ''} onSelect={(city, department) => setForm(current => ({ ...current, city, department }))} placeholder="Ciudad" />
            </FormField>
            <FormField label="Dirección (opcional)" htmlFor="sucursal-direccion">
              <Input id="sucursal-direccion" maxLength={200} disabled={busy} value={form?.address || ''} onChange={event => setForm(current => ({ ...current, address: event.target.value }))} placeholder="Dirección completa" />
            </FormField>
            {error && <p role="alert" className="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
            <div className="flex flex-wrap justify-end gap-2">
              {form?.id && <Button type="button" variant="ghost" disabled={busy} onClick={() => abrir(null)}>Cancelar edición</Button>}
              <Button type="submit" disabled={busy || !form?.name?.trim()}>{busy ? 'Guardando…' : form?.id ? 'Guardar cambios' : 'Crear sucursal'}</Button>
            </div>
          </form>
        </Card>
      }
    >
      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-mute">Cada sucursal conserva su dirección, ciudad y datos de contacto.</p>
          <Button type="button" onClick={() => { abrir(null); irAlFormulario() }}>+ Nueva sucursal</Button>
        </div>
        {branches === null ? <p className="text-sm text-mute">Cargando sucursales…</p> : branches.length === 0 ? <p className="text-sm text-mute">Todavía no hay sucursales. Creá la primera.</p> : (
          <div className="space-y-2">
            {branches.map(branch => (
              <article key={branch.id} className="rounded-xl border border-ink-600 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <b className="text-sm">{branch.name}</b>
                    <p className="mt-1 text-xs text-mute">{[branch.city, branch.department].filter(Boolean).join(' · ')}{branch.address ? ` · ${branch.address}` : ''}{branch.phone ? ` · ${branch.phone}` : ''}{branch.instagram ? ` · @${branch.instagram}` : ''}</p>
                  </div>
                  <Badge color={branch.isActive ? 'green' : 'slate'}>{branch.isActive ? 'Activa' : 'Inactiva'}</Badge>
                </div>
                <div className="mt-2 flex gap-3">
                  <button type="button" className="text-xs font-semibold text-fono-light hover:underline" disabled={busy} onClick={() => abrir(branch)}>Editar</button>
                  <button type="button" className="text-xs font-semibold text-mute hover:underline" disabled={busy} onClick={() => alternar(branch)}>{branch.isActive ? 'Desactivar' : 'Reactivar'}</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </Card>
    </PanelDerecho>
  )
}
