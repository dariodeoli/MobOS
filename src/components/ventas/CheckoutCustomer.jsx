import { guardarFichaClienteDemo } from '@/lib/demoCheckoutCustomer'
import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api/client'
import { Button, IconAction, Input } from '@/components/ui'
import { ConfirmDialog, FormActions, Modal } from '@/components/shared/popupKit'
import { Info } from 'lucide-react'
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
import { applyCheckoutIdentity, checkoutVisibleName, clearCheckoutIdentity } from '@/lib/checkoutIdentity'
import { customerIdentityPayload } from '@/lib/customerIdentity'
import { buscarPreClientes, guardarPreCliente, diasDeBorrador } from '@/lib/preClientes'
import { listarClientesDemo } from '@/lib/demoClientes'
import { useSesion } from '@/lib/sesion'
import { useModulos } from '@/lib/useModulos'
import { cn } from '@/lib/utils'
import { fechaLegible } from '@/utils/pedido'
import { avisoClienteBloqueado } from '@/utils/cobroPos'
import ClienteResumenPopup from '@/components/customers/ClienteResumenPopup'
import { detectarDocumento, fichaTieneDocumento, MENSAJE_DOCUMENTO_INVALIDO, nombreVisibleDesdeRuc } from '@/lib/clienteDocumento'
import { consultarRucAdmitido, sinAccesoConsultaRuc } from '@/components/shared/RucField'

// Los clientes demo no traen `stats`: se arman con su historial de ejemplo.
function estadisticasDemo(cliente) {
  const pedidos = cliente?.demoProfile?.orders
  if (!Array.isArray(pedidos)) return null
  const ultimo = pedidos.reduce((max, o) => (o.createdAt && (!max || o.createdAt > max) ? o.createdAt : max), null)
  return { orders: pedidos.length, lastOrderAt: ultimo, pendingPyg: pedidos.reduce((suma, o) => suma + Number(o.pendingPyg || 0), 0) }
}

const TITULO_SECCION = 'text-xs font-semibold text-mute'
const emptyAddress = () => ({ label: 'Principal', address: '', city: '', department: '', country: 'Paraguay', notes: '', isDefault: true })
const clienteVacio = () => ({ id: undefined, name: '', phone: '', countryCode: '+595', email: '', document: '', pricingTier: 'RETAIL', priceListId: null, creditLimitPyg: null, creditDays: null, addresses: [], billingName: '', billingDocument: '' })
const customerValue = (customer) => ({
  ...('nameOfficial' in customer ? { nameOfficial: customer.nameOfficial, displayName: customer.displayName, identityKind: customer.identityKind ?? null, givenNames: customer.givenNames ?? null, surnames: customer.surnames ?? null, personConfirmed: customer.identityKind === 'PERSON' && Boolean(customer.givenNames?.trim() && customer.surnames?.trim()) } : {}),
  id: customer.id, name: customer.name || '', phone: customer.phone || '', countryCode: customer.countryCode || '+595',
  email: customer.email || '', document: customer.document || '',
  pricingTier: customer.pricingTier || 'RETAIL', priceListId: customer.priceListId || null, creditLimitPyg: customer.creditLimitPyg ?? null, creditDays: customer.creditDays ?? null,
  // Keep the server address id so checkout can offer the saved delivery
  // address without turning it into an untracked free-text address.
  addresses: Array.isArray(customer.addresses) ? customer.addresses.map(address => ({ ...address })) : [],
  billingName: customer.billingName || '', billingDocument: customer.billingDocument || '',
})

