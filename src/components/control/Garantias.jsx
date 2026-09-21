import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useBusquedaDiferida } from '@/hooks/useBusquedaDiferida'
import { Card, Button, Input, Label, Textarea, Badge, EmptyState, Modal, MoneyInput, Skeleton, useToast, IconAction } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import SearchField from '@/components/shared/SearchField'
import WhatsAppMenu from '@/components/shared/WhatsAppMenu'
import SerialField from '@/components/shared/SerialField'
import AttachmentInput from '@/components/shared/AttachmentInput'
import { api, API_URL } from '@/lib/api/client'
import { qrGarantia } from '@/lib/printing/qr'
import { descargarCsv } from '@/utils/descargarCsv'
import { useSesion } from '@/lib/sesion'
import { gs } from '@/utils/calculos'
import { getDemoWarranties, saveDemoWarranties } from '@/lib/demoWarranties'
import { cn } from '@/lib/utils'
import SerialTexto from '@/components/shared/SerialTexto'

const STATES = [['RECEIVED', 'Recibido'], ['DIAGNOSIS', 'En diagnóstico'], ['READY', 'Listo'], ['DELIVERED', 'Entregado']]
const label = Object.fromEntries(STATES)
const blank = { customerName: '', serial: '', description: '', responsibleName: '', technicianName: '', diagnosis: '', resolution: '', repairCostPyg: '', partsText: '', photosText: '', branchId: '', warrantyDays: '', expiresAt: '', coverage: '', exclusions: '' }
// El caso todavía no guarda teléfono propio: se usa el del cliente vinculado si
// el API lo expone; sin teléfono no se muestra el menú de WhatsApp.
const telefonoDelCaso = (item) => item.customerPhone || item.customer?.phone || ''

