import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api/client'
import { isDemoRuntime } from '@/lib/demoMode'
import { Aviso, Badge, Button, Card, ConfirmDialog, FormField, Input, Modal, Select, Textarea, useToast } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import { CATEGORIAS_PLANTILLA, VARIABLES_POR_CONTEXTO, VALORES_EJEMPLO, renderPlantilla } from '@/lib/whatsappPlantillas'
import { cn } from '@/lib/utils'
import { CELDA_DATO, CELDA_ENCABEZADO, CELDA_IDENTIDAD, ROTULO_DATO } from '@/components/shared/tabla'
import { GRILLA_DOS_COLUMNAS, PIE_ACCIONES } from '@/components/shared/formulario'
// Tabla compacta: una fila por plantilla, con el mensaje recortado a una línea.
const GRID_PLANTILLAS = 'grid min-w-[52rem] grid-cols-[minmax(10rem,1.1fr)_minmax(12rem,2fr)_6.5rem_9rem] items-center gap-x-2'

const NOMBRE_CATEGORIA = Object.fromEntries(CATEGORIAS_PLANTILLA.map((item) => [item.clave, item.nombre]))
const MAX_CUERPO = 1200

// Plantillas demo (#201): viven en memoria del módulo —nunca en la base ni en
// localStorage— y se reinician al recargar. Los guardados no salen al API.
let plantillasDemo = null
const plantillasDemoIniciales = () => [
  { id: 'demo-tpl-pedido-listo', name: 'Pedido listo para retirar', body: 'Hola {{cliente}}, tu pedido {{pedido}} está listo para retirar. Total {{total}}. ¡Te esperamos!', category: 'ORDERS', isActive: true, isDefault: true },
  { id: 'demo-tpl-pedido-seguimiento', name: 'Seguimiento del pedido', body: 'Hola {{cliente}}, podés seguir tu pedido {{pedido}} acá: {{seguimiento}}.', category: 'ORDERS', isActive: true, isDefault: false },
  { id: 'demo-tpl-cliente-saldo', name: 'Saldo pendiente', body: 'Hola {{cliente}}, te recordamos que tenés un saldo pendiente de {{saldo_pendiente}}.', category: 'CUSTOMERS', isActive: true, isDefault: true },
  { id: 'demo-tpl-servicio-estado', name: 'Equipo en taller', body: 'Hola {{cliente}}, tu equipo {{equipo}} está en {{estado}}. Te avisamos cuando esté listo.', category: 'SERVICE', isActive: true, isDefault: true },
  { id: 'demo-tpl-cobranza-cuota', name: 'Cuota próxima', body: 'Hola {{cliente}}, tu cuota de {{pedido}} vence el {{fecha}}. Cualquier duda, escribinos.', category: 'COLLECTIONS', isActive: true, isDefault: true },
]
const avisarGuardadoDemo = () => { try { window.dispatchEvent(new CustomEvent('mobos:demo-guardado')) } catch { /* sin window */ } }

const editorVacio = (category) => ({ id: null, name: '', body: '', category, isActive: true, isDefault: false })
const editorDe = (plantilla) => ({ id: plantilla.id, name: plantilla.name || '', body: plantilla.body || '', category: plantilla.category || 'ORDERS', isActive: plantilla.isActive !== false, isDefault: plantilla.isDefault === true })

