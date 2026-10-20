import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api/client'
import { Button, ConfirmDialog, IconAction, Input } from '@/components/ui'
import CityAutocomplete from '@/components/shared/CityAutocomplete'
import CountrySelect from '@/components/shared/CountrySelect'
import { Campo, GrillaCampos } from '@/components/shared/GrillaCampos'
import EmailField from '@/components/shared/EmailField'
import RucField from '@/components/shared/RucField'
import PhoneField from '@/components/shared/PhoneField'
import Icon from '@/components/shared/Icon'
import { montoGs } from '@/utils/moneda'
import { coincideCliente, datosFacturacionCliente } from '@/utils/cliente'
import { capitalizarPrimera } from '@/utils/texto'
import { normalizarNombre } from '@/utils/nombre'
import { applyCheckoutIdentity, clearCheckoutIdentity } from '@/lib/checkoutIdentity'
import { buscarPreClientes, guardarPreCliente, diasDeBorrador } from '@/lib/preClientes'
import { listarClientesDemo } from '@/lib/demoClientes'
import { useSesion } from '@/lib/sesion'
import { cn } from '@/lib/utils'
import { fechaLegible } from '@/utils/pedido'
import { avisoClienteBloqueado } from '@/utils/cobroPos'
import ClienteResumenPopup from '@/components/customers/ClienteResumenPopup'

// Los clientes demo no traen `stats`: se arman con su historial de ejemplo.
function estadisticasDemo(cliente) {
  const pedidos = cliente?.demoProfile?.orders
  if (!Array.isArray(pedidos)) return null
  const ultimo = pedidos.reduce((max, o) => (o.createdAt && (!max || o.createdAt > max) ? o.createdAt : max), null)
  return { orders: pedidos.length, lastOrderAt: ultimo, pendingPyg: pedidos.reduce((suma, o) => suma + Number(o.pendingPyg || 0), 0) }
}

const TITULO_SECCION = 'text-[11px] font-semibold uppercase tracking-wide text-mute'
const emptyAddress = () => ({ label: 'Principal', address: '', city: '', department: '', country: 'Paraguay', notes: '', isDefault: true })
const clienteVacio = () => ({ id: undefined, name: '', phone: '', countryCode: '+595', email: '', document: '', pricingTier: 'RETAIL', priceListId: null, creditLimitPyg: null, creditDays: null, addresses: [], billingName: '', billingDocument: '' })
const customerValue = (customer) => ({
  ...('nameOfficial' in customer ? { nameOfficial: customer.nameOfficial, displayName: customer.displayName } : {}),
  id: customer.id, name: customer.name || '', phone: customer.phone || '', countryCode: customer.countryCode || '+595',
  email: customer.email || '', document: customer.document || '',
  pricingTier: customer.pricingTier || 'RETAIL', priceListId: customer.priceListId || null, creditLimitPyg: customer.creditLimitPyg ?? null, creditDays: customer.creditDays ?? null,
  addresses: Array.isArray(customer.addresses) ? customer.addresses.map(({ id, ...address }) => address) : [],
  billingName: customer.billingName || '', billingDocument: customer.billingDocument || '',
})

