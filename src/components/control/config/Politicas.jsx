import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api/client'
import { useSesion } from '@/lib/sesion'
import { Aviso, Badge, Button, Card, Modal, Textarea, useToast } from '@/components/ui'
import Switch from '@/components/shared/Switch'
import { fechaHora } from '@/utils/fecha'
import { POLITICAS, POLITICA_MAX_CHARS, limpiarTextoPolitica, plantillaPolitica, urlPoliticas } from '@/lib/politicas'
import { olvidarPoliticasImpresion } from '@/lib/politicasEmpresa'
import { publicUrls } from '@/lib/urls'
import { mensajeErrorPoliticas } from '@/lib/politicasUx'

// Configuración › Organización › Políticas (#433), al estilo «Políticas» de
// Shopify: una fila por política con su estado y «›»; cada una se edita en una
// ventana con plantilla inicial, contador y publicar/borrador. Solo el dueño
// llega acá (el servidor lo vuelve a exigir en cada llamada).
// Demo (#192): ninguna llamada sale al API real; las políticas viven solo en este navegador.
let demoPoliticas = null
const politicasDemo = () => {
  if (!demoPoliticas) demoPoliticas = { slug: 'tienda-demo', policies: POLITICAS.map(({ tipo, etiqueta }) => ({ type: tipo, label: etiqueta, content: '', published: false, updatedAt: null })) }
  return demoPoliticas
}

const base = () => String(import.meta.env.VITE_PUBLIC_TRACKING_URL || '').replace(/\/$/, '') || publicUrls.clientPortal

