// #253 · Organización → «Tiendas y sucursales» (unificado).
//
// Antes eran dos tarjetas sueltas («Tiendas» y «Sucursales») y el archivado de
// la tienda desde la lista duplicaba «Archivar empresa». Ahora una sola tarjeta
// reúne la tienda actual, las demás tiendas de la cuenta y las sucursales de la
// tienda activa; el alta/edición de sucursal usa el panel derecho del patrón de
// Configuración. El archivado de la empresa queda en un único lugar de la
// sección (con motivo y reautenticación), sin repetir el flujo acá.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSesion } from '@/lib/sesion'
import { api } from '@/lib/api/client'
import { getCompanyContext, sessionApi } from '@/lib/api/session'
import { Aviso, Badge, Button, Card, EmptyState, FormField, Input, useToast } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import PhoneField, { parseTelefono, componerTelefono } from '@/components/shared/PhoneField'
import InstagramField, { normalizarInstagram } from '@/components/shared/InstagramField'
import CityAutocomplete from '@/components/shared/CityAutocomplete'
import PanelDerecho from '@/components/shared/PanelDerecho'
import { GRILLA_DOS_COLUMNAS, PIE_ACCIONES } from '@/components/shared/formulario'
import { CELDA_DATO } from '@/components/shared/tabla'
import { copiarValor } from '@/utils/portapapeles'
import { cn } from '@/lib/utils'
import { EstadoGuardado, useGuardadoCuenta } from '@/components/control/GuardadoCuenta'
import DialogoDestructivo from '@/components/config/DialogoDestructivo'

