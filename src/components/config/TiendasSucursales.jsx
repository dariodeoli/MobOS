// #253 · Organización → «Tiendas y sucursales» (unificado).
//
// Antes eran dos tarjetas sueltas («Tiendas» y «Sucursales») y el archivado de
// la tienda desde la lista duplicaba «Archivar empresa». Ahora una sola tarjeta
// reúne la tienda actual, las demás tiendas de la cuenta y las sucursales de la
// tienda activa; el alta/edición de sucursal usa el panel derecho del patrón de
// Configuración. El archivado de la empresa queda en un único lugar de la
// sección (con motivo y reautenticación), sin repetir el flujo acá.
import { useEffect, useRef, useState } from 'react'
import { obligatorio } from 'owncoding-ui'
import { useSesion } from '@/lib/sesion'
import { api } from '@/lib/api/client'
import { resources } from '@/lib/api'
import { getCompanyContext, sessionApi } from '@/lib/api/session'
import { Aviso, Badge, Button, Card, FormField, Input, Subtabs, useToast } from '@/components/ui'
import { ConfirmDialog } from '@/components/shared/popupKit'
import Icon from '@/components/shared/Icon'
import PhoneField, { parseTelefono, componerTelefono } from '@/components/shared/PhoneField'
import InstagramField, { normalizarInstagram } from '@/components/shared/InstagramField'
import CityAutocomplete from '@/components/shared/CityAutocomplete'
import { DialogosEmpresa, MENSAJE_SIN_CUENTA, useCambioEmpresa } from '@/components/shared/SelectorEmpresa'
import PanelDerecho from '@/components/shared/PanelDerecho'
import { GRILLA_DOS_COLUMNAS, PIE_ACCIONES } from '@/components/shared/formulario'
import { CELDA_DATO } from '@/components/shared/tabla'
import { copiarValor } from '@/utils/portapapeles'
import { cn } from '@/lib/utils'
import { EstadoGuardado, useGuardadoCuenta } from '@/components/control/GuardadoCuenta'
import DialogoDestructivo from '@/components/config/DialogoDestructivo'
import useValidacionFormulario from '@/hooks/useValidacionFormulario'

// #323: firma del formulario de sucursal para saber si hay cambios sin guardar.
const firmaSucursal = (f) => JSON.stringify({
  id: f?.id || null,
  name: f?.name || '',
  address: f?.address || '',
  city: f?.city || '',
  department: f?.department || '',
  countryCode: f?.countryCode || '+595',
  phone: f?.phone || '',
  instagram: f?.instagram || '',
})

const ETIQUETAS_SUCURSAL = { nombre: 'el nombre' }
const REGLAS_SUCURSAL = { nombre: [obligatorio('Completá el nombre de la sucursal.')] }