export default function CheckoutCustomer({ value, onChange, esDemo, billingTo, onBillingChange, nombreLista = '', colapsarFicha = false, errorNombre = '', onStats, onSelected }) {
  const { empresa } = useSesion()
  const empresaId = empresa?.id || null
  const [matches, setMatches] = useState([])
  const [error, setError] = useState('')
  // Pre-clientes: borradores guardados al consultar un RUC que todavía no tiene
  // ficha. Reaparecen al buscar por nombre para no volver a tipearlos.
  const [borradores, setBorradores] = useState([])
  // Facturación a otro titular: toggle compacto junto al cliente.
  const [facturarAOtro, setFacturarAOtro] = useState(Boolean(billingTo?.name || billingTo?.document))
  // #309: con la ficha elegida el bloque se lee en una línea; «Editar datos»
  // abre el formulario completo (contacto, direcciones y facturación).
  const [editar, setEditar] = useState(false)
  // #389: el formulario (identidad, contacto, facturación y direcciones) vive en
  // un bloque plegable; «Editar datos» lo abre ya desplegado.
  const [abierto, setAbierto] = useState(false)
  const [quitarDireccion, setQuitarDireccion] = useState(null)
  const [fichaAbierta, setFichaAbierta] = useState(false)
  // Registro completo del cliente elegido (con sus estadísticas): se guarda
  // aparte del valor del formulario para no viajar en el payload de la venta.
  const [registro, setRegistro] = useState(null)
  const tarjetaRef = useRef(null)
  const cajaRef = useRef(null)
  const enfocarBusqueda = useRef(false)
  const stats = registro?.id === value.id ? (registro?.stats || estadisticasDemo(registro)) : null
  // La deuda abierta del cliente elegido sube al POS para anticipar el crédito.
  const deudaStats = stats ? Number(stats.pendingPyg || 0) : null
  useEffect(() => { onStats?.(deudaStats) }, [deudaStats, value.id]) // eslint-disable-line react-hooks/exhaustive-deps
  // #309: el POS colapsa la ficha elegida a una línea; los modales de edición
  // (ficha del cliente, cambiar cliente del pedido) mantienen el formulario.
  const colapsado = colapsarFicha && Boolean(value.id) && !editar
  // Última versión de `elegirCliente` accesible desde el efecto de búsqueda sin
  // recrearlo en cada render (evita reconsultas en loop).
  const elegirClienteRef = useRef(null)
  useEffect(() => { elegirClienteRef.current = elegirCliente })
  useEffect(() => {
    const query = (value.name || '').trim()
    if (!empresaId || esDemo || value.id || !query) { setBorradores([]); return }
    setBorradores(buscarPreClientes(empresaId, query))
  }, [value.name, value.id, empresaId, esDemo])
  useEffect(() => {
    let active = true
    const query = (value.name || '').trim()
    if (!query) { setMatches([]); return () => { active = false } }
    const timer = setTimeout(async () => {
      try {
        // En demo la cartera es la de la pestaña (#201): seeds (#194) + lo
        // creado acá. Antes solo buscaba lo creado y los seeds no se podían
        // elegir en el POS (#160).
        const rows = esDemo ? listarClientesDemo() : await api.get(`/api/customers?q=${encodeURIComponent(query)}`)
        if (!active) return
        const encontrados = rows.filter(customer => coincideCliente(customer, query)).slice(0, 5)
        setMatches(encontrados)
        setError('')
        // Nombre exacto y único: se liga la ficha sola. Sin esto, escribir el
        // nombre completo dejaba la venta como "cliente nuevo" y el precio no
        // tomaba la lista asignada.
        const exactos = encontrados.filter(customer => String(customer.name || '').trim().toLowerCase() === query.toLowerCase())
        if (!value.id && exactos.length === 1) elegirClienteRef.current?.(exactos[0])
      } catch { if (active) setError('No se pudo consultar clientes. Reintentá antes de confirmar.') }
    }, 250)
    return () => { active = false; clearTimeout(timer) }
  }, [value.name, value.id, esDemo])

  // Cliente restaurado (carrito guardado): se recupera su registro para la tarjeta.
  useEffect(() => {
    if (!colapsarFicha || !value.id || registro?.id === value.id) return undefined
    let activo = true
    const buscar = async () => {
      try {
        const filas = esDemo ? listarClientesDemo() : await api.get(`/api/customers?q=${encodeURIComponent(value.name || '')}`)
        const fila = filas.find(item => item.id === value.id)
        if (activo && fila) setRegistro(fila)
      } catch { /* la tarjeta se muestra sin estadísticas */ }
    }
    buscar()
    return () => { activo = false }
  }, [colapsarFicha, value.id, value.name, esDemo, registro?.id])
  useEffect(() => {
    if (!enfocarBusqueda.current || value.id) return
    enfocarBusqueda.current = false
    cajaRef.current?.querySelector('input')?.focus()
  })

  // Solo el consentimiento del extractor aplica la identidad fiscal exacta.
  // El nombre de mostrador queda separado, sin adivinar nombres/apellidos.
  function aplicarDocumento(datos) {
    const next = applyCheckoutIdentity(value, datos)
    onChange(next)
    if (!esDemo && empresaId && next.nameOfficial)
      guardarPreCliente(empresaId, next, { dias: diasDeBorrador(empresa) })
  }
  function usarBorrador(borrador) {
    onChange({
      ...('nameOfficial' in borrador ? { nameOfficial: borrador.nameOfficial, displayName: borrador.displayName } : {}),
      id: undefined, name: borrador.name, phone: borrador.phone || '', countryCode: borrador.countryCode || '+595',
      email: borrador.email || '', document: borrador.document || '', pricingTier: 'RETAIL', priceListId: null,
      creditLimitPyg: null, creditDays: null, addresses: [], billingName: '', billingDocument: '',
    })
    setBorradores([])
    setMatches([])
  }
  function elegirCliente(customer) {
    setEditar(false)
    setRegistro(customer)
    onChange(customerValue(customer))
    // La factura a otro titular que el cliente ya usó se propone de nuevo,
    // salvo que esta venta ya tenga datos escritos.
    const facturacion = datosFacturacionCliente(customer)
    if (facturacion && onBillingChange && !billingTo?.name?.trim() && !billingTo?.document?.trim()) onBillingChange(facturacion)
    // The POS uses this hook to move the operator directly to product search.
    // It is deliberately emitted after the customer state is applied so the
    // next Enter always belongs to the product combobox, never the sale form.
    onSelected?.(customer)
  }
  function quitarCliente() {
    setMatches([]); setError(''); setEditar(false); setRegistro(null); setFichaAbierta(false)
    enfocarBusqueda.current = true
    onChange(clienteVacio())
  }

  const setAddress = (index, field, next) => onChange({ ...value, addresses: value.addresses.map((address, position) => position === index ? { ...address, [field]: next } : address) })
  const addAddress = () => onChange({ ...value, addresses: [...(value.addresses || []), { ...emptyAddress(), label: `Dirección ${(value.addresses?.length || 0) + 1}`, isDefault: !value.addresses?.length }] })
  const abrirEdicion = () => { setEditar(true); setAbierto(true) }
  // Una dirección vacía se quita sin preguntar; con datos pide confirmación.
  const pedirQuitarDireccion = (index) => {
    const { address = '', city = '', notes = '' } = value.addresses[index] || {}
    if ([address, city, notes].some(texto => String(texto).trim())) setQuitarDireccion(index)
    else removeAddress(index)
  }
  const removeAddress = (index) => onChange({ ...value, addresses: value.addresses.filter((_, position) => position !== index).map((address, position) => ({ ...address, isDefault: position === 0 ? true : address.isDefault })) })

  // Tarjeta del cliente elegido (#309/#390): reemplaza al buscador y da el
  // contexto para cobrar de un vistazo. Escritorio: una fila; celular: dos
  // líneas con los chips en scroll horizontal.
  if (colapsado) {
    const limite = Number(value.creditLimitPyg || 0)
    const deuda = Number(stats?.pendingPyg || 0)
    const disponible = Math.max(0, limite - deuda)
    const avisos = [
      !String(value.document || '').trim() && !String(billingTo?.document || '').trim() ? 'Sin RUC/CI para factura' : '',
      stats && limite > 0 && deuda > limite ? 'Crédito superado' : '',
    ].filter(Boolean)
    return (
      <div ref={tarjetaRef} data-testid="cliente-elegido" className="rounded-xl border border-ok/30 bg-ok/10 px-3 py-2 text-xs">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span data-testid="cliente-elegido-nombre" className="min-w-0 max-w-full truncate text-sm font-bold text-fore">{value.name}</span>
          {value.document ? <span className="text-mute">{value.document}</span> : null}
          {value.phone ? <span className="whitespace-nowrap text-mute">{value.countryCode} {value.phone}</span> : null}
          <span className="ml-auto flex shrink-0 items-center">
            <button type="button" className="toque-44 grid h-11 w-11 place-items-center rounded-lg text-mute transition hover:bg-ink-700 hover:text-fore md:h-8 md:w-8" title="Ver ficha" aria-label="Ver ficha del cliente" onClick={() => setFichaAbierta(true)}>
              <Icon name="eye" className="h-4 w-4" />
            </button>
            <button type="button" className="toque-44 grid h-11 w-11 place-items-center rounded-lg text-mute transition hover:bg-ink-700 hover:text-fore md:h-8 md:w-8" title="Editar datos" aria-label="Editar datos del cliente" onClick={abrirEdicion}>
              <Icon name="edit" className="h-4 w-4" />
            </button>
            <button type="button" className="toque-44 grid h-11 w-11 place-items-center rounded-lg text-bad transition hover:bg-bad/10 md:h-8 md:w-8" title="Quitar cliente" aria-label="Quitar cliente" onClick={quitarCliente}>
              <Icon name="close" className="h-4 w-4" />
            </button>
          </span>
        </div>
        <div data-testid="cliente-chips" className="mt-1 flex items-center gap-1.5 overflow-x-auto whitespace-nowrap pb-0.5 md:flex-wrap md:overflow-visible">
          <span className="rounded border border-fono/30 px-1.5 py-0.5 font-bold text-fono-light">{value.pricingTier === 'WHOLESALE' ? 'Mayorista' : 'Cliente final'}</span>
          {nombreLista ? <span className="rounded border border-fono/30 px-1.5 py-0.5 font-bold text-fono-light" title="Lista de precios asignada a esta ficha">Lista {nombreLista}</span> : null}
          {limite > 0 ? (
            <span className="rounded border border-warn/30 px-1.5 py-0.5 font-bold text-warn">
              {stats ? `Crédito disponible ${montoGs(disponible)}` : `Crédito hasta ${montoGs(limite)}`}{value.creditDays ? ' · ' + value.creditDays + ' días' : ''}
            </span>
          ) : null}
          {deuda > 0 ? <span className="rounded border border-bad/40 px-1.5 py-0.5 font-bold text-bad-text">Deuda {montoGs(deuda)}</span> : null}
          {stats ? <span className="text-mute">{stats.orders ?? 0} {Number(stats.orders) === 1 ? 'pedido' : 'pedidos'}{stats.lastOrderAt ? ` · última compra ${fechaLegible(stats.lastOrderAt)}` : ''}</span> : null}
          {facturarAOtro && (billingTo?.name || billingTo?.document) ? <span className="text-mute">Factura a {billingTo?.name || billingTo?.document}</span> : null}
        </div>
        {value.blocked ? (
          <p role="alert" data-testid="cliente-bloqueado" className="mt-1 flex items-center gap-1 font-bold text-bad-text">
            <Icon name="alert" className="h-3.5 w-3.5" aria-hidden="true" />{avisoClienteBloqueado(value)}
          </p>
        ) : null}
        {avisos.length > 0 ? (
          <p role="status" data-testid="cliente-avisos" className="mt-1 flex flex-wrap items-center gap-x-3 font-semibold text-warn">
            {avisos.map(aviso => <span key={aviso} className="inline-flex items-center gap-1"><Icon name="alert" className="h-3.5 w-3.5" aria-hidden="true" />{aviso}</span>)}
          </p>
        ) : null}
        <ClienteResumenPopup
          row={registro || { ...value, wholesale: value.pricingTier === 'WHOLESALE', stats }}
          open={fichaAbierta}
          onClose={() => setFichaAbierta(false)}
          onEditar={() => { setFichaAbierta(false); abrirEdicion() }}
          onDetalle={() => { setFichaAbierta(false); abrirEdicion() }}
        />
      </div>
    )
  }

  return <div ref={cajaRef} className="space-y-3 md:col-span-2">
    <label className="block text-sm font-semibold"><span className="sr-only">Cliente</span><Input aria-label="Nombre, teléfono, CI o RUC del cliente" aria-invalid={errorNombre ? true : undefined} value={value.name} placeholder="Buscar cliente o escribir un nombre nuevo" onChange={event => onChange({ ...clearCheckoutIdentity(value), id: undefined, name: event.target.value, displayName: event.target.value })} onKeyDown={event => {
      if (event.key !== 'Enter') return
      event.preventDefault()
      // Enter confirms the highlighted/first customer. If the operator is
      // creating a new customer by name, it still advances to products rather
      // than submitting the complete sale accidentally.
      if (matches[0]) elegirCliente(matches[0])
      else if (value.name.trim()) onSelected?.()
    }} /></label>
    {errorNombre && <p role="alert" className="mt-1 text-xs text-bad-text">{errorNombre}</p>}
    {!value.id && value.name && <div className="space-y-1">{matches.map(customer => <button type="button" key={customer.id} className="block w-full rounded-xl border border-ink-600 p-3 text-left text-sm hover:border-fono" onClick={() => elegirCliente(customer)}><strong>{customer.name}</strong><span className="ml-3 text-mute">{customer.phone || customer.document || customer.email || 'Sin identificador'}</span>{customer.addresses?.length ? <span className="ml-2 text-xs text-fono-light">· {customer.addresses.length} dirección{customer.addresses.length === 1 ? '' : 'es'}</span> : null}{datosFacturacionCliente(customer) ? <span className="ml-2 text-xs text-mute">· Factura a {customer.billingName || customer.billingDocument}</span> : null}</button>)}{borradores.map(borrador => <button type="button" key={`borrador-${borrador.document}`} className="block w-full rounded-xl border border-dashed border-fono/40 bg-fono/[.04] p-3 text-left text-sm hover:border-fono" onClick={() => usarBorrador(borrador)}><strong>{borrador.name}</strong><span className="ml-2 rounded border border-fono/40 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-fono-light">Pre-cliente</span><span className="ml-3 text-mute">{borrador.document}</span></button>)}{!matches.length && !borradores.length && !error && <p className="text-xs text-fono-light">Cliente nuevo: se creará automáticamente al confirmar la venta.</p>}</div>}
    {value.id && <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-ok/30 bg-ok/10 px-3 py-2 text-xs"><span className="inline-flex items-center gap-1.5 font-bold text-ok"><Icon name="check" className="h-3.5 w-3.5" /> Cliente seleccionado</span><span className="font-semibold text-fore">{value.name}</span>{value.document ? <span className="text-mute">{value.document}</span> : null}{value.phone ? <span className="text-mute">{value.countryCode} {value.phone}</span> : null}{value.pricingTier === 'WHOLESALE' ? <span className="rounded border border-fono/30 px-1.5 py-0.5 font-bold text-fono-light">Mayorista</span> : null}{nombreLista ? <span className="rounded border border-fono/30 px-1.5 py-0.5 font-bold text-fono-light" title="Lista de precios asignada a esta ficha">Lista {nombreLista}</span> : null}{Number(value.creditLimitPyg || 0) > 0 ? <span className="rounded border border-warn/30 px-1.5 py-0.5 font-bold text-warn">Crédito hasta {montoGs(value.creditLimitPyg)}{value.creditDays ? ' · ' + value.creditDays + ' días' : ''}</span> : null}<button type="button" className="ml-auto rounded-lg border border-bad/40 px-2 py-1 font-semibold text-bad transition hover:bg-bad/10" onClick={quitarCliente}>× Quitar cliente</button></div>}
    {error && <p role="alert" className="text-sm text-bad">{error}</p>}
    <details open={abierto} onToggle={event => setAbierto(event.currentTarget.open)} className={cn('rounded-xl border border-ink-600 p-3', colapsarFicha && 'py-0 open:pb-3')}><summary className="flex cursor-pointer items-center gap-2 text-sm font-medium text-fono-light"><Icon name="user" className="h-3.5 w-3.5" /> Datos de contacto, RUC/CI y direcciones</summary>
      <div className="mt-3 space-y-4">
        <section aria-label="Identidad" className="space-y-2">
          <h4 className={TITULO_SECCION}>Identidad</h4>
          <GrillaCampos>
            <Campo como="div" rotulo="CI o RUC"><RucField ariaLabel="CI o RUC del cliente" disabled={false} value={value.document || ''} onChange={(document) => onChange({ ...clearCheckoutIdentity(value), document })} onAplicar={aplicarDocumento} esDemo={esDemo} /></Campo>
          </GrillaCampos>
        </section>
        <section aria-label="Contacto" className="space-y-2">
          <h4 className={TITULO_SECCION}>Contacto</h4>
          <GrillaCampos>
            <Campo como="div" ancho="telefono" rotulo="Teléfono"><PhoneField countryCode={value.countryCode || '+595'} phone={value.phone || ''} onCountryCodeChange={countryCode => onChange({ ...value, countryCode })} onChange={phone => onChange({ ...value, phone })} countryAriaLabel="Código de país" phoneAriaLabel="Teléfono del cliente" /></Campo>
            <Campo ancho="correo" rotulo="Correo"><EmailField aria-label="Correo del cliente" value={value.email || ''} onChange={(email) => onChange({ ...value, email })} placeholder="cliente@correo.com" /></Campo>
          </GrillaCampos>
        </section>
        {onBillingChange && (
          <section aria-label="Facturación" className="rounded-xl border border-ink-600 p-3">
            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium text-fono-light md:min-h-0">
              <input
                type="checkbox"
                className="h-4 w-4 accent-fono"
                checked={facturarAOtro}
                onChange={event => {
                  setFacturarAOtro(event.target.checked)
                  if (!event.target.checked) onBillingChange({ name: '', document: '' })
                }}
              />
              <Icon name="tag" className="h-3.5 w-3.5" /> Facturar a otro titular (opcional)
            </label>
            {facturarAOtro && (
              <>
                <p className="mt-2 text-xs text-mute">Factura a nombre de otra persona o empresa (esposo/a, padre, RUC): buscá por RUC/cédula o escribí el nombre y los datos fiscales se completan solos.</p>
                <GrillaCampos className="mt-3">
                  <Campo ancho="flexible" rotulo="Nombre y apellido del titular"><Input aria-label="Nombre del titular de factura" value={billingTo?.name || ''} onChange={event => onBillingChange({ ...clearCheckoutIdentity(billingTo), name: normalizarNombre(event.target.value), displayName: normalizarNombre(event.target.value) })} placeholder="Nombre y apellido" /></Campo>
                  <Campo como="div" ancho="documento" rotulo="RUC del titular"><RucField ariaLabel="RUC del titular de factura" value={billingTo?.document || ''} onChange={(document) => onBillingChange({ ...clearCheckoutIdentity(billingTo), document })} onAplicar={(datos) => onBillingChange(applyCheckoutIdentity(billingTo || {}, datos))} esDemo={esDemo} /></Campo>
                </GrillaCampos>
              </>
            )}
          </section>
        )}
        <section aria-label="Direcciones" className="space-y-2">
          <div className="flex items-center justify-between"><h4 className={TITULO_SECCION}>Direcciones</h4><Button type="button" variant="outline" onClick={addAddress}>+ Dirección</Button></div>
          {!value.addresses?.length && <p className="text-xs text-mute">Sin dirección cargada. Podés continuar con retiro en tienda.</p>}
          {(value.addresses || []).map((address, index) => (
            <div key={index} data-testid="direccion-tarjeta" className="space-y-3 rounded-xl border border-ink-600 p-3">
              <GrillaCampos>
                <Campo ancho="etiqueta" rotulo="Etiqueta"><Input autoCapitalize="words" value={address.label || ''} onChange={event => setAddress(index, 'label', capitalizarPrimera(event.target.value))} placeholder="Casa, trabajo…" /></Campo>
                <Campo como="div" ancho="pais" rotulo="País"><CountrySelect value={address.country ?? 'Paraguay'} onChange={country => setAddress(index, 'country', country)} /></Campo>
                <Campo como="div" ancho="ciudad" rotulo="Ciudad">
                  <CityAutocomplete esDemo={esDemo} value={address.city || ''} onSelect={(city, department) => onChange({ ...value, addresses: value.addresses.map((item, position) => position === index ? { ...item, city, department } : item) })} placeholder="Asunción" />
                  {address.department && address.department.trim().toLowerCase() !== String(address.city || '').trim().toLowerCase() && <span className="block truncate px-1 pt-1 text-[11px] text-fono-light">{address.department}</span>}
                </Campo>
              </GrillaCampos>
              <div className="flex flex-col gap-2 md:flex-row md:items-end">
              <GrillaCampos className="min-w-0 flex-1">
                <Campo ancho="flexible" rotulo="Dirección"><Input autoCapitalize="sentences" value={address.address || ''} onChange={event => setAddress(index, 'address', capitalizarPrimera(event.target.value))} placeholder="Calle, número y referencia" /></Campo>
                <Campo ancho="flexible" rotulo="Notas"><Input autoCapitalize="sentences" value={address.notes || ''} onChange={event => setAddress(index, 'notes', capitalizarPrimera(event.target.value))} placeholder="Horario, piso, referencia" /></Campo>
              </GrillaCampos>
              <div className="self-end"><IconAction icon="trash" tone="bad" label="Quitar dirección" onClick={() => pedirQuitarDireccion(index)} /></div>
              </div>
            </div>
          ))}
        </section>
      </div>
    </details>
    <ConfirmDialog
      open={quitarDireccion !== null}
      title="¿Quitar esta dirección?"
      description="Se elimina de la ficha del cliente cuando guardes los cambios."
      confirmLabel="Quitar dirección"
      variant="danger"
      onCancel={() => setQuitarDireccion(null)}
      onConfirm={() => { removeAddress(quitarDireccion); setQuitarDireccion(null) }}
    />
  </div>
}