function EditorPolitica({ politica, slug, demo, onClose, onGuardada }) {
  const toast = useToast()
  const meta = POLITICAS.find(item => item.tipo === politica.type)
  const [texto, setTexto] = useState(politica.content || '')
  const [publicada, setPublicada] = useState(Boolean(politica.published))
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [reemplazar, setReemplazar] = useState(false)
  const enlace = demo ? '' : urlPoliticas(base(), slug, politica.type)

  function usarPlantilla() {
    if (texto.trim() && !reemplazar) { setReemplazar(true); return }
    setTexto(plantillaPolitica(politica.type))
    setReemplazar(false)
  }

  async function guardar(event) {
    event.preventDefault()
    setError('')
    if (publicada && !texto.trim()) { setError('Escribí el texto antes de publicar la política.'); return }
    setGuardando(true)
    try {
      const guardada = demo
        ? { content: limpiarTextoPolitica(texto).trim(), published: publicada && Boolean(texto.trim()), updatedAt: new Date().toISOString() }
        : await api.put(`/api/tenant/policies/${politica.type}`, { content: texto, published: publicada })
      olvidarPoliticasImpresion()
      toast.success(publicada ? 'Política publicada' : 'Borrador guardado', meta?.etiqueta)
      onGuardada({ ...politica, content: guardada.content, published: guardada.published, updatedAt: guardada.updatedAt })
    } catch (cause) {
      setError(mensajeErrorPoliticas(cause, 'guardar'))
    } finally { setGuardando(false) }
  }

  return (
    <Modal open onClose={onClose} title={meta?.etiqueta || 'Política'} size="amplio">
      <form onSubmit={guardar} className="space-y-3" data-testid="politica-editor">
        <p className="text-sm text-mute">{meta?.ayuda} Formato simple: <b className="text-fore"># Título</b>, <b className="text-fore">- ítem</b> para listas y <b className="text-fore">**negrita**</b>.</p>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button type="button" variant="outline" className="min-h-11 md:min-h-9" onClick={usarPlantilla} disabled={guardando} data-testid="politica-plantilla">Usar plantilla</Button>
          <span className="text-xs text-mute tabular-nums" data-testid="politica-contador">{texto.length} / {POLITICA_MAX_CHARS}</span>
        </div>
        {reemplazar && (
          <Aviso tono="warn" className="rounded-xl p-3 text-sm">
            <p>Esto reemplaza el texto que escribiste.</p>
            <div className="mt-2 flex gap-2">
              <Button type="button" className="min-h-11 md:min-h-9" onClick={usarPlantilla}>Reemplazar con la plantilla</Button>
              <Button type="button" variant="ghost" className="min-h-11 md:min-h-9" onClick={() => setReemplazar(false)}>Conservar mi texto</Button>
            </div>
          </Aviso>
        )}
        <Textarea
          aria-label={`Texto de ${meta?.etiqueta || 'la política'}`}
          rows={14}
          maxLength={POLITICA_MAX_CHARS}
          value={texto}
          onChange={event => setTexto(limpiarTextoPolitica(event.target.value).slice(0, POLITICA_MAX_CHARS))}
          placeholder="Escribí la política o tocá «Usar plantilla» para partir de un texto sugerido."
          className="font-mono text-sm"
        />
        <label className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-ink-600 px-3">
          <span className="min-w-0">
            <span className="block text-sm font-semibold">{publicada ? 'Publicada' : 'Borrador'}</span>
            <span className="block text-xs text-mute">{publicada ? 'Tus clientes la ven en la página pública de la tienda.' : 'Nadie fuera del equipo la ve todavía.'}</span>
          </span>
          <Switch checked={publicada} onChange={event => setPublicada(event.target.checked)} ariaLabel="Publicar política" />
        </label>
        {publicada && enlace && <p className="break-all text-xs text-mute">Enlace público: <span className="text-fore">{enlace}</span></p>}
        {error && <p role="alert" className="text-sm text-bad">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={guardando} className="min-h-11 md:min-h-9">Cancelar</Button>
          <Button type="submit" disabled={guardando} className="min-h-11 md:min-h-9">{guardando ? 'Guardando…' : 'Guardar'}</Button>
        </div>
      </form>
    </Modal>
  )
}

export default function Politicas() {
  const { esDemo } = useSesion()
  const demo = Boolean(esDemo)
  const [datos, setDatos] = useState(() => (demo ? politicasDemo() : null))
  const [fallo, setFallo] = useState('')
  const [editando, setEditando] = useState(null)

  const cargar = useCallback(async () => {
    setFallo('')
    if (demo) { setDatos(politicasDemo()); return }
    try {
      setDatos(await api.get('/api/tenant/policies'))
    } catch (cause) {
      setFallo(mensajeErrorPoliticas(cause, 'leer'))
    }
  }, [demo])
  useEffect(() => { cargar() }, [cargar])

  const porTipo = Object.fromEntries((datos?.policies || []).map(item => [item.type, item]))
  const publicadas = (datos?.policies || []).filter(item => item.published).length
  const enlaceTienda = !demo && datos?.slug && publicadas ? urlPoliticas(base(), datos.slug) : ''

  return (
    <Card data-config-anchor="politicas" className="space-y-3" data-testid="politicas-pantalla">
      <div>
        <h2 className="font-semibold">Políticas de la tienda</h2>
        <p className="mt-1 text-sm text-mute">Garantía, cambios, envíos y más. Las que publiques se ven en una página pública de tu tienda y se enlazan desde el pedido, la cotización y el comprobante.</p>
      </div>
      {fallo && <Aviso tono="error" className="rounded-xl p-3 text-sm">{fallo}</Aviso>}
      <ul className="divide-y divide-ink-600 overflow-hidden rounded-xl border border-ink-600" data-testid="politicas-lista">
        {POLITICAS.map(({ tipo, etiqueta, ayuda }) => {
          const politica = porTipo[tipo]
          const estado = politica?.published ? 'Publicada' : politica?.content ? 'Borrador' : 'Sin texto'
          return (
            <li key={tipo}>
              <button
                type="button"
                data-politica={tipo}
                disabled={!politica}
                onClick={() => setEditando(politica)}
                className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left transition hover:bg-ink-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-fono disabled:opacity-60"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{etiqueta}</span>
                  <span className="block text-xs text-mute">{politica?.updatedAt ? `Actualizada ${fechaHora(politica.updatedAt)}` : ayuda}</span>
                </span>
                <Badge color={politica?.published ? 'green' : 'slate'}>{estado}</Badge>
                <span aria-hidden="true" className="text-xl leading-none text-mute">›</span>
              </button>
            </li>
          )
        })}
      </ul>
      {demo && <p className="text-xs text-mute">Demo: las políticas se guardan solo en este navegador.</p>}
      {enlaceTienda && <p className="break-all text-xs text-mute" data-testid="politicas-enlace">Página pública: <a href={enlaceTienda} target="_blank" rel="noreferrer" className="font-semibold text-fono-light hover:underline">{enlaceTienda}</a></p>}
      {editando && (
        <EditorPolitica
          politica={editando}
          slug={datos?.slug}
          demo={demo}
          onClose={() => setEditando(null)}
          onGuardada={actualizada => {
            const siguiente = { ...datos, policies: datos.policies.map(item => item.type === actualizada.type ? actualizada : item) }
            if (demo) demoPoliticas = siguiente
            setDatos(siguiente)
            setEditando(null)
          }}
        />
      )}
    </Card>
  )
}
