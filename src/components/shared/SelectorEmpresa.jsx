// Selector de empresa (#377): una misma cuenta puede operar varias empresas.
//
// `useCambioEmpresa` concentra la lógica (lista, aviso de ventas pendientes,
// cambio y alta) y lo usa el AppShell una sola vez; `SelectorEmpresa` pinta el
// control en el encabezado (menú) o en la hoja del perfil en móvil (lista), y
// `DialogosEmpresa` los modales. Cambiar de empresa recarga la app completa:
// nada de la anterior queda en memoria (el espejo local, la cola y las
// preferencias ya van por empresa).
import { useEffect, useRef, useState } from 'react'
import { useSesion } from '@/lib/sesion'
import { sessionApi } from '@/lib/api/session'
import { hayPendientesEnEmpresaActual, sincronizarCola } from '@/lib/offline/ventas'
import { Aviso, Badge, Button, FormField, Input, Modal, useToast } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import { cn } from '@/lib/utils'

const ROLES = { OWNER: 'Dueño', ADMIN: 'Admin', MEMBER: 'Miembro' }
const etiquetaRol = (rol) => ROLES[rol] || null

export const MENSAJE_SIN_CUENTA = 'Para cambiar o crear empresas, ingresá con tu PIN de dueño.'

// Mensaje claro para el error de un cambio directo (401/403 sin cuenta vinculada,
// 409 carrera de dos cambios a la vez); el resto conserva el texto del servidor.
export function mensajeErrorCambio(cause) {
  if (cause?.status === 401 || cause?.status === 403) return 'No se pudo cambiar de empresa. Ingresá con tu PIN de dueño e intentá de nuevo.'
  if (cause?.status === 409 || cause?.code === 'TENANT_SWITCH_RACE') return 'Otro cambio está en curso, intentá de nuevo.'
  return cause?.message || 'No se pudo cambiar de empresa. Probá de nuevo.'
}

