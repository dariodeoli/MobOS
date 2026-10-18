import { Aviso, Badge, Button, ConfirmDialog, EmptyState, Input, Label, Modal, Select, Skeleton, Textarea } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import RecordHeader from '@/components/app/RecordHeader'
import { cn } from '@/lib/utils'
import { CELDA_DATO, ROTULO_SECCION } from '@/components/shared/tabla'
import SerialTexto from '@/components/shared/SerialTexto'
import { conteoAplicable } from '@/lib/validacionGlobal'
import Switch from '@/components/shared/Switch'
import { PIE_ACCIONES_REVERSO } from '@/components/shared/formulario'
import { ESTADO_CONTEO, fechaReserva } from './stockHelpers'
import { CameraScan } from './CameraScan'

export default function TabConteos({ ctx }) {
  const { esDemo, conteoId, conteoError, conteoLoading, conteoDetalle, cerrarConteo, enviarEscaneo, conteoSerialRef, conteoSerial, setConteoSerial, conteoBusy, setCamaraConteoOpen, conteoFlash, sumarSinSerie, conteoSinSerie, setConteoSinSerie, availableProducts, puedeAplicarConteo, setAjustarConteo, setAplicarConteoOpen, setCancelarConteoOpen, aplicarConteoOpen, ajustarConteo, aplicarConteo, motivoAplicarConteo, setMotivoAplicarConteo, cancelarConteoOpen, cancelarConteo, camaraConteoOpen, cerrarCamaraConteo, detectarConteoCamara, setNuevoConteoOpen, conteosLoading, conteosError, conteos, abrirConteo, nuevoConteoOpen, crearConteo, sucursal, nuevoConteoNota, setNuevoConteoNota, nuevoConteoUbicacionId, setNuevoConteoUbicacionId, nuevoConteoAlcance, setNuevoConteoAlcance, locationsFor } = ctx
  return (
    esDemo
      ? <div className="mt-4"><Aviso tono="warn">Los conteos físicos auditables necesitan conexión con el servidor: en la demo no se guardan documentos ni se ajusta stock. Ingresá con una cuenta real para usarlos.</Aviso></div>
      : <div className="mt-4 space-y-4" data-testid="conteos-tab">
        {conteoId ? <div className="space-y-4">
          {conteoError && <Aviso tono="error">{conteoError}</Aviso>}
          {(conteoLoading || !conteoDetalle) && !conteoError && <div className="space-y-2"><Skeleton className="h-16 w-full" /><Skeleton className="h-44 w-full" /></div>}
          {!conteoDetalle && conteoError && <Button type="button" variant="outline" onClick={cerrarConteo}>Volver a conteos</Button>}
          {conteoDetalle && (() => {
            const s = conteoDetalle.summary || { expected: 0, counted: 0, missing: 0, unexpected: 0, productsWithoutSerial: 0 }
            const borrador = conteoDetalle.status === 'DRAFT'
            const [estadoLabel, estadoTone] = ESTADO_CONTEO[conteoDetalle.status] || ['Conteo', 'slate']
            return <div className="space-y-4">
              {/* #358: encabezado compacto del registro (como el detalle de pedido): volver · sucursal · estado · fechas. */}
              <RecordHeader
                backLabel="Conteos"
                onBack={cerrarConteo}
                title={conteoDetalle.branch?.name || 'Sucursal'}
                chip={<Badge color={estadoTone}>{estadoLabel}</Badge>}
                meta={`Iniciado ${fechaReserva(conteoDetalle.createdAt)} · ${conteoDetalle.scope === 'FULL' ? 'Alcance completo' : 'Alcance parcial'}${conteoDetalle.location?.name ? ` · ${conteoDetalle.location.name}` : ' · Toda la sucursal'}${conteoDetalle.appliedAt ? ` · Aplicado ${fechaReserva(conteoDetalle.appliedAt)}` : ''}${conteoDetalle.note ? ` · ${conteoDetalle.note}` : ''}`}
              />
              <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                {[['Esperados', s.expected, 'text-fore'], ['Contados', s.counted, 'text-ok'], ['Faltantes', s.missing, 'text-warn'], ['Inesperados', s.unexpected, 'text-bad']].map(([label, value, tone]) => <div key={label} className="rounded-xl border border-ink-600 p-3"><p className={`text-xl font-bold ${tone}`}>{value}</p><p className="text-[11px] text-mute">{label}</p></div>)}
              </div>
              {conteoDetalle.quantityDifferences?.length > 0 && <section className="space-y-2 rounded-xl border border-ink-600 p-3"><h4 className="text-sm font-bold">Diferencias por cantidad</h4><p className="text-xs text-mute">La base se guarda al iniciar el conteo. Si las ventas, recepciones o ajustes cambian el stock durante el trabajo, el sistema bloquea la aplicación y pide iniciar otro conteo.</p>{conteoDetalle.snapshotMissingProducts?.length > 0 && <Aviso tono="warn">El catálogo cambió durante el conteo. Iniciá un conteo nuevo antes de aplicar.</Aviso>}{conteoDetalle.quantityDifferences.map(row => <div key={row.productId} className="flex flex-wrap items-center gap-2 border-t border-ink-700 pt-2 text-xs"><span className="min-w-0 flex-1 truncate">{row.productName} · {row.sku}</span><span className="text-mute">Esperado {row.expected}</span><span>Contado {row.counted}</span><b className={row.delta === 0 ? 'text-ok' : row.delta < 0 ? 'text-warn' : 'text-fono-light'}>{row.delta > 0 ? '+' : ''}{row.delta}</b>{row.changedDuringCount && <span className="w-full text-warn">El stock cambió durante el conteo; volvé a contar antes de aplicar.</span>}</div>)}</section>}
              {borrador && <form onSubmit={enviarEscaneo} className="rounded-xl border border-ink-600 bg-ink-800/40 p-3">
                <Label htmlFor="conteo-serial">Escanear IMEI / serial</Label>
                <div className="mt-1 flex flex-wrap gap-2">
                  <Input id="conteo-serial" ref={conteoSerialRef} className="min-w-0 flex-1" value={conteoSerial} onChange={event => setConteoSerial(event.target.value)} placeholder="Escaneá o escribí el IMEI y presioná Enter" autoCapitalize="characters" autoComplete="off" autoFocus />
                  <Button type="submit" disabled={conteoBusy || !conteoSerial.trim()}>{conteoBusy ? 'Guardando…' : 'Escanear'}</Button>
                  <Button type="button" variant="outline" onClick={() => setCamaraConteoOpen(true)}>Cámara</Button>
                </div>
                {conteoFlash && <p role="status" className={`mt-2 rounded-lg border px-3 py-1.5 text-sm ${conteoFlash.kind === 'ok' ? 'border-ok/40 bg-ok/10 text-ok' : conteoFlash.kind === 'miss' ? 'border-warn/40 bg-warn/10 text-warn' : 'border-bad/40 bg-bad/10 text-bad'}`}>{conteoFlash.kind === 'ok' ? `✓ IMEI ${conteoFlash.serial}: figura en el stock de esta sucursal.` : conteoFlash.kind === 'miss' ? `⚠ IMEI ${conteoFlash.serial}: no figura en el stock de esta sucursal.` : `⚠ IMEI ${conteoFlash.serial}: ya estaba escaneado en este conteo.`}</p>}
                <p className="mt-2 text-xs text-mute">Cada lectura se guarda al instante, así podés cortar y seguir después. Un lector Bluetooth o USB que envíe Enter funciona igual que la cámara.</p>
              </form>}
              {borrador && <form onSubmit={sumarSinSerie} className="rounded-xl border border-ink-600 bg-ink-800/40 p-3">
                <Label htmlFor="conteo-producto">Producto sin serie</Label>
                <p className="mt-1 text-xs text-mute">Para accesorios o productos sin IMEI: sumá las unidades contadas y el resumen las muestra aparte.</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_7rem_auto]">
                  <Select id="conteo-producto" value={conteoSinSerie.productId} onChange={event => setConteoSinSerie(current => ({ ...current, productId: event.target.value }))}><option value="">Elegí el producto</option>{availableProducts.map(product => <option key={product.id} value={product.id}>{product.nombre}{product.branch?.name ? ` · ${product.branch.name}` : ''}</option>)}</Select>
                  <Input aria-label="Cantidad contada" inputMode="numeric" value={conteoSinSerie.quantity} onChange={event => setConteoSinSerie(current => ({ ...current, quantity: event.target.value.replace(/\D/g, '') }))} placeholder="Cantidad" />
                  <Button type="submit" disabled={conteoBusy || !conteoSinSerie.productId || !conteoSinSerie.quantity}>Sumar</Button>
                </div>
              </form>}
              <section>
                <h4 className={ROTULO_SECCION}>Escaneados ({conteoDetalle.lines.length})</h4>
                {conteoDetalle.lines.length === 0
                  ? <p className="mt-2 text-sm text-mute">Todavía no hay líneas en este conteo.</p>
                  : <div className="mt-2 max-h-72 space-y-1 overflow-y-auto">{conteoDetalle.lines.map(line => <div key={line.id} data-testid="conteo-linea" className="flex flex-wrap items-center gap-2 rounded-lg border border-ink-600 px-3 py-1.5">{line.serial ? <SerialTexto serial={line.serial} className="w-40 shrink-0 text-[11px]" /> : <span className="shrink-0 text-[11px] text-mute">Sin serie × {line.quantity}</span>}<span className="min-w-0 flex-1 truncate text-xs" title={line.product?.name || 'Producto no reconocido'}>{line.product?.name || 'Producto no reconocido'}{line.product?.sku ? ` · SKU ${line.product.sku}` : ''}</span><Badge color={line.serial ? (line.expected ? 'green' : 'red') : 'slate'}>{line.serial ? (line.expected ? 'Esperado' : 'No esperado') : 'Sin serie'}</Badge></div>)}</div>}
              </section>
              {conteoDetalle.missing.length > 0 && <section>
                <h4 className={ROTULO_SECCION}>Faltantes ({conteoDetalle.missing.length})</h4>
                <p className="mt-1 text-xs text-mute">Figuran disponibles en la sucursal y no se escanearon. Al aplicar con ajuste pasan a defectuoso.</p>
                <div className="mt-2 max-h-56 space-y-1 overflow-y-auto">{conteoDetalle.missing.map(unit => <div key={unit.id} data-testid="conteo-faltante" className="flex flex-wrap items-center gap-2 rounded-lg border border-warn/25 bg-warn/5 px-3 py-1.5"><span className="min-w-0 flex-1 truncate text-xs">{unit.product?.name || 'Producto'}{unit.product?.sku ? ` · SKU ${unit.product.sku}` : ''}</span><SerialTexto serial={unit.serial} className="w-40 shrink-0 text-[11px]" /></div>)}</div>
              </section>}
              {borrador
                ? <div className="flex flex-wrap items-center gap-2">
                  {puedeAplicarConteo && <Button type="button" data-testid="aplicar-conteo" disabled={conteoBusy || !conteoAplicable(conteoDetalle)} title={conteoAplicable(conteoDetalle) ? undefined : 'Escaneá al menos un equipo antes de aplicar el conteo.'} onClick={() => { setAjustarConteo(true); setAplicarConteoOpen(true) }}>Aplicar conteo</Button>}
                  <Button type="button" variant="outline" disabled={conteoBusy} onClick={() => setCancelarConteoOpen(true)}>Cancelar conteo</Button>
                  {!conteoAplicable(conteoDetalle) && <p role="status" data-testid="conteo-sin-escaneos" className="text-xs text-mute">El conteo no se aplica sin equipos escaneados.</p>}
                  {!puedeAplicarConteo && <p className="text-xs text-mute">Solo administración o gerencia pueden aplicar el conteo: pediles la aprobación al terminar.</p>}
                </div>
                : <p className="rounded-lg border border-ink-600 bg-ink-800/40 px-3 py-2 text-sm text-mute">{conteoDetalle.status === 'APPLIED' ? 'Conteo aplicado y auditado: no admite más escaneos.' : 'Conteo cancelado: el stock no cambió.'}</p>}
              <Modal open={aplicarConteoOpen} onClose={() => setAplicarConteoOpen(false)} title="Aplicar conteo">
                <div className="space-y-4">
                  <p className="text-sm text-mute">Vas a aprobar el conteo {conteoDetalle.scope === 'FULL' ? 'completo' : 'parcial'} de <b className="text-fore">{conteoDetalle.location?.name || conteoDetalle.branch?.name || 'la sucursal'}</b>: {s.counted} unidades serializadas contadas, {s.missing} faltantes y {s.unexpected} inesperadas. La cantidad de productos sin serie se ajusta por separado. La acción queda auditada y no se puede deshacer.</p>
                  <div><Label htmlFor="conteo-motivo">Motivo de aplicación</Label><Textarea id="conteo-motivo" rows={2} maxLength={500} value={motivoAplicarConteo} onChange={event => setMotivoAplicarConteo(event.target.value)} placeholder="Ej: conteo físico de cierre de turno" /></div>
                  <label className="flex items-start gap-2 text-sm text-mute"><Switch className="mt-0.5" checked={ajustarConteo} onChange={event => setAjustarConteo(event.target.checked)} /><span><b className="text-fore">Ajustar stock:</b> aplica diferencias de cantidades y pasa unidades serializadas faltantes a defectuoso. Sin marcar, solo se aprueba el documento.</span></label>
                  <div className={PIE_ACCIONES_REVERSO}><Button type="button" variant="ghost" onClick={() => setAplicarConteoOpen(false)} disabled={conteoBusy}>Volver</Button><Button type="button" onClick={aplicarConteo} disabled={conteoBusy || !conteoAplicable(conteoDetalle) || !motivoAplicarConteo.trim()} title={!motivoAplicarConteo.trim() ? 'Indicá el motivo de aplicación.' : conteoAplicable(conteoDetalle) ? undefined : 'Escaneá al menos un equipo antes de aplicar el conteo.'}>{conteoBusy ? 'Aplicando…' : 'Aplicar conteo'}</Button></div>
                </div>
              </Modal>
              <ConfirmDialog open={cancelarConteoOpen} onCancel={() => setCancelarConteoOpen(false)} onConfirm={cancelarConteo} busy={conteoBusy} variant="danger" title="Cancelar conteo" confirmLabel="Cancelar conteo" description="El conteo queda cancelado y no se puede volver a escanear. El stock no cambia." />
              <Modal open={camaraConteoOpen} onClose={cerrarCamaraConteo} title="Escanear con cámara">
                <CameraScan continuous onDetected={detectarConteoCamara} onClose={cerrarCamaraConteo} />
                <p className="mt-2 text-xs text-mute">Cada equipo que enfoques se registra solo. Cerrá esta ventana para seguir con el conteo.</p>
              </Modal>
            </div>
          })()}
        </div> : <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><h3 className="text-sm font-bold text-fore">Conteos físicos</h3><p className="mt-0.5 text-xs text-mute">Documento auditable por sucursal: escaneá, revisá diferencias y aprobalo al terminar.</p></div>
            <Button type="button" onClick={() => setNuevoConteoOpen(true)} disabled={conteosLoading}><Icon name="plus" className="h-4 w-4" />Nuevo conteo</Button>
          </div>
          {conteosError && <Aviso tono="error">{conteosError}</Aviso>}
          {conteosLoading && conteos.length === 0 && <div className="space-y-2"><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div>}
          {!conteosLoading && conteos.length === 0 && <EmptyState compact icon="box" title="Todavía no hay conteos." description="Creá uno para comparar lo que hay físicamente contra el stock del sistema." />}
          {conteos.length > 0 && <div className="space-y-1.5">{conteos.map(item => { const [estadoLabel, estadoTone] = ESTADO_CONTEO[item.status] || ['Conteo', 'slate']; return <button key={item.id} type="button" data-testid="conteo-fila" onClick={() => abrirConteo(item)} className="flex w-full flex-wrap items-center gap-2 rounded-xl border border-ink-600 bg-ink-800/40 px-3 py-2 text-left transition hover:border-fono/40"><Badge color={estadoTone}>{estadoLabel}</Badge><b className="min-w-0 truncate text-sm">{item.branch?.name || 'Sucursal'}</b><span className="text-xs text-mute">{fechaReserva(item.createdAt)}</span><span className="text-xs text-mute">{item._count?.lines || 0} línea(s)</span>{item.note && <span className={cn('min-w-0', CELDA_DATO)}>· {item.note}</span>}<span className="ml-auto flex shrink-0 items-center gap-1 text-xs font-semibold text-fono-light">Abrir<Icon name="chevron" className="h-3.5 w-3.5 -rotate-90" /></span></button> })}</div>}
          <Modal open={nuevoConteoOpen} onClose={() => setNuevoConteoOpen(false)} title="Nuevo conteo">
            <form onSubmit={crearConteo} className="space-y-3">
              <p className="text-sm text-mute">Se abre un conteo en borrador para <b className="text-fore">{sucursal?.nombre || sucursal?.name || 'tu sucursal'}</b>. Escaneá los equipos y al terminar aplicalo con gerencia.</p>
              <div><Label htmlFor="conteo-alcance">Alcance</Label><Select id="conteo-alcance" value={nuevoConteoAlcance} onChange={event => setNuevoConteoAlcance(event.target.value)}><option value="PARTIAL">Parcial: solo artículos contados (recomendado)</option><option value="FULL">Completo: artículos no escaneados quedan en cero/faltantes</option></Select></div>
              <div><Label htmlFor="conteo-ubicacion">Sector (opcional)</Label><Select id="conteo-ubicacion" value={nuevoConteoUbicacionId} onChange={event => setNuevoConteoUbicacionId(event.target.value)}><option value="">Toda la sucursal</option>{(locationsFor?.(sucursal?.id) || []).map(location => <option key={location.id} value={location.id}>{location.name}</option>)}</Select>{nuevoConteoUbicacionId && <p className="mt-1 text-xs text-mute">Un conteo por sector verifica unidades serializadas. Las cantidades de productos sin serie se rechazan porque el saldo todavía se guarda por sucursal.</p>}</div>
              <div><Label htmlFor="conteo-nota">Nota (opcional)</Label><Textarea id="conteo-nota" rows={2} maxLength={300} value={nuevoConteoNota} onChange={event => setNuevoConteoNota(event.target.value)} placeholder="Ej: conteo mensual, turno mañana…" /></div>
              <div className={PIE_ACCIONES_REVERSO}><Button type="button" variant="ghost" onClick={() => setNuevoConteoOpen(false)} disabled={conteoBusy}>Volver</Button><Button type="submit" disabled={conteoBusy}>{conteoBusy ? 'Iniciando…' : 'Iniciar conteo'}</Button></div>
            </form>
          </Modal>
        </div>}
      </div>
  )
}
