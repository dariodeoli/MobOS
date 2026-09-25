import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSesion } from '@/lib/sesion'
import { api } from '@/lib/api/client'
import Switch from '@/components/shared/Switch'
import PhotoCropper from '@/components/shared/PhotoCropper'
import AttachmentInput from '@/components/shared/AttachmentInput'
import { getLogoDataUrl, olvidarLogo } from '@/lib/tenantLogo'
import { getAvatarDataUrl, olvidarAvatar } from '@/lib/userAvatar'
import { getDemoTenant, setDemoInsurancePct, setDemoLimits, setDemoNumeracion } from '@/lib/demoTenant'
import { promptLogo } from '@/lib/logoPrompt'
import { getCompanyContext, sessionApi } from '@/lib/api/session'
import { deviceId } from '@/lib/deviceId'
import { comprimirImagen } from '@/utils/imagen'
import { fechaHora as fmtDate } from '@/utils/fecha'
import { Aviso, Badge, Button, Card, ConfirmDialog, EmptyState, Eyebrow, FormField, Input, Label, Modal, MoneyInput, PasswordInput, PinInput, useToast } from '@/components/ui'
import { formatGs } from '@/utils/moneda'
import Icon from '@/components/shared/Icon'
import EmailField from '@/components/shared/EmailField'
import CityAutocomplete from '@/components/shared/CityAutocomplete'
import PhoneField, { parseTelefono, componerTelefono } from '@/components/shared/PhoneField'
import RucField from '@/components/shared/RucField'
import PercentField from '@/components/shared/PercentField'
import InstagramField, { normalizarInstagram } from '@/components/shared/InstagramField'
import PanelDerecho from '@/components/shared/PanelDerecho'
import { PreferenciasContenido } from '@/components/app/Preferencias'
import Avatar from '@/components/shared/Avatar'
import UsoEquipo from '@/components/control/UsoEquipo'
import DatosPrivados from '@/components/control/DatosPrivados'
import { ROLE_LABELS } from '@/lib/roles'
import { copiarAlPortapapeles } from '@/utils/portapapeles'
import { descargarArchivo } from '@/utils/descargarArchivo'
import { CELDA_DATO } from '@/components/shared/tabla'
import { cn } from '@/lib/utils'
import { GRILLA_DOS_COLUMNAS, PIE_ACCIONES, PIE_ACCIONES_REVERSO } from '@/components/shared/formulario'
import { temaV2Activo } from '@/lib/temaV2'
import { validarEnteroNoNegativo, validarPorcentajeDecimal, validarPorcentajeEntero } from '@/utils/limitesEmpresa'
import { mensajeDeGuardado } from '@/utils/guardadoCuenta'
import { EstadoGuardado, useGuardadoCuenta } from '@/components/control/GuardadoCuenta'

// Un logo por modo (UX Config → Logos): el modo claro lleva el logo oscuro y
// el modo oscuro el logo claro, y la vista previa se hace **sobre el fondo real
// de cada modo** (blanco / consola), no sobre los dos fondos como antes.
const VARIANTES_LOGO = [
  { variant: 'light', titulo: 'Modo claro', ayuda: 'Logo oscuro, para fondos claros', fondo: 'bg-white' },
  { variant: 'dark', titulo: 'Modo oscuro', ayuda: 'Logo claro, para fondos oscuros', fondo: 'consola bg-ink-950' },
]

// Confirmación con la vista previa fiel (sobre el fondo del modo) antes de subir.
function ConfirmarLogo({ item, busy, onCancel, onConfirm }) {
  const { file, variant } = item
  const datos = VARIANTES_LOGO.find((v) => v.variant === variant) || VARIANTES_LOGO[0]
  const [url, setUrl] = useState('')
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [file])
  return (
    <Modal open onClose={onCancel} title="Confirmar logo" size="corto">
      <p className="text-sm text-mute">Así se va a ver en {datos.titulo.toLowerCase()}:</p>
      <div className={`mt-2 grid h-24 place-items-center overflow-hidden rounded-lg border border-ink-600 ${datos.fondo}`}>
        {url && <img src={url} alt={`Vista previa del logo en ${datos.titulo.toLowerCase()}`} className="max-h-20 max-w-[85%] object-contain" />}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>Cancelar</Button>
        <Button type="button" onClick={onConfirm} disabled={busy}>{busy ? 'Guardando…' : 'Usar este logo'}</Button>
      </div>
    </Modal>
  )
}

async function copiarValor(toast, valor, etiqueta) {
  if (!valor) return
  const copiado = await copiarAlPortapapeles(valor)
  if (copiado) toast.success('Copiado', `${etiqueta} quedó en el portapapeles.`)
  else toast.error('No se pudo copiar', 'Seleccioná el valor y copialo manualmente.')
}



// El backend numera con MOB cuando la empresa no configuró prefijo
// (`backend/lib/order-number.ts`): la pantalla muestra y edita el prefijo
// efectivo, no un campo vacío que después no se puede guardar.
function prefijoEfectivo(valor) {
  const texto = String(valor || '').toUpperCase()
  return /^[A-Z]{2,3}$/.test(texto) ? texto : 'MOB'
}

