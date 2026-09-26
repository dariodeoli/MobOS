import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, resources } from '@/lib/api'
import { isDemoRuntime } from '@/lib/demoMode'
import { Badge, Button, Card, ConfirmDialog, EmptyState, Input, Modal, Select, Skeleton, Textarea, useToast } from '@/components/ui'
import CameraScan from '@/components/shared/CameraScan'
import Icon from '@/components/shared/Icon'
import { analizarSerial, textoMotivo, validarLote } from '@/lib/escanerSeriales'
import { configImpresora } from '@/lib/printing/agent'
import { datosComprobanteRecepcion } from '@/lib/printing/comprobanteRecepcion'
import { imprimirDocumentoNoFiscal } from '@/lib/printing/documentos'
import { ticketComprobanteRecepcion } from '@/lib/printing/tickets'
import { printComprobanteRecepcion } from '@/components/shared/OrderReceipt'

// Abastecimiento · F5 (#250 §11): UI de recepción.
// Llegadas pendientes → abrir (o retomar) por lote / código / token del QR →
// escanear contra el manifiesto (lector BT/USB, cámara o pegado múltiple) →
// marcar incidencias con nota → elegir depósito → confirmar (el stock entra
// recién ahí; lo esperado sin escanear queda faltante).
// «Recibir todo el lote» hace el caso completo de una vez: escanea los IMEI del
// manifiesto y confirma con el depósito elegido (si falta algún IMEI por
// completar, manda a «Preparar compra»). Al confirmar se puede imprimir el
// comprobante de recepción de PRN (80 mm con respaldo A4).

const RESULTADOS = [
  ['DANADO', 'Dañado'],
  ['INCORRECTO', 'Incorrecto'],
  ['FALTANTE', 'Faltante'],
]
const ETIQUETA_RESULTADO = { RECIBIDO: 'Recibido', DANADO: 'Dañado', INCORRECTO: 'Incorrecto', FALTANTE: 'Faltante', SOBRANTE: 'Sobrante' }
const TONO_RESULTADO = { RECIBIDO: 'green', DANADO: 'red', INCORRECTO: 'orange', FALTANTE: 'red', SOBRANTE: 'blue' }

const confirmadasTexto = (incidencias, pendientes) => {
  const partes = []
  if (incidencias.length) partes.push(`${incidencias.length} ya tienen incidencia registrada y no entran al stock. `)
  if (!pendientes.length) partes.push('Todas las unidades ya estaban escaneadas. ')
  return partes.join('')
}

const fecha = (valor) => {
  if (!valor) return '—'
  const fechaValor = new Date(valor)
  return Number.isNaN(fechaValor.getTime()) ? '—' : fechaValor.toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit' })
}

