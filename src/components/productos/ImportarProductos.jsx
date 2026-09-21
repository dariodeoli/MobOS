import { useMemo, useState } from 'react'
import { api } from '@/lib/api/client'
import { useSesion } from '@/lib/sesion'
import { Badge, Button, ConfirmDialog, Modal, Select, useToast } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import AttachmentInput from '@/components/shared/AttachmentInput'
import { gs } from '@/utils/calculos'
import {
  ACEPTA_IMPORTACION,
  COLUMNAS_IMPORTACION,
  MAX_ARCHIVO_BYTES,
  MAX_FILAS_IMPORTACION,
  filasDesdeMatriz,
  leerArchivoProductos,
  validarArchivoProductos,
} from '@/utils/importarProductos'

// Vista previa de la importación: la validación fila por fila la hace el
// backend (misma regla que el alta individual) y acá se muestra el resultado
// antes de escribir nada. La escritura es un único lote: o entra completa o no
// entra nada, y después se puede deshacer desde el mismo diálogo.
const GRID_PREVIA = 'grid min-w-[52rem] grid-cols-[3rem_7.5rem_minmax(9rem,1.5fr)_7rem_4rem_6.5rem_7.5rem_minmax(8rem,1.2fr)] items-center gap-x-2'
const ACCION = {
  crear: { label: 'Crear', color: 'green' },
  actualizar: { label: 'Actualizar precio', color: 'blue' },
  omitir: { label: 'Omitir', color: 'slate' },
}

