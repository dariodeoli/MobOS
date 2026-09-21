import { useCallback, useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { api, API_URL } from '@/lib/api/client'
import { Aviso, Badge, Button, Card, ConfirmDialog, EmptyState, IconAction, Input, Modal, Skeleton, useToast } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import ComboBuscador from '@/components/shared/ComboBuscador'
import PercentField, { formatPercent, parsePercent } from '@/components/shared/PercentField'
import { gs } from '@/utils/calculos'
import { printHtml } from '@/utils/printHtml'
import { imprimirDocumentoNoFiscal } from '@/lib/printing/documentos'
import { configImpresora } from '@/lib/printing/agent'
import { ticketLiquidacionComision } from '@/lib/printing/tickets'

// Reglas de comisión sobre el margen y liquidaciones por vendedor
// (Finanzas → Comisiones). Mismo contrato que Configuración → Equipo usaba:
// endpoints /api/commission-rules, solo ADMIN las gestiona y la regla por
// usuario prevalece sobre la de rol. Cerrar una liquidación congela el detalle
// del período y emite un comprobante verificable por QR.
const ESTADO_LIQUIDACION = { DRAFT: ['Borrador', 'orange'], PAID: ['Pagada', 'green'], CANCELLED: ['Anulada', 'slate'] }

const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]))

const diaLocal = (fecha) => `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`
const hoy = () => diaLocal(new Date())
const inicioDeMes = () => { const fecha = new Date(); return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-01` }

// El QR abre la verificación pública del comprobante (sin sesión).
const enlaceVerificacion = (token) => token && API_URL ? `${API_URL}/api/public/commission-settlements/${encodeURIComponent(token)}` : ''

// Respaldo A4 del comprobante cuando la térmica no está disponible: mismo
// contenido que el ticket, con el QR para verificar la liquidación. El enlace
// se recibe ya emitido (el token crudo no vive en la base).
async function htmlLiquidacion(detalle, enlace) {
  let qr = ''
  try { if (enlace) qr = await QRCode.toDataURL(enlace, { errorCorrectionLevel: 'M', margin: 1, width: 220 }) } catch { /* el enlace queda impreso igual */ }
  const estado = ESTADO_LIQUIDACION[detalle.status]?.[0] || detalle.status || ''
  const filas = (detalle.lines || []).map(line => `<tr><td>${escapeHtml(line.orderNumber || 'Venta')}${line.date ? ` · ${escapeHtml(line.date)}` : ''}</td><td class="num">${escapeHtml(gs(line.basePyg || 0))}</td><td class="num">${escapeHtml(gs(line.commissionPyg || 0))}</td></tr>`).join('')
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Liquidación de comisiones</title><style>
  @page{size:A4;margin:18mm 16mm}
  body{font:13px/1.6 ui-sans-serif,system-ui,sans-serif;color:#0f1720;max-width:760px;margin:0 auto}
  h1{font-size:20px;margin:0 0 2px}
  .muted{color:#66707a}
  .card{border:1px solid #e3e8ec;border-radius:10px;padding:10px 12px;margin:10px 0}
  table{width:100%;border-collapse:collapse;margin:10px 0}
  th{font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:#66707a;text-align:left}
  th.num,td.num{text-align:right}
  td,th{padding:6px 0;border-bottom:1px dashed #d5dbe0}
  .total{display:flex;justify-content:space-between;font-weight:800;font-size:16px;border-top:2px solid #0f1720;padding-top:6px}
  .qr{display:block;width:42mm;height:42mm;margin:12px auto 4px}
  .small{font-size:10px;word-break:break-all;text-align:center;color:#555}
  .nofiscal{border:2px solid #0f1720;padding:6px 8px;text-align:center;font-weight:800;margin:12px 0}
  </style></head><body>
  <h1>Liquidación de comisiones</h1>
  <p class="muted">${escapeHtml(detalle.sellerName || 'Vendedor')} · Período ${escapeHtml(detalle.periodFrom || '')} al ${escapeHtml(detalle.periodTo || '')}</p>
  <div class="card">Comisión ${escapeHtml(detalle.commissionPct ?? '—')}% sobre el margen del período · Emitida ${escapeHtml(detalle.createdAt ? new Date(detalle.createdAt).toLocaleString('es-PY', { dateStyle: 'short', timeStyle: 'short', hour12: false }) : '')} · ${escapeHtml(estado)}</div>
  <table><thead><tr><th>Venta</th><th class="num">Base</th><th class="num">Comisión</th></tr></thead><tbody>${filas}</tbody></table>
  <div class="total"><span>Total a pagar</span><span>${escapeHtml(gs(detalle.totalPyg || 0))}</span></div>
  ${enlace ? `${qr ? `<img class="qr" src="${qr}" alt="QR de verificación">` : ''}<p class="small">Verificá este comprobante escaneando el QR o en ${escapeHtml(enlace)}</p>` : ''}
  <div class="nofiscal">Documento no fiscal · No válido como factura</div>
  </body></html>`
}