export default function Config({ seccion = 'organizacion', preferencias, onCambiarPreferencias } = {}) {  const { sesion, empresa, sucursal, perfilEmpresa, actualizarEmpresa, esDemo } = useSesion()
  const toast = useToast()
  const esDueno = sesion?.esPropietario
  // En la demo no hay sesión real: los ajustes que van contra la API se
  // deshabilitan con una nota en lugar de fallar con "Falta sesión" (#188).
  const demo = Boolean(esDemo)
  const v2 = temaV2Activo()
  const [account, setAccount] = useState(null)
  const [logos, setLogos] = useState({ light: '', dark: '' })
  const [logoError, setLogoError] = useState('')
  const [logoBusy, setLogoBusy] = useState(false)
  // Archivo elegido esperando la confirmación con la vista previa fiel.
  const [logoAConfirmar, setLogoAConfirmar] = useState(null)
  const [prefijo, setPrefijo] = useState('')
  const [inicio, setInicio] = useState('')
  const [limiteGasto, setLimiteGasto] = useState('')
  const [limiteCompra, setLimiteCompra] = useState('')
  const [limiteBajoLista, setLimiteBajoLista] = useState('')
  const [limiteFidelizacion, setLimiteFidelizacion] = useState('')
  const [limiteMora, setLimiteMora] = useState('')
  const [seguroPct, setSeguroPct] = useState('')
  // Guardado transversal (#162 · lote F): estado Guardado/Error por formulario
  // y verificación de la contraseña en el lugar cuando el API la pide para una
  // acción sensible (reauth de 10 minutos).
  const anotarReautenticacion = useCallback((validUntil) => {
    setAccount(current => current ? { ...current, reauthValidUntil: validUntil } : current)
  }, [])
  const guardadoNumeracion = useGuardadoCuenta({ id: 'numeracion', onReauth: anotarReautenticacion })
  const guardadoSeguro = useGuardadoCuenta({ id: 'seguro', onReauth: anotarReautenticacion })
  const guardadoLimites = useGuardadoCuenta({ id: 'limites', onReauth: anotarReautenticacion })
  const guardadoSesiones = useGuardadoCuenta({ id: 'sesiones', onReauth: anotarReautenticacion })
  const guardadoExportar = useGuardadoCuenta({ id: 'exportar', onReauth: anotarReautenticacion })
  const [password, setPassword] = useState('')
  const [archiveReason, setArchiveReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [failure, setFailure] = useState('')
  const [confirmar, setConfirmar] = useState(null)
  const [cerrarCuentaAbierto, setCerrarCuentaAbierto] = useState(false)
  const [eliminarAbierto, setEliminarAbierto] = useState(false)

  // El formulario se hidrata solo al cargar (y al recargar) la cuenta: los
  // guardados parciales actualizan `account` sin pisar lo que el usuario está
  // editando en el otro grupo.
  const hidratarFormulario = useCallback((tenant) => {
    if (!tenant) return
    setPrefijo(prefijoEfectivo(tenant.orderPrefix))
    setInicio(tenant.orderNextNumber ? String(tenant.orderNextNumber) : '')
    setLimiteGasto(String(tenant.expenseLimitPyg ?? 1000000))
    setLimiteCompra(String(tenant.purchaseCreditLimitPyg ?? 5000000))
    setLimiteBajoLista(String(tenant.belowListPct ?? 10))
    setLimiteFidelizacion(String(tenant.loyaltyPct ?? 0))
    setLimiteMora(tenant.collectionLateFeeBpPerDay ? String(tenant.collectionLateFeeBpPerDay / 100).replace('.', ',') : '')
    setSeguroPct(tenant.insurancePct ? String(tenant.insurancePct) : '')
  }, [])

  const load = useCallback(async () => {
    if (!esDueno) return
    setFailure('')
    // En la demo no se consulta la API real (#194): se usa una empresa ficticia
    // con los ajustes guardados en este navegador.
    if (esDemo) {
      const tenant = { name: empresa?.nombre || 'Tienda demo', orderPrefix: 'DEMO', orderNextNumber: 1, ...getDemoTenant() }
      setAccount({ tenant })
      hidratarFormulario(tenant)
      return
    }
    try {
      const siguiente = await api.get('/api/account')
      setAccount(siguiente)
      hidratarFormulario(siguiente?.tenant)
    } catch (error) { setFailure(error.message || 'No se pudo cargar la seguridad de la cuenta.') }
  }, [esDueno, esDemo, empresa?.nombre, hidratarFormulario])
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
    if (await copiarAlPortapapeles(promptLogo(account?.tenant?.name || 'mi empresa'))) {
      toast.success('Prompt copiado', 'Pegalo en tu ChatGPT para generar las dos versiones del logo.')
    } else { toast.error('No se pudo copiar el prompt') }
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
    try {
      const result = await guardadoSesiones.ejecutar(
        () => api.patch('/api/account', { action: 'revokeSession', sessionId }),
        { etiqueta: 'la sesión' },
      )
      if (result) {
        setNotice('Sesión revocada.')
        await load()
        if (result.revokedSessionId === account?.currentSessionId) window.location.assign('/login')
      }
    } finally { setBusy(false) }
  }
  async function exportData() {
    if (busy) return
    setBusy(true); setFailure(''); setNotice('')
    try {
      const descargado = await guardadoExportar.ejecutar(async () => {
        const data = await api.get('/api/account/export')
        descargarArchivo(`mobos-${account?.tenant?.slug || 'datos'}-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), { tipo: 'application/json' })
        return true
      }, { etiqueta: 'la exportación' })
      if (descargado) setNotice('Exportación descargada. No contiene claves, PIN, tokens ni archivos adjuntos.')
    } finally { setBusy(false) }
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

  // Seguro de ventas de la empresa (#162): % sobre el costo que se suma al
  // costo real de cada venta nueva y afecta el margen.
  async function guardarSeguro(evento) {
    evento?.preventDefault?.()
    if (busy) return
    const validacion = validarPorcentajeEntero(seguroPct, 'El seguro')
    if (!validacion.ok) { guardadoSeguro.setEstado({ ok: false, texto: validacion.error }); setFailure(''); setNotice(''); return }
    const pct = validacion.valor === null || validacion.valor === 0 ? null : validacion.valor
    if (demo) {
      const guardado = setDemoInsurancePct(pct)
      setAccount(current => current ? { ...current, tenant: { ...current.tenant, insurancePct: guardado || null } } : current)
      guardadoSeguro.setEstado({ ok: true, texto: mensajeDeGuardado(guardado ? `${guardado}% del costo` : 'sin seguro') })
      setFailure(''); setNotice('Seguro guardado en este navegador (demo).')
      return
    }
    setBusy(true); setFailure(''); setNotice('')
    try {
      const data = await guardadoSeguro.ejecutar(
        () => api.patch('/api/account', { action: 'updateLimits', insurancePct: pct }),
        { etiqueta: 'el seguro', exito: (fila) => (fila?.insurancePct ? `${fila.insurancePct}% del costo` : 'sin seguro') },
      )
      if (data) {
        setAccount(current => current ? { ...current, tenant: { ...current.tenant, insurancePct: data.insurancePct ?? null } } : current)
        setNotice('Seguro de ventas guardado.')
      }
    } finally { setBusy(false) }
  }

  async function guardarNumeracion(evento) {
    evento?.preventDefault?.()
    if (busy) return
    if (!/^[A-Z]{2,3}$/.test(prefijo)) { guardadoNumeracion.setEstado({ ok: false, texto: 'El prefijo debe tener 2 o 3 letras (ej.: MOB).' }); return }
    if (!Number.isSafeInteger(Number(inicio)) || Number(inicio) < 1) { guardadoNumeracion.setEstado({ ok: false, texto: 'El número inicial debe ser un entero positivo.' }); return }
    if (demo) {
      const guardado = setDemoNumeracion({ prefix: prefijo, start: Number(inicio) })
      setAccount(current => current ? { ...current, tenant: { ...current.tenant, orderPrefix: guardado.orderPrefix, orderNextNumber: guardado.orderNextNumber } } : current)
      const detalle = `${guardado.orderPrefix}-#${String(guardado.orderNextNumber).padStart(4, '0')}`
      guardadoNumeracion.setEstado({ ok: true, texto: mensajeDeGuardado(detalle) })
      setFailure(''); setNotice(`Numeración guardada en este navegador (demo): ${detalle}.`)
      return
    }
    setBusy(true); setFailure(''); setNotice('')
    try {
      const data = await guardadoNumeracion.ejecutar(
        () => api.patch('/api/account', { action: 'orderNumbering', prefix: prefijo, start: Number(inicio) }),
        { etiqueta: 'la numeración', exito: (fila) => fila?.preview },
      )
      if (data) {
        setAccount(current => current ? { ...current, tenant: { ...current.tenant, orderPrefix: data.prefix, orderNextNumber: data.nextNumber } } : current)
        setNotice(`Numeración guardada: ${data.preview}.`)
      }
    } finally { setBusy(false) }
  }

  async function guardarLimites(evento) {
    evento?.preventDefault?.()
    if (busy) return
    const gasto = validarEnteroNoNegativo(limiteGasto, 'El límite de gasto')
    const compra = validarEnteroNoNegativo(limiteCompra, 'El límite de compra a crédito')
    const bajoLista = validarPorcentajeEntero(limiteBajoLista, 'El porcentaje bajo lista')
    const fidelizacion = validarPorcentajeEntero(limiteFidelizacion, 'El porcentaje de fidelización')
    const mora = validarPorcentajeDecimal(limiteMora, 'El recargo por mora')
    const invalido = [gasto, compra, bajoLista, fidelizacion, mora].find(resultado => !resultado.ok)
    if (invalido) { guardadoLimites.setEstado({ ok: false, texto: invalido.error }); setFailure(''); setNotice(''); return }
    const moraBp = mora.valor === null || mora.valor === 0 ? null : Math.round(mora.valor * 100)
    if (demo) {
      setDemoLimits({ expenseLimitPyg: gasto.valor, purchaseCreditLimitPyg: compra.valor, belowListPct: bajoLista.valor, loyaltyPct: fidelizacion.valor, collectionLateFeeBpPerDay: moraBp })
      setAccount(current => current ? { ...current, tenant: { ...current.tenant, expenseLimitPyg: gasto.valor, purchaseCreditLimitPyg: compra.valor, belowListPct: bajoLista.valor, loyaltyPct: fidelizacion.valor, collectionLateFeeBpPerDay: moraBp } } : current)
      guardadoLimites.setEstado({ ok: true, texto: mensajeDeGuardado() })
      setFailure(''); setNotice('Límites guardados en este navegador (demo).')
      return
    }
    setBusy(true); setFailure(''); setNotice('')
    try {
      const data = await guardadoLimites.ejecutar(
        () => api.patch('/api/account', { action: 'updateLimits', expenseLimitPyg: gasto.valor, purchaseCreditLimitPyg: compra.valor, belowListPct: bajoLista.valor, loyaltyPct: fidelizacion.valor, collectionLateFeeBpPerDay: mora.valor }),
        { etiqueta: 'los límites' },
      )
      if (data) {
        setAccount(current => current ? { ...current, tenant: { ...current.tenant, expenseLimitPyg: gasto.valor, purchaseCreditLimitPyg: compra.valor, belowListPct: bajoLista.valor, loyaltyPct: fidelizacion.valor, collectionLateFeeBpPerDay: moraBp } } : current)
        actualizarEmpresa?.({ expenseLimitPyg: gasto.valor, purchaseCreditLimitPyg: compra.valor, belowListPct: bajoLista.valor, loyaltyPct: fidelizacion.valor })
        setNotice('Límites de autorización guardados.')
      }
    } finally { setBusy(false) }
  }
  return (
    <div className="space-y-4">
      {failure && <Aviso tono="error" className="p-3 rounded-xl">{failure}</Aviso>}{notice && <Aviso tono="ok" className="p-3 rounded-xl">{notice}</Aviso>}
      {seccion === 'organizacion' && <>
        <IdentidadCuenta tenant={account?.tenant} onReauthValid={(validUntil) => setAccount(current => current ? { ...current, reauthValidUntil: validUntil } : current)} onGuardado={(cambios) => setAccount(current => current ? { ...current, tenant: { ...current.tenant, ...cambios } } : current)} />
        <Card className="space-y-3">
          <div>
            <h2 className="font-semibold">Identificador de pedidos</h2>
            <p className="mt-1 text-sm text-mute">Formato visible de los pedidos: prefijo de 2 o 3 letras y número inicial. Ejemplo: <b className="text-fore">{prefijo || 'MOB'} #{inicio || '310840'}</b>.</p>
            <p className="mt-1 text-xs text-mute">Ahora está configurado así: <b className="text-fono-light tabular-nums">{prefijoEfectivo(account?.tenant?.orderPrefix)}-#{String(account?.tenant?.orderNextNumber || 1).padStart(4, '0')}</b> (el próximo pedido sale con ese número; el prefijo solo admite 2 o 3 letras, así que el <b className="text-fore">#</b> no puede duplicarse).</p>
          </div>
          <form onSubmit={guardarNumeracion} className="space-y-3" data-testid="numeracion-form">
            <div className="flex flex-wrap items-end gap-2">
              <label className="block w-24 space-y-1 text-xs text-mute"><span>Prefijo</span><Input aria-label="Prefijo de pedidos" maxLength={3} disabled={busy} value={prefijo} onChange={event => setPrefijo(event.target.value.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 3))} placeholder="MOB" /></label>
              <label className="block w-32 space-y-1 text-xs text-mute"><span>Número inicial</span><Input aria-label="Número inicial de pedidos" inputMode="numeric" disabled={busy} value={inicio} onChange={event => setInicio(event.target.value.replace(/\D/g, '').slice(0, 8))} placeholder="310840" /></label>
              <Button type="submit" disabled={busy}>Guardar numeración</Button>
            </div>
            <EstadoGuardado testId="numeracion-estado" estado={guardadoNumeracion.estado} />
          </form>
          {guardadoNumeracion.panel}
          <p className="text-xs text-mute">Los pedidos ya creados conservan su número; los nuevos siguen esta secuencia.</p>
        </Card>

        {esDueno && <Card className="space-y-3">
          <div>
            <h2 className="font-semibold">Logo de la empresa</h2>
            <p className="mt-1 text-sm text-mute">Un logo por modo, con la vista previa sobre el fondo donde se usa: <b className="text-fore">modo claro</b> = logo oscuro, <b className="text-fore">modo oscuro</b> = logo claro. Se muestra en el encabezado de los comprobantes. Recomendado: PNG con <b className="text-fore">fondo transparente</b>, 1024×1024 px (1600×600 si es horizontal) y hasta 1 MiB.</p>
            <Button type="button" variant="ghost" className="mt-1 h-auto px-0 py-1 text-xs text-fono-light" onClick={copiarPrompt}><Icon name="copy" className="h-3.5 w-3.5" />Copiar prompt para generar el logo</Button>
          </div>
          <div className={GRILLA_DOS_COLUMNAS}>
            {VARIANTES_LOGO.map(({ variant, titulo, ayuda, fondo }) => (
              <div key={variant} className="rounded-xl border border-ink-600 p-3">
                <p className="text-sm font-medium">{titulo}</p>
                <p className="mt-0.5 text-xs text-mute">{ayuda}</p>
                <div data-testid={`logo-preview-${variant}`} className={`mt-2 grid h-20 place-items-center overflow-hidden rounded-lg border border-ink-600 ${fondo}`}>
                  {logos[variant]
                    ? <img src={logos[variant]} alt={`Logo en ${titulo.toLowerCase()}`} className="max-h-16 max-w-[85%] object-contain" />
                    : <span className="text-[10px] text-mute">Sin logo</span>}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <AttachmentInput onSelect={(file) => setLogoAConfirmar({ file, variant })} onError={setLogoError} accept="image/png,image/jpeg,image/webp" maxBytes={1024 * 1024} disabled={logoBusy}>
                    <Button type="button" variant="outline" disabled={logoBusy}>{logos[variant] ? 'Reemplazar' : 'Subir logo'}</Button>
                  </AttachmentInput>
                  {logos[variant] && <Button type="button" variant="ghost" disabled={logoBusy} onClick={() => quitarLogo(variant)}>Quitar</Button>}
                </div>
              </div>
            ))}
          </div>
          {logoError && <p role="alert" className="text-sm text-bad">{logoError}</p>}
          {logoAConfirmar && (
            <ConfirmarLogo
              item={logoAConfirmar}
              busy={logoBusy}
              onCancel={() => setLogoAConfirmar(null)}
              onConfirm={async () => {
                const { file, variant } = logoAConfirmar
                setLogoAConfirmar(null)
                await subirLogo(file, variant)
              }}
            />
          )}
        </Card>}
        {esDueno && <DatosPrivados />}
        <SeccionTiendas account={account} />
        {esDueno && <SeccionSucursales />}
        <Card className="space-y-3 border-bad/30"><div><h2 className="font-semibold text-bad">Archivar empresa</h2><p className="mt-1 text-sm text-mute">No borra ventas ni historial. Cierra sesiones y bloquea el acceso hasta restaurarla con correo, contraseña y la confirmación RESTORE, durante los 30 días posteriores al archivado.</p></div><Input aria-label="Motivo de archivado" value={archiveReason} onChange={event => setArchiveReason(event.target.value)} placeholder="Motivo del archivado (mínimo 10 caracteres)" /><Button variant="outline" onClick={() => setConfirmar({ tipo: 'archivar' })} disabled={busy || archiveReason.trim().length < 10 || !account?.reauthValidUntil} className="border-bad/50 text-bad hover:bg-bad/10">Archivar empresa</Button></Card>

        {esDueno && <Card className="space-y-3 border-bad/30"><div><h2 className="font-semibold text-bad">Eliminar empresa definitivamente</h2><p className="mt-1 text-sm text-mute">Borra la empresa y todo su historial: ventas, clientes, pagos, stock, integrantes y auditoría. No se puede deshacer ni recuperar. Si solo querés dejar de usarla por un tiempo, usá <b className="text-fore">Archivar empresa</b>: se conserva todo y podés restaurarla.</p></div><Button variant="outline" onClick={() => { setFailure(''); setEliminarAbierto(true) }} disabled={busy || !account?.reauthValidUntil} className="border-bad/50 text-bad hover:bg-bad/10">Eliminar empresa</Button></Card>}
        {esDueno && (
          <form
            onSubmit={(event) => { event.preventDefault(); reauthenticate() }}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-600 p-3"
          >
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-mute">Confirmar identidad</p>
              <p className="mt-0.5 text-sm text-mute">Archivar o eliminar la empresa pide tu contraseña. La autorización dura 10 minutos; también podés confirmarla en <b className="text-fore">Seguridad y auditoría</b>.</p>
            </div>
            {account?.reauthValidUntil ? (
              <p className="text-xs text-ok">Acciones sensibles habilitadas hasta {fmtDate(account.reauthValidUntil)}.</p>
            ) : (
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                <PasswordInput aria-label="Contraseña para reautenticar" value={password} onChange={event => setPassword(event.target.value)} placeholder="Contraseña de la empresa" className="min-w-0 sm:w-56" />
                <Button type="submit" disabled={busy || !password}>Verificar contraseña</Button>
              </div>
            )}
          </form>
        )}
      </>}
      {seccion === 'mi-cuenta' && <>
        <MiIdentidad />
        {preferencias && (
          <Card className="p-4 md:p-5">
            <h2 className="font-semibold">Preferencias del dispositivo</h2>
            <p className="mt-1 text-sm text-mute">Bloqueo por inactividad, notificaciones y atajos de esta computadora o teléfono.</p>
            <div className="mt-3"><PreferenciasContenido preferencias={preferencias} onCambiar={onCambiarPreferencias} /></div>
          </Card>
        )}
        {esDueno && (
          <Card className="space-y-3" data-testid="mis-sesiones">
            <div>
              <h2 className="font-semibold">Sesiones personales</h2>
              <p className="mt-1 text-sm text-mute">Tus accesos a MobOS. Para ver o revocar los del resto del equipo andá a <b className="text-fore">Seguridad y auditoría</b>.</p>
            </div>
            <div className="space-y-2">
              {(account?.sessions || []).filter(activa => (activa.user?.email || '') === (sesion?.correo || '')).map(activa => (
                <div key={activa.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-600 p-3">
                  <div>
                    <p className="font-medium">{activa.deviceId || 'Este dispositivo'} {activa.id === account?.currentSessionId && <span className="ml-2 text-xs text-fono-light">Sesión actual</span>}</p>
                    <p className="mt-1 text-xs text-mute">última actividad {fmtDate(activa.lastSeenAt)}</p>
                  </div>
                  <Button variant="outline" onClick={() => setConfirmar({ tipo: 'revocar', sessionId: activa.id })} disabled={busy}>Revocar</Button>
                </div>
              ))}
            </div>
            <EstadoGuardado testId="mis-sesiones-estado" estado={guardadoSesiones.estado} />
            {guardadoSesiones.panel}
          </Card>
        )}
      </>}
      {seccion === 'comercial' && <>
        {esDueno && <Card className="space-y-3" data-testid="seguro-limites">
          <div>
            <h2 className="font-semibold">Seguro y límites</h2>
            <p className="mt-1 text-sm text-mute">Por encima de estos montos, los roles operativos (cajera, vendedor) necesitan una autorización aprobada de gerencia para registrar un gasto o una compra a crédito. La venta bajo lista hasta el porcentaje indicado no pide autorización; más abajo, sí. El dueño y gerencia no la necesitan. La fidelización acredita al cliente, por cada venta, el porcentaje indicado del total como puntos canjeables por saldo a favor (1 punto = 1 Gs.); 0 la apaga.</p>
            {demo && <p className="mt-1 rounded-lg border border-fono/30 bg-fono/5 px-3 py-2 text-xs text-fono-light">Demo: los cambios se guardan solo en este navegador y el seguro se aplica al margen que ves en Análisis → Ganancias.</p>}
          </div>
          <form
            onSubmit={(evento) => { evento.preventDefault(); guardarSeguro() }}
            className={cn('space-y-3 rounded-xl border border-ink-600 p-3', v2 && 'v2-tile')}
            data-testid="grupo-seguro"
          >
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <label className="flex items-center gap-2 text-sm font-semibold" htmlFor="seguro-toggle">
                <Switch id="seguro-toggle" checked={seguroPct.trim() !== '' && Number(seguroPct) > 0} onChange={(event) => setSeguroPct(event.target.checked ? (seguroPct && Number(seguroPct) > 0 ? seguroPct : '25') : '')} ariaLabel="Aplica seguro" />
                <span>Seguro de ventas</span>
              </label>
              <EstadoGuardado testId="seguro-estado" estado={guardadoSeguro.estado} />
            </div>
            <div className={GRILLA_DOS_COLUMNAS}>
              <FormField label="Porcentaje sobre el costo (%)" htmlFor="seguro-pct" hint="Costo real = costo + seguro. Ej.: costo 100.000 y 25% → 125.000; el margen baja en 25.000. Se guarda como número entero (sin decimales).">
                <PercentField id="seguro-pct" max={100} disabled={busy || seguroPct.trim() === ''} value={seguroPct} onChange={setSeguroPct} placeholder="25" />
              </FormField>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" variant="outline" disabled={busy}>Guardar seguro</Button>
              <p className="text-xs text-mute">Se aplica a las ventas nuevas y se guarda con Enter; el producto o la categoría pueden tener su propio porcentaje.</p>
            </div>
          </form>
          {guardadoSeguro.panel}
          <form
            onSubmit={guardarLimites}
            className={cn('space-y-3 rounded-xl border border-ink-600 p-3', v2 && 'v2-tile')}
            data-testid="grupo-limites"
          >
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <h3 className="text-sm font-semibold">Montos y porcentajes</h3>
              <EstadoGuardado testId="limites-estado" estado={guardadoLimites.estado} />
            </div>
            <div className={GRILLA_DOS_COLUMNAS}>
              <FormField label="Gasto sin autorización (Gs)" htmlFor="limite-gasto">
                <MoneyInput id="limite-gasto" disabled={busy} value={limiteGasto} onValueChange={setLimiteGasto} placeholder="1.000.000" />
              </FormField>
              <FormField label="Compra a crédito sin autorización (Gs)" htmlFor="limite-compra">
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
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={busy}>Guardar límites</Button>
              <p className="text-xs text-mute">Se guarda con Enter. Actual: gasto {formatGs(account?.tenant?.expenseLimitPyg ?? 1000000)} · compra a crédito {formatGs(account?.tenant?.purchaseCreditLimitPyg ?? 5000000)} · bajo lista {account?.tenant?.belowListPct ?? 10}% · fidelización {account?.tenant?.loyaltyPct ?? 0}% · mora {account?.tenant?.collectionLateFeeBpPerDay ? `${account.tenant.collectionLateFeeBpPerDay / 100}% diario` : 'sin recargo'}.</p>
            </div>
          </form>
          {guardadoLimites.panel}
        </Card>}
      </>}
      {seccion === 'equipo' && <>
        <SeccionInvitaciones />
      </>}
      {seccion === 'seguridad' && <>
        <Card className="space-y-3"><div className="flex items-start gap-3">{perfilEmpresa?.picture ? <img src={perfilEmpresa.picture} referrerPolicy="no-referrer" alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" /> : <div className="rounded-lg bg-fono/10 p-2 text-fono"><Icon name="user" className="h-5 w-5" /></div>}<div className="min-w-0"><h2 className="font-semibold">Sesión activa</h2><p className="mt-0.5 truncate text-sm text-mute">{perfilEmpresa?.name || sesion?.correo || sesion?.nombre || 'Usuario de MobOS'}</p></div></div><div className="flex flex-wrap gap-2 text-sm"><Badge color="blue">{empresa?.nombre || 'Mi empresa'}</Badge>{sucursal?.nombre && <Badge color="slate">{sucursal.nombre}</Badge>}{sesion?.rol && <Badge color="slate">{sesion.rol}</Badge>}</div></Card>
        <Card className="space-y-3"><div><h2 className="font-semibold">Confirmar identidad</h2><p className="mt-1 text-sm text-mute">Pedimos tu contraseña antes de descargar datos, cerrar la empresa o revocar dispositivos. La autorización dura 10 minutos.</p></div><div className="flex flex-col gap-2 sm:flex-row"><PasswordInput aria-label="Contraseña para reautenticar" value={password} onChange={event => setPassword(event.target.value)} placeholder="Contraseña de la empresa" className="min-w-0 flex-1" /><Button onClick={reauthenticate} disabled={busy || !password}>Verificar contraseña</Button></div>{account?.reauthValidUntil && <p className="text-xs text-ok">Acciones sensibles habilitadas hasta {fmtDate(account.reauthValidUntil)}.</p>}</Card>

        <Card className="space-y-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="font-semibold">Sesiones activas</h2><p className="mt-1 text-sm text-mute">Cada dispositivo se puede cerrar de forma remota.</p></div><span className="flex flex-wrap items-center gap-2"><Button variant="outline" onClick={load} disabled={busy}>Actualizar</Button><Button variant="outline" className="border-bad/50 text-bad hover:bg-bad/10" onClick={() => { setFailure(''); setCerrarCuentaAbierto(true) }} disabled={busy}>Cerrar mi cuenta</Button></span></div>{!account && !failure && <p className="text-sm text-mute">Cargando sesiones…</p>}{account?.sessions?.length === 0 && <p className="text-sm text-mute">No hay sesiones activas.</p>}<div className="space-y-2">{account?.sessions?.map(active => <div key={active.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-600 p-3"><div><p className="font-medium">{active.user?.name || 'Acceso de empresa'} {active.id === account.currentSessionId && <span className="ml-2 text-xs text-fono-light">Este dispositivo</span>}</p><p className="mt-1 text-xs text-mute">{active.user?.role || active.level} · {active.deviceId || 'Dispositivo no identificado'} · última actividad {fmtDate(active.lastSeenAt)}</p></div><Button variant="outline" onClick={() => setConfirmar({ tipo: 'revocar', sessionId: active.id })} disabled={busy}>Revocar</Button></div>)}</div>
        <EstadoGuardado testId="sesiones-estado" estado={guardadoSesiones.estado} />
        {guardadoSesiones.panel}</Card>

        {esDueno && <UsoEquipo />}
        <Card className="space-y-3"><div><h2 className="font-semibold">Exportación básica</h2><p className="mt-1 text-sm text-mute">Descarga JSON de empresa, sucursales, equipo, clientes, productos, órdenes y pagos. Excluye credenciales, tokens, PIN y archivos de comprobantes.</p></div><div className="flex flex-wrap items-center gap-3"><Button variant="outline" onClick={exportData} disabled={busy}>Descargar mis datos</Button><EstadoGuardado testId="exportar-estado" estado={guardadoExportar.estado} /></div>{guardadoExportar.panel}</Card>
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

function IdentidadCuenta({ onReauthValid, onGuardado, tenant }) {
  const toast = useToast()
  const { empresa, actualizarEmpresa, esDemo } = useSesion()
  const guardado = useGuardadoCuenta({ id: 'datos-tienda', onReauth: onReauthValid })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const formulario = () => ({
    name: empresa?.nombre || '',
    email: empresa?.email || '',
    address: tenant?.address || '',
    city: tenant?.city || '',
    department: tenant?.department || '',
    countryCode: parseTelefono(tenant?.phone).countryCode,
    phone: parseTelefono(tenant?.phone).phone,
    ruc: tenant?.ruc || '',
  })
  const [form, setForm] = useState(formulario)
  // La hidratación no puede pisar lo que la persona ya escribió: el formulario
  // se rellena con la cuenta solo mientras nadie lo tocó (el GET llega después
  // del primer render y antes borraba los campos en silencio).
  const tocado = useRef(false)
  function editar(cambios) {
    tocado.current = true
    setForm(current => ({ ...current, ...cambios }))
  }
  const valores = [
    { etiqueta: 'Nombre de la tienda', valor: empresa?.nombre || null },
    { etiqueta: 'Correo de la empresa', valor: empresa?.email || null },
    { etiqueta: 'Dirección', valor: tenant?.address || null },
    { etiqueta: 'Ciudad', valor: [tenant?.city, tenant?.department].filter(Boolean).join(' · ') || null },
    { etiqueta: 'Teléfono', valor: tenant?.phone || null },
    { etiqueta: 'RUC', valor: tenant?.ruc || null },
  ]
  // Los datos del panel siguen a la ficha (carga inicial y tras guardar) sin
  // pisar lo que la persona está escribiendo: solo se rellenan cuando cambian
  // los valores guardados.
  useEffect(() => {
    if (tocado.current) return
    setForm(formulario())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant?.id, tenant?.address, tenant?.city, tenant?.department, tenant?.phone, tenant?.ruc, empresa?.nombre, empresa?.email])

  function irAlFormulario() {
    document.getElementById('cuenta-form')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }

  function restablecer() {
    tocado.current = false
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
    const cambios = {}
    if (nombre !== (empresa?.nombre || '')) cambios.name = nombre
    if (correo !== (empresa?.email || '')) cambios.email = correo
    const perfil = {
      address: (form?.address || '').trim(),
      city: (form?.city || '').trim(),
      department: (form?.department || '').trim(),
      phone: componerTelefono({ countryCode: form?.countryCode, phone: form?.phone }),
      ruc: (form?.ruc || '').trim(),
    }
    if (perfil.address !== (tenant?.address || '')) cambios.address = perfil.address
    if (perfil.city !== (tenant?.city || '')) cambios.city = perfil.city
    if (perfil.department !== (tenant?.department || '')) cambios.department = perfil.department
    if (perfil.phone !== (tenant?.phone || '')) cambios.phone = perfil.phone
    if (perfil.ruc !== (tenant?.ruc || '')) cambios.ruc = perfil.ruc
    setBusy(true); setError('')
    try {
      const resultado = await guardado.ejecutar(async () => {
        if (Object.keys(cambios).length) await api.patch('/api/account', { action: 'updateProfile', ...cambios })
        return cambios
      }, { etiqueta: 'los datos de la tienda' })
      if (resultado) {
        actualizarEmpresa?.(resultado)
        // La ficha del panel y los datos guardados se actualizan al instante:
        // sin esto el formulario volvía a los valores viejos y parecía que no
        // se había guardado nada.
        onGuardado?.(resultado)
        toast.success('Datos de la tienda actualizados.')
      }
    } finally { setBusy(false) }
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
              <Input id="edit-nombre" disabled={busy} value={form?.name || ''} onChange={event => editar({ name: event.target.value })} placeholder="Nombre de la tienda" />
            </FormField>
            <FormField label="Correo de la empresa" htmlFor="edit-correo">
              <EmailField id="edit-correo" disabled={busy} value={form?.email || ''} onChange={value => editar({ email: value })} placeholder="Correo de la empresa" />
            </FormField>
            <FormField label="Dirección" htmlFor="edit-direccion">
              <Input id="edit-direccion" maxLength={400} disabled={busy} value={form?.address || ''} onChange={event => editar({ address: event.target.value })} placeholder="Dirección del negocio (para el comprobante)" />
            </FormField>
            <div className={cn(GRILLA_DOS_COLUMNAS, 'lg:grid-cols-1')}>
              <FormField label="Ciudad" hint={form?.department ? `Departamento: ${form.department}` : undefined}>
                <CityAutocomplete disabled={busy} value={form?.city || ''} onSelect={(city, department) => editar({ city, department })} placeholder="Ciudad del negocio" />
              </FormField>
              <FormField label="Teléfono">
                <PhoneField disabled={busy} countryCode={form?.countryCode || '+595'} phone={form?.phone || ''} onCountryCodeChange={countryCode => editar({ countryCode })} onChange={phone => editar({ phone })} placeholder="Teléfono del negocio" />
              </FormField>
            </div>
            <FormField label="RUC" htmlFor="edit-ruc">
              <RucField id="edit-ruc" value={form?.ruc || ''} onChange={ruc => editar({ ruc })} onAplicar={(datos) => { tocado.current = true; setForm(current => ({ ...current, name: datos.name || current.name, ruc: datos.fullRuc || current.ruc })) }} disabled={busy} esDemo={esDemo} placeholder="RUC del negocio (opcional)" autoComplete="off" />
            </FormField>
            <EstadoGuardado testId="datos-tienda-estado" estado={guardado.estado} />
            {error && <Aviso tono="error">{error}</Aviso>}
            <div className={PIE_ACCIONES}>
              <Button type="button" variant="ghost" disabled={busy} onClick={restablecer}>Restablecer</Button>
              <Button type="submit" disabled={busy || !form?.name?.trim() || !form?.email?.trim()}>{busy ? 'Guardando…' : 'Guardar cambios'}</Button>
            </div>
          </form>
          {guardado.panel}
        </Card>
      }
    >
      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <Eyebrow>Datos de la tienda</Eyebrow>
            <p className="mt-1 text-sm text-mute">Lo que MobOS usa en comprobantes, portal y reportes.</p>
          </div>
          <Button type="button" variant="outline" className="lg:hidden" onClick={irAlFormulario}><Icon name="edit" className="h-3.5 w-3.5" />Editar</Button>
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

export function MiIdentidad() {
  const toast = useToast()
  const { usuario, empresa, perfilEmpresa, actualizarNombreUsuario } = useSesion()
  const guardado = useGuardadoCuenta({ id: 'identidad' })
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [guardandoNombre, setGuardandoNombre] = useState(false)
  // Mi foto vive acá (y no en Organización): es la persona, no los datos de la
  // tienda. El Avatar resuelve sola la prioridad foto subida → Google → iniciales.
  const [foto, setFoto] = useState('')
  const [fotoError, setFotoError] = useState('')
  const [fotoBusy, setFotoBusy] = useState(false)
  const [fotoAConfirmar, setFotoAConfirmar] = useState(null)
  const nombreActual = perfilEmpresa?.name || usuario?.user_metadata?.nombre || 'Dueño de la tienda'
  const valores = [
    { etiqueta: 'Correo del dueño', valor: empresa?.email || null },
    { etiqueta: 'ID del usuario', valor: usuario?.id || null },
  ]
  useEffect(() => { setNuevoNombre(nombreActual) }, [nombreActual])
  useEffect(() => {
    if (!usuario?.id) return
    let vigente = true
    getAvatarDataUrl(usuario.id).then(data => { if (vigente) setFoto(data) })
    return () => { vigente = false }
  }, [usuario?.id])

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
    document.getElementById('identidad-form')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }

  async function guardarNombre(event) {
    event.preventDefault()
    if (guardandoNombre) return
    const nombre = nuevoNombre.trim()
    if (nombre.length < 2 || nombre.length > 100) { guardado.setEstado({ ok: false, texto: 'El nombre debe tener entre 2 y 100 caracteres.' }); return }
    setGuardandoNombre(true)
    try {
      const resultado = await guardado.ejecutar(() => api.patch('/api/users', { id: usuario.id, name: nombre }), { etiqueta: 'tu nombre' })
      if (resultado) {
        actualizarNombreUsuario(nombre)
        toast.success('Nombre actualizado', 'Tu nombre ahora aparece en ventas, reportes y comprobantes.')
      }
    } finally { setGuardandoNombre(false) }
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
            <EstadoGuardado testId="identidad-estado" estado={guardado.estado} />
          </form>
          {guardado.panel}
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

function SeccionTiendas({ account }) {
  const toast = useToast()
  const { salir, esDemo } = useSesion()
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

  // En demo no hay cuenta de Google: se explica en lugar de mostrar el error
  // de carga (#205).
  if (esDemo) {
    return (
      <Card>
        <h2 className="font-semibold">Tiendas</h2>
        <p className="mt-1 text-sm text-mute">Las tiendas de tu cuenta de Google se administran con una cuenta real.</p>
      </Card>
    )
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
      {error && !dialogo && <Aviso tono="error">{error}</Aviso>}
      {stores.length === 0 ? <p className="text-sm text-mute">Todavía no se pudieron cargar tus tiendas. Recargá la página para volver a intentarlo.</p> : (
        <div className="space-y-2">
          {stores.map((store) => (
            <div key={store.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-600 p-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <b className="truncate text-sm">{store.name}</b>
                  {store.current && <Badge color="green">Actual</Badge>}
                </div>
                <p className={cn('mt-1', CELDA_DATO)}>ID: {store.id}</p>
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
  const { sesion, esDemo } = useSesion()
  const [pendientes, setPendientes] = useState([])
  const [cargando, setCargando] = useState(true)
  const [elegida, setElegida] = useState(null)
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    // La demo no toca el API: no hay invitaciones reales que traer.
    if (esDemo) { setCargando(false); return }
    let vivo = true
    api.get('/api/user-invitations/pending').then((lista) => { if (vivo) setPendientes(Array.isArray(lista) ? lista : []) }).catch(() => {}).finally(() => { if (vivo) setCargando(false) })
    return () => { vivo = false }
  }, [esDemo])

  async function aceptar(event) {
    event.preventDefault(); setError('')
    if (!/^\d{4,6}$/.test(pin)) return setError('Elegí un PIN de 4 a 6 dígitos.')
    if (!elegida) return
    setBusy(true)
    try {
      const dispositivo = deviceId()
      await api.post('/api/user-invitations/accept-by-id', { id: elegida.id, pin, deviceId: dispositivo })
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
      <Modal open={elegida !== null} onClose={() => !busy && setElegida(null)} title={`Unite a ${elegida?.companyName || 'la tienda'}`} size="corto">
        <form onSubmit={aceptar} className="space-y-4">
          <p className="text-sm text-mute">Elegí tu PIN de 4 a 6 dígitos para entrar a esta tienda. Podés usar el mismo que en tu tienda actual.</p>
          <PinInput autoFocus length={6} value={pin} onChange={(next) => { setPin(next); setError('') }} />
          {error && <Aviso tono="error">{error}</Aviso>}
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
    <Modal open={open} onClose={busy ? undefined : onCancel} title={title} size="corto">
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
        {error && <Aviso tono="error">{error}</Aviso>}
        <div className={PIE_ACCIONES_REVERSO}>
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>Cancelar</Button>
          <Button type="button" variant="danger" onClick={() => onConfirm(necesitaClave ? { password: clave } : {})} disabled={busy || !lista}>{busy ? 'Procesando…' : confirmLabel}</Button>
        </div>
      </div>
    </Modal>
  )
}

function SeccionSucursales() {
  const toast = useToast()
  const { esDemo } = useSesion()
  const guardado = useGuardadoCuenta({ id: 'sucursal' })
  const [branches, setBranches] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const formVacio = () => ({ id: null, name: '', address: '', city: '', department: '', countryCode: '+595', phone: '', instagram: '' })
  const [form, setForm] = useState(formVacio)

  const cargar = async () => {
    setError('')
    try { setBranches(await api.get('/api/branches')) } catch (cause) { setError(cause?.message || 'No se pudieron cargar las sucursales.') }
  }
  useEffect(() => {
    // En demo no se consulta el API: la sección muestra un aviso claro en vez
    // de quedarse en "Cargando sucursales…" (#205).
    if (esDemo) { setBranches([]); return }
    cargar()
  }, [esDemo])

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
    if (busy) return
    if (!form?.name?.trim()) { guardado.setEstado({ ok: false, texto: 'Poné el nombre de la sucursal.' }); return }
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
      const resultado = await guardado.ejecutar(
        () => (form.id ? api.patch('/api/branches', { id: form.id, ...payload }) : api.post('/api/branches', payload)),
        { etiqueta: 'la sucursal' },
      )
      if (resultado) {
        setForm(formVacio())
        toast.success(form.id ? 'Sucursal actualizada.' : 'Sucursal creada.')
        await cargar()
      }
    } finally { setBusy(false) }
  }

  async function alternar(branch) {
    setBusy(true); setError('')
    try {
      const resultado = await guardado.ejecutar(() => api.patch('/api/branches', { id: branch.id, isActive: !branch.isActive }), { etiqueta: 'la sucursal' })
      if (resultado) {
        toast.success(branch.isActive ? 'Sucursal desactivada.' : 'Sucursal reactivada.')
        await cargar()
      }
    } finally { setBusy(false) }
  }

  // En demo las sucursales no se administran: la sesión ficticia usa "Tienda demo".
  if (esDemo) {
    return (
      <Card>
        <EmptyState
          icon="store"
          title="Las sucursales se administran con una cuenta real"
          description="En la demo operás en Tienda demo; con tu cuenta podés crear sucursales, editarlas y activarlas."
          action={<Link to="/login" className="inline-flex min-h-11 items-center rounded-lg border border-ink-600 px-4 text-sm font-semibold text-fono-light transition hover:border-fono/50">Ingresar con mi cuenta</Link>}
        />
      </Card>
    )
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
            <div className={cn(GRILLA_DOS_COLUMNAS, 'lg:grid-cols-1')}>
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
            {error && <Aviso tono="error">{error}</Aviso>}
            <EstadoGuardado testId="sucursal-estado" estado={guardado.estado} />
            <div className={PIE_ACCIONES}>
              {form?.id && <Button type="button" variant="ghost" disabled={busy} onClick={() => abrir(null)}>Cancelar edición</Button>}
              <Button type="submit" disabled={busy || !form?.name?.trim()}>{busy ? 'Guardando…' : form?.id ? 'Guardar cambios' : 'Crear sucursal'}</Button>
            </div>
          </form>
          {guardado.panel}
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
