import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Select } from '@/components/ui'
import usePlantillasEmpresa from './usePlantillasEmpresa'
import VistaPlantilla from './VistaPlantilla'
import { renderPlantilla, pdfPlantilla } from '@/lib/printing/renderPlantilla'
import { avisoSalidaPlantilla } from '@/lib/printing/perfiles'
import { descargarArchivo } from '@/utils/descargarArchivo'
export default function DocumentoPlantilla({ kind, data, onMode, premiumBuilder, dataError = '' }) {
  const store = usePlantillasEmpresa(kind),
    [selected, setSelected] = useState(null),
    [render, setRender] = useState(null),
    [error, setError] = useState(''),
    [overflow, setOverflow] = useState([]),
    [busy, setBusy] = useState(false)
  const serialized = JSON.stringify(data)
  const rows = useMemo(() => JSON.parse(serialized), [serialized])
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
  useEffect(() => onMode?.(mode), [mode, onMode])
  useEffect(() => {
    epoch.current++
    setSelected(null)
    setRender(null)
    setBusy(false)
  }, [store.signature])
  useEffect(() => {
    if (!store.loading && !store.error && selected === null)
      setSelected(store.effective[kind]?.templateId || '')
  }, [store.loading, store.error, store.effective, selected, kind])
  const template = store.templates.find(t => t.id === selected)
  useEffect(() => {
    const counter = epoch
    const request = ++counter.current
    setRender(null)
    setError('')
    setOverflow([])
    if (!template || !rows.length || dataError) return
    renderPlantilla({
      kind,
      definition: template.definition,
      data: rows,
      premiumBuilder,
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
  }, [template, rows, kind, premiumBuilder, dataError])
  async function download() {
    if (busy || !render || mode !== 'custom' || dataError) return
    const context = store.signature,
      request = epoch.current
    setBusy(true)
    setError('')
    try {
      const blob = await pdfPlantilla(render)
      if (
        identity.current === context &&
        request === epoch.current &&
        !descargarArchivo(`${kind}-${render.count}.pdf`, blob)
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
      aria-label={`Formato ${kind}`}
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
            disabled={
              mode !== 'custom' ||
              !render ||
              Boolean(error || dataError) ||
              overflow.length > 0 ||
              busy
            }
            onClick={download}
          >
            {busy ? 'Generando PDF…' : 'Descargar PDF con plantilla'}
          </Button>
        </>
      )}
      {(error || dataError || overflow.length > 0) && (
        <p role="alert" className="text-sm text-danger">
          {error || dataError || overflow.join(' ')}
        </p>
      )}
    </section>
  )
}