export default function Comisiones() {
  const toast = useToast()
  const [reglas, setReglas] = useState(null)
  const [usuarios, setUsuarios] = useState([])
  const [nueva, setNueva] = useState({ userId: '', percentPyg: '' })
  // Texto del buscador de vendedores (#141/#199): el combo es controlado y el
  // texto tipeado tiene que persistir para que el filtro funcione.
  const [busquedaVendedor, setBusquedaVendedor] = useState('')
  const [busquedaLiquidacion, setBusquedaLiquidacion] = useState('')
  const [editandoId, setEditandoId] = useState(null)
  const [borrador, setBorrador] = useState('')
  const [eliminando, setEliminando] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')

  const [liquidaciones, setLiquidaciones] = useState(null)
  const [periodo, setPeriodo] = useState(() => ({ sellerId: '', from: inicioDeMes(), to: hoy() }))
  const [cerrando, setCerrando] = useState(false)
  const [actualizandoId, setActualizandoId] = useState(null)
  const [anulando, setAnulando] = useState(null)
  const [comprobante, setComprobante] = useState(null)
  const [qr, setQr] = useState('')
  const [qrError, setQrError] = useState('')
  const [imprimiendoId, setImprimiendoId] = useState(null)
  // Token crudo de verificación solo en memoria: la API lo revela una vez al
  // emitir/rotar (en la base queda su sha256). Sin token en memoria, el panel
  // pide uno nuevo —y el QR anterior deja de funcionar— antes de imprimir o
  // copiar el enlace (#172/#178).
  const [tokens, setTokens] = useState({})
  const [generandoId, setGenerandoId] = useState(null)

  // Buscador de vendedores (#141): resultados en tiempo real por nombre, correo
  // o rol, con la misma mecánica que el buscador de productos.
  const opcionesVendedores = usuarios.map(usuario => ({ value: usuario.id, label: usuario.name, detail: [usuario.email, usuario.role].filter(Boolean).join(' · ') }))

  const cargar = useCallback(async () => {
    setError('')
    try {
      const [nextReglas, nextUsuarios] = await Promise.all([api.get('/api/commission-rules'), api.get('/api/users')])
      setReglas(nextReglas || [])
      setUsuarios(nextUsuarios || [])
    } catch (cause) { setError(cause?.message || 'No se pudieron cargar las reglas de comisión.') }
  }, [])
  const cargarLiquidaciones = useCallback(async () => {
    try { setLiquidaciones(await api.get('/api/commission-settlements') || []) }
    catch (cause) { setError(cause?.message || 'No se pudieron cargar las liquidaciones.'); setLiquidaciones([]) }
  }, [])
  useEffect(() => { cargar(); cargarLiquidaciones() }, [cargar, cargarLiquidaciones])

  async function crear(event) {
    event.preventDefault()
    if (!nueva.userId || ocupado) return
    setOcupado(true); setError('')
    try {
      await api.post('/api/commission-rules', { userId: nueva.userId, percentPyg: parsePercent(nueva.percentPyg) })
      setNueva({ userId: '', percentPyg: '' })
      setBusquedaVendedor('')
      toast.success('Regla de comisión creada.')
      await cargar()
    } catch (cause) { setError(cause?.message || 'No se pudo crear la regla.') } finally { setOcupado(false) }
  }

  async function guardar(regla) {
    const percent = parsePercent(borrador)
    if (percent === null || percent < 0 || percent > 100) { setError('El porcentaje debe estar entre 0 y 100.'); return }
    setOcupado(true); setError('')
    try {
      await api.patch('/api/commission-rules', { id: regla.id, percentPyg: percent })
      setEditandoId(null)
      toast.success('Regla de comisión actualizada.')
      await cargar()
    } catch (cause) { setError(cause?.message || 'No se pudo actualizar la regla.') } finally { setOcupado(false) }
  }

  async function confirmarEliminar() {
    setOcupado(true); setError('')
    try {
      await api.delete('/api/commission-rules', { body: { id: eliminando.id } })
      setEliminando(null)
      toast.success('Regla de comisión eliminada.')
      await cargar()
    } catch (cause) { setError(cause?.message || 'No se pudo eliminar la regla.') } finally { setOcupado(false) }
  }

  const nombreUsuario = id => usuarios.find(usuario => usuario.id === id)?.name || 'Usuario eliminado'

  // ---- Liquidaciones ---------------------------------------------------------

  function pintarQr(token) {
    setQr(''); setQrError('')
    const enlace = enlaceVerificacion(token)
    if (!enlace) return
    QRCode.toDataURL(enlace, { errorCorrectionLevel: 'M', margin: 1, width: 320 })
      .then(setQr)
      .catch(() => setQrError('No se pudo generar el QR; el enlace queda visible para compartir.'))
  }

  function abrirComprobante(liquidacion, tokenDirecto) {
    setComprobante(liquidacion)
    pintarQr(tokenDirecto || tokens[liquidacion.id])
  }

  // Rotación explícita: la API emite un token nuevo (solo guarda su hash) y el
  // QR anterior deja de validar. Devuelve el token crudo para usarlo al vuelo.
  async function generarEnlace(liquidacion) {
    setGenerandoId(liquidacion.id); setError('')
    try {
      const conToken = await api.patch(`/api/commission-settlements/${encodeURIComponent(liquidacion.id)}`, { action: 'rotate' })
      setTokens(actual => ({ ...actual, [liquidacion.id]: conToken.verificationToken }))
      setLiquidaciones(actual => (actual || []).map(item => item.id === conToken.id ? { ...item, ...conToken } : item))
      setComprobante(actual => actual?.id === conToken.id ? { ...actual, ...conToken } : actual)
      toast.success('Enlace de verificación emitido', 'El QR anterior dejó de funcionar.')
      pintarQr(conToken.verificationToken)
      return conToken.verificationToken || ''
    } catch (cause) { setError(cause?.message || 'No se pudo emitir el enlace del comprobante.'); return '' }
    finally { setGenerandoId(null) }
  }

  async function cerrarLiquidacion(event) {
    event.preventDefault()
    if (!periodo.sellerId || cerrando) return
    setCerrando(true); setError('')
    try {
      const creada = await api.post('/api/commission-settlements', { sellerId: periodo.sellerId, from: periodo.from, to: periodo.to })
      if (creada.verificationToken) setTokens(actual => ({ ...actual, [creada.id]: creada.verificationToken }))
      setLiquidaciones(actual => [creada, ...(actual || [])])
      setPeriodo(actual => ({ ...actual, sellerId: '' }))
      toast.success('Liquidación cerrada', `${creada.sellerName || 'Vendedor'}: ${gs(creada.totalPyg || 0)} en comisiones.`)
      abrirComprobante(creada, creada.verificationToken)
    } catch (cause) { setError(cause?.message || 'No se pudo cerrar la liquidación.') } finally { setCerrando(false) }
  }

  async function cambiarEstado(liquidacion, action) {
    setActualizandoId(liquidacion.id); setError('')
    try {
      const actualizada = await api.patch(`/api/commission-settlements/${encodeURIComponent(liquidacion.id)}`, { action })
      setLiquidaciones(actual => (actual || []).map(item => item.id === actualizada.id ? { ...item, ...actualizada } : item))
      setComprobante(actual => actual?.id === actualizada.id ? { ...actual, ...actualizada } : actual)
      setAnulando(null)
      toast.success(action === 'pay' ? 'Liquidación marcada como pagada.' : 'Liquidación anulada.')
    } catch (cause) { setError(cause?.message || 'No se pudo actualizar la liquidación.') } finally { setActualizandoId(null) }
  }

  async function copiarEnlace(liquidacion) {
    const token = tokens[liquidacion.id] || await generarEnlace(liquidacion)
    const enlace = enlaceVerificacion(token)
    if (!enlace) { setError('No se pudo armar el enlace de verificación.'); return }
    navigator.clipboard?.writeText(enlace)
      .then(() => toast.success('Enlace copiado', 'El QR del comprobante verifica la liquidación sin sesión.'))
      .catch(() => setError(enlace))
  }

  // Primero la térmica (agente o puente); solo si el fallo fue claro cae al
  // diálogo con el A4, igual que el resto de los documentos no fiscales.
  async function imprimir(liquidacion) {
    if (imprimiendoId) return
    setImprimiendoId(liquidacion.id); setError('')
    try {
      const detalle = Array.isArray(liquidacion.lines) ? liquidacion : await api.get(`/api/commission-settlements/${encodeURIComponent(liquidacion.id)}`)
      // Sin token en memoria hay que emitir uno nuevo (rota el anterior): el
      // comprobante impreso siempre sale con un QR válido.
      const token = tokens[liquidacion.id] || await generarEnlace(liquidacion)
      const enlace = enlaceVerificacion(token)
      const { ancho } = configImpresora()
      const resultado = await imprimirDocumentoNoFiscal(ticketLiquidacionComision(detalle, { ancho, link: enlace }), {
        tipo: 'liquidacion-comision',
        respaldo: async () => printHtml(await htmlLiquidacion(detalle, enlace)),
      })
      if (resultado.ok) {
        toast.success(
          resultado.encolado ? 'Comprobante encolado' : 'Comprobante enviado a la impresora',
          resultado.encolado ? 'La impresora no respondió; se reintenta solo.' : '',
        )
        return
      }
      if (resultado.dialogo) return
      toast.error('No se pudo imprimir el comprobante', resultado.error || 'Revisá la impresora.')
    } catch (cause) { toast.error('No se pudo imprimir el comprobante', cause?.message || 'Revisá la impresora.') }
    finally { setImprimiendoId(null) }
  }

  // Token crudo del comprobante abierto (solo en memoria).
  const tokenComprobante = comprobante ? (tokens[comprobante.id] || comprobante.verificationToken || '') : ''

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="font-bold mb-1">Comisiones</h2>
        <p className="text-sm text-mute mb-4">
          Reglas de comisión sobre el <strong>margen</strong> de cada venta. La regla por usuario prevalece sobre la de rol.
        </p>
        <form onSubmit={crear} className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <span className="block text-[10px] font-bold uppercase text-mute mb-1">Vendedor</span>
            <ComboBuscador id="comision-vendedor" ariaLabel="Vendedor de la regla" value={busquedaVendedor} options={opcionesVendedores} onChange={(texto) => { setBusquedaVendedor(texto); if (nueva.userId) setNueva({ ...nueva, userId: '' }) }} onSelect={opcion => { setBusquedaVendedor(opcion.label); setNueva({ ...nueva, userId: opcion.value }) }} placeholder="Buscá por nombre, correo o rol" required emptyLabel="Sin vendedores con esa búsqueda." />
          </div>
          <div className="sm:w-36">
            <span className="block text-[10px] font-bold uppercase text-mute mb-1">% comisión</span>
            <PercentField aria-label="Porcentaje de comisión" value={nueva.percentPyg} onChange={value => setNueva({ ...nueva, percentPyg: value })} placeholder="0" required />
          </div>
          <Button type="submit" disabled={ocupado}>{ocupado ? 'Guardando…' : 'Agregar regla'}</Button>
        </form>
        {error && <Aviso tono="error" className="mb-4">{error}</Aviso>}
        {reglas === null ? (
          <div className="space-y-2" aria-busy="true"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
        ) : reglas.length === 0 ? (
          <EmptyState compact icon="tag" title="Sin reglas de comisión" description="Agregá una regla para empezar a calcular comisiones por margen." />
        ) : (
          <div className="space-y-2">
            {reglas.map(regla => (
              <div key={regla.id} data-testid="regla-comision" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-600 p-2.5">
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-semibold">{regla.userId ? (regla.user?.name || nombreUsuario(regla.userId)) : `Rol ${regla.role}`}</div>
                  <div className="mt-0.5 text-xs text-mute">{regla.userId ? 'Regla por usuario' : 'Regla por rol'}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {editandoId === regla.id ? (
                    <>
                      <PercentField className="h-8 w-20 px-2 text-right text-sm" aria-label="Porcentaje de comisión" value={borrador} onChange={setBorrador} />
                      <Button type="button" variant="success" disabled={ocupado} className="h-8 px-2 text-xs" onClick={() => guardar(regla)}>Guardar</Button>
                      <Button type="button" variant="ghost" className="h-8 px-2 text-xs" onClick={() => setEditandoId(null)}>Cancelar</Button>
                    </>
                  ) : (
                    <>
                      <Badge color="green">{formatPercent(regla.percentPyg)}%</Badge>
                      <IconAction icon="edit" label="Editar porcentaje" onClick={() => { setEditandoId(regla.id); setBorrador(formatPercent(regla.percentPyg)) }} />
                      <IconAction icon="trash" label="Eliminar regla" onClick={() => setEliminando(regla)} />
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <h2 className="font-bold mb-1">Liquidaciones</h2>
        <p className="text-sm text-mute mb-4">
          Cerrá el período de un vendedor: la comisión se congela con el detalle de cada venta y el comprobante se verifica por QR.
        </p>
        <form onSubmit={cerrarLiquidacion} className="flex flex-col gap-3 mb-4 lg:flex-row lg:items-end">
          <div className="flex-1">
            <span className="block text-[10px] font-bold uppercase text-mute mb-1">Vendedor</span>
            <ComboBuscador id="liquidacion-vendedor" ariaLabel="Vendedor de la liquidación" value={busquedaLiquidacion} options={opcionesVendedores} onChange={(texto) => { setBusquedaLiquidacion(texto); if (periodo.sellerId) setPeriodo({ ...periodo, sellerId: '' }) }} onSelect={opcion => { setBusquedaLiquidacion(opcion.label); setPeriodo({ ...periodo, sellerId: opcion.value }) }} placeholder="Buscá por nombre, correo o rol" required emptyLabel="Sin vendedores con esa búsqueda." />
          </div>
          <div className="lg:w-40">
            <span className="block text-[10px] font-bold uppercase text-mute mb-1">Desde</span>
            <Input type="date" aria-label="Desde" value={periodo.from} onChange={event => setPeriodo({ ...periodo, from: event.target.value })} required />
          </div>
          <div className="lg:w-40">
            <span className="block text-[10px] font-bold uppercase text-mute mb-1">Hasta</span>
            <Input type="date" aria-label="Hasta" value={periodo.to} onChange={event => setPeriodo({ ...periodo, to: event.target.value })} required />
          </div>
          <Button type="submit" disabled={cerrando || !periodo.sellerId}>{cerrando ? 'Cerrando…' : 'Cerrar liquidación'}</Button>
        </form>
        {liquidaciones === null ? (
          <div className="space-y-2" aria-busy="true"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
        ) : liquidaciones.length === 0 ? (
          <EmptyState compact icon="receipt" title="Sin liquidaciones" description="Cerrá el período de un vendedor para emitir su comprobante." />
        ) : (
          <div className="space-y-2">
            {liquidaciones.map(item => {
              const [estado, color] = ESTADO_LIQUIDACION[item.status] || [item.status, 'slate']
              return (
                <div key={item.id} data-testid="liquidacion-comision" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-600 p-2.5">
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-semibold">{item.sellerName || 'Vendedor'} · {gs(item.totalPyg || 0)}</div>
                    <div className="mt-0.5 text-xs text-mute">
                      {item.periodFrom} al {item.periodTo}
                      {item.commissionPct !== null && item.commissionPct !== undefined ? ` · ${formatPercent(item.commissionPct)}%` : ''}
                      {item.createdAt ? ` · emitida ${new Date(item.createdAt).toLocaleDateString('es-PY')}` : ''}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge color={color}>{estado}</Badge>
                    <IconAction icon="receipt" label="Ver comprobante y QR" onClick={() => abrirComprobante(item)} />
                    <IconAction icon="printer" label="Imprimir comprobante" disabled={Boolean(imprimiendoId)} onClick={() => imprimir(item)} />
                    <IconAction icon="copy" label="Copiar enlace de verificación" onClick={() => copiarEnlace(item)} />
                    {item.status === 'DRAFT' && (
                      <>
                        <IconAction icon="check" tone="ok" label="Marcar como pagada" disabled={actualizandoId === item.id} onClick={() => cambiarEstado(item, 'pay')} />
                        <IconAction icon="close" tone="bad" label="Anular liquidación" disabled={actualizandoId === item.id} onClick={() => setAnulando(item)} />
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      <Modal open={Boolean(comprobante)} onClose={() => setComprobante(null)} title={`Comprobante · ${comprobante?.sellerName || 'Vendedor'}`} className="max-w-lg">
        {comprobante && (
          <div className="space-y-4">
            <div className="rounded-xl border border-ink-600 p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-mute">Período</span>
                <b>{comprobante.periodFrom} al {comprobante.periodTo}</b>
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <span className="text-mute">Total liquidado</span>
                <b className="text-fono-light">{gs(comprobante.totalPyg || 0)}</b>
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <span className="text-mute">Estado</span>
                <Badge color={(ESTADO_LIQUIDACION[comprobante.status] || ['', 'slate'])[1]}>{(ESTADO_LIQUIDACION[comprobante.status] || [comprobante.status, ''])[0]}</Badge>
              </div>
            </div>
            {tokenComprobante ? (
              qr
                ? <img src={qr} alt="QR de verificación" className="mx-auto h-44 w-44 rounded-xl bg-white p-2" />
                : <p className="py-6 text-center text-sm text-mute">{qrError || 'Generando QR…'}</p>
            ) : (
              <div className="space-y-3 rounded-xl border border-ink-600 bg-ink-800/40 p-3 text-center">
                <p className="text-sm text-mute">
                  El enlace se revela una sola vez y en la base solo queda su huella. Emití uno nuevo para imprimir o compartir: el QR anterior dejará de funcionar.
                </p>
                <Button type="button" disabled={generandoId === comprobante.id} onClick={() => generarEnlace(comprobante)}>
                  {generandoId === comprobante.id ? 'Emitiendo…' : 'Generar enlace de verificación'}
                </Button>
              </div>
            )}
            <p className="break-all rounded-lg border border-ink-600 bg-ink-900 px-3 py-2 text-[11px] text-mute">{enlaceVerificacion(tokenComprobante) || 'El enlace se emite al generar, imprimir o copiar.'}</p>
            {comprobante.verificationTokenIssuedAt && (
              <p className="text-[11px] text-mute">Enlace emitido {new Date(comprobante.verificationTokenIssuedAt).toLocaleString('es-PY', { dateStyle: 'short', timeStyle: 'short', hour12: false })}.</p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => copiarEnlace(comprobante)}><Icon name="copy" className="h-4 w-4" />Copiar enlace</Button>
              <Button type="button" disabled={imprimiendoId === comprobante.id} onClick={() => imprimir(comprobante)}><Icon name="printer" className="h-4 w-4" />{imprimiendoId === comprobante.id ? 'Imprimiendo…' : 'Imprimir comprobante'}</Button>
            </div>
            <p className="text-xs text-mute">Al escanear el QR se verifica el comprobante sin sesión: vendedor, período, total, estado y fecha de emisión. No expone ventas ni clientes. Emitir un enlace nuevo invalida el QR anterior.</p>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(eliminando)}
        onCancel={() => setEliminando(null)}
        onConfirm={confirmarEliminar}
        busy={ocupado}
        title="¿Eliminar regla?"
        description="La regla dejará de aplicarse al calcular comisiones. Las ventas ya calculadas no cambian."
        confirmLabel="Eliminar regla"
        variant="danger"
      />
      <ConfirmDialog
        open={Boolean(anulando)}
        onCancel={() => setAnulando(null)}
        onConfirm={() => anulando && cambiarEstado(anulando, 'cancel')}
        busy={actualizandoId === anulando?.id}
        title="¿Anular liquidación?"
        description="La liquidación queda anulada y su comprobante deja de estar vigente. Después podés cerrar el período otra vez."
        confirmLabel="Anular liquidación"
        variant="danger"
      />
    </div>
  )
}
