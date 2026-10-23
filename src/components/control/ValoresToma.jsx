import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ChipsFiltro from '@/components/ventas/ChipsFiltro'
import { Aviso, Badge, Button, Card, Input, Label, MenuDesplegable, MoneyInput, Select, Textarea } from '@/components/ui'
import { FormActions } from '@/components/shared/popupKit'
import Popup from '@/components/shared/Popup'
import Icon from '@/components/shared/Icon'
import SearchField from '@/components/shared/SearchField'
import ModeloCatalogoField from '@/components/shared/ModeloCatalogoField'
import { CELDA_DATO, CELDA_ENCABEZADO, CELDA_IDENTIDAD } from '@/components/shared/tabla'
import { GRILLA_DOS_COLUMNAS } from '@/components/shared/formulario'
import { guardarLoteValuacionesDemo, guardarValuacionDemo, listarValuacionesDemo } from '@/lib/demo/valuaciones'
import { api } from '@/lib/api'
import { gs } from '@/utils/calculos'
import { descargarCsvCliente } from '@/utils/descargarArchivo'
import { normalizarModelo } from '@/utils/tradeInCheckout'
import { cn } from '@/lib/utils'
import { FAMILIAS_APPLE, modeloApple, normalizarCapacidad } from '../../../backend/lib/catalogo-apple.mjs'
import { CONDICIONES_TOMA, ETIQUETA_CONDICION, cambiosDeGrilla, csvPlantilla, csvValores, filasGrilla, filasQueCambian, leerCsvValores } from '@/lib/valoresToma'

const GRID_VALORACIONES = 'grid min-w-[52rem] grid-cols-[minmax(11rem,1.4fr)_6rem_6.5rem_7rem_7rem_6rem_8rem] items-center gap-x-2'
const GRID_MASIVA = 'grid grid-cols-[minmax(0,1fr)_9.5rem_9.5rem] items-center gap-x-2 max-sm:grid-cols-[minmax(0,1fr)_7rem_7rem]'
const VALUACION_VACIA = { model: '', storage: '', condition: 'USED', baseValuePyg: '', maxValuePyg: '', notes: '', isActive: true }
const FILAS_POR_PAGINA = 60

