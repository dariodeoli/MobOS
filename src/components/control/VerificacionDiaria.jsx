import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { useSesion } from '@/lib/sesion'
import { useUrlState } from '@/hooks/useUrlState'
import { formatGs } from '@/utils/moneda'
import { fechaHora } from '@/utils/fecha'
import {
  ESTADO_DIA, ESTADO_LINEA, MOTIVOS_OMITIDO, categoriasDelDia, errorDiscrepancia, hoyParaguay, lineaDelDia, numeroPedidoVisible, puedeVerificarPagos, resumenResultado, sumarResultados,
} from '@/lib/verificacionPagos'
import { demoRegistrarDiscrepancia, demoResolverDiscrepancia, demoVerificarDia, demoVistaDia } from '@/lib/demoVerificacionPagos'
import Icon from '@/components/shared/Icon'
import Popup from '@/components/shared/Popup'
import PopupConfirmar from '@/components/shared/PopupConfirmar'
import BarraGestion from '@/components/shared/BarraGestion'
import { Aviso, Badge, Button, Card, EmptyState, FormField, Input, MoneyInput, Select, Skeleton, Textarea, useToast } from '@/components/ui'

const hora = (iso) => new Date(iso).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit', hour12: false })
const claveGrupo = (grupo) => `${grupo.method}|${grupo.accountId || ''}|${grupo.currency}`

