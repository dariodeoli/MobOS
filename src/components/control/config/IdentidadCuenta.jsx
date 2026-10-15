import { useEffect, useRef, useState } from 'react'
import { useSesion } from '@/lib/sesion'
import { api } from '@/lib/api/client'
import { Aviso, Button, Card, FormField, Input, useToast } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import EmailField from '@/components/shared/EmailField'
import CityAutocomplete from '@/components/shared/CityAutocomplete'
import PhoneField from '@/components/shared/PhoneField'
import RucField from '@/components/shared/RucField'
import { GRILLA_DOS_COLUMNAS } from '@/components/shared/formulario'
import { EstadoGuardado, useGuardadoCuenta } from '@/components/control/GuardadoCuenta'
import { cambiosIdentidad, formularioIdentidad } from '@/lib/identidadCuenta'

// Datos de la tienda. Dos modos:
//  - tarjeta (por defecto): lectura + «Editar» en la misma tarjeta (#298);
//  - ventana (#422): solo el formulario, listo para vivir dentro de una
//    VentanaDetalle abierta desde una fila de «Datos generales». Al guardar o
//    descartar llama a `onCerrar`. `campos` limita qué grupo se muestra:
//    'comercial' (nombre, RUC), 'contacto' (nombre, correo, teléfono) o
//    'direccion' (ciudad y dirección).
const CAMPOS_VISIBLES = {
  comercial: ['name', 'ruc'],
  contacto: ['name', 'email', 'phone'],
  direccion: ['city', 'address'],
}