// Tabla de valores de toma que alimenta la sugerencia del POS y el cotizador: el
// vendedor ve el valor base del modelo, la capacidad y la condición, y decide si
// lo usa o lo cambia. El modelo sale del catálogo Apple; la capacidad depende del
// modelo. «Edición masiva» edita todo el catálogo en una grilla y guarda en lote.
export default function ValoresToma({ esDemo }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [form, setForm] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [limite, setLimite] = useState(FILAS_POR_PAGINA)
  const [masiva, setMasiva] = useState(false)
  const [importacion, setImportacion] = useState(null)
  const lock = useRef(false)
  const archivo = useRef(null)

  const load = useCallback(async () => {
    if (esDemo) { setRows(listarValuacionesDemo()); return }
    setLoading(true); setError('')
    try {
      const data = await api.get('/api/device-valuations?all=1')
      if (!Array.isArray(data)) throw new Error('La API no devolvió una lista de valores.')
      setRows(data)
    } catch (err) { setError(err.message || 'No se pudieron cargar los valores de toma.') }
    finally { setLoading(false) }
  }, [esDemo])

  useEffect(() => { load() }, [load])
  useEffect(() => { setLimite(FILAS_POR_PAGINA) }, [query])

  function openForm(row = null) {
    setEditingId(row?.id ?? null)
    setForm(row ? { model: row.model, storage: row.storage || '', condition: row.condition, baseValuePyg: row.baseValuePyg,
      maxValuePyg: row.maxValuePyg ?? '', notes: row.notes || '', isActive: row.isActive } : { ...VALUACION_VACIA })
    setMessage(''); setFormError('')
  }
  function cerrarForm() { setForm(null); setEditingId(null); setFormError('') }
  function change(key, value) { setForm(current => ({ ...current, [key]: value })) }
  // Cambiar de modelo reinicia la capacidad: es dependiente del modelo.
  function cambiarModelo(model) { setForm(current => ({ ...current, model, storage: modeloApple(model)?.capacidades.length === 1 ? modeloApple(model).capacidades[0] : '' })) }

  const catalogo = form ? modeloApple(form.model) : null

  async function guardar(event) {
    event.preventDefault()
    if (lock.current || !form) return
    const model = (catalogo?.nombre || form.model).trim().replace(/\s+/g, ' ')
    const baseValuePyg = Number(form.baseValuePyg)
    const maxValuePyg = String(form.maxValuePyg ?? '').trim() === '' ? null : Number(form.maxValuePyg)
    const storage = catalogo ? form.storage : form.storage.trim()
    if (!model) { setFormError('Buscá el modelo en el catálogo.'); return }
    if (catalogo && catalogo.capacidades.length && !catalogo.capacidades.includes(storage)) { setFormError('Elegí una capacidad del modelo.'); return }
    if (!Number.isSafeInteger(baseValuePyg) || baseValuePyg <= 0) { setFormError('El valor base debe ser un entero positivo.'); return }
    if (maxValuePyg !== null && (!Number.isSafeInteger(maxValuePyg) || maxValuePyg < baseValuePyg)) { setFormError('El valor máximo debe ser mayor o igual al valor base.'); return }
    lock.current = true; setBusy(true); setFormError(''); setMessage('')
    try {
      const payload = { model, storage, condition: form.condition, baseValuePyg, maxValuePyg, notes: form.notes.trim(), isActive: form.isActive }
      const saved = esDemo ? guardarValuacionDemo(editingId, payload) : editingId ? await api.patch('/api/device-valuations', { id: editingId, ...payload }) : await api.post('/api/device-valuations', payload)
      setRows(current => current.some(row => row.id === saved.id) ? current.map(row => row.id === saved.id ? saved : row) : [saved, ...current])
      setMessage(editingId ? 'Valor actualizado.' : 'Valor creado. El POS y el cotizador ya pueden sugerirlo.')
      cerrarForm()
    } catch (err) { setFormError(err.message || 'No se pudo guardar el valor.') }
    finally { lock.current = false; setBusy(false) }
  }

  async function alternar(row) {
    if (lock.current) return
    lock.current = true; setBusy(true); setError(''); setMessage('')
    try {
      const saved = esDemo ? guardarValuacionDemo(row.id, { isActive: !row.isActive }) : await api.patch('/api/device-valuations', { id: row.id, isActive: !row.isActive })
      setRows(current => current.map(item => item.id === saved.id ? saved : item))
      setMessage(saved.isActive ? 'Valor activado.' : 'Valor desactivado: el POS deja de sugerirlo y conserva el historial.')
    } catch (err) { setError(err.message || 'No se pudo cambiar el estado del valor.') }
    finally { lock.current = false; setBusy(false) }
  }

  // Un solo endpoint de lote (idempotente) para la grilla y para el CSV.
  async function guardarLote(lote) {
    if (esDemo) return guardarLoteValuacionesDemo(lote)
    const respuesta = await api.post('/api/device-valuations/batch', { rows: lote })
    await load()
    return respuesta
  }

  function exportar() {
    descargarCsvCliente(`valores-de-toma-${new Date().toISOString().slice(0, 10)}.csv`, csvValores(rows))
  }
  function plantilla() { descargarCsvCliente('valores-de-toma-plantilla.csv', csvPlantilla()) }

  async function leerArchivo(evento) {
    const elegido = evento.target.files?.[0]
    evento.target.value = ''
    if (!elegido) return
    setError(''); setMessage('')
    if (elegido.size > 2 * 1024 * 1024) { setError('El archivo es demasiado grande (máximo 2 MB).'); return }
    const lectura = leerCsvValores(await elegido.text())
    setImportacion({ ...lectura, nombre: elegido.name, cambian: filasQueCambian(lectura.rows, rows) })
  }
  async function aplicarImportacion() {
    if (!importacion || lock.current || importacion.errores.length || !importacion.cambian.length) return
    lock.current = true; setBusy(true); setError('')
    try {
      const respuesta = await guardarLote(importacion.cambian)
      setMessage(`Importación lista: ${respuesta.created} nuevos, ${respuesta.updated} actualizados.`)
      setImportacion(null)
    } catch (err) { setImportacion(actual => actual && { ...actual, errores: [err.message || 'No se pudo importar el archivo.'] }) }
    finally { lock.current = false; setBusy(false) }
  }

  const search = normalizarModelo(query)
  const visibles = useMemo(() => (search ? rows.filter(row => normalizarModelo(`${row.model} ${row.storage || ''}`).includes(search)) : rows), [rows, search])
  const pagina = visibles.slice(0, limite)

  return <Card className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="font-bold">Valores de toma · {rows.length} cargados</h2>
        <p className="mt-1 text-sm text-mute">Sugerencia por modelo, capacidad y condición. El vendedor la ve al cargar el canje y en las cotizaciones, y puede cambiarla.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" disabled={busy || loading || !!form} onClick={() => setMasiva(true)}>Edición masiva</Button>
        <Button type="button" disabled={busy || loading || !!form} onClick={() => openForm()}>Agregar valor</Button>
        <MenuDesplegable
          trigger={<span className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg border border-ink-500 px-3 text-sm font-semibold text-fore">Más<Icon name="chevron" className="h-3.5 w-3.5 text-mute" /></span>}
          ariaLabel="Más acciones de valores de toma"
          items={[
            { label: 'Exportar CSV', disabled: !rows.length, onClick: exportar },
            { label: 'Importar CSV', disabled: busy, onClick: () => archivo.current?.click() },
            { label: 'Descargar plantilla CSV', onClick: plantilla },
            { label: 'Actualizar', disabled: busy || loading, onClick: load },
          ]}
        />
        <input ref={archivo} type="file" accept=".csv,text/csv,text/plain" className="hidden" aria-label="Archivo CSV de valores de toma" data-testid="valores-csv-archivo" onChange={leerArchivo} />
      </div>
    </div>
    {loading && <p role="status" className="text-sm text-mute">Cargando valores…</p>}
    {error && <p role="alert" className="rounded-lg bg-bad/10 p-3 text-sm text-bad">{error}</p>}
    {message && <p role="status" className="text-sm text-ok">{message}</p>}
    <SearchField ariaLabel="Buscar valores por modelo" placeholder="Buscar por modelo…" value={query} onChange={(event) => setQuery(event.target.value)} />
    <Popup open={Boolean(form)} onClose={busy ? undefined : cerrarForm} title={editingId ? 'Editar valor de toma' : 'Nuevo valor de toma'} tamano="md">
      {form && <form onSubmit={guardar} className="space-y-4">
        <fieldset disabled={busy} className={GRILLA_DOS_COLUMNAS}>
          <div className="sm:col-span-2"><Label htmlFor="dv-model">Modelo</Label><ModeloCatalogoField id="dv-model" value={form.model} onChange={cambiarModelo} /></div>
          <div>
            <Label htmlFor="dv-storage">Capacidad{catalogo ? '' : ' (opcional)'}</Label>
            {catalogo?.capacidades.length
              ? <Select id="dv-storage" required value={form.storage} onChange={(event) => change('storage', normalizarCapacidad(event.target.value))}>
                <option value="">Elegí la capacidad</option>
                {catalogo.capacidades.map(capacidad => <option key={capacidad} value={capacidad}>{capacidad}</option>)}
              </Select>
              : catalogo ? <Input id="dv-storage" disabled value="Sin capacidad" readOnly />
                : <Input id="dv-storage" maxLength={60} value={form.storage} onChange={(event) => change('storage', event.target.value)} placeholder="Ej. 128GB (modelo fuera del catálogo)" />}
          </div>
          <div><Label htmlFor="dv-condition">Condición</Label><Select id="dv-condition" value={form.condition} onChange={(event) => change('condition', event.target.value)}>{CONDICIONES_TOMA.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></div>
          <div><Label htmlFor="dv-base">Valor base (Gs)</Label><MoneyInput id="dv-base" required value={form.baseValuePyg} onValueChange={(value) => change('baseValuePyg', value)} placeholder="0" /></div>
          <div><Label htmlFor="dv-max">Valor máximo (Gs, opcional)</Label><MoneyInput id="dv-max" value={form.maxValuePyg} onValueChange={(value) => change('maxValuePyg', value)} placeholder="Hasta" /></div>
          <label className="flex items-center gap-2 self-end text-sm"><input type="checkbox" checked={form.isActive} onChange={(event) => change('isActive', event.target.checked)} />Valor activo</label>
          <div className="sm:col-span-2"><Label htmlFor="dv-notes">Notas (opcional)</Label><Textarea id="dv-notes" rows={2} maxLength={2000} value={form.notes} onChange={(event) => change('notes', event.target.value)} placeholder="Aclaraciones para el equipo" /></div>
        </fieldset>
        {formError && <Aviso tono="error" className="px-3 py-2 text-sm">{formError}</Aviso>}
        <FormActions>
          <Button type="button" variant="ghost" disabled={busy} onClick={cerrarForm}>Cancelar</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar valor'}</Button>
        </FormActions>
      </form>}
    </Popup>
    {!loading && !error && !visibles.length && <p className="text-sm text-mute">{rows.length ? 'Ningún valor coincide con la búsqueda.' : 'Todavía no hay valores cargados. Sin un valor cargado, el POS no sugiere nada.'}</p>}
    {visibles.length > 0 && <div className="overflow-x-auto" data-testid="valoraciones-tabla">
      <div className={cn(GRID_VALORACIONES, 'px-3.5 pb-2 pt-1')}>
        <span className={CELDA_ENCABEZADO}>Modelo</span>
        <span className={CELDA_ENCABEZADO}>Capacidad</span>
        <span className={CELDA_ENCABEZADO}>Condición</span>
        <span className={cn(CELDA_ENCABEZADO, 'text-right')}>Valor base</span>
        <span className={cn(CELDA_ENCABEZADO, 'text-right')}>Máximo</span>
        <span className={CELDA_ENCABEZADO}>Estado</span>
        <span className={cn(CELDA_ENCABEZADO, 'text-right')}>Acciones</span>
      </div>
      <div className="space-y-1">{pagina.map(row => <div key={row.id} data-testid="valoracion-fila" className={cn(GRID_VALORACIONES, 'rounded-xl border border-ink-600 bg-ink-800/40 px-3.5 py-2 transition hover:border-fono/40')}>
        <span className={cn('min-w-0', CELDA_IDENTIDAD)} title={row.model}>{row.model}</span>
        <span className={CELDA_DATO}>{row.storage || '—'}</span>
        <span><Badge color={row.condition === 'NEW' ? 'green' : row.condition === 'USED' ? 'orange' : 'slate'} className="w-fit whitespace-nowrap px-1.5 py-0.5 text-[10px]">{ETIQUETA_CONDICION[row.condition] || row.condition}</Badge></span>
        <span className="text-right text-xs tabular-nums text-fore">{gs(row.baseValuePyg)}</span>
        <span className="text-right text-xs tabular-nums text-mute">{row.maxValuePyg != null ? gs(row.maxValuePyg) : '—'}</span>
        <span className={CELDA_DATO}>{row.isActive ? 'Activo' : 'Inactivo'}</span>
        <span className="flex items-center justify-end gap-1.5">
          <Button type="button" variant="outline" className="h-8 px-2 text-xs" disabled={busy || !!form} aria-label={`Editar ${row.model} ${row.storage || ''}`.trim()} onClick={() => openForm(row)}>Editar</Button>
          <Button type="button" variant="ghost" className="h-8 px-2 text-xs" disabled={busy || !!form} aria-label={`${row.isActive ? 'Desactivar' : 'Activar'} ${row.model} ${row.storage || ''}`.trim()} onClick={() => alternar(row)}>{row.isActive ? 'Desactivar' : 'Activar'}</Button>
        </span>
      </div>)}</div>
      {visibles.length > pagina.length && <div className="flex justify-center pt-2">
        <Button type="button" variant="outline" onClick={() => setLimite(actual => actual + FILAS_POR_PAGINA)}>Mostrar más ({visibles.length - pagina.length} restantes)</Button>
      </div>}
    </div>}
    <EdicionMasiva open={masiva} onClose={() => setMasiva(false)} rows={rows} guardarLote={guardarLote} onGuardado={(respuesta) => setMessage(`Cambios guardados: ${respuesta.created} nuevos, ${respuesta.updated} actualizados.`)} />
    <Popup open={Boolean(importacion)} onClose={busy ? undefined : () => setImportacion(null)} title="Importar valores de toma" tamano="md">
      {importacion && <div className="space-y-3" data-testid="valores-importacion">
        <p className="text-sm text-mute">{importacion.nombre}: {importacion.rows.length} fila(s) válidas, {importacion.cambian.length} con cambios{importacion.omitidas ? `, ${importacion.omitidas} sin valor (se omiten)` : ''}.</p>
        {importacion.errores.length > 0 && <Aviso tono="error">
          <p className="font-semibold">Corregí el archivo y volvé a subirlo:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">{importacion.errores.slice(0, 8).map((texto) => <li key={texto}>{texto}</li>)}</ul>
          {importacion.errores.length > 8 && <p className="mt-1 text-xs">… y {importacion.errores.length - 8} más.</p>}
        </Aviso>}
        {!importacion.errores.length && !importacion.cambian.length && <Aviso tono="warn">El archivo no cambia ningún valor: ya está todo cargado así.</Aviso>}
        <FormActions>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => setImportacion(null)}>Cancelar</Button>
          <Button type="button" disabled={busy || importacion.errores.length > 0 || !importacion.cambian.length} onClick={aplicarImportacion}>{busy ? 'Importando…' : `Importar ${importacion.cambian.length} valor(es)`}</Button>
        </FormActions>
      </div>}
    </Popup>
  </Card>
}

// Grilla de edición masiva: una fila por modelo × capacidad para la condición
// elegida, con valor base y máximo editables en línea. Solo viajan las filas
// que cambian; el servidor guarda el lote completo o no guarda nada.
function EdicionMasiva({ open, onClose, rows, guardarLote, onGuardado }) {
  const [condicion, setCondicion] = useState('USED')
  const [familia, setFamilia] = useState('iPhone')
  const [texto, setTexto] = useState('')
  const [ediciones, setEdiciones] = useState({})
  const [errores, setErrores] = useState([])
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  useEffect(() => { if (open) { setEdiciones({}); setErrores([]); setTexto('') } }, [open])

  const filas = useMemo(() => filasGrilla(rows, { condicion, familia, texto }), [rows, condicion, familia, texto])
  // Los cambios de TODAS las condiciones editadas, no solo las visibles.
  const pendientes = useMemo(() => {
    const todas = []
    const errs = []
    for (const [codigo] of CONDICIONES_TOMA) {
      const delCodigo = Object.fromEntries(Object.entries(ediciones).filter(([, valor]) => valor.condicion === codigo))
      if (!Object.keys(delCodigo).length) continue
      const base = filasGrilla(rows, { condicion: codigo })
      const { rows: lote, errores: e } = cambiosDeGrilla(base, delCodigo)
      todas.push(...lote); errs.push(...e)
    }
    return { rows: todas, errores: errs }
  }, [ediciones, rows])

  const editar = (fila, campo, valor) => setEdiciones((actual) => {
    const previo = actual[fila.clave] || { base: fila.base, max: fila.max, condicion: fila.condition }
    return { ...actual, [fila.clave]: { ...previo, [campo]: valor === '' || valor == null ? '' : String(valor) } }
  })

  async function guardar() {
    if (lock.current || !pendientes.rows.length) return
    if (pendientes.errores.length) { setErrores(pendientes.errores); return }
    lock.current = true; setBusy(true); setErrores([])
    try {
      const respuesta = await guardarLote(pendientes.rows)
      onGuardado?.(respuesta)
      setEdiciones({})
      onClose()
    } catch (cause) { setErrores([cause?.message || 'No se pudieron guardar los cambios.']) }
    finally { lock.current = false; setBusy(false) }
  }

  return <Popup open={open} onClose={busy ? undefined : onClose} title="Edición masiva de valores de toma" tamano="xl" dirty={Object.keys(ediciones).length > 0}>
    <div className="space-y-3" data-testid="valores-masiva">
      <div className="flex flex-wrap items-center gap-2">
        <ChipsFiltro etiqueta="Condición" opciones={CONDICIONES_TOMA} valor={condicion} onChange={setCondicion} className="min-w-0" />
        <ChipsFiltro etiqueta="Familia" opciones={[['', 'Todas'], ...FAMILIAS_APPLE.map((nombre) => [nombre, nombre])]} valor={familia} onChange={setFamilia} className="min-w-0" />
      </div>
      <SearchField ariaLabel="Buscar modelo en la grilla" placeholder="Buscar modelo (ej. 15 pro max)…" value={texto} onChange={(evento) => setTexto(evento.target.value)} />
      <p className="text-xs text-mute">Escribí el valor base y, si querés, el máximo. Una celda vacía no cambia nada; vaciar el valor base de un valor cargado lo desactiva.</p>
      <div className="rounded-xl border border-ink-600" role="table" aria-label="Valores de toma por modelo y capacidad">
        <div role="row" className={cn(GRID_MASIVA, 'sticky top-0 z-10 rounded-t-xl border-b border-ink-600 bg-ink-800 px-3 py-2')}>
          <span role="columnheader" className={CELDA_ENCABEZADO}>Modelo y capacidad</span>
          <span role="columnheader" className={cn(CELDA_ENCABEZADO, 'text-right')}>Valor base</span>
          <span role="columnheader" className={cn(CELDA_ENCABEZADO, 'text-right')}>Máximo</span>
        </div>
        {filas.length === 0 && <p className="px-3 py-4 text-sm text-mute">Ningún modelo coincide.</p>}
        {filas.map((fila) => {
          const editada = ediciones[fila.clave]
          const etiqueta = `${fila.model}${fila.storage ? ` ${fila.storage}` : ''}`
          return <div key={fila.clave} role="row" data-testid="masiva-fila" data-modelo={fila.model} data-capacidad={fila.storage} className={cn(GRID_MASIVA, 'border-b border-ink-700 px-3 py-1.5 last:border-b-0', editada && 'bg-fono/5')}>
            <span role="cell" className="min-w-0 text-sm"><span className="font-medium text-fore">{fila.model}</span>{fila.storage && <span className="ml-1.5 text-mute">{fila.storage}</span>}</span>
            <span role="cell"><MoneyInput aria-label={`Valor base de ${etiqueta}`} value={editada ? editada.base : fila.base} onValueChange={(valor) => editar(fila, 'base', valor)} placeholder="—" className="h-9 text-right text-sm" /></span>
            <span role="cell"><MoneyInput aria-label={`Valor máximo de ${etiqueta}`} value={editada ? editada.max : fila.max} onValueChange={(valor) => editar(fila, 'max', valor)} placeholder="—" className="h-9 text-right text-sm" /></span>
          </div>
        })}
      </div>
      {errores.length > 0 && <Aviso tono="error"><ul className="list-disc space-y-0.5 pl-5 text-xs">{errores.slice(0, 6).map((e) => <li key={e}>{e}</li>)}</ul></Aviso>}
      <FormActions>
        <span className="mr-auto self-center text-xs text-mute" aria-live="polite">{pendientes.rows.length ? `${pendientes.rows.length} cambio(s) sin guardar` : 'Sin cambios'}</span>
        <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>Cancelar</Button>
        <Button type="button" disabled={busy || !pendientes.rows.length} onClick={guardar}>{busy ? 'Guardando…' : pendientes.rows.length ? `Guardar ${pendientes.rows.length} cambio(s)` : 'Guardar cambios'}</Button>
      </FormActions>
    </div>
  </Popup>
}
