import { useEffect, useMemo, useState } from 'react'
import { Card, Button, Input, Label, Textarea, Badge, EmptyState, Eyebrow, Modal, Skeleton, useToast } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import { api, API_URL } from '@/lib/api/client'
import { useSesion } from '@/lib/sesion'
import { getDemoWarranties, saveDemoWarranties } from '@/lib/demoWarranties'

const STATES = [['RECEIVED', 'Recibido'], ['DIAGNOSIS', 'En diagnóstico'], ['READY', 'Listo'], ['DELIVERED', 'Entregado']]
const label = Object.fromEntries(STATES)
const blank = { customerName: '', serial: '', description: '', responsibleName: '', technicianName: '', diagnosis: '', partsText: '', photosText: '', branchId: '' }

export default function Garantias() {
  const { esDemo, sucursal } = useSesion()
  const toast = useToast()
  const [items, setItems] = useState([]); const [q, setQ] = useState(''); const [form, setForm] = useState(blank); const [error, setError] = useState(''); const [saving, setSaving] = useState(false); const [advancingId, setAdvancingId] = useState(null)
  const [fotosDe, setFotosDe] = useState(null); const [fotos, setFotos] = useState([]); const [fotosCargando, setFotosCargando] = useState(false); const [fotosError, setFotosError] = useState(''); const [subiendo, setSubiendo] = useState(false)
  async function load() { try { setItems(esDemo ? getDemoWarranties() : await api.get(`/api/warranties?q=${encodeURIComponent(q)}`)) } catch (e) { setError(e.message) } }
  useEffect(() => { load() }, [esDemo])
  const visible = useMemo(() => esDemo ? items.filter((x) => [x.customerName, x.serial, x.description].some((v) => v.toLowerCase().includes(q.toLowerCase()))) : items, [items, q, esDemo])
  const listInput = (value) => value.split('\n').map((item) => item.trim()).filter(Boolean)
  async function create(e) { e.preventDefault(); setSaving(true); setError(''); try { const { partsText, photosText, ...base } = form; const data = { ...base, parts: listInput(partsText), photos: listInput(photosText), branchId: form.branchId || sucursal?.id }; if (esDemo) setItems(saveDemoWarranties([{ ...data, id: `demo-${Date.now()}`, status: 'RECEIVED', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, ...items])); else setItems([await api.post('/api/warranties', data), ...items]); setForm(blank) } catch (e) { setError(e.message) } finally { setSaving(false) } }
  async function advance(item) { const next = STATES[STATES.findIndex(([s]) => s === item.status) + 1]?.[0]; if (!next || advancingId) return; setAdvancingId(item.id); setError(''); try { if (esDemo) { const nextItems = items.map((x) => x.id === item.id ? { ...x, status: next, updatedAt: new Date().toISOString() } : x); setItems(saveDemoWarranties(nextItems)) } else { const updated = await api.patch('/api/warranties', { id: item.id, status: next }); setItems(items.map((x) => x.id === item.id ? updated : x)) } } catch (e) { setError(e.message) } finally { setAdvancingId(null) } }
  async function abrirFotos(item) {
    setFotosDe(item); setFotos([]); setFotosCargando(true); setFotosError('')
    try { setFotos(await api.get(`/api/warranties/${item.id}/photos`)) } catch (cause) { setFotosError(cause?.message || 'No se pudieron cargar las fotos.') } finally { setFotosCargando(false) }
  }
  async function subirFoto(event) {
    const file = event.target.files?.[0]
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
    } finally { setSubiendo(false); event.target.value = '' }
  }
  return <div className="space-y-5"><div className="flex flex-wrap items-end justify-between gap-3"><div><Eyebrow>Servicio y seguimiento</Eyebrow><h2 className="mt-1 text-2xl font-bold tracking-tight">Garantías</h2><p className="mt-1 text-sm text-mute">Seguimiento por caso, sin inventar cobertura automática.</p></div><div className="relative w-full max-w-sm"><Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mute" /><Input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} placeholder="Buscar cliente, serial o detalle…" className="pl-9" aria-label="Buscar garantías" /></div></div>
    <Card><form onSubmit={create} className="grid gap-3 md:grid-cols-2"><div><Label>Cliente</Label><Input required value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} placeholder="Nombre del cliente" /></div><div><Label>Serial / IMEI</Label><Input required value={form.serial} onChange={(e) => setForm({ ...form, serial: e.target.value })} placeholder="Serial o IMEI" /></div><div className="md:col-span-2"><Label>Descripción del caso</Label><Textarea required rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Falla reportada, revisión solicitada…" /></div><div><Label>Responsable</Label><Input value={form.responsibleName} onChange={(e) => setForm({ ...form, responsibleName: e.target.value })} placeholder="Persona responsable" /></div><div><Label>Técnico asignado</Label><Input value={form.technicianName} onChange={(e) => setForm({ ...form, technicianName: e.target.value })} placeholder="Técnico responsable" /></div><div className="md:col-span-2"><Label>Diagnóstico inicial</Label><Textarea rows={2} value={form.diagnosis} onChange={(e) => setForm({ ...form, diagnosis: e.target.value })} placeholder="Pruebas, causa probable y condición de recepción…" /></div><div><Label>Repuestos (uno por línea)</Label><Textarea rows={2} value={form.partsText} onChange={(e) => setForm({ ...form, partsText: e.target.value })} placeholder="Pantalla OLED\nBatería" /></div><div><Label>Fotos / enlaces (uno por línea)</Label><Textarea rows={2} value={form.photosText} onChange={(e) => setForm({ ...form, photosText: e.target.value })} placeholder="https://…" /></div><Button type="submit" disabled={saving} className="md:col-span-2 min-h-11">{saving ? 'Guardando…' : 'Registrar caso'}</Button></form></Card>
    {error && <p role="alert" className="rounded-xl border border-bad/30 bg-bad/10 px-4 py-3 text-sm text-bad">{error}</p>}
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{visible.map((item) => <Card key={item.id} className="border-fono/20"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-semibold">{item.customerName}</p><p className="mt-1 text-xs font-mono text-fono-light">{item.serial}</p></div><Badge color={item.status === 'DELIVERED' ? 'green' : item.status === 'READY' ? 'orange' : 'slate'}>{label[item.status]}</Badge></div><p className="mt-4 min-h-12 text-sm leading-6 text-mute">{item.description}</p>{item.diagnosis && <p className="mt-2 rounded-lg bg-ink-700 p-2 text-xs text-mute">Diagnóstico: {item.diagnosis}</p>}<div className="mt-3 space-y-1 text-xs text-mute"><p>Técnico: {item.technicianName || 'Sin asignar'}</p>{item.parts?.length > 0 && <p>Repuestos: {item.parts.join(', ')}</p>}{item.photos?.length > 0 && <p>{item.photos.length} foto(s) o enlace(s) adjuntos</p>}</div><div className="mt-4 flex items-center justify-between gap-2 border-t border-ink-600 pt-3 text-xs text-mute"><span>{item.responsibleName || 'Sin responsable'}</span><div className="flex items-center gap-2">{!esDemo && <Button type="button" variant="outline" className="h-8 px-2 text-xs" onClick={() => abrirFotos(item)}>Fotos</Button>}{item.status !== 'DELIVERED' && <Button type="button" variant="outline" disabled={advancingId !== null} className="h-8 px-2 text-xs" onClick={() => advance(item)}>{advancingId === item.id ? 'Actualizando…' : 'Avanzar'}</Button>}</div></div></Card>)}</div>{!visible.length && <Card><EmptyState compact icon="search" title="No hay casos que coincidan con la búsqueda." /></Card>}
    <Modal open={fotosDe !== null} onClose={() => setFotosDe(null)} title={`Fotos · ${fotosDe?.serial || ''}`} className="max-w-xl">
      <div className="space-y-4">
        <div>
          <Label htmlFor="foto-caso">Agregar foto (JPG/PNG, hasta 5 MiB)</Label>
          <input id="foto-caso" type="file" accept="image/*" onChange={subirFoto} disabled={subiendo} className="block w-full text-sm text-mute file:mr-3 file:rounded-lg file:border file:border-ink-500 file:bg-ink-700 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-fore hover:file:bg-ink-600 disabled:opacity-40" />
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