// Tabla compacta: una fila por caso y las acciones en la misma línea.
const GRID_GARANTIAS = 'grid min-w-[54rem] grid-cols-[minmax(7rem,1.1fr)_minmax(5rem,0.9fr)_minmax(7rem,1.6fr)_5.5rem_5.5rem_6rem_13rem] items-center gap-x-2'
const CELDA = 'truncate text-[10px] font-bold uppercase tracking-wider text-mute'
const fechaCorta = (value) => {
  const date = new Date(value)
  if (!value || Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('es-PY', { day: '2-digit', month: 'short' }).replace('.', '')
}
// El vencimiento de la garantía se guardaba y no se veía en el listado: se
// pinta solo cuando está por caer o ya venció.
const vencimientoGarantia = (item) => {
  const vence = item.expiresAt ? new Date(item.expiresAt) : null
  if (!vence || Number.isNaN(vence.getTime())) return { texto: '—', urgente: false, titulo: 'Sin vencimiento cargado' }
  const titulo = `Vence el ${vence.toLocaleDateString('es-PY')}`
  const dias = Math.ceil((vence.getTime() - Date.now()) / 86400000)
  if (dias < 0) return { texto: 'venció', urgente: true, titulo }
  if (dias <= 7) return { texto: `en ${dias} d`, urgente: true, titulo }
  return { texto: fechaCorta(item.expiresAt), urgente: false, titulo }
}

export default function Garantias() {
  const { esDemo, sucursal } = useSesion()
  const toast = useToast()
  // La búsqueda global abre la sección con ?q= aplicado (serial, cliente o detalle).
  const [searchParams] = useSearchParams()
  const qParam = searchParams.get('q') || ''
  const [items, setItems] = useState([]); const [q, setQ] = useState(qParam); const [form, setForm] = useState(blank); const [error, setError] = useState(''); const [saving, setSaving] = useState(false); const [advancingId, setAdvancingId] = useState(null)
  const [orden, setOrden] = useState({ key: 'recientes', dir: 'desc' })
  const [fotosDe, setFotosDe] = useState(null); const [fotos, setFotos] = useState([]); const [fotosCargando, setFotosCargando] = useState(false); const [fotosError, setFotosError] = useState(''); const [subiendo, setSubiendo] = useState(false)
  const [exportando, setExportando] = useState(false)
  const busquedaDiferida = useBusquedaDiferida(q)
  const load = useCallback(async (busqueda = '') => { try { setItems(esDemo ? getDemoWarranties() : await api.get(`/api/warranties?q=${encodeURIComponent(busqueda)}`)) } catch (e) { setError(e.message) } }, [esDemo])
  useEffect(() => { load(busquedaDiferida) }, [load, busquedaDiferida])
  useEffect(() => { if (qParam) setQ(qParam) }, [qParam])
  async function exportar() {
    if (esDemo) return
    setExportando(true); setError('')
    try { await descargarCsv('warranties', { q: busquedaDiferida.trim() || undefined }, 'mobos-garantias.csv') } catch (e) { setError(e.message) } finally { setExportando(false) }
  }
  const ordenarPor = (key) => setOrden(current => current.key === key
    ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
    : { key, dir: 'asc' })
  const encabezado = (key, label, extra = '') => (
    <button type="button" onClick={() => ordenarPor(key)} className={cn('flex items-center gap-1 truncate text-left text-[10px] font-bold uppercase tracking-wider transition hover:text-fore', orden.key === key ? 'text-fono-light' : 'text-mute', extra)}>
      {label}<span className="shrink-0">{orden.key === key ? (orden.dir === 'asc' ? '↑' : '↓') : ''}</span>
    </button>
  )
  const visible = useMemo(() => {
    const lista = esDemo ? items.filter((x) => [x.customerName, x.serial, x.description].some((v) => v.toLowerCase().includes(q.toLowerCase()))) : items
    if (orden.key === 'recientes') return lista
    const factor = orden.dir === 'asc' ? 1 : -1
    const valor = (item) => {
      if (orden.key === 'cliente') return String(item.customerName || '')
      if (orden.key === 'serial') return String(item.serial || '')
      if (orden.key === 'caso') return String(item.description || '')
      if (orden.key === 'tecnico') return String(item.technicianName || '')
      if (orden.key === 'vence') return item.expiresAt ? new Date(item.expiresAt).getTime() : 0
      return STATES.findIndex(([id]) => id === item.status)
    }
    return [...lista].sort((a, b) => {
      const va = valor(a); const vb = valor(b)
      if (typeof va === 'string' || typeof vb === 'string') return String(va).localeCompare(String(vb), 'es') * factor
      return (va - vb) * factor
    })
  }, [items, q, esDemo, orden])
  const listInput = (value) => value.split('\n').map((item) => item.trim()).filter(Boolean)
  async function create(e) { e.preventDefault(); setSaving(true); setError(''); try { const { partsText, photosText, warrantyDays, repairCostPyg, ...base } = form; const data = { ...base, parts: listInput(partsText), photos: listInput(photosText), branchId: form.branchId || sucursal?.id, ...(String(warrantyDays).trim() ? { warrantyDays: Number(warrantyDays) } : {}), ...(String(repairCostPyg).trim() ? { repairCostPyg: Number(repairCostPyg) } : {}) }; if (esDemo) setItems(saveDemoWarranties([{ ...data, id: `demo-${Date.now()}`, status: 'RECEIVED', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, ...items])); else { const saved = await api.post('/api/warranties', data); setItems([saved, ...items]); if (saved?.publicToken) { const url = qrGarantia(saved.publicToken); navigator.clipboard?.writeText(url).catch(() => {}); toast.success('Garantía creada. El enlace público quedó copiado.') } } setForm(blank) } catch (e) { setError(e.message) } finally { setSaving(false) } }
  async function advance(item) { const next = STATES[STATES.findIndex(([s]) => s === item.status) + 1]?.[0]; if (!next || advancingId) return; setAdvancingId(item.id); setError(''); try { if (esDemo) { const nextItems = items.map((x) => x.id === item.id ? { ...x, status: next, updatedAt: new Date().toISOString() } : x); setItems(saveDemoWarranties(nextItems)) } else { const updated = await api.patch('/api/warranties', { id: item.id, status: next }); setItems(items.map((x) => x.id === item.id ? updated : x)) } } catch (e) { setError(e.message) } finally { setAdvancingId(null) } }
  async function abrirFotos(item) {
    setFotosDe(item); setFotos([]); setFotosCargando(true); setFotosError('')
    try { setFotos(await api.get(`/api/warranties/${item.id}/photos`)) } catch (cause) { setFotosError(cause?.message || 'No se pudieron cargar las fotos.') } finally { setFotosCargando(false) }
  }
  async function subirFoto(file) {
    if (!file || !fotosDe) return
    setSubiendo(true); setFotosError('')
    try {
      const formData = new FormData()
      formData.append('file', file)
      const creada = await api.post(`/api/warranties/${fotosDe.id}/photos`, formData)
      toast.success('Foto subida.')
      setFotos([creada, ...fotos])
    } catch (cause) {
      setFotosError(cause?.message || 'No se pudo subir la foto.')
      toast.error('No se pudo subir la foto.', cause?.message)
    } finally { setSubiendo(false) }
  }
  return <div className="space-y-5"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm text-mute">Seguimiento por caso, sin inventar cobertura automática.</p></div><div className="flex w-full max-w-md shrink-0 items-center gap-2"><SearchField value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cliente, serial o detalle…" ariaLabel="Buscar garantías" className="min-w-0 flex-1" />{!esDemo && <Button type="button" variant="outline" className="h-9 shrink-0 px-3 text-xs" disabled={exportando} onClick={exportar}><Icon name="download" className="h-4 w-4" />Exportar CSV</Button>}</div></div>
    <Card><form onSubmit={create} className="grid gap-3 md:grid-cols-2"><div><Label>Cliente</Label><Input required value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} placeholder="Nombre del cliente" /></div><div><Label>Serial / IMEI</Label><SerialField required value={form.serial} onChange={(value) => setForm({ ...form, serial: value })} placeholder="Serial o IMEI" /></div><div className="md:col-span-2"><Label>Descripción del caso</Label><Textarea required rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Falla reportada, revisión solicitada…" /></div><div><Label>Responsable</Label><Input value={form.responsibleName} onChange={(e) => setForm({ ...form, responsibleName: e.target.value })} placeholder="Persona responsable" /></div><div><Label>Costo de reparación (Gs)</Label><MoneyInput value={form.repairCostPyg} onValueChange={(value) => setForm({ ...form, repairCostPyg: value === '' ? '' : String(value) })} placeholder="0" /></div><div><Label>Técnico asignado</Label><Input value={form.technicianName} onChange={(e) => setForm({ ...form, technicianName: e.target.value })} placeholder="Técnico responsable" /></div><div className="md:col-span-2"><Label>Diagnóstico inicial</Label><Textarea rows={2} value={form.diagnosis} onChange={(e) => setForm({ ...form, diagnosis: e.target.value })} placeholder="Pruebas, causa probable y condición de recepción…" /></div><div className="md:col-span-2"><Label>Resolución</Label><Textarea rows={2} value={form.resolution} onChange={(e) => setForm({ ...form, resolution: e.target.value })} placeholder="Qué se hizo y cómo quedó el equipo…" /></div><div><Label>Repuestos (uno por línea)</Label><Textarea rows={2} value={form.partsText} onChange={(e) => setForm({ ...form, partsText: e.target.value })} placeholder="Pantalla OLED\nBatería" /></div><div><Label>Fotos / enlaces (uno por línea)</Label><Textarea rows={2} value={form.photosText} onChange={(e) => setForm({ ...form, photosText: e.target.value })} placeholder="https://…" /></div><div><Label>Días de garantía</Label><Input inputMode="numeric" value={form.warrantyDays} onChange={(e) => setForm({ ...form, warrantyDays: e.target.value.replace(/\D/g, '') })} placeholder="Ej. 90" /></div><div><Label>Vencimiento</Label><Input type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} /></div><div className="md:col-span-2"><Label>Qué cubre (una por línea)</Label><Textarea rows={2} value={form.coverage} onChange={(e) => setForm({ ...form, coverage: e.target.value })} placeholder={'Defectos de fábrica\nPantalla y batería'} /></div><div className="md:col-span-2"><Label>Qué no cubre (una por línea)</Label><Textarea rows={2} value={form.exclusions} onChange={(e) => setForm({ ...form, exclusions: e.target.value })} placeholder={'Daños por agua\nReparaciones de terceros'} /></div><Button type="submit" disabled={saving} className="md:col-span-2 min-h-11">{saving ? 'Guardando…' : 'Registrar caso'}</Button></form></Card>
    {error && <p role="alert" className="rounded-xl border border-bad/30 bg-bad/10 px-4 py-3 text-sm text-bad">{error}</p>}
    {visible.length > 0 && <div className="overflow-x-auto" data-testid="garantias-tabla">
      <div className={cn(GRID_GARANTIAS, 'px-3.5 pb-2 pt-1')}>
        {encabezado('cliente', 'Cliente')}
        {encabezado('serial', 'Serial')}
        {encabezado('caso', 'Caso')}
        {encabezado('tecnico', 'Técnico')}
        {encabezado('vence', 'Vence')}
        {encabezado('estado', 'Estado')}
        <span className={cn(CELDA, 'text-right')}>Acciones</span>
      </div>
      <div className="space-y-1">
        {visible.map((item) => {
          const vence = vencimientoGarantia(item)
          const serial = String(item.serial || '')
          const detalle = [item.diagnosis ? `Diagnóstico: ${item.diagnosis}` : '', item.resolution ? `Resolución: ${item.resolution}` : '', item.repairCostPyg ? `Costo: ${gs(item.repairCostPyg)}` : '', item.responsibleName ? `Resp: ${item.responsibleName}` : '', item.parts?.length ? `Repuestos: ${item.parts.join(', ')}` : '', item.photos?.length ? `${item.photos.length} foto(s)` : ''].filter(Boolean).join(' · ')
          return <div key={item.id} data-testid="garantia-fila" className={cn(GRID_GARANTIAS, 'rounded-xl border border-ink-600 bg-ink-800/40 px-3.5 py-2 transition hover:border-fono/40')}>
            <span className="truncate text-sm font-semibold" title={item.customerName}>{item.customerName || 'Sin cliente'}</span>
            <SerialTexto serial={serial} className="truncate text-[11px] text-fono-light" />
            <span className="truncate text-xs text-mute" title={[item.description, detalle].filter(Boolean).join(' · ')}>{item.description || '—'}{detalle ? <span className="text-mute/70"> · {detalle}</span> : null}</span>
            <span className="truncate text-xs text-mute">{item.technicianName || '—'}</span>
            <span className={cn('truncate text-xs', vence.urgente ? 'font-semibold text-warn' : 'text-mute')} title={vence.titulo}>{vence.texto}</span>
            <Badge color={item.status === 'DELIVERED' ? 'green' : item.status === 'READY' ? 'orange' : 'slate'} className="w-fit justify-self-start whitespace-nowrap px-1.5 py-0.5 text-[10px]">{label[item.status]}</Badge>
            <span className="flex flex-wrap items-center justify-end gap-1">
              {telefonoDelCaso(item) && <WhatsAppMenu telefono={telefonoDelCaso(item)} countryCode={item.customerCountryCode || item.customer?.countryCode || '+595'} category="SERVICE" title={item.customerName} contexto={{ cliente: item.customerName || '', nombre: item.customerName || '', equipo: item.serial || '', servicio: item.description || '', estado: label[item.status] || '', fecha: item.createdAt ? new Date(item.createdAt).toLocaleDateString('es-PY') : '' }} />}
              {item.publicToken && <IconAction icon="external" tone="mute" label="Enlace del caso" onClick={() => { navigator.clipboard?.writeText(qrGarantia(item.publicToken)).catch(() => {}); toast.success('Enlace de garantía del cliente copiado.') }} />}
              {!esDemo && <IconAction icon="image" tone="fono" label="Fotos" onClick={() => abrirFotos(item)} />}
              {item.status !== 'DELIVERED' && <IconAction icon="check" tone="ok" label={advancingId === item.id ? 'Actualizando…' : 'Avanzar'} disabled={advancingId !== null} onClick={() => advance(item)} />}
            </span>
          </div>
        })}
      </div>
    </div>}
    {!visible.length && <Card><EmptyState compact icon="search" title="No hay casos que coincidan con la búsqueda." /></Card>}
    <Modal open={fotosDe !== null} onClose={() => setFotosDe(null)} title={`Fotos · ${fotosDe?.serial || ''}`} className="max-w-xl">
      <div className="space-y-4">
        <div>
          <Label htmlFor="foto-caso">Agregar foto (JPG/PNG, hasta 5 MiB)</Label>
          <AttachmentInput id="foto-caso" onSelect={subirFoto} onError={setFotosError} disabled={subiendo} className="block w-full text-sm text-mute file:mr-3 file:rounded-lg file:border file:border-ink-500 file:bg-ink-700 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-fore hover:file:bg-ink-600 disabled:opacity-40" />
        </div>
        {subiendo && <Skeleton className="h-10 w-full" />}
        {fotosError && <p role="alert" className="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-xs text-bad">{fotosError}</p>}
        {fotosCargando && <div className="space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>}
        {!fotosCargando && !fotos.length && <EmptyState compact icon="image" title="Sin fotos para este caso." description="Subí la primera foto para dejar evidencia del estado del equipo." />}
        {fotos.length > 0 && (
          <div className="grid gap-2 sm:grid-cols-2">
            {fotos.map(foto => (
              <a key={foto.id} href={`${API_URL}/api/warranties/${fotosDe.id}/photos/${foto.id}`} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-2 rounded-lg border border-ink-600 px-3 py-2 text-sm text-fore transition hover:border-fono hover:bg-fono/5">
                <span className="min-w-0 truncate">{foto.label || foto.fileName}</span>
                <span className="shrink-0 text-xs text-mute">{new Date(foto.createdAt).toLocaleDateString('es-PY')} · {Math.max(1, Math.round((foto.sizeBytes || 0) / 1024))} KB</span>
              </a>
            ))}
          </div>
        )}
      </div>
    </Modal>
  </div>
}
