import { useCallback, useEffect, useMemo, useState } from 'react'
import { resources } from '@/lib/api'
import { isDemoRuntime } from '@/lib/demoMode'
import { getProductos } from '@/lib/storage'
import { gs } from '@/utils/calculos'
import { Badge, Button, Card, EmptyState, Input, Modal, MoneyInput, Select, Skeleton, Textarea, useToast } from '@/components/ui'
import SearchField from '@/components/shared/SearchField'
import AttachmentList from '@/components/shared/AttachmentList'
import BarraModulo from '@/components/shared/BarraModulo'
import { GRILLA_DOS_COLUMNAS, PIE_ACCIONES } from '@/components/shared/formulario'
import Icon from '@/components/shared/Icon'
import ProductCombobox from '@/components/shared/ProductCombobox'
import ListaCompraModal from '@/components/supply/ListaCompraModal'
import { etiquetaCompra, tonoCompra } from 'owncoding-ui'
import { CONDICION_UNIDAD } from '@/utils/inventario'
import { analizarSerial, textoMotivo, validarLote } from '@/lib/escanerSeriales'

// Abastecimiento · F2 (#250 §6): compras del Centro.
// Lista lo comprado — las líneas que cubren necesidades y las de reposición
// libre — con sus IMEI cargados y las cantidades libres; permite agregar líneas
// a una compra activa (COMPRADA) y cancelarla con motivo. Nada mueve stock: el
// stock nace en la recepción (F5).

const ESTADOS_FILTRO = ['TODAS', 'COMPRADA', 'PREPARANDO', 'EN_TRANSITO', 'RECIBIDA', 'CANCELADA']