export default function ImportarProductos({ onImportada }) {
  const { sucursal } = useSesion()
  const toast = useToast()
  const [abierto, setAbierto] = useState(false)
  const [archivo, setArchivo] = useState(null)
  const [leyendo, setLeyendo] = useState(false)
  const [filas, setFilas] = useState([])
  const [descartadas, setDescartadas] = useState(0)
  const [desconocidos, setDesconocidos] = useState([])
  const [error, setError] = useState('')
  const [mode, setMode] = useState('crear')
  const [previa, setPrevia] = useState(null)
  const [previsualizando, setPrevisualizando] = useState(false)
  const [soloProblemas, setSoloProblemas] = useState(false)
  const [importando, setImportando] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [deshaciendo, setDeshaciendo] = useState(false)
  const [confirmarDeshacer, setConfirmarDeshacer] = useState(false)

  const filasVisibles = useMemo(() => {
    const rows = previa?.rows || []
    return soloProblemas ? rows.filter(fila => fila.status !== 'ok') : rows
  }, [previa, soloProblemas])
  const importables = (previa?.rows || []).filter(fila => fila.action === 'crear' || fila.action === 'actualizar').length

  function reiniciar() {
    setArchivo(null)
    setFilas([])
    setDescartadas(0)
    setDesconocidos([])
    setError('')
    setPrevia(null)
    setResultado(null)
    setSoloProblemas(false)
  }

  async function previsualizar(rows, modo) {
    setPrevisualizando(true)
    setError('')
    setResultado(null)
    try {
      const data = await api.post('/api/products/import', { rows, mode: modo, dryRun: true, branchId: sucursal?.id, fileName: archivo?.name })
      setPrevia(data)
      setSoloProblemas(data.resumen.errores > 0)
    } catch (err) {
      setPrevia(null)
      setError(err?.message || 'No se pudo validar el archivo.')
    } finally {
      setPrevisualizando(false)
    }
  }

  async function seleccionar(archivoElegido) {
    reiniciar()
    if (!archivoElegido) return
    const problema = validarArchivoProductos(archivoElegido)
    if (problema) { setError(problema); return }
    setArchivo(archivoElegido)
    setLeyendo(true)
    try {
      const matriz = await leerArchivoProductos(archivoElegido)
      const lectura = filasDesdeMatriz(matriz)
      setDescartadas(lectura.descartadas)
      setDesconocidos(lectura.desconocidos)
      if (lectura.faltantes.length) {
        setError(`No se encontró la columna ${lectura.faltantes.map(clave => COLUMNAS_IMPORTACION.find(col => col.clave === clave)?.etiqueta || clave).join(', ')}. Revisá el encabezado del archivo.`)
        return
      }
      if (!lectura.filas.length) {
        setError('El archivo no tiene filas de datos. Revisá que la primera fila sea el encabezado.')
        return
      }
      if (lectura.filas.length > MAX_FILAS_IMPORTACION) {
        setError(`El archivo tiene ${lectura.filas.length} filas: el máximo por importación es ${MAX_FILAS_IMPORTACION}.`)
        return
      }
      setFilas(lectura.filas)
      await previsualizar(lectura.filas, mode)
    } catch (err) {
      console.error('[ImportarProductos] no se pudo leer el archivo:', err)
      setError('No se pudo leer el archivo. Verificá que sea un .csv o .xlsx válido.')
    } finally {
      setLeyendo(false)
    }
  }

  async function cambiarModo(nuevo) {
    setMode(nuevo)
    if (filas.length) await previsualizar(filas, nuevo)
  }

  async function importar() {
    if (!previa || importando) return
    const rows = previa.rows.filter(fila => fila.action === 'crear' || fila.action === 'actualizar').map(fila => fila.data)
    if (!rows.length) return
    setImportando(true)
    setError('')
    try {
      const data = await api.post('/api/products/import', { rows, mode, dryRun: false, branchId: sucursal?.id, fileName: archivo?.name })
      setResultado(data)
      setPrevia(null)
      onImportada?.()
      toast.success('Importación aplicada', `${data.creados} creados · ${data.actualizados} precios actualizados${data.omitidos ? ` · ${data.omitidos} omitidos` : ''}.`)
    } catch (err) {
      setError(err?.message || 'No se pudo importar.')
      toast.error('No se importó nada', 'La importación se revierte completa si una fila falla.')
    } finally {
      setImportando(false)
    }
  }

  async function deshacer() {
    if (!resultado?.batchId || deshaciendo) return
    setDeshaciendo(true)
    setError('')
    try {
      const data = await api.post('/api/products/import', { action: 'undo', batchId: resultado.batchId })
      setResultado({ ...resultado, undo: data })
      onImportada?.()
      toast.success('Importación deshecha', `${data.desactivados} productos eliminados · ${data.restaurados} precios restaurados${data.omitidos.length ? ` · ${data.omitidos.length} sin tocar` : ''}.`)
    } catch (err) {
      setError(err?.message || 'No se pudo deshacer la importación.')
    } finally {
      setDeshaciendo(false)
      setConfirmarDeshacer(false)
    }
  }

  return (
    <>
      <Button type="button" variant="outline" className="h-9 px-3 text-xs font-medium" onClick={() => setAbierto(true)} data-testid="importar-productos">
        <Icon name="upload" className="h-4 w-4" />
        Importar productos
      </Button>

      <Modal
        open={abierto}
        onClose={(importando || confirmarDeshacer) ? undefined : () => setAbierto(false)}
        title="Importar productos (CSV o Excel)"
        className="max-w-5xl"
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-ink-600 bg-ink-700/40 p-4 text-xs leading-5 text-mute">
            <p className="font-semibold text-fore">Cómo preparar el archivo</p>
            <p className="mt-1">
              La primera fila es el encabezado y tiene que incluir <strong className="text-fore">SKU</strong>. Se aceptan{' '}
              {COLUMNAS_IMPORTACION.map(columna => columna.etiqueta).join(', ')} en cualquier orden, en mayúsculas o minúsculas.
              En Excel se lee la <strong className="text-fore">primera hoja</strong> del libro.
            </p>
            <p className="mt-2">
              El backend valida <strong className="text-fore">fila por fila</strong> contra el catálogo: SKU faltantes, precios inválidos,
              repetidos en el archivo y SKU ya existentes. Nada se escribe hasta que confirmás la vista previa, y el lote entra completo o no entra.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <AttachmentInput
              accept={ACEPTA_IMPORTACION}
              etiqueta="Elegir archivo .csv o .xlsx"
              mensaje="El archivo debe ser .csv, .tsv o .xlsx de hasta 5 MiB."
              maxBytes={MAX_ARCHIVO_BYTES}
              disabled={leyendo || importando}
              onSelect={seleccionar}
              onError={setError}
              aria-label="Archivo de productos"
            >
              <span className="inline-flex h-9 items-center gap-2 rounded-lg border border-ink-500 px-3 text-xs font-semibold text-fore transition hover:border-fono hover:bg-fono/10">
                <Icon name="upload" className="h-4 w-4" />
                {archivo ? 'Elegir otro archivo' : 'Elegir archivo .csv o .xlsx'}
              </span>
            </AttachmentInput>
            {archivo && <span className="truncate text-xs text-mute" title={archivo.name}>{archivo.name}</span>}
            <Select aria-label="Modo de importación" className="w-auto" value={mode} disabled={leyendo || importando} onChange={(event) => cambiarModo(event.target.value)}>
              <option value="crear">Solo crear nuevos (SKU existente = error)</option>
              <option value="actualizar">Crear nuevos y actualizar precios</option>
            </Select>
          </div>

          {desconocidos.length > 0 && (
            <p className="text-xs text-mute">Columnas ignoradas: {desconocidos.join(', ')}.</p>
          )}
          {descartadas > 0 && <p className="text-xs text-mute">{descartadas} filas vacías se omiten.</p>}

          {error && (
            <p role="alert" className="rounded-xl border border-bad/30 bg-bad/10 px-4 py-3 text-sm text-bad">{error}</p>
          )}

          {(leyendo || previsualizando) && (
            <div className="rounded-xl border border-ink-600 bg-ink-700/40 px-4 py-3 text-sm text-mute" role="status">
              {leyendo ? 'Leyendo el archivo…' : 'Validando las filas contra el catálogo…'}
            </div>
          )}

          {previa && !previsualizando && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge color="blue">{previa.resumen.total} filas</Badge>
                <Badge color="green">{previa.resumen.crear} para crear</Badge>
                <Badge color="blue">{previa.resumen.actualizar} precios</Badge>
                {previa.resumen.omitir > 0 && <Badge color="slate">{previa.resumen.omitir} omitidas</Badge>}
                {previa.resumen.errores > 0 && <Badge color="red">{previa.resumen.errores} con error</Badge>}
                {previa.resumen.advertencias > 0 && <Badge color="orange">{previa.resumen.advertencias} con aviso</Badge>}
                <label className="ml-auto flex items-center gap-2 text-xs text-mute">
                  <input type="checkbox" className="h-4 w-4 accent-fono" checked={soloProblemas} onChange={(event) => setSoloProblemas(event.target.checked)} />
                  Ver solo filas con problemas
                </label>
              </div>

              <div className="overflow-x-auto rounded-xl border border-ink-600" data-testid="importar-previa">
                <div className="max-h-72 overflow-y-auto">
                  <div className={GRID_PREVIA + ' sticky top-0 z-10 border-b border-ink-600 bg-ink-800 px-3.5 py-2 text-[10px] font-bold uppercase tracking-wider text-mute'}>
                    <span>Fila</span><span>SKU</span><span>Producto</span><span className="text-right">Precio</span><span className="text-right">Stock</span><span>Condición</span><span>Acción</span><span>Detalle</span>
                  </div>
                  {filasVisibles.map(fila => {
                    const accion = ACCION[fila.action]
                    return (
                      <div key={fila.line} className={GRID_PREVIA + ' border-b border-ink-600/60 px-3.5 py-2 text-xs last:border-0'}>
                        <span className="tabular-nums text-mute">{fila.line}</span>
                        <span className="truncate font-mono text-[11px]" title={fila.data.sku}>{fila.data.sku || '—'}</span>
                        <span className="truncate font-medium" title={fila.data.name || undefined}>{fila.data.name || '—'}</span>
                        <span className="truncate text-right tabular-nums">{fila.data.pricePyg === null ? '—' : gs(fila.data.pricePyg)}</span>
                        <span className="truncate text-right tabular-nums">{fila.data.stock === null ? '—' : fila.data.stock}</span>
                        <span className="truncate">{fila.data.condition === null ? '—' : fila.data.condition === 'USED' ? 'Seminuevo' : fila.data.condition === 'REFURBISHED' ? 'Reacondicionado' : 'Nuevo'}</span>
                        <span>
                          {fila.status === 'error'
                            ? <Badge color="red">Error</Badge>
                            : accion ? <Badge color={accion.color}>{accion.label}</Badge> : <Badge color="slate">—</Badge>}
                        </span>
                        <span className={fila.status === 'error' ? 'truncate text-bad' : 'truncate text-mute'} title={fila.message || undefined}>
                          {fila.message || '—'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button type="button" variant="ghost" onClick={reiniciar} disabled={importando}>Elegir otro archivo</Button>
                <Button type="button" onClick={importar} disabled={importando || !importables} data-testid="importar-confirmar">
                  {importando ? 'Importando…' : `Importar ${importables} ${importables === 1 ? 'fila' : 'filas'}`}
                </Button>
              </div>
            </>
          )}

          {resultado && !resultado.undo && (
            <div className="rounded-xl border border-ok/30 bg-ok/5 p-4" data-testid="importar-resultado">
              <p className="text-sm font-semibold text-fore">Importación aplicada</p>
              <p className="mt-2 text-sm">
                <Badge color="green">{resultado.creados} {resultado.creados === 1 ? 'creado' : 'creados'}</Badge>{' '}
                <Badge color="blue">{resultado.actualizados} {resultado.actualizados === 1 ? 'precio actualizado' : 'precios actualizados'}</Badge>{' '}
                {resultado.omitidos > 0 && <Badge color="slate">{resultado.omitidos} omitidos</Badge>}
              </p>
              <p className="mt-2 text-xs text-mute">
                Si algo salió mal, podés deshacer el lote: se eliminan solo los productos creados acá que nadie tocó después.
              </p>
              <div className="mt-3 flex justify-end">
                <Button type="button" variant="outline" disabled={deshaciendo} onClick={() => setConfirmarDeshacer(true)} data-testid="importar-deshacer">
                  {deshaciendo ? 'Deshaciendo…' : 'Deshacer importación'}
                </Button>
              </div>
            </div>
          )}

          {resultado?.undo && (
            <div className="rounded-xl border border-ink-600 bg-ink-700/40 p-4" data-testid="importar-deshacer-resultado">
              <p className="text-sm font-semibold text-fore">Lote deshecho</p>
              <p className="mt-2 text-sm">
                <Badge color="slate">{resultado.undo.desactivados} {resultado.undo.desactivados === 1 ? 'producto eliminado' : 'productos eliminados'}</Badge>{' '}
                <Badge color="blue">{resultado.undo.restaurados} {resultado.undo.restaurados === 1 ? 'precio restaurado' : 'precios restaurados'}</Badge>{' '}
                {resultado.undo.omitidos.length > 0 && <Badge color="orange">{resultado.undo.omitidos.length} sin tocar</Badge>}
              </p>
              {resultado.undo.omitidos.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-mute">
                  {resultado.undo.omitidos.slice(0, 8).map(fila => <li key={fila.sku}>{fila.sku}: {fila.motivo}.</li>)}
                  {resultado.undo.omitidos.length > 8 && <li>y {resultado.undo.omitidos.length - 8} más…</li>}
                </ul>
              )}
            </div>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmarDeshacer}
        onCancel={() => setConfirmarDeshacer(false)}
        onConfirm={deshacer}
        title="Deshacer la importación"
        description="Se dan de baja los productos creados por este lote y se restauran los precios que haya cambiado. Lo que se editó después no se toca."
        confirmLabel="Deshacer importación"
        variant="danger"
        busy={deshaciendo}
      />
    </>
  )
}