export default function CheckoutCustomer({ value, onChange, esDemo, billingTo, onBillingChange, nombreLista = '', colapsarFicha = false, errorNombre = '', onStats, onSelected }) {
  const { empresa } = useSesion()
  const mayoristas = useModulos().activo('mayoristas')
  const empresaId = empresa?.id || null
  // Only the outer search writes this query; editing the card never selects
  // a different customer merely because its visible name matches.
  const [searchQuery, setSearchQuery] = useState('')
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
  const [guardandoFicha, setGuardandoFicha] = useState(false)
  const [guardandoDireccion, setGuardandoDireccion] = useState(null)
  const [feedbackFicha, setFeedbackFicha] = useState('')
  // Popup único «Completar cliente»: se abre al crear por CI/RUC (Enter) sin coincidencias.
  const [completar, setCompletar] = useState(false)
  const [feedbackFichaTipo, setFeedbackFichaTipo] = useState('status')
  // Registro completo del cliente elegido (con sus estadísticas): se guarda
  // aparte del valor del formulario para no viajar en el payload de la venta.
  const [registro, setRegistro] = useState(null)
  const tarjetaRef = useRef(null)
  const cajaRef = useRef(null)
  const editarClienteRef = useRef(null)
  const contactoTriggerRef = useRef(null)
  const modalEstabaAbierto = useRef(false)
  useEffect(() => {
    const cerrado = modalEstabaAbierto.current && !abierto
    modalEstabaAbierto.current = colapsarFicha && abierto
    if (!colapsarFicha || !cerrado) return
    // The card/summary trigger is remounted when the POS editor closes.
    // Restore to its logical successor after the shared Modal cleans up.
    const frame = requestAnimationFrame(() => {
      (editarClienteRef.current || contactoTriggerRef.current)?.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [abierto, colapsarFicha])
  const enfocarBusqueda = useRef(false)
  // Alta por documento (CI/RUC sin ficha): consulta única por número, con
  // resultado en memoria y descarte de respuestas viejas.
  const [consultandoDoc, setConsultandoDoc] = useState(false)
  const valueRef = useRef(value)
  valueRef.current = value
  const docSeq = useRef(0)
  const docCache = useRef(new Map())
  const docAuto = useRef(new Set())
  const resolverDocumentoRef = useRef(null)
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
    const query = searchQuery.trim()
    if (!empresaId || esDemo || value.id || !query) { setBorradores([]); return }
    setBorradores(buscarPreClientes(empresaId, query))
  }, [searchQuery, value.id, empresaId, esDemo])
  useEffect(() => {
    let active = true
    const query = searchQuery.trim()
    if (!query || value.id || (colapsarFicha && abierto)) { setMatches([]); return () => { active = false } }
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
  }, [searchQuery, value.id, esDemo, abierto, colapsarFicha])

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

  // Escribir una CI/RUC sin ficha: se consulta el validador de RUC y se abre el
  // alta con nombre y documento; si ya hay una ficha con ese documento, se liga.
  async function resolverDocumento(texto, { auto = false } = {}) {
    const doc = detectarDocumento(texto)
    if (!doc) return false
    if (doc.estado === 'dv_invalido') { if (!auto) setError(MENSAJE_DOCUMENTO_INVALIDO); return true }
    const { identity } = doc
    const seq = ++docSeq.current
    const vigente = () => seq === docSeq.current && !valueRef.current.id && valueRef.current.name === texto
    setConsultandoDoc(true)
    setError('')
    try {
      let existentes
      try {
        const filas = esDemo ? listarClientesDemo() : await api.get(`/api/customers?q=${encodeURIComponent(identity.base)}`)
        existentes = filas.filter(cliente => fichaTieneDocumento(cliente, identity))
      } catch { if (vigente()) setError('No se pudo consultar clientes. Reintentá antes de confirmar.'); return true }
      if (!vigente()) return true
      if (existentes.length) { if (!auto) elegirCliente(existentes[0]); return true }
      let datos = docCache.current.get(identity.fullRuc)
      if (datos === undefined) {
        try {
          datos = await consultarRucAdmitido(identity, { demo: esDemo })
          docCache.current.set(identity.fullRuc, datos)
        } catch (cause) {
          if (!sinAccesoConsultaRuc(cause)) {
            // Falla transitoria (cuota, red): se avisa solo si la persona lo pidió.
            if (!auto && vigente()) { setFeedbackFichaTipo('error'); setFeedbackFicha(cause?.message || 'No se pudo consultar el RUC. Completá los datos manualmente.') }
            if (auto) return true
          } else docCache.current.set(identity.fullRuc, null)
          datos = null
        }
      }
      if (!vigente()) return true
      const base = clearCheckoutIdentity(valueRef.current)
      if (datos && !auto && (esDemo || empresaId)) {
        const visible = nombreVisibleDesdeRuc(datos)
        const siguiente = { ...applyCheckoutIdentity(base, datos), name: visible, displayName: visible }
        try {
          let guardado
          if (esDemo) guardado = guardarFichaClienteDemo(siguiente)
          else {
            const respuesta = await api.post('/api/customers', {
              name: checkoutVisibleName(siguiente, visible),
              ...customerIdentityPayload(siguiente),
              document: String(siguiente.document || '').trim() || undefined,
              countryCode: siguiente.countryCode || '+595',
            })
            guardado = respuesta?.customer || respuesta
            if (!guardado?.id) throw new Error('El servidor no devolvió la ficha del cliente.')
            guardado = { ...siguiente, ...guardado, id: guardado.id, document: guardado.document || siguiente.document }
          }
          if (!vigente()) return true
          setSearchQuery(''); setMatches([]); setBorradores([])
          setRegistro(guardado)
          onChange(customerValue(guardado))
          onSelected?.(guardado)
          setFeedbackFicha('')
          setCompletar(true)
          return true
        } catch (cause) {
          setFeedbackFichaTipo('error')
          setFeedbackFicha(cause?.message || 'No se pudo crear el cliente. Completá los datos manualmente.')
        }
      }
      if (!vigente()) return true
      // Automático (pausa de 1,2 s al escribir): NUNCA crea la ficha y sin datos verificados del RUC no hace nada
      // (no abre el editor ni borra lo escrito: un número parcial o un teléfono no es un cliente). Con datos solo
      // prellena el editor para que la persona confirme con «Guardar». Crear la ficha y abrir «Completar cliente»
      // queda para Enter o el botón «Consultar RUC y crear cliente», que reusan esta misma consulta en memoria.
      if (auto && !datos) return true
      if (datos) {
        const visible = nombreVisibleDesdeRuc(datos)
        onChange({ ...applyCheckoutIdentity(base, datos), name: visible, displayName: visible })
        setFeedbackFichaTipo('status')
        setFeedbackFicha('Datos del RUC cargados. Completá teléfono y correo y confirmá el cliente.')
      } else {
        onChange({ ...base, document: identity.fullRuc, name: '', displayName: '' })
        setFeedbackFichaTipo('status')
        setFeedbackFicha('Escribí el nombre del cliente y confirmá la ficha.')
      }
      setSearchQuery('')
      setMatches([])
      setBorradores([])
      setAbierto(true)
      return true
    } finally {
      if (seq === docSeq.current) setConsultandoDoc(false)
    }
  }
  useEffect(() => { resolverDocumentoRef.current = resolverDocumento })
  // Al terminar de escribir un documento válido (pausa), se consulta solo.
  useEffect(() => {
    const doc = detectarDocumento(searchQuery)
    if (!doc || doc.estado !== 'valido' || value.id || (colapsarFicha && abierto) || doc.identity.base.length < 6) return undefined
    if (docAuto.current.has(doc.identity.fullRuc)) return undefined
    const texto = searchQuery
    const timer = setTimeout(() => {
      docAuto.current.add(doc.identity.fullRuc)
      resolverDocumentoRef.current?.(texto, { auto: true })
    }, 1200)
    return () => clearTimeout(timer)
  }, [searchQuery, value.id, colapsarFicha, abierto])

  // Solo el consentimiento del extractor aplica la identidad fiscal exacta.
  // El nombre de mostrador queda separado, sin adivinar nombres/apellidos.
  async function aplicarDocumento(datos) {
    if (guardandoFicha || guardandoDireccion !== null) return
    const next = applyCheckoutIdentity(value, datos)
    if (esDemo) {
      onChange(next)
      try {
        const guardado = guardarFichaClienteDemo(next)
        onChange(customerValue(guardado))
        setRegistro(guardado)
        setFeedbackFichaTipo('success')
        setFeedbackFicha('Datos RUC guardados en esta demo. Se descartan al recargar.')
        onSelected?.(guardado)
      } catch (cause) {
        setFeedbackFichaTipo('error')
        setFeedbackFicha(cause?.message || 'No se pudo guardar el cliente en esta demo.')
        setAbierto(true)
      }
      return
    }
    if (!empresaId) { onChange(next); return }
    setGuardandoFicha(true)
    setFeedbackFichaTipo('status')
    setFeedbackFicha('Guardando datos verificados…')
    try {
      const payload = {
        name: checkoutVisibleName(next),
        ...customerIdentityPayload(next),
        document: String(next.document || '').trim() || undefined,
        phone: String(next.phone || '').trim() || undefined,
        countryCode: next.countryCode || '+595',
        email: String(next.email || '').trim() || undefined,
      }
      const respuesta = value.id
        ? await api.patch(`/api/customers/${encodeURIComponent(value.id)}`, payload)
        : await api.post('/api/customers', payload)
      const guardado = respuesta?.customer || respuesta
      if (!guardado?.id) throw new Error('El servidor no devolvió la ficha verificada.')
      // El proveedor puede devolver una ficha existente deduplicada. La
      // respuesta del servidor es la fuente de verdad para direcciones e IDs;
      // los datos del extractor sólo completan campos que no haya devuelto.
      onChange(customerValue({ ...next, ...guardado, id: guardado.id, document: guardado.document || next.document }))
      setRegistro(guardado)
      setFeedbackFichaTipo('success')
      setFeedbackFicha('Datos RUC guardados en la ficha del cliente.')
    } catch (cause) {
      onChange(next)
      if (empresaId && next.nameOfficial) guardarPreCliente(empresaId, next, { dias: diasDeBorrador(empresa) })
      setFeedbackFichaTipo('error')
      setFeedbackFicha(cause?.message || 'No se pudieron guardar los datos RUC. Revisá e intentá de nuevo.')
    } finally {
      setGuardandoFicha(false)
    }
  }
  function usarBorrador(borrador) {
    setSearchQuery('')
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
    setSearchQuery('')
    setEditar(false)
    setRegistro(customer)
    onChange(customerValue(customer))
    // La factura a otro titular que el cliente ya usó se propone de nuevo,
    // salvo que esta venta ya tenga datos escritos.
    const facturacion = datosFacturacionCliente(customer)
    if (facturacion && onBillingChange && !billingTo?.name?.trim() && !billingTo?.document?.trim()) onBillingChange(facturacion)
    onSelected?.(customer)
  }
  async function confirmarFicha() {
    if (guardandoFicha || guardandoDireccion !== null) return
    const nombre = String(value.name || '').trim()
    if (!nombre) {
      setFeedbackFichaTipo('error')
      setFeedbackFicha('Ingresá el nombre del cliente antes de confirmar.')
      setAbierto(true)
      return
    }
    setGuardandoFicha(true)
    setFeedbackFichaTipo('status')
    setFeedbackFicha('Guardando cliente…')
    try {
      const payload = {
        name: checkoutVisibleName(value, nombre),
        ...customerIdentityPayload(value),
        document: String(value.document || '').trim() || undefined,
        phone: String(value.phone || '').trim() || undefined,
        countryCode: value.countryCode || '+595',
        email: String(value.email || '').trim() || undefined,
        addresses: Array.isArray(value.addresses) ? value.addresses : [],
        // No enviar null cuando esta venta no factura a otro titular: así no
        // se borra la identidad fiscal maestra del cliente por confirmar una
        // ficha de contacto sin tocar la facturación.
        ...(facturarAOtro ? {
          billingName: String(billingTo?.name || '').trim() || null,
          billingDocument: String(billingTo?.document || '').trim() || null,
        } : {}),
      }
      const respuesta = esDemo
        ? guardarFichaClienteDemo({ ...value, ...payload })
        : value.id
          ? await api.patch(`/api/customers/${encodeURIComponent(value.id)}`, payload)
          : await api.post('/api/customers', payload)
      const guardado = respuesta?.customer || respuesta
      if (!guardado?.id) throw new Error('El servidor no devolvió la ficha guardada.')
      const siguiente = customerValue(guardado)
      onChange(siguiente)
      setRegistro(guardado)
      setFeedbackFichaTipo('success')
      setFeedbackFicha(esDemo ? 'Cliente guardado en esta demo. Se descarta al recargar.' : 'Cliente guardado correctamente.')
      if (esDemo) onSelected?.(guardado)
      setAbierto(false)
      setEditar(false)
      return true
    } catch (cause) {
      setFeedbackFichaTipo('error')
      setFeedbackFicha(cause?.message || 'No se pudo guardar el cliente. Revisá los datos e intentá de nuevo.')
      if (!completar) setAbierto(true)
      return false
    } finally {
      setGuardandoFicha(false)
    }
  }
  function quitarCliente() {
    docSeq.current += 1; setConsultandoDoc(false)
    setSearchQuery(''); setMatches([]); setError(''); setEditar(false); setRegistro(null); setFichaAbierta(false)
    enfocarBusqueda.current = true
    onChange(clienteVacio())
  }

  const setAddress = (index, field, next) => onChange({ ...value, addresses: value.addresses.map((address, position) => position === index ? { ...address, [field]: next } : address) })
  const addAddress = () => onChange({ ...value, addresses: [...(value.addresses || []), { ...emptyAddress(), label: `Dirección ${(value.addresses?.length || 0) + 1}`, isDefault: !value.addresses?.length }] })
  async function guardarDireccion(index) {
    if (guardandoFicha || guardandoDireccion !== null) return
    if (!value.id) {
      setFeedbackFichaTipo('error')
      setFeedbackFicha('Guardá primero el cliente para agregarle una dirección.')
      return
    }
    setGuardandoDireccion(index)
    setFeedbackFichaTipo('status')
    setFeedbackFicha('Guardando dirección…')
    try {
      const respuesta = esDemo
        ? guardarFichaClienteDemo(value)
        : await api.patch(`/api/customers/${encodeURIComponent(value.id)}`, { addresses: value.addresses })
      const guardado = respuesta?.customer || respuesta
      if (!guardado?.id) throw new Error('El servidor no devolvió la dirección guardada.')
      onChange(customerValue(guardado))
      setRegistro(guardado)
      setFeedbackFichaTipo('success')
      setFeedbackFicha(esDemo ? 'Dirección guardada en esta demo. Se descarta al recargar.' : 'Dirección guardada en el cliente.')
    } catch (cause) {
      setFeedbackFichaTipo('error')
      setFeedbackFicha(cause?.message || 'No se pudo guardar la dirección.')
    } finally {
      setGuardandoDireccion(null)
    }
  }
  const abrirEdicion = () => { setSearchQuery(''); setEditar(true); setAbierto(true) }
  // Una dirección vacía se quita sin preguntar; con datos pide confirmación.
  const pedirQuitarDireccion = (index) => {
    const { address = '', city = '', notes = '' } = value.addresses[index] || {}
    if ([address, city, notes].some(texto => String(texto).trim())) setQuitarDireccion(index)
    else removeAddress(index)
  }
  const removeAddress = (index) => onChange({ ...value, addresses: value.addresses.filter((_, position) => position !== index).map((address, position) => ({ ...address, isDefault: position === 0 ? true : address.isDefault })) })

  const popupCompletar = completar && value.id ? (
    <Modal open title="Completar cliente" size="formulario" testId="completar-cliente" onClose={() => setCompletar(false)}>
      <div className="space-y-4">
        <p data-testid="completar-cliente-resumen" className="text-sm text-mute"><b className="text-fore">{value.name}</b>{value.document ? ` · ${value.document}` : ''}</p>
        <GrillaCampos>
          <Campo como="div" rotulo="Teléfono"><PhoneField countryCode={value.countryCode || '+595'} phone={value.phone || ''} onCountryCodeChange={countryCode => onChange({ ...value, countryCode })} onChange={phone => onChange({ ...value, phone })} countryAriaLabel="Código de país" phoneAriaLabel="Teléfono del cliente" /></Campo>
          <Campo ancho="correo" rotulo="Correo"><EmailField aria-label="Correo del cliente" value={value.email || ''} onChange={(email) => onChange({ ...value, email })} placeholder="cliente@correo.com" /></Campo>
        </GrillaCampos>
        {(value.addresses || []).map((address, index) => (
          <div key={index} data-testid="direccion-tarjeta" className="space-y-3 rounded-xl border border-ink-600 p-3">
            <GrillaCampos>
              <Campo como="div" ancho="ciudad" rotulo="Ciudad"><CityAutocomplete esDemo={esDemo} value={address.city || ''} onSelect={(city, department) => onChange({ ...value, addresses: value.addresses.map((item, position) => position === index ? { ...item, city, department } : item) })} placeholder="Asunción" /></Campo>
              <Campo ancho="flexible" rotulo="Dirección"><Input autoCapitalize="sentences" value={address.address || ''} onChange={event => setAddress(index, 'address', capitalizarPrimera(event.target.value))} placeholder="Calle, número y referencia" /></Campo>
            </GrillaCampos>
            <div className="flex justify-end"><IconAction icon="trash" tone="bad" label="Quitar dirección" onClick={() => pedirQuitarDireccion(index)} /></div>
          </div>
        ))}
        <div><Button type="button" variant="outline" onClick={addAddress}>+ Agregar dirección</Button></div>
        <div className="flex items-center justify-end gap-3">
          {feedbackFicha && <span role={feedbackFichaTipo === 'error' ? 'alert' : 'status'} className={cn('min-w-0 text-xs font-semibold', feedbackFichaTipo === 'error' ? 'text-bad-text' : 'text-fono-light')}>{feedbackFicha}</span>}
          <Button type="button" disabled={guardandoFicha} onClick={async () => { if (await confirmarFicha()) setCompletar(false) }}>Guardar</Button>
        </div>
      </div>
    </Modal>
  ) : null

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
            <button type="button" className="toque-44 grid h-11 w-11 place-items-center rounded-lg text-mute transition hover:bg-ink-700 hover:text-fore md:h-8 md:w-8" ref={editarClienteRef} title="Editar datos" aria-label="Editar datos del cliente" onClick={abrirEdicion}>
              <Icon name="edit" className="h-4 w-4" />
            </button>
            <button type="button" className="toque-44 grid h-11 w-11 place-items-center rounded-lg text-bad transition hover:bg-bad/10 md:h-8 md:w-8" title="Quitar cliente" aria-label="Quitar cliente" onClick={quitarCliente}>
              <Icon name="close" className="h-4 w-4" />
            </button>
          </span>
        </div>
        <div data-testid="cliente-chips" className="mt-1 flex items-center gap-1.5 overflow-x-auto whitespace-nowrap pb-0.5 md:flex-wrap md:overflow-visible">
          {mayoristas && <span className="rounded border border-fono/30 px-1.5 py-0.5 font-bold text-fono-light">{value.pricingTier === 'WHOLESALE' ? 'Mayorista' : 'Cliente final'}</span>}
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
        {onBillingChange && (
          <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-ok/20 pt-2 text-xs">
            <span className="font-semibold text-mute">Factura:</span>
            <span className="min-w-0 truncate text-fore">{facturarAOtro && (billingTo?.name || billingTo?.document) ? (billingTo.name || billingTo.document) : 'titular del cliente'}</span>
            <button type="button" className="ml-auto min-h-9 rounded-lg border border-fono/35 px-2.5 font-semibold text-fono-light transition hover:bg-fono/10" onClick={() => { setFacturarAOtro(true); abrirEdicion() }}>
              {facturarAOtro && (billingTo?.name || billingTo?.document) ? 'Cambiar titular' : 'Facturar a otro'}
            </button>
          </div>
        )}
        {value.addresses?.length > 0 && (
          <div data-testid="cliente-direcciones-guardadas" className="mt-2 border-t border-ok/20 pt-2 text-xs">
            <span className="font-semibold text-mute">Direcciones guardadas:</span>{' '}
            <span className="text-fore">{value.addresses.map(address => address.label || address.city || address.address).filter(Boolean).join(' · ')}</span>
          </div>
        )}
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
        {feedbackFicha && <p role={feedbackFichaTipo === 'error' ? 'alert' : 'status'} data-testid="cliente-guardado" className={cn('mt-1 font-semibold', feedbackFichaTipo === 'error' ? 'text-bad-text' : feedbackFichaTipo === 'success' ? 'text-ok' : 'text-fono-light')}>{feedbackFicha}</p>}
        {popupCompletar}
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

  const fichaContenido = (
    <div className="mt-1 space-y-3">
        <section aria-label="Identidad" className="space-y-2">
          <h4 className={TITULO_SECCION}>Identidad y contacto</h4>
          <GrillaCampos>
            {(colapsarFicha || typeof value.nameOfficial === 'string') && <Campo ancho="flexible" rotulo={<>Nombre del cliente{typeof value.nameOfficial === 'string' && <span className="ml-1 inline-flex align-middle text-mute" title="Nombre visible para el mostrador. La identidad fiscal se conserva aparte."><Info aria-hidden="true" className="h-3.5 w-3.5" /></span>}</>}><Input aria-label="Nombre del cliente en ficha" maxLength={200} value={value.displayName ?? (value.name || '')} onChange={event => onChange({ ...value, name: event.target.value, displayName: event.target.value })} placeholder="Nombre y apellido o razón social" aria-invalid={errorNombre ? true : undefined} />{errorNombre && <span role="alert" className="mt-1 block text-xs text-bad-text">{errorNombre}</span>}</Campo>}
            <Campo como="div" ancho="documento" rotulo="CI o RUC"><RucField ariaLabel="CI o RUC del cliente" disabled={guardandoFicha} value={value.document || ''} onChange={(document) => onChange({ ...clearCheckoutIdentity(value), document })} onAplicar={(datos) => { const antes = value; aplicarDocumento(datos); return () => onChange(antes) }} esDemo={esDemo} /></Campo>
            <Campo como="div" ancho="telefono" rotulo="Teléfono" onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); confirmarFicha() } }}><PhoneField countryCode={value.countryCode || '+595'} phone={value.phone || ''} onCountryCodeChange={countryCode => onChange({ ...value, countryCode })} onChange={phone => onChange({ ...value, phone })} countryAriaLabel="Código de país" phoneAriaLabel="Teléfono del cliente" /></Campo>
            <Campo ancho="correo" rotulo="Correo"><EmailField aria-label="Correo del cliente" value={value.email || ''} onChange={(email) => onChange({ ...value, email })} placeholder="cliente@correo.com" /></Campo>
          </GrillaCampos>
          {typeof value.nameOfficial === 'string' && <p className="text-xs text-mute" data-testid="ficha-razon-social">Razón social fiscal (se conserva aparte): <b className="break-words">{value.nameOfficial}</b></p>}
        </section>
        <FormActions className="items-center">
          {feedbackFicha && <span role={feedbackFichaTipo === 'error' ? 'alert' : 'status'} data-testid="cliente-guardado" className={cn('min-w-0 text-xs font-semibold md:mr-auto', feedbackFichaTipo === 'error' ? 'text-bad-text' : feedbackFichaTipo === 'success' ? 'text-ok' : 'text-fono-light')}>{feedbackFicha}</span>}
          {editar && colapsarFicha && <Button type="button" variant="outline" className="min-h-11 md:h-11" onClick={() => { setAbierto(false); setEditar(false) }}>Cerrar edición</Button>}
          <Button type="button" data-testid="confirmar-cliente" disabled={guardandoFicha} className="min-h-11 md:h-11" onClick={confirmarFicha}>Confirmar cliente</Button>
        </FormActions>
        {onBillingChange && (
          <section aria-label="Facturación" className="rounded-xl border border-ink-600 px-3 py-2">
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
                <p className="mt-1 text-xs text-mute">Buscá por RUC o cédula, o escribí el nombre: los datos fiscales se completan solos.</p>
                <GrillaCampos className="mt-2">
                  <Campo como="div" ancho="documento" rotulo="RUC del titular"><RucField ariaLabel="RUC del titular de factura" value={billingTo?.document || ''} onChange={(document) => onBillingChange({ ...clearCheckoutIdentity(billingTo), document })} onAplicar={(datos) => { const antes = billingTo || { name: '', document: '' }; onBillingChange(applyCheckoutIdentity(billingTo || {}, datos)); return () => onBillingChange(antes) }} esDemo={esDemo} /></Campo>
                  <Campo ancho="flexible" rotulo="Nombre y apellido del titular"><Input aria-label="Nombre del titular de factura" value={billingTo?.name || ''} onChange={event => onBillingChange({ ...clearCheckoutIdentity(billingTo), name: normalizarNombre(event.target.value), displayName: normalizarNombre(event.target.value) })} placeholder="Nombre y apellido" /></Campo>
                </GrillaCampos>
              </>
            )}
          </section>
        )}
        <section aria-label="Direcciones" className="space-y-2">
          <div className="flex items-center justify-between"><h4 className={TITULO_SECCION}>Direcciones</h4><Button type="button" variant="outline" onClick={addAddress}>Nueva dirección</Button></div>
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
              <div className="flex items-center gap-2 self-end">
                {value.id && <Button type="button" variant="outline" disabled={guardandoDireccion !== null} onClick={() => guardarDireccion(index)}>{guardandoDireccion === index ? 'Guardando…' : 'Guardar dirección en cliente'}</Button>}
                <IconAction icon="trash" tone="bad" label="Quitar dirección" onClick={() => pedirQuitarDireccion(index)} />
              </div>
              </div>
            </div>
          ))}
        </section>
      </div>
  )

  return <div ref={cajaRef} className="space-y-3 md:col-span-2">
    <label className="block text-sm font-semibold"><span className="sr-only">Cliente</span><Input aria-label="Nombre, teléfono, CI o RUC del cliente" aria-invalid={errorNombre ? true : undefined} value={value.name} placeholder="Buscar cliente o escribir un nombre nuevo" onChange={event => { docSeq.current += 1; setConsultandoDoc(false); setSearchQuery(event.target.value); onChange({ ...clearCheckoutIdentity(value), id: undefined, name: event.target.value, displayName: event.target.value }) }} onKeyDown={event => {
      if (event.key !== 'Enter') return
      event.preventDefault()
      if (matches[0]) elegirCliente(matches[0])
      else if (detectarDocumento(value.name)) resolverDocumento(value.name)
      else if (value.name.trim()) onSelected?.()
    }} /></label>
    {errorNombre && <p role="alert" className="mt-1 text-xs text-bad-text">{errorNombre}</p>}
    {!value.id && value.name && <div className="space-y-1">{matches.map(customer => <button type="button" key={customer.id} className="block w-full rounded-xl border border-ink-600 p-3 text-left text-sm hover:border-fono" onClick={() => elegirCliente(customer)}><strong>{customer.name}</strong><span className="ml-3 text-mute">{customer.phone || customer.document || customer.email || 'Sin identificador'}</span>{customer.addresses?.length ? <span className="ml-2 text-xs text-fono-light">· {customer.addresses.length} dirección{customer.addresses.length === 1 ? '' : 'es'}</span> : null}{datosFacturacionCliente(customer) ? <span className="ml-2 text-xs text-mute">· Factura a {customer.billingName || customer.billingDocument}</span> : null}</button>)}{borradores.map(borrador => <button type="button" key={`borrador-${borrador.document}`} className="block w-full rounded-xl border border-dashed border-fono/40 bg-fono/[.04] p-3 text-left text-sm hover:border-fono" onClick={() => usarBorrador(borrador)}><strong>{borrador.name}</strong><span className="ml-2 rounded border border-fono/40 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-fono-light">Pre-cliente</span><span className="ml-3 text-mute">{borrador.document}</span></button>)}{!matches.length && !borradores.length && !error && !consultandoDoc && <p className="text-xs text-fono-light">Cliente nuevo: completá sus datos y confirmá la ficha para guardarlo.</p>}{!matches.length && !consultandoDoc && detectarDocumento(value.name)?.estado === 'valido' && <button type="button" data-testid="consultar-ruc-buscador" className="min-h-11 rounded-lg border border-fono/40 px-3 text-sm font-semibold text-fono-light hover:border-fono md:min-h-9" onClick={() => resolverDocumento(value.name)}>Consultar RUC y crear cliente</button>}</div>}
    {consultandoDoc && <p role="status" data-testid="consultando-ruc" className="text-xs font-semibold text-fono-light">Consultando RUC…</p>}
    {value.id && <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-ok/30 bg-ok/10 px-3 py-2 text-xs"><span className="inline-flex items-center gap-1.5 font-bold text-ok"><Icon name="check" className="h-3.5 w-3.5" /> Cliente seleccionado</span><span className="font-semibold text-fore">{value.name}</span>{value.document ? <span className="text-mute">{value.document}</span> : null}{value.phone ? <span className="text-mute">{value.countryCode} {value.phone}</span> : null}{value.pricingTier === 'WHOLESALE' ? <span className="rounded border border-fono/30 px-1.5 py-0.5 font-bold text-fono-light">Mayorista</span> : null}{nombreLista ? <span className="rounded border border-fono/30 px-1.5 py-0.5 font-bold text-fono-light" title="Lista de precios asignada a esta ficha">Lista {nombreLista}</span> : null}{Number(value.creditLimitPyg || 0) > 0 ? <span className="rounded border border-warn/30 px-1.5 py-0.5 font-bold text-warn">Crédito hasta {montoGs(value.creditLimitPyg)}{value.creditDays ? ' · ' + value.creditDays + ' días' : ''}</span> : null}<button type="button" className="ml-auto rounded-lg border border-bad/40 px-2 py-1 font-semibold text-bad transition hover:bg-bad/10" onClick={quitarCliente}>× Quitar cliente</button></div>}
    {error && <p role="alert" className="text-sm text-bad">{error}</p>}
    {colapsarFicha && abierto ? (
      <Modal open title="Datos del cliente" size="amplio" onClose={() => { setAbierto(false); setEditar(false) }}>
        {fichaContenido}
      </Modal>
    ) : (
      <details open={abierto} onToggle={event => { if (colapsarFicha && event.currentTarget.open) setSearchQuery(''); setAbierto(event.currentTarget.open) }} className={cn('rounded-xl border border-ink-600 p-3', colapsarFicha && 'py-0 open:pb-3')}>
        <summary ref={contactoTriggerRef} className="flex cursor-pointer items-center gap-2 text-sm font-medium text-fono-light"><Icon name="user" className="h-3.5 w-3.5" /> Datos de contacto, RUC/CI y direcciones</summary>
        {fichaContenido}
      </details>
    )}
    {!value.id && feedbackFicha && !abierto && <p role={feedbackFichaTipo === 'error' ? 'alert' : 'status'} data-testid="cliente-guardado" className={cn('mt-1 text-xs font-semibold', feedbackFichaTipo === 'error' ? 'text-bad-text' : feedbackFichaTipo === 'success' ? 'text-ok' : 'text-fono-light')}>{feedbackFicha}</p>}
    {popupCompletar}
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