export default function Recepcion() {
  const toast = useToast()
  const navigate = useNavigate()
  const esDemo = isDemoRuntime
  const [llegadas, setLlegadas] = useState([])
  const [cargando, setCargando] = useState(!esDemo)
  const [error, setError] = useState('')
  const [recepcion, setRecepcion] = useState(null)
  const [resumen, setResumen] = useState(null)
  const [depositos, setDepositos] = useState([])
  const [depositoId, setDepositoId] = useState('')
  const [entrada, setEntrada] = useState('')
  const [pegado, setPegado] = useState('')
  const [verPegado, setVerPegado] = useState(false)
  const [camara, setCamara] = useState(false)
  const [aviso, setAviso] = useState('')
  const [codigo, setCodigo] = useState('')
  const [incidencia, setIncidencia] = useState(null)
  const [nota, setNota] = useState('')
  const [confirmarTodo, setConfirmarTodo] = useState(false)
  const [confirmada, setConfirmada] = useState(null)
  const [imprimiendo, setImprimiendo] = useState(false)
  const [busy, setBusy] = useState(false)

  const cargar = useCallback(async () => {
    if (esDemo) return
    setCargando(true)
    setError('')
    try {
      const datos = await resources.supplyReceptions.list({ pendientes: 1 })
      setLlegadas(datos?.llegadas || [])
    } catch (causa) {
      setError(causa?.message || 'No se pudieron cargar las llegadas.')
    } finally {
      setCargando(false)
    }
  }, [esDemo])

  useEffect(() => { cargar() }, [cargar])

  const escaneados = useMemo(() => new Set((recepcion?.items || []).filter((item) => item.resultado === 'RECIBIDO').map((item) => item.serial)), [recepcion])
  const esperados = recepcion?.shipment?.items || []
  const porItemId = useMemo(() => {
    const mapa = new Map()
    for (const item of recepcion?.items || []) {
      if (item.shipmentItemId) mapa.set(item.shipmentItemId, item)
      else mapa.set(`sobrante-${item.id}`, item)
    }
    return mapa
  }, [recepcion])
  const cubiertos = useMemo(() => new Set((recepcion?.items || []).map((item) => item.shipmentItemId).filter(Boolean)), [recepcion])
  const pendientes = useMemo(() => esperados.filter((item) => !cubiertos.has(item.id)), [esperados, cubiertos])
  const sinSerial = useMemo(() => pendientes.filter((item) => !item.serial), [pendientes])
  const incidenciasCargadas = useMemo(() => (recepcion?.items || []).filter((item) => item.resultado && item.resultado !== 'RECIBIDO'), [recepcion])

  async function abrir(llegada) {
    setBusy(true)
    setAviso('')
    try {
      const datos = await resources.supplyReceptions.create({
        shipmentId: llegada.id,
        ...(llegada.ubicacionSugerida?.id ? { locationId: llegada.ubicacionSugerida.id } : {}),
      })
      const detalle = datos?.recepcion || datos
      setRecepcion(detalle)
      setResumen(datos?.resumen || null)
      setDepositoId(detalle?.locationId || llegada.ubicacionSugerida?.id || '')
      const sucursalId = detalle?.shipment?.destinationBranch?.id || llegada.destinoBranchId
      if (sucursalId) {
        resources.stockLocations.list(sucursalId).then((filas) => setDepositos((filas || []).filter((fila) => fila.isActive !== false))).catch(() => setDepositos([]))
      }
      if (datos?.retomada) toast.info('Recepción retomada', 'Seguía abierta: se conserva lo escaneado.')
    } catch (causa) {
      toast.error('No se pudo abrir la recepción', causa?.message || 'Reintentá en un momento.')
    } finally {
      setBusy(false)
    }
  }

  async function abrirPorCodigo() {
    const valor = codigo.trim()
    if (!valor || busy) return
    const token = valor.match(/[?&]t=([^&\s]+)/)?.[1] || (/^[A-Za-z0-9_-]{16,}$/.test(valor) ? valor : '')
    setBusy(true)
    try {
      const datos = await resources.supplyReceptions.create(token ? { token } : { code: valor.toUpperCase() })
      const detalle = datos?.recepcion || datos
      setRecepcion(detalle)
      setResumen(datos?.resumen || null)
      setDepositoId(detalle?.locationId || '')
      const sucursalId = detalle?.shipment?.destinationBranch?.id
      if (sucursalId) resources.stockLocations.list(sucursalId).then((filas) => setDepositos((filas || []).filter((fila) => fila.isActive !== false))).catch(() => setDepositos([]))
      setCodigo('')
    } catch (causa) {
      toast.error('No se encontró el lote', causa?.message || 'Revisá el código o el QR del manifiesto.')
    } finally {
      setBusy(false)
    }
  }

  function aplicar(datos) {
    const detalle = datos?.recepcion || datos
    if (detalle) setRecepcion(detalle)
    if (datos?.resumen) setResumen(datos.resumen)
  }

  async function escanear(serialBruto) {
    if (!recepcion || busy) return
    const analisis = analizarSerial(serialBruto)
    if (!analisis.ok) {
      setAviso(`${analisis.serial || 'Código'}: ${textoMotivo(analisis.motivo)}`)
      return
    }
    setBusy(true)
    setAviso('')
    try {
      const datos = await resources.supplyReceptions.update({ id: recepcion.id, action: 'scan', serial: analisis.serial })
      aplicar(datos)
      setEntrada('')
    } catch (causa) {
      setAviso(causa?.message || 'El código no se pudo registrar.')
    } finally {
      setBusy(false)
    }
  }

  async function pegarLote() {
    if (!recepcion || busy) return
    const ya = new Set([...escaneados, ...(recepcion.items || []).map((item) => item.serial)].filter(Boolean))
    const permitidos = new Set(esperados.map((item) => item.serial).filter(Boolean))
    const { validos, errores } = validarLote({ entradas: pegado, yaCargados: [...ya], permitidos })
    if (!validos.length) {
      setAviso(errores.map((error) => `${error.serial}: ${textoMotivo(error.motivo)}`).join(' · ') || 'No hay códigos para cargar.')
      return
    }
    setBusy(true)
    let cargados = 0
    for (const serial of validos) {
      try {
        aplicar(await resources.supplyReceptions.update({ id: recepcion.id, action: 'scan', serial }))
        cargados += 1
      } catch (causa) {
        errores.push({ serial, motivo: causa?.message || 'RECHAZADO' })
      }
    }
    setPegado('')
    setVerPegado(false)
    setAviso(`${cargados} cargado(s)${errores.length ? ` · ${errores.length} con problema: ${errores.map((error) => `${error.serial} (${textoMotivo(error.motivo)})`).join(', ')}` : ''}`)
    setBusy(false)
    if (cargados) toast.success('Lote cargado', `${cargados} código(s) contra el manifiesto.`)
  }

  async function guardarIncidencia() {
    if (!incidencia || nota.trim().length < 3 || busy) return
    setBusy(true)
    try {
      await resources.supplyReceptions.update({ id: recepcion.id, action: 'item', itemId: incidencia.itemId, resultado: incidencia.resultado, nota: nota.trim() })
      const datos = await resources.supplyReceptions.list({ id: recepcion.id })
      aplicar(datos?.recepcion ? { recepcion: datos.recepcion, resumen: datos.resumen } : datos)
      toast.success('Incidencia registrada', `${ETIQUETA_RESULTADO[incidencia.resultado]} con nota.`)
      setIncidencia(null)
      setNota('')
    } catch (causa) {
      toast.error('No se pudo registrar', causa?.message || 'Reintentá en un momento.')
    } finally {
      setBusy(false)
    }
  }

  async function confirmar(depositoElegido = depositoId) {
    if (!recepcion || busy) return
    if (!depositoElegido) { toast.error('Elegí el depósito destino'); return }
    setBusy(true)
    try {
      const datos = await resources.supplyReceptions.update({ id: recepcion.id, action: 'confirm', locationId: depositoElegido })
      setConfirmada({
        recepcion: datos?.recepcion || recepcion,
        resumen: datos?.resumen || resumen || {},
        estadoLote: datos?.estadoLote || '',
        unidadesCreadas: datos?.unidadesCreadas ?? 0,
      })
      toast.success('Recepción confirmada', 'El stock de lo recibido ya está disponible en el depósito elegido.')
      setRecepcion(null)
      setResumen(null)
      setDepositos([])
      cargar()
    } catch (causa) {
      toast.error('No se pudo confirmar', causa?.message || 'Revisá el depósito y reintentá.')
    } finally {
      setBusy(false)
    }
  }

  // Caso completo de una vez: escanea los IMEI del manifiesto que faltan y
  // confirma. Las unidades ya marcadas con incidencia no se tocan.
  async function recibirTodo() {
    if (!recepcion || busy) return
    if (!depositoId) { toast.error('Elegí el depósito destino'); return }
    if (sinSerial.length) {
      setAviso(`Hay ${sinSerial.length} unidad(es) con IMEI por completar: preparalos antes de recibir todo el lote.`)
      setConfirmarTodo(false)
      return
    }
    setBusy(true)
    setAviso('')
    try {
      let detalle = recepcion
      for (const esperado of pendientes) {
        const datos = await resources.supplyReceptions.update({ id: recepcion.id, action: 'scan', serial: esperado.serial })
        detalle = datos?.recepcion || detalle
        if (datos?.resumen) setResumen(datos.resumen)
      }
      setRecepcion(detalle)
      setConfirmarTodo(false)
      await confirmar(depositoId)
    } catch (causa) {
      setAviso(causa?.message || 'No se pudo recibir todo el lote.')
      setConfirmarTodo(false)
    } finally {
      setBusy(false)
    }
  }

  // Comprobante de recepción de PRN: térmica de 80 mm y respaldo A4/rollo.
  async function imprimirComprobante() {
    if (!confirmada?.recepcion || imprimiendo) return
    setImprimiendo(true)
    try {
      const detalle = confirmada.recepcion
      const ids = new Set([...(detalle.items || []).map((item) => item.productId), ...(detalle.shipment?.items || []).map((item) => item.productId)].filter(Boolean))
      const productos = {}
      await Promise.all([...ids].map(async (id) => {
        try { productos[id] = await api.get(`/api/products/${id}`) } catch { /* sin nombre: cae al id */ }
      }))
      const datos = datosComprobanteRecepcion(detalle, { productos })
      const { ancho } = configImpresora()
      const resultado = await imprimirDocumentoNoFiscal(ticketComprobanteRecepcion(datos, { ancho }), { tipo: 'comprobante-recepcion', respaldo: () => printComprobanteRecepcion(datos, { format: 'a4' }) })
      if (resultado?.dialogo) toast.info('Comprobante listo', 'Se abrió para imprimir o guardar en PDF.')
      else if (resultado?.ok) toast.success('Comprobante enviado', 'Sale por la impresora configurada.')
    } catch (causa) {
      toast.error('No se pudo imprimir', causa?.message || 'Reintentá desde la recepción.')
    } finally {
      setImprimiendo(false)
    }
  }

  async function cancelar() {
    if (!recepcion || busy) return
    setBusy(true)
    try {
      await resources.supplyReceptions.update({ id: recepcion.id, action: 'cancel' })
      toast.success('Recepción cancelada', 'El lote sigue en camino y no se tocó el stock.')
      setRecepcion(null)
      setResumen(null)
    } catch (causa) {
      toast.error('No se pudo cancelar', causa?.message || 'Reintentá en un momento.')
    } finally {
      setBusy(false)
    }
  }

  if (esDemo) {
    return (
      <Card className="p-4 md:p-5">
        <h2 className="font-semibold">Recepción</h2>
        <p className="mt-1 text-sm text-mute">La recepción de lotes trabaja con los envíos y el stock de una cuenta real.</p>
      </Card>
    )
  }

  // ── Recepción confirmada ────────────────────────────────────────────────
  if (confirmada) {
    const estados = confirmada.resumen || {}
    const creadas = confirmada.unidadesCreadas ?? estados.RECIBIDO ?? 0
    return (
      <div className="space-y-4" data-testid="recepcion-confirmada">
        <Card className="space-y-3 p-4 md:p-5">
          <div>
            <h2 className="font-semibold">Recepción confirmada · {confirmada.recepcion?.shipment?.code || ''}</h2>
            <p className="mt-1 text-sm text-mute">
              {creadas} unidad(es) entraron al stock en {confirmada.recepcion?.location?.name || 'el depósito elegido'}.
              {confirmada.estadoLote === 'RECEPCION_PARCIAL' ? ' El lote quedó parcial: lo faltante sigue pendiente de llegada.' : ''}
              {confirmada.estadoLote === 'CON_INCIDENCIA' ? ' El lote quedó con incidencias registradas.' : ''}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-mute">
            <Badge color="green">{estados.RECIBIDO || 0} recibidas</Badge>
            {(estados.FALTANTE || 0) > 0 && <Badge color="red">{estados.FALTANTE} faltantes</Badge>}
            {(estados.DANADO || 0) > 0 && <Badge color="red">{estados.DANADO} dañadas</Badge>}
            {(estados.INCORRECTO || 0) > 0 && <Badge color="orange">{estados.INCORRECTO} incorrectas</Badge>}
            {(estados.SOBRANTE || 0) > 0 && <Badge color="blue">{estados.SOBRANTE} sobrantes</Badge>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={imprimirComprobante} disabled={imprimiendo}>
              <Icon name="printer" className="h-3.5 w-3.5" />{imprimiendo ? 'Preparando…' : 'Imprimir comprobante'}
            </Button>
            <Button type="button" variant="outline" onClick={() => { setConfirmada(null); setRecepcion(null); setResumen(null); cargar() }}>
              Volver a llegadas
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  // ── Recepción activa ────────────────────────────────────────────────────
  if (recepcion) {
    const sobrantes = (recepcion.items || []).filter((item) => !item.shipmentItemId)
    const estados = resumen || {}
    return (
      <div className="space-y-4" data-testid="recepcion-activa">
        <Card className="p-4 md:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-semibold">Recepción {recepcion.shipment?.code}</h2>
              <p className="mt-1 text-sm text-mute">
                Compra {recepcion.shipment?.purchase?.code || '—'} · destino {recepcion.shipment?.destinationBranch?.name || '—'} ·
                {' '}{esperados.length} esperada(s) · llegada {fecha(recepcion.shipment?.etaAt)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => { setRecepcion(null); setResumen(null); cargar() }} disabled={busy}>Volver</Button>
              <Button type="button" variant="outline" onClick={() => confirmar()} disabled={busy || !depositoId}>Confirmar recepción</Button>
              <Button type="button" onClick={() => setConfirmarTodo(true)} disabled={busy || !depositoId}>
                <Icon name="check" className="h-3.5 w-3.5" />Recibir todo el lote
              </Button>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-mute">
            <Badge color="green">{estados.RECIBIDO || 0} recibidas</Badge>
            <Badge color="slate">{Math.max(0, esperados.length - Object.values(estados).reduce((suma, valor) => suma + valor, 0))} sin escanear</Badge>
            {(estados.FALTANTE || 0) > 0 && <Badge color="red">{estados.FALTANTE} faltantes</Badge>}
            {(estados.DANADO || 0) > 0 && <Badge color="red">{estados.DANADO} dañadas</Badge>}
            {(estados.INCORRECTO || 0) > 0 && <Badge color="orange">{estados.INCORRECTO} incorrectas</Badge>}
            {(estados.SOBRANTE || 0) > 0 && <Badge color="blue">{estados.SOBRANTE} sobrantes</Badge>}
          </div>
        </Card>

        <Card className="space-y-3 p-4 md:p-5">
          <div>
            <h3 className="text-sm font-semibold">Escanear contra el manifiesto</h3>
            <p className="mt-1 text-sm text-mute">Lector Bluetooth/USB (escribí y Enter), cámara del teléfono o pegado múltiple. Un código ya escaneado se rechaza; los IMEI se validan con Luhn.</p>
          </div>
          <form
            onSubmit={(evento) => { evento.preventDefault(); escanear(entrada) }}
            className="flex flex-wrap items-center gap-2"
          >
            <Input
              autoFocus
              value={entrada}
              onChange={(evento) => setEntrada(evento.target.value)}
              placeholder="Escaneá o escribí el IMEI/serial…"
              aria-label="Código a escanear"
              className="min-w-0 flex-1"
            />
            <Button type="submit" disabled={busy || !entrada.trim()}>Registrar</Button>
            <Button type="button" variant="outline" onClick={() => setCamara((valor) => !valor)}>
              <Icon name="image" className="h-3.5 w-3.5" />Cámara
            </Button>
            <Button type="button" variant="outline" onClick={() => setVerPegado((valor) => !valor)}>Pegar varios</Button>
          </form>
          {camara && (
            <CameraScan continuous onDetected={escanear} onClose={() => setCamara(false)} />
          )}
          {verPegado && (
            <div className="space-y-2">
              <Textarea
                value={pegado}
                onChange={(evento) => setPegado(evento.target.value)}
                placeholder={'Pegá los códigos separados por coma, espacio o salto de línea…'}
                aria-label="Códigos para pegar"
                className="min-h-24 w-full"
              />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => { setVerPegado(false); setPegado('') }} disabled={busy}>Cerrar</Button>
                <Button type="button" onClick={pegarLote} disabled={busy || !pegado.trim()}>{busy ? 'Cargando…' : 'Cargar lote'}</Button>
              </div>
            </div>
          )}
          {aviso && <p role="status" className="text-sm text-warn">{aviso}</p>}
        </Card>

        <Card className="space-y-3 p-4 md:p-5">
          <h3 className="text-sm font-semibold">Depósito destino</h3>
          <Select aria-label="Depósito destino" value={depositoId} onChange={(evento) => setDepositoId(evento.target.value)} className="w-full sm:max-w-sm">
            <option value="">Elegí el depósito…</option>
            {depositos.map((deposito) => <option key={deposito.id} value={deposito.id}>{deposito.name}{deposito.code ? ` (${deposito.code})` : ''}</option>)}
          </Select>
          <p className="text-xs text-mute">Se sugiere el último depósito usado en la sucursal; podés cambiarlo (queda auditado).</p>
          {sinSerial.length > 0 && (
            <p className="text-xs text-warn">
              {sinSerial.length} unidad(es) con IMEI por completar: para recibir todo el lote primero cargá los IMEI.{' '}
              <button type="button" className="underline" onClick={() => navigate('/preparacion')}>Ir a Preparar compra</button>
            </p>
          )}
        </Card>

        <div className="space-y-2.5">
          {esperados.map((item) => {
            const registro = porItemId.get(item.id)
            const estado = registro?.resultado
            const serial = item.serial || registro?.serial
            return (
              <Card key={item.id} className="p-3.5" data-testid="recepcion-esperado">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-sm font-semibold">{serial || 'IMEI por completar'}</p>
                    {registro?.nota && <p className="mt-0.5 text-xs text-mute">{registro.nota}</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge color={estado ? TONO_RESULTADO[estado] : 'slate'}>{estado ? ETIQUETA_RESULTADO[estado] : 'Pendiente'}</Badge>
                    {!estado && RESULTADOS.map(([id, label]) => (
                      <Button key={id} type="button" variant="outline" onClick={() => { setIncidencia({ itemId: item.id, resultado: id, serial }); setNota('') }}>{label}</Button>
                    ))}
                  </div>
                </div>
              </Card>
            )
          })}
          {sobrantes.map((item) => (
            <Card key={item.id} className="p-3.5" data-testid="recepcion-sobrante">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="truncate font-mono text-sm font-semibold">{item.serial}</p>
                <div className="flex items-center gap-2">
                  <Badge color="blue">Sobrante</Badge>
                  {!item.nota && <Button type="button" variant="outline" onClick={() => { setIncidencia({ itemId: item.id, resultado: 'SOBRANTE' }); setNota('') }}>Agregar nota</Button>}
                </div>
              </div>
              {item.nota && <p className="mt-0.5 text-xs text-mute">{item.nota}</p>}
            </Card>
          ))}
        </div>

        <div className="flex justify-end">
          <Button type="button" variant="ghost" className="text-bad" onClick={cancelar} disabled={busy}>Cancelar recepción</Button>
        </div>

        <ConfirmDialog
          open={confirmarTodo}
          onCancel={() => setConfirmarTodo(false)}
          onConfirm={recibirTodo}
          title="Recibir todo el lote"
          description={`Se marcan ${pendientes.length} unidad(es) como recibidas con los IMEI del manifiesto y se confirma la recepción en el depósito elegido. ${confirmadasTexto(incidenciasCargadas, pendientes)}El stock entra recién al confirmar.`}
          confirmLabel="Recibir todo"
          busy={busy}
        />

        <Modal open={Boolean(incidencia)} onClose={() => !busy && setIncidencia(null)} title={`Incidencia: ${ETIQUETA_RESULTADO[incidencia?.resultado] || ''}`} size="corto">
          <p className="mt-2 text-sm text-mute">{incidencia?.serial || 'La unidad'} · la nota queda auditada con la recepción.</p>
          <label htmlFor="nota-incidencia" className="mt-4 block text-sm font-semibold">Nota</label>
          <Input id="nota-incidencia" className="mt-2 w-full" value={nota} onChange={(evento) => setNota(evento.target.value)} placeholder="Qué pasó (mínimo 3 caracteres)" />
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setIncidencia(null)} disabled={busy}>Volver</Button>
            <Button type="button" onClick={guardarIncidencia} disabled={nota.trim().length < 3 || busy}>{busy ? 'Guardando…' : 'Registrar'}</Button>
          </div>
        </Modal>
      </div>
    )
  }

  // ── Llegadas pendientes ─────────────────────────────────────────────────
  return (
    <div className="space-y-4" data-testid="recepcion">
      <Card className="p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-semibold">Recepción de compras</h2>
            <p className="mt-1 text-sm text-mute">
              Lotes en camino: escaneá contra el manifiesto, marcá incidencias con nota y elegí el depósito.
              El stock entra recién al confirmar; lo que no llegó queda faltante.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" onClick={cargar} disabled={cargando}>
              <Icon name="refresh" className="h-3.5 w-3.5" />Actualizar
            </Button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1 space-y-1 text-sm">
            <span className="font-semibold">Código o QR del manifiesto</span>
            <Input value={codigo} onChange={(evento) => setCodigo(evento.target.value)} placeholder="ENV-… o el enlace del QR" aria-label="Código del lote" />
          </label>
          <Button type="button" onClick={abrirPorCodigo} disabled={busy || !codigo.trim()}>Abrir lote</Button>
        </div>
      </Card>

      {error && <Card className="text-sm text-bad">{error}</Card>}
      {cargando && !llegadas.length ? (
        <div className="space-y-2"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>
      ) : !llegadas.length ? (
        <EmptyState icon="truck" title="No hay llegadas pendientes." description="Cuando despachás una compra, el lote aparece acá para recibirlo." />
      ) : (
        <div className="space-y-2.5">
          {llegadas.map((llegada) => (
            <Card key={llegada.id} className="p-3.5" data-testid="recepcion-llegada">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{llegada.code} <span className="font-normal text-mute">· compra {llegada.compra || '—'}</span></p>
                  <p className="mt-1 text-xs text-mute">
                    {llegada.origen || '—'} → {llegada.destino || '—'} · {llegada.empresa || llegada.metodo || '—'} · llegada {fecha(llegada.eta)}
                  </p>
                </div>
                <Badge color={llegada.pendientes > 0 ? 'orange' : 'blue'}>{llegada.unidades} unidad{llegada.unidades === 1 ? '' : 'es'}</Badge>
              </div>
              <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-mute">
                {llegada.conImei > 0 && <span>{llegada.conImei} con IMEI</span>}
                {llegada.pendientes > 0 && <span>{llegada.pendientes} con IMEI por completar</span>}
                {llegada.ubicacionSugerida?.name && <span>· depósito sugerido: <b className="text-fore">{llegada.ubicacionSugerida.name}</b></span>}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" onClick={() => abrir(llegada)} disabled={busy}>
                  {llegada.recepcionAbiertaId ? 'Retomar recepción' : 'Recibir'}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
