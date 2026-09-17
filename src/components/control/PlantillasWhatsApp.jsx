import { useCallback, useEffect, useState } from 'react'
import { Badge, Button, Card, Input, Label, Modal, Select, Skeleton, Textarea, useToast } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import { api } from '@/lib/api/client'
import { renderMessage } from '@/components/customers/customerMessaging'

const CONTEXTOS = [['clientes', 'Clientes'], ['pedidos', 'Pedidos'], ['servicio', 'Servicio Técnico']]
const VARIABLES = ['{cliente}', '{nombre}', '{empresa}', '{sucursal}', '{usuario}', '{pedido}', '{total}', '{saldo_pendiente}', '{producto}', '{fecha}', '{seguimiento}']
const VACIA = { name: '', body: '', context: 'clientes', isActive: true, isDefault: false }
const MUESTRA = { name: 'Juan Pérez', empresa: 'iPhone Store', sucursal: 'Asunción' }

export default function PlantillasWhatsApp() {
  const toast = useToast()
  const [plantillas, setPlantillas] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const data = await api.get('/api/message-templates')
      setPlantillas(Array.isArray(data) ? data : [])
    } catch (cause) { setError(cause?.message || 'No se pudieron cargar las plantillas.') } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  async function guardar(event) {
    event.preventDefault()
    if (busy || !form.name.trim() || !form.body.trim()) return
    setBusy(true)
    try {
      if (form.id) await api.patch('/api/message-templates', { id: form.id, name: form.name.trim(), body: form.body.trim(), context: form.context, isActive: form.isActive, ...(form.isDefault ? { isDefault: true } : {}) })
      else await api.post('/api/message-templates', { name: form.name.trim(), body: form.body.trim(), context: form.context, isDefault: form.isDefault })
      toast.success(form.id ? 'Plantilla actualizada.' : 'Plantilla creada.')
      setForm(null)
      await load()
    } catch (cause) { toast.error(cause?.message || 'No se pudo guardar la plantilla.') } finally { setBusy(false) }
  }

  async function accion(operacion, mensaje) {
    try { await operacion(); toast.success(mensaje); await load() } catch (cause) { toast.error(cause?.message || 'No se pudo completar la acción.') }
  }

  const porContexto = CONTEXTOS.map(([key, label]) => ({ key, label, items: plantillas.filter(plantilla => plantilla.context === key) }))

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Configuración</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight">Plantillas de WhatsApp</h2>
          <p className="mt-1 text-sm text-mute">Un solo sistema para Clientes, Pedidos y Servicio Técnico. La predeterminada es la que abre el icono de WhatsApp.</p>
        </div>
        <Button onClick={() => setForm({ ...VACIA })}>+ Nueva plantilla</Button>
      </div>

      {error && <p role="alert" className="rounded-lg border border-bad/30 bg-bad/10 p-3 text-sm text-bad">{error}</p>}
      {loading && <div className="space-y-2"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>}

      {!loading && porContexto.map(grupo => (
        <section key={grupo.key} className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-mute">{grupo.label}</h3>
          {!grupo.items.length && <p className="text-sm text-mute">Sin plantillas en este contexto.</p>}
          {grupo.items.map(plantilla => (
            <article key={plantilla.id} className="rounded-xl border border-ink-600 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  <b className="truncate text-sm">{plantilla.name}</b>
                  {plantilla.isDefault && <Badge color="blue">Predeterminada</Badge>}
                  {!plantilla.isActive && <Badge color="slate">Inactiva</Badge>}
                </span>
                <span className="flex flex-wrap items-center gap-3 text-xs">
                  <button type="button" className="font-semibold text-fono-light hover:underline" onClick={() => setForm({ ...plantilla })}>Editar</button>
                  <button type="button" className="text-mute hover:text-fore" onClick={() => accion(() => api.post('/api/message-templates', { duplicate: plantilla.id }), 'Plantilla duplicada.')}>Duplicar</button>
                  {!plantilla.isDefault && <button type="button" className="text-mute hover:text-fore" onClick={() => accion(() => api.patch('/api/message-templates', { id: plantilla.id, isDefault: true }), 'Predeterminada actualizada.')}>Predeterminada</button>}
                  <button type="button" className="text-mute hover:text-fore" onClick={() => accion(() => api.patch('/api/message-templates', { id: plantilla.id, isActive: !plantilla.isActive }), plantilla.isActive ? 'Plantilla desactivada.' : 'Plantilla activada.')}>{plantilla.isActive ? 'Desactivar' : 'Activar'}</button>
                  <button type="button" className="text-mute hover:text-bad" aria-label={`Eliminar ${plantilla.name}`} onClick={() => accion(() => api.delete(`/api/message-templates?id=${encodeURIComponent(plantilla.id)}`), 'Plantilla eliminada.')}><Icon name="trash" className="h-3.5 w-3.5" /></button>
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-mute">{plantilla.body}</p>
            </article>
          ))}
        </section>
      ))}

      <Modal open={Boolean(form)} onClose={() => !busy && setForm(null)} title={form?.id ? 'Editar plantilla' : 'Nueva plantilla'} className="max-w-2xl">
        {form && (
          <form onSubmit={guardar} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label>Nombre</Label><Input aria-label="Nombre de la plantilla" autoFocus value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} placeholder="Seguimiento de cliente" /></div>
              <div><Label>Contexto</Label><Select aria-label="Contexto de la plantilla" value={form.context} onChange={event => setForm(current => ({ ...current, context: event.target.value }))}>{CONTEXTOS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select></div>
            </div>
            <div>
              <Label>Mensaje</Label>
              <Textarea rows={4} value={form.body} onChange={event => setForm(current => ({ ...current, body: event.target.value }))} placeholder="Hola {nombre}, te escribo de {empresa}…" autoCapitalize="sentences" />
              <p className="mt-1 flex flex-wrap gap-1.5 text-[11px] text-mute">
                Variables:
                {VARIABLES.map(variable => <button key={variable} type="button" className="rounded border border-ink-500 px-1.5 py-0.5 hover:text-fore" onClick={() => setForm(current => ({ ...current, body: `${current.body}${variable}` }))}>{variable}</button>)}
              </p>
            </div>
            <div className="rounded-xl border border-ink-600 bg-ink-800/50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-mute">Vista previa</p>
              <p className="mt-1 text-sm text-fore">{renderMessage({ body: form.body }, MUESTRA) || '—'}</p>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-fono" checked={form.isActive} onChange={event => setForm(current => ({ ...current, isActive: event.target.checked }))} />Activa</label>
              <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-fono" checked={form.isDefault} onChange={event => setForm(current => ({ ...current, isDefault: event.target.checked }))} />Predeterminada del contexto</label>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" disabled={busy} onClick={() => setForm(null)}>Cancelar</Button>
              <Button type="submit" disabled={busy || !form.name.trim() || !form.body.trim()}>{busy ? 'Guardando…' : form.id ? 'Guardar cambios' : 'Crear plantilla'}</Button>
            </div>
          </form>
        )}
      </Modal>
    </Card>
  )
}
