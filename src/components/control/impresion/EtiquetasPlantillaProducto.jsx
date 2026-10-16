import { useEffect, useRef, useState } from 'react'
import { Button, Select } from '@/components/ui'
import usePlantillasEmpresa from './usePlantillasEmpresa'
import VistaPlantilla from './VistaPlantilla'
import {
  datosProductoPlantilla,
  renderPlantilla,
  pdfPlantilla,
} from '@/lib/printing/renderPlantilla'
import { avisoSalidaPlantilla } from '@/lib/printing/perfiles'
import { descargarArchivo } from '@/utils/descargarArchivo'
import { empresaImpresion } from '@/lib/printing/empresaImpresion'
export default function EtiquetasPlantillaProducto({ items, onMode }) {
  const store = usePlantillasEmpresa('etiquetas-producto'),
    [selected, setSelected] = useState(null),
    [render, setRender] = useState(null),
    [error, setError] = useState(''),
    [overflow, setOverflow] = useState([]),
    [busy, setBusy] = useState(false)
  const epoch = useRef(0),
    identity = useRef(store.signature)
  identity.current = store.signature
  const mode =
    store.loading || selected === null
      ? 'loading'
      : store.error
        ? 'error'
        : selected
          ? 'custom'
          : 'legacy'
  useEffect(() => onMode(mode), [mode, onMode])
  useEffect(() => {
    setSelected(null)
    setRender(null)
    setBusy(false)
  }, [store.signature])
  useEffect(() => {
    if (!store.loading && !store.error && selected === null)
      setSelected(store.effective['etiquetas-producto']?.templateId || '')
  }, [store.loading, store.error, store.effective, selected])
  const template = store.templates.find(t => t.id === selected)
  useEffect(() => {
    const counter = epoch
    const request = ++counter.current
    setRender(null)
    setError('')
    setOverflow([])
    if (!template || !items.length) return
    renderPlantilla({
      kind: 'etiquetas-producto',
      definition: template.definition,
      data: datosProductoPlantilla(items, { brand: empresaImpresion().tenant?.name || 'MobOS' }),
    })
      .then(result => {
        if (request === epoch.current) setRender(result)
      })
      .catch(err => {
        if (request === epoch.current) setError(err.message)
      })
    return () => {
      counter.current++
    }
  }, [template, items])
  async function download() {
    if (busy || !render) return
    const context = store.signature,
      request = epoch.current
    setBusy(true)
    setError('')
    try {
      const blob = await pdfPlantilla(render)
      if (
        identity.current === context &&
        request === epoch.current &&
        !descargarArchivo(`etiquetas-${render.count}.pdf`, blob)
      )
        throw Error('No se pudo descargar el PDF.')
    } catch (err) {
      if (identity.current === context && request === epoch.current) setError(err.message)
    } finally {
      if (identity.current === context && request === epoch.current) setBusy(false)
    }
  }
  return (
    <section
      className="space-y-3 rounded-xl border border-ink-600 p-3 min-w-0"
      aria-label="Formato de etiquetas"
    >
      <label className="block text-sm space-y-1">
        Plantilla del PDF
        <Select
          className="min-h-11"
          aria-label="Plantilla del PDF"
          value={selected || ''}
          disabled={store.loading || busy}
          onChange={e => setSelected(e.target.value)}
        >
          <option value="">Formato habitual · agente / diálogo</option>
          {store.templates.map(t => (
            <option key={t.id} value={t.id}>
              {t.name} · {t.definition.page.widthMm} × {t.definition.page.heightMm} mm
            </option>
          ))}
        </Select>
      </label>
      {store.loading && (
        <p role="status" className="text-sm text-mute">
          Consultando formato de la empresa…
        </p>
      )}
      {store.error && (
        <>
          <p role="alert" className="text-sm text-danger">
            {store.error} No se cambió automáticamente al formato habitual.
          </p>
          <Button className="min-h-11" variant="ghost" onClick={store.recargar}>
            Reintentar formatos
          </Button>
        </>
      )}
      {selected && (
        <>
          <p className="text-sm text-mute">{avisoSalidaPlantilla()}</p>
          {render && <VistaPlantilla render={render} onErrors={setOverflow} />}
          <Button
            className="min-h-11"
            disabled={!render || Boolean(error) || overflow.length > 0 || busy}
            onClick={download}
          >
            {busy ? 'Generando PDF…' : 'Descargar PDF con plantilla'}
          </Button>
        </>
      )}
      {(error || overflow.length > 0) && (
        <p role="alert" className="text-sm text-danger">
          {error || overflow.join(' ')}
        </p>
      )}
    </section>
  )
}
