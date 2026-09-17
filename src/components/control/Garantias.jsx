import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, Button, Input, Label, Textarea, Badge, EmptyState, Eyebrow, Modal, Skeleton, useToast } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import WhatsAppMenu from '@/components/shared/WhatsAppMenu'
import SerialField from '@/components/shared/SerialField'
import AttachmentInput from '@/components/shared/AttachmentInput'
import { api, API_URL } from '@/lib/api/client'
import { useSesion } from '@/lib/sesion'
import { getDemoWarranties, saveDemoWarranties } from '@/lib/demoWarranties'

const STATES = [['RECEIVED', 'Recibido'], ['DIAGNOSIS', 'En diagnóstico'], ['READY', 'Listo'], ['DELIVERED', 'Entregado']]
const label = Object.fromEntries(STATES)
const blank = { customerName: '', serial: '', description: '', responsibleName: '', technicianName: '', diagnosis: '', partsText: '', photosText: '', branchId: '', warrantyDays: '', expiresAt: '', coverage: '', exclusions: '' }
// El caso todavía no guarda teléfono propio: se usa el del cliente vinculado si
// el API lo expone; sin teléfono no se muestra el menú de WhatsApp.
const telefonoDelCaso = (item) => item.customerPhone || item.customer?.phone || ''

export default function Garantias() {
  const { esDemo, sucursal } = useSesion()
  const toast = useToast()
  const [items, setItems] = useState([]); const [q, setQ] = useState(''); const [form, setForm] = useState(blank); const [error, setError] = useState(''); const [saving, setSaving] = useState(false); const [advancingId, setAdvancingId] = useState(null)
  const [fotosDe, setFotosDe] = useState(null); const [fotos, setFotos] = useState([]); const [fotosCargando, setFotosCargando] = useState(false); const [fotosError, setFotosError] = useState(''); const [subiendo, setSubiendo] = useState(false)
  const load = useCallback(async (busqueda = '') => { try { setItems(esDemo ? getDemoWarranties() : await api.get(`/api/warranties?q=${encodeURIComponent(busqueda)}`)) } catch (e) { setError(e.message) } }, [esDemo])
  useEffect(() => { load() }, [load])
  const visible = useMemo(() => esDemo ? items.filter((x) => [x.customerName, x.serial, x.description].some((v) => v.toLowerCase().includes(q.toLowerCase()))) : items, [items, q, esDemo])
  const listInput = (value) => value.split('\n').map((item) => item.trim()).filter(Boolean)
  async function create(e) { e.preventDefault(); setSaving(true); setError(''); try { const { partsText, photosText, warrantyDays, ...base } = form; const data = { ...base, parts: listInput(partsText), photos: listInput(photosText), branchId: form.branchId || sucursal?.id, ...(String(warrantyDays).trim() ? { warrantyDays: Number(warrantyDays) } : {}) }; if (esDemo) setItems(saveDemoWarranties([{ ...data, id: `demo-${Date.now()}`, status: 'RECEIVED', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, ...items])); else { const saved = await api.post('/api/warranties', data); setItems([saved, ...items]); if (saved?.publicToken) { const url = `${window.location.origin}/garantia/${saved.publicToken}`; navigator.clipboard?.writeText(url).catch(() => {}); toast.success('Garantía creada. El enlace público quedó copiado.') } } setForm(blank) } catch (e) { setError(e.message) } finally { setSaving(false) } }
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
  return <div className="space-y-5"><div className="flex flex-wrap items-end justify-between gap-3"><div><Eyebrow>Servicio y seguimiento</Eyebrow><h2 className="mt-1 text-2xl font-bold tracking-tight">Garantías</h2><p className="mt-1 text-sm text-mute">Seguimiento por caso, sin inventar cobertura automática.</p></div><div className="relative w-full max-w-sm"><Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mute" /><Input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load(q)} placeholder="Buscar cliente, serial o detalle…" className="pl-9" aria-label="Buscar garantías" /></div></div>
    <Card><form onSubmit={create} className="grid gap-3 md:grid-cols-2"><div><Label>Cliente</Label><Input required value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} placeholder="Nombre del cliente" /></div><div><Label>Serial / IMEI</Label><SerialField required value={form.serial} onChange={(value) => setForm({ ...form, serial: value })} placeholder="Serial o IMEI" /></div><div className="md:col-span-2"><Label>Descripción del caso</Label><Textarea required rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Falla reportada, revisión solicitada…" /></div><div><Label>Responsable</Label><Input value={form.responsibleName} onChange={(e) => setForm({ ...form, responsibleName: e.target.value })} placeholder="Persona responsable" /></div><div><Label>Técnico asignado</Label><Input value={form.technicianName} onChange={(e) => setForm({ ...form, technicianName: e.target.value })} placeholder="Técnico responsable" /></div><div className="md:col-span-2"><Label>Diagnóstico inicial</Label><Textarea rows={2} value={form.diagnosis} onChange={(e) => setForm({ ...form, diagnosis: e.target.value })} placeholder="Pruebas, causa probable y condición de recepción…" /></div><div><Label>Repuestos (uno por línea)</Label><Textarea rows={2} value={form.partsText} onChange={(e) => setForm({ ...form, partsText: e.target.value })} placeholder="Pantalla OLED\nBatería" /></div><div><Label>Fotos / enlaces (uno por línea)</Label><Textarea rows={2} value={form.photosText} onChange={(e) => setForm({ ...form, photosText: e.target.value })} placeholder="https://…" /></div><div><Label>Días de garantía</Label><Input inputMode="numeric" value={form.warrantyDays} onChange={(e) => setForm({ ...form, warrantyDays: e.target.value.replace(/\D/g, '') })} placeholder="Ej. 90" /></div><div><Label>Vencimiento</Label><Input type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} /></div><div className="md:col-span-2"><Label>Qué cubre (una por línea)</Label><Textarea rows={2} value={form.coverage} onChange={(e) => setForm({ ...form, coverage: e.target.value })} placeholder={'Defectos de fábrica\nPantalla y batería'} /></div><div className="md:col-span-2"><Label>Qué no cubre (una por línea)</Label><Textarea rows={2} value={form.exclusions} onChange={(e) => setForm({ ...form, exclusions: e.target.value })} placeholder={'Daños por agua\nReparaciones de terceros'} /></div><Button type="submit" disabled={saving} className="md:col-span-2 min-h-11">{saving ? 'Guardando…' : 'Registrar caso'}</Button></form></Card>
    {error && <p role="alert" className="rounded-xl border border-bad/30 bg-bad/10 px-4 py-3 text-sm text-bad">{error}</p>}
    <div className="space-y-2">{visible.map((item) => <article key={item.id} className="rounded-xl border border-ink-600 px-3 py-2.5 transition hover:border-fono/40">
      <div className="flex flex-wrap items-center gap-2">
        <b className="min-w-0 truncate text-sm">{item.customerName}</b>
        <span className="shrink-0 font-mono text-[11px] text-fono-light">{item.serial}</span>
        <Badge color={item.status === 'DELIVERED' ? 'green' : item.status === 'READY' ? 'orange' : 'slate'}>{label[item.status]}</Badge>
        <span className="ml-auto flex shrink-0 flex-wrap items-center gap-1.5">{telefonoDelCaso(item) && <WhatsAppMenu telefono={telefonoDelCaso(item)} countryCode={item.customer?.countryCode} category="SERVICE" title={item.customerName} contexto={{ cliente: item.customerName || '', nombre: item.customerName || '', equipo: item.serial || '', servicio: item.description || '', estado: label[item.status] || '', fecha: item.createdAt ? new Date(item.createdAt).toLocaleDateString('es-PY') : '' }} />}{item.publicToken && <Button type="button" variant="outline" className="h-8 px-2 text-xs" onClick={() => { navigator.clipboard?.writeText(`${window.location.origin}/garantia/${item.publicToken}`).catch(() => {}); toast.success('Enlace de garantía del cliente copiado.') }}>Página cliente</Button>}{!esDemo && <Button type="button" variant="outline" className="h-8 px-2 text-xs" onClick={() => abrirFotos(item)}>Fotos</Button>}{item.status !== 'DELIVERED' && <Button type="button" variant="outline" className="h-8 px-2 text-xs" disabled={advancingId !== null} onClick={() => advance(item)}>{advancingId === item.id ? 'Actualizando…' : 'Avanzar'}</Button>}</span>
      </div>
      <p className="mt-1 truncate text-xs text-mute">{item.description}{item.diagnosis ? ` · Diagnóstico: ${item.diagnosis}` : ''}{item.technicianName ? ` · Técnico: ${item.technicianName}` : ''}{item.responsibleName ? ` · Resp: ${item.responsibleName}` : ''}{item.parts?.length > 0 ? ` · Repuestos: ${item.parts.join(', ')}` : ''}{item.photos?.length > 0 ? ` · ${item.photos.length} foto(s)` : ''}</p>
    </article>)}</div>{!visible.length && <Card><EmptyState compact icon="search" title="No hay casos que coincidan con la búsqueda." /></Card>}
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