// Sección de Configuración: plantillas de WhatsApp centralizadas por contexto.
// Los borradores se pierden al cerrar el editor, nunca se envían solos.
export default function WhatsAppTemplates() {
  const toast = useToast()
  const [categoria, setCategoria] = useState('ORDERS')
  const [items, setItems] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [editor, setEditor] = useState(null)
  const [editorError, setEditorError] = useState('')
  const [eliminar, setEliminar] = useState(null)
  const cuerpoRef = useRef(null)

  const cargar = useCallback(async () => {
    setError('')
    if (isDemoRuntime) {
      if (!plantillasDemo) plantillasDemo = plantillasDemoIniciales()
      setItems(plantillasDemo)
      return
    }
    try { const rows = await api.get('/api/message-templates'); setItems(Array.isArray(rows) ? rows : []) } catch (cause) { setError(cause?.message || 'No se pudieron cargar las plantillas.'); setItems([]) }
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const deCategoria = (items || []).filter((item) => item.category === categoria)
  const variables = VARIABLES_POR_CONTEXTO[editor?.category] || VARIABLES_POR_CONTEXTO[categoria] || []

  function abrirEditor(plantilla) {
    setEditorError('')
    setEditor(plantilla)
  }

  function insertarVariable(clave) {
    const campo = cuerpoRef.current
    const token = `{{${clave}}}`
    if (!campo) {
      setEditor((current) => (current ? { ...current, body: `${current.body}${token}` } : current))
      return
    }
    const inicio = campo.selectionStart ?? campo.value.length
    const fin = campo.selectionEnd ?? inicio
    const siguiente = `${campo.value.slice(0, inicio)}${token}${campo.value.slice(fin)}`
    setEditor((current) => (current ? { ...current, body: siguiente } : current))
    requestAnimationFrame(() => {
      campo.focus()
      const posicion = inicio + token.length
      campo.setSelectionRange(posicion, posicion)
    })
  }

  async function guardar(event) {
    event.preventDefault()
    if (busy || !editor) return
    const nombre = editor.name.trim()
    const cuerpo = editor.body.trim()
    if (!nombre || nombre.length > 120) { setEditorError('El nombre es obligatorio (hasta 120 caracteres).'); return }
    if (!cuerpo || cuerpo.length > MAX_CUERPO) { setEditorError(`El mensaje es obligatorio (hasta ${MAX_CUERPO} caracteres).`); return }
    setBusy(true); setEditorError('')
    if (isDemoRuntime) {
      const actual = plantillasDemo || (plantillasDemo = plantillasDemoIniciales())
      plantillasDemo = editor.id
        ? actual.map((item) => (item.id === editor.id ? { ...item, name: nombre, body: cuerpo, category: editor.category, isActive: editor.isActive, isDefault: editor.isDefault } : item))
        : [...actual, { id: `demo-tpl-${Date.now().toString(36)}`, name: nombre, body: cuerpo, category: editor.category, isActive: editor.isActive, isDefault: editor.isDefault }]
      setItems(plantillasDemo)
      toast.success(editor.id ? 'Plantilla actualizada.' : 'Plantilla creada.')
      setCategoria(editor.category)
      setEditor(null)
      avisarGuardadoDemo()
      setBusy(false)
      return
    }
    try {
      if (editor.id) await api.patch('/api/message-templates', { id: editor.id, name: nombre, body: cuerpo, category: editor.category, isActive: editor.isActive, isDefault: editor.isDefault })
      else await api.post('/api/message-templates', { name: nombre, body: cuerpo, category: editor.category, isActive: editor.isActive, isDefault: editor.isDefault })
      toast.success(editor.id ? 'Plantilla actualizada.' : 'Plantilla creada.')
      setCategoria(editor.category)
      setEditor(null)
      await cargar()
    } catch (cause) { setEditorError(cause?.message || 'No se pudo guardar la plantilla.') } finally { setBusy(false) }
  }

  async function duplicar(plantilla) {
    if (busy) return
    setBusy(true); setError('')
    if (isDemoRuntime) {
      const actual = plantillasDemo || (plantillasDemo = plantillasDemoIniciales())
      const original = actual.find((item) => item.id === plantilla.id)
      if (original) {
        plantillasDemo = [...actual, { ...original, id: `demo-tpl-${Date.now().toString(36)}`, name: `${original.name} (copia)`, isDefault: false }]
        setItems(plantillasDemo)
        toast.success('Plantilla duplicada.')
        avisarGuardadoDemo()
      }
      setBusy(false)
      return
    }
    try { await api.post('/api/message-templates', { duplicateOf: plantilla.id }); toast.success('Plantilla duplicada.'); await cargar() } catch (cause) { setError(cause?.message || 'No se pudo duplicar la plantilla.') } finally { setBusy(false) }
  }

  async function eliminarPlantilla() {
    if (busy || !eliminar) return
    setBusy(true); setError('')
    if (isDemoRuntime) {
      plantillasDemo = (plantillasDemo || []).filter((item) => item.id !== eliminar.id)
      setItems(plantillasDemo)
      toast.success('Plantilla eliminada.')
      avisarGuardadoDemo()
      setBusy(false)
      setEliminar(null)
      return
    }
    try {
      await api.delete(`/api/message-templates?id=${encodeURIComponent(eliminar.id)}`)
      toast.success('Plantilla eliminada.')
      await cargar()
    } catch (cause) { setError(cause?.message || 'No se pudo eliminar la plantilla.') } finally { setBusy(false); setEliminar(null) }
  }

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm text-mute">Mensajes reutilizables por contexto para clientes, pedidos y servicio. Las variables se completan al enviar.</p>
        </div>
        <Button type="button" onClick={() => abrirEditor(editorVacio(categoria))}><Icon name="plus" className="h-3.5 w-3.5" />Nueva plantilla</Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {CATEGORIAS_PLANTILLA.map((item) => {
          const total = (items || []).filter((plantilla) => plantilla.category === item.clave).length
          return (
            <button key={item.clave} type="button" onClick={() => setCategoria(item.clave)} className={cn('rounded-lg border px-3 py-1.5 text-xs font-semibold transition', categoria === item.clave ? 'border-fono/40 bg-fono/10 text-fono-light' : 'border-ink-500 text-mute hover:text-fore')}>
              {item.nombre}{items ? ` (${total})` : ''}
            </button>
          )
        })}
      </div>
      {error && <Aviso tono="error">{error}</Aviso>}
      {items === null ? <p className="text-sm text-mute">Cargando plantillas…</p> : deCategoria.length === 0 ? <p className="text-sm text-mute">Todavía no hay plantillas en esta categoría.</p> : (
        <div className="overflow-x-auto" data-testid="plantillas-tabla">
          <div className={cn(GRID_PLANTILLAS, 'px-3.5 pb-2 pt-1')}>
            <span className={CELDA_ENCABEZADO}>Plantilla</span>
            <span className={CELDA_ENCABEZADO}>Mensaje</span>
            <span className={CELDA_ENCABEZADO}>Estado</span>
            <span className={cn(CELDA_ENCABEZADO, 'text-right')}>Acciones</span>
          </div>
          <div className="space-y-1">
          {deCategoria.map((item) => (
            <div key={item.id} data-testid="plantilla-fila" className={cn(GRID_PLANTILLAS, 'rounded-xl border border-ink-600 bg-ink-800/40 px-3.5 py-2 transition hover:border-fono/40')}>
              <span className="flex min-w-0 items-center gap-2">
                <b className={cn('min-w-0', CELDA_IDENTIDAD)} title={item.name}>{item.name}</b>
                {item.isDefault && <Badge color="blue" className="shrink-0 whitespace-nowrap px-1.5 py-0 text-[10px]"><Icon name="check" className="h-3 w-3" />Predeterminada</Badge>}
              </span>
              <span className={CELDA_DATO} title={item.body}>{item.body}</span>
              <span className={cn('inline-flex items-center gap-1 text-xs font-semibold', item.isActive !== false ? 'text-ok' : 'text-mute')}>
                <Icon name={item.isActive !== false ? 'check' : 'close'} className="h-3.5 w-3.5" />{item.isActive !== false ? 'Activa' : 'Inactiva'}
              </span>
              <span className="flex items-center justify-end gap-1">
                  <button type="button" aria-label={`Editar ${item.name}`} title="Editar" disabled={busy} onClick={() => abrirEditor(editorDe(item))} className="grid h-8 w-8 place-items-center rounded-lg text-mute transition hover:bg-fono/10 hover:text-fono-light"><Icon name="edit" className="h-3.5 w-3.5" /></button>
                  <button type="button" aria-label={`Duplicar ${item.name}`} title="Duplicar" disabled={busy} onClick={() => duplicar(item)} className="grid h-8 w-8 place-items-center rounded-lg text-mute transition hover:bg-fono/10 hover:text-fono-light"><Icon name="copy" className="h-3.5 w-3.5" /></button>
                  <button type="button" aria-label={`Eliminar ${item.name}`} title="Eliminar" disabled={busy} onClick={() => setEliminar(item)} className="grid h-8 w-8 place-items-center rounded-lg text-mute transition hover:bg-bad/10 hover:text-bad"><Icon name="trash" className="h-3.5 w-3.5" /></button>
              </span>
            </div>
          ))}
          </div>
        </div>
      )}
      <Modal open={editor !== null} onClose={() => !busy && setEditor(null)} title={editor?.id ? 'Editar plantilla' : 'Nueva plantilla'} size="amplio">
        <form onSubmit={guardar} className="space-y-3">
          <div className={GRILLA_DOS_COLUMNAS}>
            <FormField label="Nombre" htmlFor="plantilla-nombre">
              <Input id="plantilla-nombre" autoFocus maxLength={120} disabled={busy} value={editor?.name || ''} onChange={(event) => setEditor((current) => ({ ...current, name: event.target.value }))} placeholder="Ej. Pedido listo para retirar" />
            </FormField>
            <FormField label="Categoría" htmlFor="plantilla-categoria">
              <Select id="plantilla-categoria" disabled={busy} value={editor?.category || 'ORDERS'} onChange={(event) => setEditor((current) => ({ ...current, category: event.target.value }))}>
                {CATEGORIAS_PLANTILLA.map((item) => <option key={item.clave} value={item.clave}>{item.nombre}</option>)}
              </Select>
            </FormField>
          </div>
          <div>
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
              <span className="block text-[11px] font-medium uppercase tracking-wider text-mute">Mensaje</span>
              <span className={cn('text-[11px] tabular-nums', (editor?.body?.length || 0) > MAX_CUERPO ? 'text-bad' : 'text-mute')}>{(editor?.body?.length || 0)}/{MAX_CUERPO}</span>
            </div>
            <Textarea
              ref={cuerpoRef}
              aria-label="Mensaje de la plantilla"
              rows={4}
              maxLength={MAX_CUERPO}
              disabled={busy}
              value={editor?.body || ''}
              onChange={(event) => setEditor((current) => ({ ...current, body: event.target.value }))}
              placeholder="Hola {{cliente}}, tu pedido {{pedido}} está listo."
              className="w-full resize-none rounded-lg border border-ink-500 bg-ink-800 px-3.5 py-2.5 text-base text-fore outline-none transition placeholder:text-mute/60 focus:border-fono focus:ring-1 focus:ring-fono/40 md:text-sm"
            />
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className={ROTULO_DATO}>Variables</span>
              {variables.map((variable) => (
                <button key={variable.clave} type="button" title={variable.descripcion} disabled={busy} onClick={() => insertarVariable(variable.clave)} className="rounded-full border border-fono/25 bg-fono/10 px-2 py-0.5 font-mono text-[11px] text-fono-light transition hover:bg-fono/20">{`{{${variable.clave}}}`}</button>
              ))}
            </div>
            <div className="mt-3">
              <p className={ROTULO_DATO}>Vista previa (datos de ejemplo)</p>
              <p className="mt-1.5 w-fit max-w-full whitespace-pre-wrap break-words rounded-2xl rounded-tl-sm border border-ok/25 bg-ok/10 px-3 py-2 text-xs leading-5 text-fore">
                {renderPlantilla(editor?.body, VALORES_EJEMPLO) || 'Escribí el mensaje para verlo con datos de ejemplo.'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={busy} checked={editor?.isActive !== false} onChange={(event) => setEditor((current) => ({ ...current, isActive: event.target.checked }))} />Activa</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={busy} checked={editor?.isDefault === true} onChange={(event) => setEditor((current) => ({ ...current, isDefault: event.target.checked }))} />Predeterminada de {NOMBRE_CATEGORIA[editor?.category] || 'la categoría'}</label>
          </div>
          {editorError && <Aviso tono="error">{editorError}</Aviso>}
          <div className={PIE_ACCIONES}><Button type="button" variant="ghost" disabled={busy} onClick={() => setEditor(null)}>Cancelar</Button><Button type="submit" disabled={busy || !editor?.name?.trim() || !editor?.body?.trim()}>{busy ? 'Guardando…' : editor?.id ? 'Guardar cambios' : 'Crear plantilla'}</Button></div>
        </form>
      </Modal>
      <ConfirmDialog
        open={Boolean(eliminar)}
        onCancel={() => !busy && setEliminar(null)}
        onConfirm={eliminarPlantilla}
        title="¿Eliminar esta plantilla?"
        description={`Se borra "${eliminar?.name || ''}" de ${NOMBRE_CATEGORIA[eliminar?.category] || 'la categoría'}. Si la categoría queda vacía, la próxima visita vuelve a sembrar las plantillas base.`}
        confirmLabel="Eliminar plantilla"
        variant="danger"
        busy={busy}
      />
    </Card>
  )
}