export function useCambioEmpresa() {
  const { esDemo, empresa, usuario } = useSesion()
  const toast = useToast()
  const [sinCuenta, setSinCuenta] = useState(false)
  const [datos, setDatos] = useState({ tenants: [], canCreate: false })
  const [listaCargada, setListaCargada] = useState(false)
  const [dialogo, setDialogo] = useState(null) // { tipo: 'pendientes', destino } | { tipo: 'crear' }
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  const [nombre, setNombre] = useState('')
  const deepLinkProcesado = useRef(false)
  const empresaId = empresa?.id
  const puedeGestionarEmpresas = usuario?.canManageCompanies === true
  const usuarioId = usuario?.id

  useEffect(() => {
    // La sesión de tienda no equivale a una cuenta personal multiempresa.
    // Consultar ese endpoint sin capacidad devuelve401 y revoca el contexto privado.
    if (esDemo || !empresaId || !puedeGestionarEmpresas) { setDatos({ tenants: [], canCreate: false }); setListaCargada(true); setSinCuenta(!esDemo && Boolean(empresaId)); return undefined }
    let vivo = true
    setListaCargada(false)
    sessionApi.listTenants()
      .then((respuesta) => { if (vivo) { setSinCuenta(false); setDatos({ tenants: Array.isArray(respuesta?.tenants) ? respuesta.tenants : [], canCreate: Boolean(respuesta?.canCreate) }); setListaCargada(true) } })
      .catch((cause) => {
        console.error('[empresas] no se pudo cargar la lista de empresas:', cause)
        // Dueño sin sesión de vendedor vinculada a la cuenta: no es un fallo mudo.
        if (vivo) { if (cause?.status === 401 || cause?.status === 403) setSinCuenta(true); setListaCargada(true) }
      })
    return () => { vivo = false }
  }, [esDemo, empresaId, usuarioId, puedeGestionarEmpresas])

  // Los conectores sólo pueden preparar este enlace; el formulario y el
  // endpoint normal siguen siendo la única vía para crear una empresa. Nunca
  // prellenar si la pestaña cambió de cuenta/empresa desde que se emitió.
  useEffect(() => {
    if (deepLinkProcesado.current || !listaCargada || esDemo || !empresaId || !usuarioId || typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('crearEmpresa') !== '1') return
    deepLinkProcesado.current = true
    const expectedTenantId = params.get('expectedTenantId')
    const expectedUserId = params.get('expectedUserId')
    const nombrePreparado = (params.get('nombre') || '').trim().slice(0, 100)
    const limpiarDeepLink = () => {
      params.delete('crearEmpresa')
      params.delete('nombre')
      params.delete('expectedTenantId')
      params.delete('expectedUserId')
      const query = params.toString()
      window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`)
    }
    if (!datos.canCreate || !expectedTenantId || !expectedUserId || expectedTenantId !== empresaId || expectedUserId !== usuarioId) {
      limpiarDeepLink()
      const mensaje = 'El enlace de creación pertenece a otra sesión. Volvé a preparar la empresa desde tu cuenta.'
      setError(mensaje)
      toast.error(mensaje)
      return
    }
    limpiarDeepLink()
    setError('')
    setNombre(nombrePreparado)
    setDialogo({ tipo: 'crear' })
  }, [datos.canCreate, listaCargada, empresaId, usuarioId, esDemo, toast])

  const visible = !esDemo && (datos.tenants.length >= 2 || datos.canCreate)
  const actualId = datos.tenants.find((item) => item.current)?.id || empresaId

  function cerrar() {
    if (ocupado) return
    setDialogo(null); setError(''); setNombre('')
  }

  async function ejecutarCambio(destino) {
    setOcupado(true); setError('')
    try {
      await sessionApi.switchTenant(destino)
      // Recarga completa: descarta toda la memoria de la empresa anterior.
      window.location.assign('/')
    } catch (cause) {
      const mensaje = mensajeErrorCambio(cause)
      console.error('[empresas] no se pudo cambiar de empresa:', cause)
      setError(mensaje)
      toast.error(mensaje)
      setOcupado(false)
    }
  }

  async function pedirCambio(destino) {
    if (!destino || destino === actualId || ocupado) return
    setError('')
    let hay = false
    try { hay = await hayPendientesEnEmpresaActual() } catch (cause) { console.error('[empresas] no se pudo revisar la cola offline:', cause) }
    if (hay) setDialogo({ tipo: 'pendientes', destino })
    else await ejecutarCambio(destino)
  }

  async function sincronizarYCambiar() {
    const destino = dialogo?.destino
    setOcupado(true); setError('')
    try {
      await sincronizarCola()
      if (await hayPendientesEnEmpresaActual()) {
        setError('Quedaron ventas sin enviar. Revisá la conexión o cambiá igual: se envían cuando vuelvas a esta empresa.')
        setOcupado(false)
        return
      }
    } catch (cause) {
      console.error('[empresas] no se pudo sincronizar antes de cambiar:', cause)
      setError('No se pudo sincronizar ahora. Probá de nuevo o cambiá igual: las ventas siguen en la cola de esta empresa.')
      setOcupado(false)
      return
    }
    setOcupado(false)
    await ejecutarCambio(destino)
  }

  function pedirCrear() { setError(''); setNombre(''); setDialogo({ tipo: 'crear' }) }

  async function crear(event) {
    event?.preventDefault()
    const limpio = nombre.trim()
    if (ocupado) return
    if (limpio.length < 2) { setError('Escribí el nombre de la empresa (mínimo 2 letras).'); return }
    setOcupado(true); setError('')
    try {
      await sessionApi.createCompany(limpio)
      window.location.assign('/')
    } catch (cause) {
      setError(cause?.message || 'No se pudo crear la empresa. Probá de nuevo.')
      setOcupado(false)
    }
  }

  return { sinCuenta, visible, tenants: datos.tenants, canCreate: datos.canCreate, actualId, dialogo, ocupado, error, nombre, setNombre, cerrar, pedirCambio, pedirCrear, crear, ejecutarCambio, sincronizarYCambiar }
}

function Opcion({ item, actual, onElegir }) {
  const rol = etiquetaRol(item.role)
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={actual}
      data-testid={`empresa-opcion-${item.id}`}
      onClick={() => onElegir(item.id)}
      className={cn('flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left text-[13px] transition hover:bg-ink-700', actual && 'bg-fono/10')}
    >
      <span className="min-w-0 truncate">{item.name}</span>
      <span className="flex shrink-0 items-center gap-2">
        {rol && <Badge color="slate">{rol}</Badge>}
        {actual && <Icon name="check" className="h-3.5 w-3.5 text-fono-light" />}
      </span>
    </button>
  )
}

function Lista({ control, alElegir, alCrear }) {
  return (
    <>
      {control.tenants.map((item) => (
        <Opcion key={item.id} item={item} actual={item.id === control.actualId} onElegir={alElegir} />
      ))}
      {control.canCreate && (
        <button
          type="button"
          role="menuitem"
          data-testid="empresa-crear"
          onClick={alCrear}
          className="flex min-h-11 w-full items-center gap-2 border-t border-ink-600 px-3 py-2 text-left text-[13px] font-semibold text-fono-light transition hover:bg-ink-700"
        >
          <Icon name="plus" className="h-3.5 w-3.5" />Crear empresa
        </button>
      )}
    </>
  )
}

/** Control del encabezado (escritorio) o lista dentro de la hoja del perfil (móvil). */
export default function SelectorEmpresa({ control, variante = 'menu', className, alElegir }) {
  const { empresa } = useSesion()
  const [abierto, setAbierto] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!abierto) return undefined
    const fuera = (event) => { if (ref.current && !ref.current.contains(event.target)) setAbierto(false) }
    const escape = (event) => { if (event.key === 'Escape') setAbierto(false) }
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', escape) }
  }, [abierto])

  if (!control?.visible) return null
  const actual = control.tenants.find((item) => item.id === control.actualId)?.name || empresa?.nombre || 'Mi empresa'
  const elegir = (id) => { setAbierto(false); alElegir?.(); control.pedirCambio(id) }
  const crear = () => { setAbierto(false); alElegir?.(); control.pedirCrear() }

  if (variante === 'lista') {
    return (
      <div data-testid="empresa-lista" role="menu" aria-label="Cambiar de empresa" className={cn('overflow-hidden rounded-xl border border-ink-600', className)}>
        <Lista control={control} alElegir={elegir} alCrear={crear} />
      </div>
    )
  }

  return (
    <div ref={ref} className={cn('relative flex min-w-0 items-center', className)}>
      <button
        type="button"
        data-testid="empresa-selector"
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-label={`Empresa: ${actual}`}
        title="Cambiar de empresa"
        onClick={() => setAbierto((valor) => !valor)}
        className="flex h-[34px] min-h-11 min-w-0 max-w-[170px] cursor-pointer items-center gap-2 rounded-[9px] border border-fono/30 bg-ink-800 px-2.5 text-[12.5px] text-fore outline-none transition hover:border-fono/60 focus:border-fono"
      >
        <Icon name="building" className="h-[15px] w-[15px] shrink-0 text-mute" />
        <span className="truncate">{actual}</span>
        <Icon name="chevron" className={cn('h-3.5 w-3.5 shrink-0 text-mute transition-transform', abierto && 'rotate-180')} />
      </button>
      {abierto && (
        <div
          data-testid="empresa-menu"
          role="menu"
          aria-label="Cambiar de empresa"
          className="absolute right-0 top-[calc(100%+6px)] z-40 max-h-[70dvh] min-w-[220px] max-w-[300px] overflow-y-auto overflow-x-hidden rounded-xl border border-ink-500 bg-ink-800 py-1 shadow-xl"
        >
          <Lista control={control} alElegir={elegir} alCrear={crear} />
        </div>
      )}
    </div>
  )
}

/** Modales: aviso de ventas sin enviar y alta de empresa. Se montan una sola vez. */
export function DialogosEmpresa({ control }) {
  if (!control) return null
  const { dialogo, ocupado, error } = control
  return (
    <>
      <Modal open={dialogo?.tipo === 'pendientes'} onClose={control.cerrar} title="Hay ventas sin enviar" size="corto" busy={ocupado}>
        <div className="space-y-4" data-testid="empresa-pendientes">
          <p className="text-sm leading-6 text-mute">
            Esta empresa tiene ventas guardadas sin conexión que todavía no se enviaron. Podés sincronizarlas ahora, o cambiar igual:
            las ventas siguen en la cola de esta empresa y se envían cuando vuelvas a ella.
          </p>
          {error && <Aviso tono="error">{error}</Aviso>}
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" disabled={ocupado} onClick={() => control.ejecutarCambio(dialogo.destino)} data-testid="empresa-cambiar-igual">Cambiar igual</Button>
            <Button type="button" disabled={ocupado} onClick={control.sincronizarYCambiar} data-testid="empresa-sincronizar">{ocupado ? 'Procesando…' : 'Sincronizar primero'}</Button>
          </div>
        </div>
      </Modal>
      <Modal open={dialogo?.tipo === 'crear'} onClose={control.cerrar} title="Crear empresa" size="corto" dirty={Boolean(control.nombre.trim())} busy={ocupado}>
        <form className="space-y-4" onSubmit={control.crear} data-testid="empresa-crear-form">
          <FormField label="Nombre de la empresa" htmlFor="empresa-nueva-nombre">
            <Input id="empresa-nueva-nombre" autoFocus maxLength={100} disabled={ocupado} value={control.nombre} onChange={(event) => control.setNombre(event.target.value)} placeholder="Nombre de la nueva empresa" autoComplete="off" />
          </FormField>
          <p className="text-xs leading-5 text-mute">Se crea con tu cuenta como dueño y pasás a ella ahora. Podés volver a esta empresa cuando quieras.</p>
          {error && <Aviso tono="error">{error}</Aviso>}
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" disabled={ocupado} onClick={control.cerrar}>Cancelar</Button>
            <Button type="submit" disabled={ocupado || control.nombre.trim().length < 2} data-testid="empresa-crear-confirmar">{ocupado ? 'Creando…' : 'Crear empresa'}</Button>
          </div>
        </form>
      </Modal>
    </>
  )
}