export default function TiendasSucursales({ account }) {
  const toast = useToast()
  const { salir, esDemo } = useSesion()
  const guardado = useGuardadoCuenta({ id: 'sucursal' })
  const [branches, setBranches] = useState(null)
  const [errorSucursales, setErrorSucursales] = useState('')
  const [busy, setBusy] = useState(false)
  const [dialogo, setDialogo] = useState(null) // 'abandonar'
  const [errorTiendas, setErrorTiendas] = useState('')
  const formVacio = () => ({ id: null, name: '', address: '', city: '', department: '', countryCode: '+595', phone: '', instagram: '' })
  const [form, setForm] = useState(formVacio)

  const delContexto = getCompanyContext()?.stores || []
  const stores = Array.isArray(account?.stores) && account.stores.length ? account.stores : delContexto
  const otras = stores.filter((store) => !store.current)
  const hayOtra = otras.length > 0 || (stores.length > 1 && !stores.some((store) => store.current))

  const cargar = async () => {
    setErrorSucursales('')
    try { setBranches(await api.get('/api/branches')) } catch (cause) { setErrorSucursales(cause?.message || 'No se pudieron cargar las sucursales.') }
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
    setErrorSucursales('')
    if (branch) irAlFormulario()
  }

  async function guardar(event) {
    event.preventDefault()
    if (busy) return
    if (!form?.name?.trim()) { guardado.setEstado({ ok: false, texto: 'Poné el nombre de la sucursal.' }); return }
    setBusy(true); setErrorSucursales('')
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
    setBusy(true); setErrorSucursales('')
    try {
      const resultado = await guardado.ejecutar(() => api.patch('/api/branches', { id: branch.id, isActive: !branch.isActive }), { etiqueta: 'la sucursal' })
      if (resultado) {
        toast.success(branch.isActive ? 'Sucursal desactivada.' : 'Sucursal reactivada.')
        await cargar()
      }
    } finally { setBusy(false) }
  }

  async function crearOtra() {
    setErrorTiendas('')
    try { await sessionApi.startGoogle(true) } catch (cause) { setErrorTiendas(cause?.message || 'No se pudo abrir el acceso con Google.') }
  }

  async function abandonar() {
    if (busy) return
    setBusy(true); setErrorTiendas('')
    try {
      await api.patch('/api/account', { action: 'leaveStore', confirm: 'ABANDONAR' })
      setDialogo(null)
      await salir()
      window.location.assign('/login')
    } catch (cause) { setErrorTiendas(cause?.message || 'No se pudo abandonar la tienda.') } finally { setBusy(false) }
  }

  const bloqueTiendas = (
    <section className="space-y-3" data-testid="tiendas-bloque">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold">Tiendas</h3>
          <p className="mt-1 text-sm text-mute">Las tiendas de las que sos dueño con esta cuenta de Google.</p>
        </div>
        {!esDemo && <Button type="button" variant="outline" onClick={crearOtra}><Icon name="plus" className="h-3.5 w-3.5" />Crear otra tienda</Button>}
      </div>
      {errorTiendas && !dialogo && <Aviso tono="error">{errorTiendas}</Aviso>}
      {esDemo ? (
        <p className="text-sm text-mute">La demo opera en una tienda ficticia: crear otra tienda o abandonar la actual se hace con una cuenta real.</p>
      ) : stores.length === 0 ? (
        <p className="text-sm text-mute">Todavía no se pudieron cargar tus tiendas. Recargá la página para volver a intentarlo.</p>
      ) : (
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
      {hayOtra && !esDemo && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => { setErrorTiendas(''); setDialogo('abandonar') }} disabled={busy}>Abandonar tienda</Button>
        </div>
      )}
    </section>
  )

  const bloqueSucursales = (
    <section className="space-y-3" data-testid="sucursales-bloque">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold">Sucursales</h3>
          <p className="mt-1 text-sm text-mute">Cada sucursal conserva su dirección, ciudad y datos de contacto.</p>
        </div>
        {!esDemo && <Button type="button" onClick={() => { abrir(null); irAlFormulario() }}>+ Nueva sucursal</Button>}
      </div>
      {esDemo ? (
        <EmptyState
          icon="store"
          title="Las sucursales se administran con una cuenta real"
          description="En la demo operás en Tienda demo; con tu cuenta podés crear sucursales, editarlas y activarlas."
          action={<Link to="/login" className="inline-flex min-h-11 items-center rounded-lg border border-ink-600 px-4 text-sm font-semibold text-fono-light transition hover:border-fono/50">Ingresar con mi cuenta</Link>}
        />
      ) : branches === null ? <p className="text-sm text-mute">Cargando sucursales…</p> : branches.length === 0 ? <p className="text-sm text-mute">Todavía no hay sucursales. Creá la primera.</p> : (
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
    </section>
  )

  if (esDemo) {
    return (
      <Card className="space-y-4" data-testid="tiendas-sucursales">
        <div>
          <h2 className="font-semibold">Tiendas y sucursales</h2>
          <p className="mt-1 text-sm text-mute">Las tiendas y las sucursales de tu negocio, en un solo lugar.</p>
        </div>
        {bloqueTiendas}
        <div className="border-t border-ink-600" />
        {bloqueSucursales}
      </Card>
    )
  }

  const formularioSucursal = (
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
        {errorSucursales && <Aviso tono="error">{errorSucursales}</Aviso>}
        <EstadoGuardado testId="sucursal-estado" estado={guardado.estado} />
        <div className={PIE_ACCIONES}>
          {form?.id && <Button type="button" variant="ghost" disabled={busy} onClick={() => abrir(null)}>Cancelar edición</Button>}
          <Button type="submit" disabled={busy || !form?.name?.trim()}>{busy ? 'Guardando…' : form?.id ? 'Guardar cambios' : 'Crear sucursal'}</Button>
        </div>
      </form>
      {guardado.panel}
    </Card>
  )

  return (
    <>
      <PanelDerecho id="sucursal-form" panel={formularioSucursal}>
        <Card className="space-y-4" data-testid="tiendas-sucursales">
          <div>
            <h2 className="font-semibold">Tiendas y sucursales</h2>
            <p className="mt-1 text-sm text-mute">Tu tienda actual, las demás tiendas de tu cuenta y las sucursales de esta tienda.</p>
          </div>
          {bloqueTiendas}
          <div className="border-t border-ink-600" />
          {bloqueSucursales}
        </Card>
      </PanelDerecho>
      <DialogoDestructivo
        open={dialogo === 'abandonar'}
        title="¿Abandonar esta tienda?"
        description="Dejarás de ser dueño de esta tienda y no podrás volver a entrar con esta cuenta. La tienda necesita al menos otro administrador para seguir funcionando, y podés seguir usando tus otras tiendas. Esta acción no se puede deshacer desde la app."
        palabra="ABANDONAR"
        confirmLabel="Abandonar tienda"
        busy={busy}
        error={errorTiendas}
        onCancel={() => !busy && setDialogo(null)}
        onConfirm={abandonar}
      />
    </>
  )
}