// Finanzas › Verificación: todo lo que entró en el día por medio de pago, con el
// detalle por pedido, para verificarlo en lote (todos / una categoría) o uno por
// uno, y registrar diferencias entre lo esperado y lo recibido. Usa los mismos
// estados de pago y la misma auditoría que «Autorizaciones › Pagos»; el servidor
// no deja verificar cobros propios salvo configuración y es idempotente.
export default function VerificacionDiaria() {
  const { usuario, esDemo, sucursal, sucursales = [] } = useSesion()
  const toast = useToast()
  const esAdmin = usuario?.role === 'ADMIN' || usuario?.role === 'dueno'
  const permitido = esDemo || puedeVerificarPagos(usuario?.role) || esAdmin
  const [dia, setDia] = useUrlState('dia', hoyParaguay())
  const [sucursalId, setSucursalId] = useState(sucursal?.id || '')
  const [vista, setVista] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [confirmar, setConfirmar] = useState(null) // { tipo: 'todos' | 'categoria', categoria? }
  const [resultado, setResultado] = useState(null)
  const [discrepancia, setDiscrepancia] = useState(null) // { scope, linea?, categoria?, esperado }
  const [formDisc, setFormDisc] = useState({ recibido: '', motivo: '' })
  const [errorDisc, setErrorDisc] = useState('')
  const [cierre, setCierre] = useState(null)
  const [notaCierre, setNotaCierre] = useState('')
  const intento = useRef(null)
  const pedido = useRef(0)

  const cargar = useCallback(async () => {
    if (!permitido) return
    const turno = ++pedido.current
    setCargando(true)
    setError('')
    try {
      const datos = esDemo
        ? demoVistaDia(dia)
        : await api.get(`/api/payments/verification/daily?day=${encodeURIComponent(dia)}${sucursalId ? `&branchId=${encodeURIComponent(sucursalId)}` : ''}`, { cacheMs: 0 })
      if (turno === pedido.current) setVista(datos)
    } catch (cause) {
      if (turno === pedido.current) { setVista(null); setError(cause?.message || 'No se pudo cargar la verificación del día.') }
    } finally {
      if (turno === pedido.current) setCargando(false)
    }
  }, [permitido, esDemo, dia, sucursalId])
  useEffect(() => { cargar() }, [cargar])

  const categorias = useMemo(() => categoriasDelDia(vista?.groups || []), [vista])
  const estadoDia = ESTADO_DIA[vista?.state] || ESTADO_DIA.OPEN

  async function enviar(cuerpo) {
    if (esDemo) {
      if (['verify-all', 'verify-category', 'verify-one'].includes(cuerpo.action)) return demoVerificarDia({ day: dia, ...cuerpo }).result
      return null
    }
    return api.post('/api/payments/verification/daily', { day: dia, ...(sucursalId ? { branchId: sucursalId } : {}), ...cuerpo })
  }

  async function verificar(cuerpos, { silencioso = false } = {}) {
    if (ocupado) return
    setOcupado(true)
    setError('')
    try {
      const respuestas = []
      for (const cuerpo of cuerpos) {
        const respuesta = await enviar(cuerpo)
        respuestas.push(esDemo ? respuesta : respuesta.result)
      }
      const total = respuestas.length === 1 ? respuestas[0] : sumarResultados(respuestas)
      setResultado(total)
      if (!silencioso) {
        if (total.skipped.length) toast.info('Verificación parcial', resumenResultado(total))
        else toast.success('Verificado', resumenResultado(total))
      }
    } catch (cause) {
      const mensaje = cause?.message || 'No se pudo verificar.'
      setError(mensaje)
      toast.error('No se pudo verificar', mensaje)
    } finally {
      setOcupado(false)
      setConfirmar(null)
      cargar()
    }
  }

  const verificarTodos = () => verificar([{ action: 'verify-all' }])
  const verificarCategoria = (categoria) => verificar(
    categoria.grupos.filter(grupo => grupo.toVerifyCount + grupo.pendingCount > 0)
      .map(grupo => ({ action: 'verify-category', method: grupo.method, accountId: grupo.accountId || undefined, currency: grupo.currency })),
  )
  const verificarUno = (linea) => verificar([{ action: 'verify-one', paymentId: linea.id }])

  function abrirDiscrepancia(datos) {
    setFormDisc({ recibido: '', motivo: '' })
    setErrorDisc('')
    intento.current = null
    setDiscrepancia(datos)
  }
  async function guardarDiscrepancia() {
    if (!discrepancia || ocupado) return
    const mensaje = errorDiscrepancia({ recibido: formDisc.recibido, esperado: discrepancia.esperado, motivo: formDisc.motivo })
    if (mensaje) { setErrorDisc(mensaje); return }
    setOcupado(true)
    setErrorDisc('')
    try {
      const recibido = Number(formDisc.recibido)
      if (esDemo) {
        demoRegistrarDiscrepancia({ day: dia, scope: discrepancia.scope, paymentId: discrepancia.linea?.id, method: discrepancia.categoria?.method, receivedPyg: recibido, reason: formDisc.motivo })
      } else {
        if (!intento.current) intento.current = crypto.randomUUID()
        await api.post('/api/payments/verification/daily', {
          day: dia, ...(sucursalId ? { branchId: sucursalId } : {}), action: 'discrepancy', scope: discrepancia.scope, requestId: intento.current,
          ...(discrepancia.scope === 'LINE'
            ? { paymentId: discrepancia.linea.id }
            : { method: discrepancia.grupo.method, accountId: discrepancia.grupo.accountId || undefined, currency: discrepancia.grupo.currency }),
          receivedPyg: recibido, reason: formDisc.motivo.trim(),
        })
      }
      toast.success('Discrepancia registrada', 'Queda con el motivo, la persona y la hora.')
      setDiscrepancia(null)
      cargar()
    } catch (cause) {
      setErrorDisc(cause?.message || 'No se pudo registrar la discrepancia.')
    } finally {
      setOcupado(false)
    }
  }
  async function cerrarDiscrepancia() {
    if (!cierre || ocupado) return
    setOcupado(true)
    try {
      if (esDemo) demoResolverDiscrepancia(cierre.id, notaCierre.trim())
      else await api.post('/api/payments/verification/daily', { day: dia, ...(sucursalId ? { branchId: sucursalId } : {}), action: 'resolve-discrepancy', discrepancyId: cierre.id, note: notaCierre.trim() || undefined })
      toast.success('Discrepancia cerrada')
      setCierre(null)
      cargar()
    } catch (cause) {
      toast.error('No se pudo cerrar', cause?.message)
    } finally {
      setOcupado(false)
    }
  }

  if (!permitido) {
    return <Card><Aviso tono="warn">La verificación diaria es para administración, gerencia y caja.</Aviso></Card>
  }

  const sinResolver = vista?.unresolved ?? 0
  const totales = vista?.totals

  return (
    <div className="space-y-3" data-testid="verificacion-diaria">
      <BarraGestion
        etiqueta="Verificación diaria"
        testId="barra-verificacion-dia"
        primary={(
          <Button type="button" className="min-h-11 px-4" disabled={ocupado || cargando || sinResolver === 0} onClick={() => setConfirmar({ tipo: 'todos' })} data-testid="verificar-todos">
            <Icon name="check" className="h-4 w-4" />Verificar todos{sinResolver > 0 ? ` (${sinResolver})` : ''}
          </Button>
        )}
      >
        <label className="flex items-center gap-2 text-xs font-semibold text-mute" htmlFor="verificacion-dia">
          Día
          <Input id="verificacion-dia" type="date" className="h-11 w-auto" value={dia} max={hoyParaguay()} onChange={event => event.target.value && setDia(event.target.value)} />
        </label>
        {esAdmin && sucursales.length > 1 && (
          <label className="flex items-center gap-2 text-xs font-semibold text-mute" htmlFor="verificacion-sucursal">
            Sucursal
            <Select id="verificacion-sucursal" className="h-11 w-auto" value={sucursalId} onChange={event => setSucursalId(event.target.value)}>
              <option value="">Elegí una sucursal</option>
              {sucursales.map(fila => <option key={fila.id} value={fila.id}>{fila.nombre || fila.name}</option>)}
            </Select>
          </label>
        )}
        {vista && <Badge color={estadoDia.tono} data-testid="verificacion-estado-dia">{estadoDia.label}</Badge>}
        <Button type="button" variant="outline" className="min-h-11 px-3 text-xs" onClick={cargar} disabled={cargando}>{cargando ? 'Cargando…' : 'Actualizar'}</Button>
      </BarraGestion>

      {esDemo && <Aviso tono="warn">Datos ficticios: el día de ejemplo se verifica en el navegador y no cambia cobros reales.</Aviso>}
      {error && <Aviso tono="error">{error}</Aviso>}
      {resultado && (
        <Aviso como="div" tono={resultado.skipped?.length ? 'warn' : 'ok'} data-testid="verificacion-resultado">
          <span className="font-semibold">{resumenResultado(resultado)}</span>
          {resultado.skipped?.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-xs">
              {resultado.skipped.map(fila => <li key={fila.paymentId}>Pedido {fila.orderNumber}: {MOTIVOS_OMITIDO[fila.code] || fila.reason}</li>)}
            </ul>
          )}
        </Aviso>
      )}
      {cargando && !vista && <div className="space-y-2" aria-busy="true"><Skeleton className="h-24 w-full" /><Skeleton className="h-40 w-full" /></div>}

      {vista && totales && (
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="verificacion-totales">
          <Total titulo="Total del día" valor={formatGs(totales.confirmedPyg + totales.pendingPyg)} detalle={`${totales.count} cobro${totales.count === 1 ? '' : 's'}`} />
          <Total titulo="Verificado" valor={formatGs(totales.verifiedPyg)} tono="ok" />
          <Total titulo="Por verificar" valor={formatGs(totales.toVerifyPyg + totales.pendingPyg)} tono={sinResolver ? 'warn' : undefined} detalle={sinResolver ? `${sinResolver} pendiente${sinResolver === 1 ? '' : 's'}` : undefined} />
          <Total titulo="Rechazado" valor={formatGs(totales.rejectedPyg)} tono={totales.rejectedPyg ? 'bad' : undefined} />
        </dl>
      )}

      {vista && !categorias.length && !error && (
        <Card><EmptyState compact icon="check" title="No hubo cobros este día" description="Elegí otro día o sucursal para ver lo que entró por efectivo, transferencias, PIX, USDT y tarjeta." /></Card>
      )}

      {categorias.map(categoria => (
        <Card key={categoria.method} data-testid="verificacion-categoria" data-categoria={categoria.method} className="space-y-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h3 className="text-base font-bold">{categoria.label}</h3>
            <span className="text-base font-bold tabular-nums" data-testid="verificacion-categoria-total">{formatGs(categoria.confirmedPyg + categoria.pendingPyg)}</span>
            <span className="text-xs text-mute">{categoria.count} cobro{categoria.count === 1 ? '' : 's'}</span>
            {categoria.porVerificar > 0 && <Badge color="orange">{categoria.porVerificar} por verificar</Badge>}
            {categoria.porVerificar === 0 && categoria.count > 0 && <Badge color="green">Al día</Badge>}
            <span className="ml-auto flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" className="min-h-11 px-3 text-xs" disabled={ocupado} onClick={() => abrirDiscrepancia({ scope: 'CATEGORY', categoria, grupo: categoria.grupos[0], esperado: categoria.grupos.reduce((suma, grupo) => suma + grupo.verifiedPyg + grupo.toVerifyPyg, 0) })} data-testid="discrepancia-categoria">Registrar discrepancia</Button>
              <Button type="button" className="min-h-11 px-3 text-xs" disabled={ocupado || categoria.porVerificar === 0} onClick={() => setConfirmar({ tipo: 'categoria', categoria })} data-testid="verificar-categoria">Verificar categoría</Button>
            </span>
          </div>
          {categoria.grupos.map(grupo => (
            <div key={claveGrupo(grupo)} className="space-y-1">
              {(categoria.grupos.length > 1 || grupo.label !== categoria.label) && (
                <p className="text-xs font-semibold text-mute">{grupo.label}{grupo.openDiscrepancies ? ` · ${grupo.openDiscrepancies} discrepancia${grupo.openDiscrepancies === 1 ? '' : 's'} abierta${grupo.openDiscrepancies === 1 ? '' : 's'}` : ''}</p>
              )}
              <ul className="divide-y divide-ink-600 rounded-xl border border-ink-600">
                {grupo.payments.map(linea => {
                  const estado = ESTADO_LINEA[linea.state] || ESTADO_LINEA.TO_VERIFY
                  return (
                    <li key={linea.id} data-testid="verificacion-linea" data-estado={linea.state} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
                      <span className="min-w-0 flex-1 basis-64 break-words text-sm">{lineaDelDia(linea, { formatear: formatGs, hora })}</span>
                      <Badge color={estado.tono}>{estado.label}</Badge>
                      <span className="flex items-center gap-1.5">
                        {linea.canVerify && <Button type="button" className="min-h-11 px-3 text-xs" disabled={ocupado} onClick={() => verificarUno(linea)} data-testid="verificar-uno">Verificar</Button>}
                        {linea.state !== 'REJECTED' && (
                          <Button type="button" variant="ghost" className="min-h-11 px-3 text-xs" disabled={ocupado} onClick={() => abrirDiscrepancia({ scope: 'LINE', linea, grupo, esperado: linea.amountPyg })} aria-label={`Registrar discrepancia del pedido ${linea.orderNumber}`}>Discrepancia</Button>
                        )}
                        {!linea.canVerify && linea.state !== 'VERIFIED' && linea.state !== 'REJECTED' && <span className="max-w-[10rem] text-[11px] text-mute">Cobro propio: lo verifica otra persona</span>}
                      </span>
                      {linea.state === 'VERIFIED' && linea.verifiedByName && <span className="basis-full text-[11px] text-mute">Verificó {linea.verifiedByName}{linea.verifiedAt ? ` · ${fechaHora(linea.verifiedAt)}` : ''}</span>}
                      {linea.state === 'REJECTED' && linea.note && <span className="basis-full text-[11px] text-bad">Motivo del rechazo: {linea.note}</span>}
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </Card>
      ))}

      {vista?.discrepancies?.length > 0 && (
        <Card className="space-y-2" data-testid="verificacion-discrepancias">
          <h3 className="text-base font-bold">Discrepancias del día</h3>
          <ul className="space-y-2">
            {vista.discrepancies.map(fila => (
              <li key={fila.id} className={`rounded-xl border px-3 py-2 text-sm ${fila.resolved ? 'border-ink-600' : 'border-bad/40 bg-bad/5'}`} data-testid="discrepancia-fila">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <b>{fila.scope === 'LINE' ? 'Por pedido' : 'Categoría'}</b>
                  <span>Esperado <b className="tabular-nums">{formatGs(fila.expectedPyg)}</b></span>
                  <span>Recibido <b className="tabular-nums">{formatGs(fila.receivedPyg)}</b></span>
                  <span className={fila.differencePyg < 0 ? 'font-bold text-bad' : 'font-bold text-warn'}>Diferencia {formatGs(fila.differencePyg)}</span>
                  <Badge color={fila.resolved ? 'green' : 'red'}>{fila.resolved ? 'Cerrada' : 'Abierta'}</Badge>
                  {!fila.resolved && <Button type="button" variant="outline" className="ml-auto min-h-11 px-3 text-xs" onClick={() => { setNotaCierre(''); setCierre(fila) }}>Cerrar</Button>}
                </div>
                <p className="mt-1 text-xs text-mute">Motivo: {fila.reason} · {fila.createdByName || 'Sistema'} · {fechaHora(fila.createdAt)}{fila.resolved ? ` · cerró ${fila.resolvedByName || ''}${fila.resolvedNote ? `: ${fila.resolvedNote}` : ''}` : ''}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <PopupConfirmar
        open={Boolean(confirmar)}
        onCancel={() => { if (!ocupado) setConfirmar(null) }}
        onConfirm={() => (confirmar?.tipo === 'categoria' ? verificarCategoria(confirmar.categoria) : verificarTodos())}
        busy={ocupado}
        title={confirmar?.tipo === 'categoria' ? `Verificar ${confirmar.categoria.label}` : 'Verificar todos los cobros'}
        description={confirmar?.tipo === 'categoria'
          ? `Confirmás que ${confirmar.categoria.porVerificar} cobro${confirmar.categoria.porVerificar === 1 ? '' : 's'} de ${confirmar.categoria.label} del día llegaron. Los cobros propios y los que no tienen comprobante se omiten y te los mostramos.`
          : `Confirmás que los ${sinResolver} cobros pendientes del día llegaron. Los cobros propios y los que no tienen comprobante se omiten y te los mostramos.`}
        confirmLabel="Verificar"
      />

      <Popup
        open={Boolean(discrepancia)}
        onClose={() => { if (!ocupado) setDiscrepancia(null) }}
        dirty={Boolean(discrepancia) && (formDisc.recibido !== '' || formDisc.motivo.trim() !== '')}
        busy={ocupado}
        title="Registrar discrepancia"
        acciones={{
          secundaria: { label: 'Cancelar', disabled: ocupado, cierra: true },
          primaria: { label: ocupado ? 'Guardando…' : 'Registrar', disabled: ocupado, onClick: guardarDiscrepancia },
        }}
      >
        {discrepancia && (
          <div className="space-y-4">
            <p className="text-sm text-mute">
              {discrepancia.scope === 'LINE'
                ? <>Pedido {numeroPedidoVisible(discrepancia.linea.orderNumber)} · {discrepancia.linea.customerName || 'Consumidor final'}</>
                : <>Categoría {discrepancia.categoria.label} del día</>}
              {' · '}Esperado: <b className="text-fore" data-testid="discrepancia-esperado">{formatGs(discrepancia.esperado)}</b>
            </p>
            <FormField label="Monto recibido (Gs.)" htmlFor="discrepancia-recibido">
              <MoneyInput id="discrepancia-recibido" value={formDisc.recibido} onValueChange={valor => { setErrorDisc(''); setFormDisc(actual => ({ ...actual, recibido: valor })) }} placeholder="0" />
            </FormField>
            <FormField label="Motivo de la diferencia" htmlFor="discrepancia-motivo">
              <Textarea id="discrepancia-motivo" rows={3} maxLength={500} value={formDisc.motivo} onChange={event => { setErrorDisc(''); setFormDisc(actual => ({ ...actual, motivo: event.target.value })) }} placeholder="Ej.: la procesadora retuvo la comisión del lote…" />
            </FormField>
            {errorDisc && <Aviso tono="error" compact data-testid="discrepancia-error">{errorDisc}</Aviso>}
          </div>
        )}
      </Popup>

      <Popup
        open={Boolean(cierre)}
        onClose={() => { if (!ocupado) setCierre(null) }}
        busy={ocupado}
        title="Cerrar discrepancia"
        acciones={{
          secundaria: { label: 'Cancelar', disabled: ocupado, cierra: true },
          primaria: { label: ocupado ? 'Guardando…' : 'Cerrar discrepancia', disabled: ocupado, onClick: cerrarDiscrepancia },
        }}
      >
        {cierre && (
          <FormField label="Nota (opcional)" htmlFor="discrepancia-nota" hint={`Diferencia ${formatGs(cierre.differencePyg)} · ${cierre.reason}`}>
            <Textarea id="discrepancia-nota" rows={3} maxLength={500} value={notaCierre} onChange={event => setNotaCierre(event.target.value)} placeholder="Qué se revisó y cómo se resolvió…" />
          </FormField>
        )}
      </Popup>
    </div>
  )
}

function Total({ titulo, valor, detalle, tono }) {
  const color = tono === 'ok' ? 'text-ok' : tono === 'warn' ? 'text-warn' : tono === 'bad' ? 'text-bad' : 'text-fore'
  return (
    <div className="rounded-xl border border-ink-600 px-3 py-2">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-mute">{titulo}</dt>
      <dd className={`text-base font-bold tabular-nums ${color}`}>{valor}</dd>
      {detalle && <dd className="text-[11px] text-mute">{detalle}</dd>}
    </div>
  )
}