export default function IdentidadCuenta({ onReauthValid, onGuardado, tenant, modo = 'tarjeta', campos, onCerrar }) {
  const enVentana = modo === 'ventana'
  const visibles = campos ? CAMPOS_VISIBLES[campos] : null
  const ver = (campo) => !visibles || visibles.includes(campo)
  const toast = useToast()
  const { empresa, actualizarEmpresa, esDemo } = useSesion()
  const guardado = useGuardadoCuenta({ id: 'datos-tienda', onReauth: onReauthValid })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // #298: una sola tarjeta, sin resumen duplicado. En lectura muestra los
  // datos y «Editar»; la edición reemplaza la misma tarjeta, con la barra de
  // «Guardar cambios» visible solo cuando hay diferencias reales.
  const [editando, setEditando] = useState(enVentana)
  const [form, setForm] = useState(() => formularioIdentidad({ empresa, tenant }))
  // La hidratación no puede pisar lo que la persona ya escribió: el formulario
  // se rellena con lo guardado solo mientras nadie lo tocó.
  const tocado = useRef(false)
  function editar(cambios) {
    tocado.current = true
    setForm(current => ({ ...current, ...cambios }))
  }
  useEffect(() => {
    if (tocado.current) return
    setForm(formularioIdentidad({ empresa, tenant }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant?.id, tenant?.address, tenant?.city, tenant?.department, tenant?.phone, tenant?.ruc, empresa?.nombre, empresa?.email])

  const hayCambios = Object.keys(cambiosIdentidad(form, { empresa, tenant })).length > 0

  function abrirEdicion() {
    tocado.current = false
    setForm(formularioIdentidad({ empresa, tenant }))
    setError('')
    setEditando(true)
  }
  function cancelar() {
    if (busy) return
    tocado.current = false
    setForm(formularioIdentidad({ empresa, tenant }))
    setError('')
    setEditando(enVentana)
    onCerrar?.()
  }
  // Cierra la edición con lo ya persistido (también tras reautenticar): la
  // tarjeta vuelve a lectura con los datos nuevos.
  function aplicarGuardado(datos) {
    const valores = datos || {}
    actualizarEmpresa?.({
      ...(valores.name ? { nombre: valores.name } : {}),
      ...(valores.email ? { email: valores.email } : {}),
    })
    onGuardado?.(valores)
    tocado.current = false
    setEditando(enVentana)
    onCerrar?.()
    toast.success('Datos de la tienda actualizados.')
  }
  async function guardar(event) {
    event.preventDefault()
    if (busy) return
    // Sin diferencias no hay acción: el criterio es que «Guardar» exista solo
    // con cambios.
    const pendientes = cambiosIdentidad(form, { empresa, tenant })
    if (!Object.keys(pendientes).length) return
    const nombre = form?.name?.trim() || ''
    const correo = form?.email?.trim() || ''
    if (nombre.length < 2 || nombre.length > 120) { setError('El nombre de la tienda debe tener entre 2 y 120 caracteres.'); return }
    if (!/^\S+@\S+\.\S+$/.test(correo)) { setError('Ingresá un correo de empresa válido.'); return }
    setBusy(true); setError('')
    try {
      await guardado.ejecutar(
        () => api.patch('/api/account', { action: 'updateProfile', ...pendientes }),
        { etiqueta: 'los datos de la tienda', onExito: aplicarGuardado },
      )
    } finally { setBusy(false) }
  }

  const lecturas = [
    ['Nombre de la tienda', empresa?.nombre],
    ['Correo de la empresa', empresa?.email],
    ['RUC', tenant?.ruc],
    ['Teléfono', tenant?.phone],
    ['Ciudad', tenant?.city],
    ['Departamento', tenant?.department],
  ]
  const Envoltorio = enVentana ? 'div' : Card
  const propsEnvoltorio = enVentana ? { 'data-testid': 'cuenta-form-ventana', className: 'space-y-3' } : { id: 'cuenta-form', 'data-testid': 'cuenta-form', className: 'space-y-3' }
  return (
    <Envoltorio {...propsEnvoltorio}>
      {!enVentana && <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">Datos de la tienda</h2>
          <p className="mt-1 text-sm text-mute">Se usan en comprobantes, portal y reportes.</p>
        </div>
        {editando
          ? <Button type="button" variant="ghost" onClick={cancelar} disabled={busy}>Cancelar</Button>
          : <Button type="button" variant="outline" data-testid="datos-tienda-editar" onClick={abrirEdicion}><Icon name="edit" className="h-4 w-4" />Editar</Button>}
      </div>}

      {!editando && (
        <dl data-testid="datos-tienda-lectura" className="grid gap-2 sm:grid-cols-2">
          {lecturas.map(([etiqueta, valor]) => (
            <div key={etiqueta} className="rounded-xl border border-ink-600 p-3">
              <dt className="text-xs font-semibold uppercase tracking-wider text-mute">{etiqueta}</dt>
              <dd className="mt-0.5 truncate text-sm text-fore">{valor || '—'}</dd>
            </div>
          ))}
          <div className="rounded-xl border border-ink-600 p-3 sm:col-span-2">
            <dt className="text-xs font-semibold uppercase tracking-wider text-mute">Dirección</dt>
            <dd className="mt-0.5 text-sm text-fore">{tenant?.address || '—'}</dd>
          </div>
        </dl>
      )}

      {editando && (
        <form onSubmit={guardar} className="space-y-3" data-testid="datos-tienda-form">
          {/* #298: formulario en 2 columnas; la dirección va a ancho completo. */}
          <div className={GRILLA_DOS_COLUMNAS}>
            {ver('name') && <FormField label="Nombre de la tienda" htmlFor="edit-nombre">
              <Input id="edit-nombre" disabled={busy} value={form?.name || ''} onChange={event => editar({ name: event.target.value })} placeholder="Nombre de la tienda" />
            </FormField>}
            {ver('email') && <FormField label="Correo de la empresa" htmlFor="edit-correo">
              <EmailField id="edit-correo" disabled={busy} value={form?.email || ''} onChange={value => editar({ email: value })} placeholder="Correo de la empresa" />
            </FormField>}
            {ver('ruc') && <FormField label="RUC" htmlFor="edit-ruc">
              <RucField id="edit-ruc" value={form?.ruc || ''} onChange={ruc => editar({ ruc })} onAplicar={(datos) => { tocado.current = true; setForm(current => ({ ...current, name: datos.name || current.name, ruc: datos.fullRuc || current.ruc })) }} disabled={busy} esDemo={esDemo} placeholder="RUC del negocio (opcional)" autoComplete="off" />
            </FormField>}
            {ver('phone') && <FormField label="Teléfono">
              <PhoneField disabled={busy} countryCode={form?.countryCode || '+595'} phone={form?.phone || ''} onCountryCodeChange={countryCode => editar({ countryCode })} onChange={phone => editar({ phone })} placeholder="Teléfono del negocio" />
            </FormField>}
            {ver('city') && <FormField label="Ciudad" hint={form?.department ? `Departamento: ${form.department}` : undefined}>
              <CityAutocomplete disabled={busy} value={form?.city || ''} onSelect={(city, department) => editar({ city, department })} placeholder="Ciudad del negocio" />
            </FormField>}
            {ver('address') && <FormField className="sm:col-span-2" label="Dirección" htmlFor="edit-direccion">
              <Input id="edit-direccion" maxLength={400} disabled={busy} value={form?.address || ''} onChange={event => editar({ address: event.target.value })} placeholder="Dirección del negocio (para el comprobante)" />
            </FormField>}
          </div>
          <EstadoGuardado testId="datos-tienda-estado" estado={guardado.estado} />
          {error && <Aviso tono="error">{error}</Aviso>}
          {enVentana && !hayCambios && (
            <div className="flex justify-end"><Button type="button" variant="ghost" onClick={cancelar} disabled={busy}>Cancelar</Button></div>
          )}
          {hayCambios && (
            <div data-testid="datos-tienda-barra" className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink-600 bg-ink-800 px-3 py-2 shadow-lg shadow-black/10">
              <span className="text-xs text-mute">Tenés cambios sin guardar.</span>
              <span className="flex items-center gap-2">
                <Button type="button" variant="ghost" disabled={busy} onClick={cancelar}>Descartar</Button>
                <Button type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar cambios'}</Button>
              </span>
            </div>
          )}
        </form>
      )}
      {guardado.panel}
    </Envoltorio>
  )
}