export default function ComprasCentro() {
  const toast = useToast()
  const esDemo = isDemoRuntime
  const [compras, setCompras] = useState([])
  const [cargando, setCargando] = useState(!esDemo)
  const [error, setError] = useState('')
  const [estado, setEstado] = useState('TODAS')
  const [busqueda, setBusqueda] = useState('')
  const [abierta, setAbierta] = useState('')
  const [agregar, setAgregar] = useState(null)
  const [linea, setLinea] = useState({ productId: '', quantity: '1', unitCostPyg: '', seriales: '' })
  const [adjuntosDe, setAdjuntosDe] = useState(null)
  const [listaDe, setListaDe] = useState(null)
  const [cancelar, setCancelar] = useState(null)
  const [motivo, setMotivo] = useState('')
  const [busy, setBusy] = useState(false)

  const cargar = useCallback(async () => {
    if (esDemo) return
    setCargando(true)
    setError('')
    try {
      const datos = await resources.supplyPurchases.list({ limit: 50, ...(estado !== 'TODAS' ? { status: estado } : {}) })
      setCompras(datos?.compras || [])
    } catch (causa) {
      setError(causa?.message || 'No se pudieron cargar las compras.')
    } finally {
      setCargando(false)
    }
  }, [esDemo, estado])

  useEffect(() => { cargar() }, [cargar])

  const filtradas = useMemo(() => {
    const termino = busqueda.trim().toLowerCase()
    if (!termino) return compras
    return compras.filter((compra) => [compra.code, compra.supplierName, compra.branch?.name, ...(compra.lines || []).map((fila) => fila.product?.name)]
      .some((valor) => String(valor || '').toLowerCase().includes(termino)))
  }, [compras, busqueda])

  const totalLibres = useMemo(() => compras.reduce((suma, compra) => suma + (compra.lines || []).reduce((parcial, fila) => parcial + Number(fila.libreQuantity || 0), 0), 0), [compras])

  function abrirAgregar(compra) {
    setAgregar(compra)
    setLinea({ productId: '', quantity: '1', unitCostPyg: '', seriales: '' })
    setError('')
  }

  async function guardarLineas(evento) {
    evento.preventDefault()
    if (!agregar || !linea.productId || busy) return
    const cantidad = Number(linea.quantity) || 0
    if (cantidad < 1) return setError('Indicá la cantidad de la línea.')
    const costo = Number(String(linea.unitCostPyg).replace(/\D/g, '')) || 0
    const { validos, errores } = validarLote({ entradas: linea.seriales, limite: cantidad })
    if (errores.length) {
      return setError(errores.map((fila) => `${fila.serial}: ${textoMotivo(fila.motivo)}`).join(' · '))
    }
    // El backend vuelve a validar (Luhn, duplicados e inventario): acá solo se avisa antes.
    for (const serial of validos) {
      const analisis = analizarSerial(serial)
      if (!analisis.ok) return setError(`${serial}: ${textoMotivo(analisis.motivo)}`)
    }
    setBusy(true)
    setError('')
    try {
      await resources.supplyPurchases.update({
        id: agregar.id,
        action: 'addLines',
        lines: [{ productId: linea.productId, quantity: cantidad, ...(costo > 0 ? { unitCostPyg: costo } : {}), ...(validos.length ? { serials: validos } : {}) }],
      })
      toast.success('Líneas agregadas', `${agregar.code}: ${cantidad} unidad(es) más.`)
      setAgregar(null)
      cargar()
    } catch (causa) {
      setError(causa?.message || 'No se pudieron agregar las líneas.')
    } finally {
      setBusy(false)
    }
  }

  async function cancelarCompra(evento) {
    evento.preventDefault()
    if (!cancelar || busy) return
    setBusy(true)
    setError('')
    try {
      await resources.supplyPurchases.update({ id: cancelar.id, action: 'cancel', reason: motivo.trim() })
      toast.success('Compra cancelada', 'Las necesidades vuelven a «Por comprar».')
      setCancelar(null)
      setMotivo('')
      cargar()
    } catch (causa) {
      setError(causa?.message || 'No se pudo cancelar la compra.')
    } finally {
      setBusy(false)
    }
  }

  if (esDemo) {
    return (
      <Card className="p-4 md:p-5">
        <h2 className="font-semibold">Compras del Centro</h2>
        <p className="mt-1 text-sm text-mute">El Centro de Abastecimiento trabaja con las compras de una cuenta real.</p>
      </Card>
    )
  }

  return (
    <div className="space-y-4" data-testid="compras-centro">
      <BarraModulo
        icono="store"
        titulo="Compras del Centro"
        descripcion="Lo comprado por el Centro: necesidades cubiertas y reposición libre, con sus IMEI y cantidades libres. El stock nace en la recepción."
        testId="barra-compras-centro"
      >
        <Button type="button" variant="outline" onClick={cargar} disabled={cargando}>
          <Icon name="refresh" className="h-3.5 w-3.5" />Actualizar
        </Button>
      </BarraModulo>

      <div className="flex flex-wrap items-center gap-2">
        <SearchField value={busqueda} onChange={(evento) => setBusqueda(evento.target.value)} placeholder="Buscar por código, proveedor o producto" ariaLabel="Buscar en compras del Centro" className="min-w-0 flex-1" />
        <Select value={estado} onChange={(evento) => setEstado(evento.target.value)} className="w-auto" aria-label="Estado de la compra">
          {ESTADOS_FILTRO.map((clave) => <option key={clave} value={clave}>{clave === 'TODAS' ? 'Todos los estados' : etiquetaCompra(clave)}</option>)}
        </Select>
        {totalLibres > 0 && <Badge color="blue">{totalLibres} unidad(es) libres</Badge>}
      </div>

      {error && <Card className="text-sm text-bad">{error}</Card>}
      {cargando && !compras.length ? (
        <div className="space-y-2"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>
      ) : !filtradas.length ? (
        <EmptyState icon="store" title="No hay compras para mostrar." description="Cuando el Centro registre una compra, aparece acá." />
      ) : (
        <div className="space-y-2.5">
          {filtradas.map((compra) => {
            const unidades = (compra.lines || []).reduce((suma, fila) => suma + Number(fila.quantity || 0), 0)
            const libres = (compra.lines || []).reduce((suma, fila) => suma + Number(fila.libreQuantity || 0), 0)
            const expandida = abierta === compra.id
            const activa = compra.status === 'COMPRADA'
            const cancelable = ['COMPRADA', 'PREPARANDO', 'EN_TRANSITO'].includes(compra.status)
            return (
              <Card key={compra.id} className="p-3.5" data-testid="compra-centro-fila">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">
                      {compra.code}
                      <span className="font-normal text-mute"> · {compra.supplierName || compra.supplier?.name || 'Sin proveedor'}</span>
                    </p>
                    <p className="mt-1 text-xs text-mute">
                      {unidades} unidad(es) · {compra.branch?.name || 'Sin sucursal'}
                      {compra.currency && compra.currency !== 'PYG' ? ` · ${compra.currency} ${compra.originalCost ?? '—'}` : compra.originalCost ? ` · ${gs(Number(compra.originalCost))}` : ''}
                      {libres > 0 ? ` · ${libres} libre(s)` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge color={tonoCompra(compra.status) === 'ok' ? 'green' : tonoCompra(compra.status) === 'warn' ? 'orange' : tonoCompra(compra.status) === 'mute' ? 'slate' : 'blue'}>{etiquetaCompra(compra.status)}</Badge>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button type="button" variant={expandida ? 'outline' : 'primary'} onClick={() => setAbierta(expandida ? '' : compra.id)}>
                    {expandida ? 'Cerrar' : 'Ver líneas'}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setAdjuntosDe(compra)}>Adjuntos</Button>
                  {/* #278 · el impreso de §11 ya existía sin llamador: acá se
                      adopta (térmica directa, PDF o imagen para el proveedor). */}
                  <Button type="button" variant="outline" disabled={!(compra.lines || []).length} onClick={() => setListaDe(compra)} data-testid="compra-lista-imprimir">
                    <Icon name="printer" className="h-4 w-4" />Lista de compra
                  </Button>
                  {activa && <Button type="button" variant="outline" onClick={() => abrirAgregar(compra)}>+ Agregar líneas</Button>}
                  {cancelable && <Button type="button" variant="ghost" className="text-bad" onClick={() => { setCancelar(compra); setMotivo('') }}>Cancelar</Button>}
                </div>

                {expandida && (
                  <div className="mt-3 space-y-1.5 border-t border-ink-600 pt-3" data-testid="compra-centro-lineas">
                    {(compra.lines || []).map((fila) => {
                      const seriales = (fila.serials || []).length
                      return (
                        <div key={fila.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-ink-600 px-3 py-2 text-sm">
                          <span className="min-w-0 flex-1 truncate">
                            {fila.product?.name || 'Producto'}
                            {fila.product?.capacity ? ` · ${fila.product.capacity}` : ''}
                            <span className="ml-1 text-xs text-mute">{CONDICION_UNIDAD[fila.condition] || fila.condition || ''}</span>
                          </span>
                          <span className="text-xs tabular-nums text-mute">{fila.quantity} unidad(es)</span>
                          <Badge color={seriales >= Number(fila.quantity) ? 'green' : 'blue'}>{seriales}/{fila.quantity} IMEI</Badge>
                          {Number(fila.libreQuantity || 0) > 0 && <Badge color="blue">{fila.libreQuantity} libre(s)</Badge>}
                          {fila.unitCostPyg ? <span className="text-xs tabular-nums text-mute">{gs(Number(fila.unitCostPyg))} c/u</span> : null}
                        </div>
                      )
                    })}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      <Modal open={Boolean(agregar)} onClose={() => !busy && setAgregar(null)} title={`Agregar líneas · ${agregar?.code || ''}`} size="amplio">
        <form onSubmit={guardarLineas} className="space-y-3">
          <p className="text-sm text-mute">
            Reposición libre sobre una compra <b>activa</b>: no crea otra compra y el stock sigue entrando en la recepción.
            Podés cargar los IMEI ahora o dejarlos pendientes.
          </p>
          <div>
            <label className="block text-sm font-semibold" htmlFor="linea-producto">Producto</label>
            <ProductCombobox
              className="mt-1"
              products={getProductos()}
              selectedId={linea.productId}
              onSelect={(producto) => setLinea((actual) => ({ ...actual, productId: producto?.id || '' }))}
            />
          </div>
          <div className={GRILLA_DOS_COLUMNAS}>
            <label className="block space-y-1 text-sm">
              <span className="font-semibold">Cantidad</span>
              <Input inputMode="numeric" value={linea.quantity} onChange={(evento) => setLinea((actual) => ({ ...actual, quantity: evento.target.value.replace(/\D/g, '').slice(0, 4) }))} />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="font-semibold">Costo unitario (Gs., opcional)</span>
              <MoneyInput aria-label="Costo unitario de la línea" value={linea.unitCostPyg} onValueChange={(valor) => setLinea((actual) => ({ ...actual, unitCostPyg: valor === '' ? '' : String(valor) }))} placeholder="Ej. 1500000" />
            </label>
          </div>
          <label className="block space-y-1 text-sm">
            <span className="font-semibold">IMEI/seriales (opcional)</span>
            <Textarea value={linea.seriales} onChange={(evento) => setLinea((actual) => ({ ...actual, seriales: evento.target.value }))} placeholder="Pegá los IMEI separados por coma o salto de línea…" aria-label="IMEI de la línea" className="min-h-20 w-full" />
          </label>
          <div className={PIE_ACCIONES}>
            <Button type="button" variant="outline" onClick={() => setAgregar(null)} disabled={busy}>Volver</Button>
            <Button type="submit" disabled={busy || !linea.productId || Number(linea.quantity) < 1}>{busy ? 'Agregando…' : 'Agregar líneas'}</Button>
          </div>
        </form>
      </Modal>

      <ListaCompraModal compra={listaDe} open={Boolean(listaDe)} onClose={() => setListaDe(null)} />

      <Modal open={Boolean(adjuntosDe)} onClose={() => setAdjuntosDe(null)} title={`Adjuntos · ${adjuntosDe?.code || ''}`} size="amplio">
        <p className="text-sm text-mute">La factura o los comprobantes de la compra quedan auditados con el documento.</p>
        {adjuntosDe && <AttachmentList entity="SUPPLY_PURCHASE" entityId={adjuntosDe.id} puedeSubir titulo="Factura de la compra" />}
      </Modal>

      <Modal open={Boolean(cancelar)} onClose={() => !busy && setCancelar(null)} title="Cancelar compra" size="corto">
        <form onSubmit={cancelarCompra} className="space-y-3">
          <p className="text-sm text-mute">
            {cancelar?.code} · {cancelar?.supplierName}. Las necesidades que cubría vuelven a «Por comprar». Queda auditado quién y por qué.
          </p>
          <label className="block space-y-1 text-sm">
            <span className="font-semibold">Motivo</span>
            <Input value={motivo} onChange={(evento) => setMotivo(evento.target.value)} placeholder="Ej.: el proveedor no tenía stock" autoFocus />
          </label>
          <div className={PIE_ACCIONES}>
            <Button type="button" variant="outline" onClick={() => setCancelar(null)} disabled={busy}>Volver</Button>
            <Button type="submit" variant="danger" disabled={motivo.trim().length < 3 || busy}>{busy ? 'Cancelando…' : 'Cancelar compra'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