export default function TiendasSucursales({ account }) {
  const toast = useToast()
  const { salir, esDemo, empresa } = useSesion()
  const guardado = useGuardadoCuenta({ id: 'sucursal' })
  const cambioEmpresa = useCambioEmpresa()
  const [branches, setBranches] = useState(null)
  const [errorSucursales, setErrorSucursales] = useState('')
  const [busy, setBusy] = useState(false)
  const [dialogo, setDialogo] = useState(null) // 'abandonar'
  // #422: filtro de la lista de sucursales (Todas · Activas · Inactivas).
  const [filtroSucursales, setFiltroSucursales] = useState('todas')
  const [errorTiendas, setErrorTiendas] = useState('')
  const formVacio = () => ({ id: null, name: '', address: '', city: '', department: '', countryCode: '+595', phone: '', instagram: '' })
  const [form, setForm] = useState(formVacio)
  // #323: cambios sin guardar y validación junto al campo.
  const inicialSucursal = useRef(firmaSucursal(formVacio()))
  const [descartar, setDescartar] = useState(null)
  const control = useValidacionFormulario({ nombre: form?.name || '' }, REGLAS_SUCURSAL, ETIQUETAS_SUCURSAL)
  const hayCambios = firmaSucursal(form) !== inicialSucursal.current

  const delContexto = getCompanyContext()?.stores || []
  // La demo lista su tienda ficticia (la empresa de la sesión) como la actual.
  const tiendaDemo = esDemo ? [{ id: empresa?.id || 'mobos-demo', name: empresa?.nombre || 'Tienda demo', current: true }] : null
  const stores = tiendaDemo || (Array.isArray(account?.stores) && account.stores.length ? account.stores : delContexto)
  const otras = stores.filter((store) => !store.current)
  const hayOtra = otras.length > 0 || (stores.length > 1 && !stores.some((store) => store.current))

  const cargar = async () => {
    setErrorSucursales('')
    try { setBranches(await resources.branches.list()) } catch (cause) { setErrorSucursales(cause?.message || 'No se pudieron cargar las sucursales.') }
  }
  // En demo las sucursales salen de la memoria de la pestaña (mismas que usa
  // Inventario): se crean, editan y activan igual que con una cuenta real.
  useEffect(() => { cargar() }, [esDemo])

  function irAlFormulario() {
    document.getElementById('sucursal-form')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }

  function abrir(branch) {
    // El teléfono se guarda como string único: al abrir se separa en código de
    // país y número para editarlos con PhoneField.
    const telefono = parseTelefono(branch?.phone)
    const siguiente = branch
      ? { id: branch.id, name: branch.name, address: branch.address || '', city: branch.city || '', department: branch.department || '', countryCode: telefono.countryCode, phone: telefono.phone, instagram: normalizarInstagram(branch.instagram) }
      : formVacio()
    setForm(siguiente)
    inicialSucursal.current = firmaSucursal(siguiente)
    control.limpiar()
    setErrorSucursales('')
    if (branch) irAlFormulario()
  }

  // #323: cambiar de sucursal (o empezar una nueva) con cambios sin guardar
  // pide confirmación antes de descartarlos.
  function pedirAbrir(branch) {
    if (hayCambios && !busy) { setDescartar({ branch }); return }
    abrir(branch)
  }

  async function guardar(event) {
    event.preventDefault()
    if (busy) return
    if (!control.intentar().valido) return
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
        () => (form.id ? resources.branches.update({ id: form.id, ...payload }) : resources.branches.create(payload)),
        { etiqueta: 'la sucursal' },
      )
      if (resultado) {
        const vacio = formVacio()
        setForm(vacio)
        inicialSucursal.current = firmaSucursal(vacio)
        control.limpiar()
        toast.success(form.id ? 'Sucursal actualizada.' : 'Sucursal creada.')
        await cargar()
      }
    } finally { setBusy(false) }
  }

  async function alternar(branch) {
    setBusy(true); setErrorSucursales('')
    try {
      const resultado = await guardado.ejecutar(() => resources.branches.update({ id: branch.id, isActive: !branch.isActive }), { etiqueta: 'la sucursal' })
      if (resultado) {
        toast.success(branch.isActive ? 'Sucursal desactivada.' : 'Sucursal reactivada.')
        await cargar()
      }
    } finally { setBusy(false) }
  }

  // #377: crear otra tienda ya no reinicia el acceso con Google; abre el alta
  // de empresa de la misma cuenta y pasa a ella.
  // Sin la cuenta vinculada (dueño que no entró con su PIN) no hay lista ni alta
  // directa: el camino de Google sigue disponible como respaldo.
  async function crearOtra() {
    setErrorTiendas('')
    if (!cambioEmpresa.sinCuenta) { cambioEmpresa.pedirCrear(); return }
    try { await sessionApi.startGoogle(true) } catch (cause) { setErrorTiendas(cause?.message || 'No se pudo iniciar el alta con Google.') }
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
        <Button type="button" variant="outline" onClick={crearOtra} disabled={esDemo} aria-describedby={esDemo ? 'tiendas-demo-nota' : undefined}><Icon name="plus" className="h-3.5 w-3.5" />Crear otra tienda</Button>
      </div>
      {cambioEmpresa.sinCuenta && !esDemo && <Aviso tono="info" data-testid="tiendas-sin-cuenta">{MENSAJE_SIN_CUENTA} Mientras tanto podés crear otra tienda con Google.</Aviso>}
      {errorTiendas && !dialogo && <Aviso tono="error">{errorTiendas}</Aviso>}
      {esDemo && <p id="tiendas-demo-nota" className="text-xs text-mute" data-testid="tiendas-demo-nota">En la demo no se crean ni se abandonan tiendas: eso se hace con tu cuenta.</p>}
      {stores.length === 0 ? (
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

  const activas = (branches || []).filter(branch => branch.isActive).length
  const inactivas = (branches || []).length - activas
  const sucursalesVisibles = (branches || []).filter(branch => filtroSucursales === 'todas' || (filtroSucursales === 'activas' ? branch.isActive : !branch.isActive))

  const bloqueSucursales = (
    <section className="space-y-3" data-testid="sucursales-bloque">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold">Sucursales</h3>
          <p className="mt-1 text-sm text-mute">Cada sucursal conserva su dirección, ciudad y datos de contacto.</p>
        </div>
        <Button type="button" onClick={() => { pedirAbrir(null); irAlFormulario() }}>+ Nueva sucursal</Button>
      </div>
      {branches !== null && branches.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2" data-config-anchor="sucursales-uso">
          {/* El plan todavía no define un máximo de sucursales (no hay límite en el
              backend): se informa el uso real, sin inventar un «de M». */}
          <p data-testid="sucursales-uso" className="text-sm text-mute">Usando <b className="text-fore">{activas}</b> {activas === 1 ? 'sucursal activa' : 'sucursales activas'}{inactivas > 0 ? ` · ${inactivas} ${inactivas === 1 ? 'inactiva' : 'inactivas'}` : ''}</p>
          <Subtabs
            value={filtroSucursales}
            onChange={setFiltroSucursales}
            items={[['todas', 'Todas', branches.length], ['activas', 'Activas', activas], ['inactivas', 'Inactivas', inactivas]]}
            ariaLabel="Filtrar sucursales"
            className="[&>button]:min-h-11 md:[&>button]:min-h-9"
          />
        </div>
      )}
      {branches === null ? <p className="text-sm text-mute">Cargando sucursales…</p> : branches.length === 0 ? <p className="text-sm text-mute">Todavía no hay sucursales. Creá la primera.</p> : (
        <div className="space-y-2">
          {sucursalesVisibles.length === 0 && <p className="text-sm text-mute">No hay sucursales en este filtro.</p>}
          {sucursalesVisibles.map(branch => (
            <article key={branch.id} className="rounded-xl border border-ink-600 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <b className="text-sm">{branch.name}</b>
                  <p className="mt-1 text-xs text-mute">{[branch.city, branch.department].filter(Boolean).join(' · ')}{branch.address ? ` · ${branch.address}` : ''}{branch.phone ? ` · ${branch.phone}` : ''}{branch.instagram ? ` · @${branch.instagram}` : ''}</p>
                </div>
                <Badge color={branch.isActive ? 'green' : 'slate'}>{branch.isActive ? 'Activa' : 'Inactiva'}</Badge>
              </div>
              <div className="mt-2 flex gap-3">
                <button type="button" className="toque-44 text-xs font-semibold text-fono-light hover:underline" disabled={busy} onClick={() => pedirAbrir(branch)}>Editar</button>
                <button type="button" className="toque-44 text-xs font-semibold text-mute hover:underline" disabled={busy} onClick={() => alternar(branch)}>{branch.isActive ? 'Desactivar' : 'Reactivar'}</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )

  const formularioSucursal = (
    <Card className="space-y-3">
      <div>
        <h2 className="font-semibold">{form?.id ? 'Editar sucursal' : 'Nueva sucursal'}</h2>
        <p className="mt-1 text-sm text-mute">La ciudad completa el departamento automáticamente.</p>
      </div>
      <form onSubmit={guardar} className="space-y-3">
        <FormField label="Nombre" htmlFor="sucursal-nombre" error={control.errorDe('nombre')}>
          <Input id="sucursal-nombre" maxLength={100} disabled={busy} value={form?.name || ''} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} onBlur={control.alSalir('nombre')} placeholder="Nombre de la sucursal" aria-invalid={Boolean(control.errorDe('nombre')) || undefined} />
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
          {form?.id && <Button type="button" variant="ghost" disabled={busy} onClick={() => pedirAbrir(null)}>Cancelar edición</Button>}
          <Button type="submit" disabled={busy || !control.valido} title={control.motivo || undefined}>{busy ? 'Guardando…' : form?.id ? 'Guardar cambios' : 'Crear sucursal'}</Button>
        </div>
      </form>
      {guardado.panel}
    </Card>
  )

  return (
    <>
      {!esDemo && <DialogosEmpresa control={cambioEmpresa} />}
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
      <ConfirmDialog
        open={Boolean(descartar)}
        onCancel={() => setDescartar(null)}
        onConfirm={() => { const destino = descartar?.branch ?? null; setDescartar(null); abrir(destino) }}
        title="¿Descartar los cambios de la sucursal?"
        description="Lo que escribiste no se guardó. Si seguís, se pierde."
        confirmLabel="Descartar cambios"
        variant="danger"
      />
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
