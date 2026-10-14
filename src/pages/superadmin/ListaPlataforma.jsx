import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { api } from '@/lib/api'
import { Input, Select } from '@/components/ui'
import VentanaDetalle from '@/components/shared/VentanaDetalle'
import { consultaLista, formatNumero, totalPaginas } from '@/lib/superadmin/formato'

const CAMPO = 'h-11 rounded-lg border border-ink-600 bg-ink-800 px-3 text-sm text-fore focus-visible:outline focus-visible:outline-2 focus-visible:outline-fono'

// Lista paginada de la plataforma (30 por página): búsqueda, filtros, orden y
// detalle en ventana centrada. Escritorio en tabla; celular en tarjetas.
export default function ListaPlataforma({ nombre, ruta, columnas, filtros, ordenes, ordenInicial = 'alta', placeholder, detalleTitulo, DetalleContenido, filaId = fila => fila.id }) {
  const [q, setQ] = useState('')
  const [consulta, setConsulta] = useState('')
  const [valores, setValores] = useState({})
  const [orden, setOrden] = useState(ordenInicial)
  const [dir, setDir] = useState('desc')
  const [pagina, setPagina] = useState(1)
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [abierto, setAbierto] = useState(null)
  const secuencia = useRef(0)

  useEffect(() => {
    const t = setTimeout(() => { setConsulta(q.trim()); setPagina(1) }, 300)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    const mia = ++secuencia.current
    setError('')
    const qs = consultaLista({ q: consulta, ...valores, orden, dir, pagina })
    api.get(`${ruta}?${qs}`, { cacheMs: 0 })
      .then(res => { if (mia === secuencia.current) setDatos(res) })
      .catch(err => { if (mia === secuencia.current) { console.error(`[superadmin] ${nombre}:`, err); setError('No se pudo cargar la lista.') } })
  }, [ruta, nombre, consulta, valores, orden, dir, pagina])

  const paginas = totalPaginas(datos?.total)
  const filas = datos?.items || []
  const cambiarFiltro = (clave, valor) => { setValores(v => ({ ...v, [clave]: valor })); setPagina(1) }

  return (
    <div className="flex flex-col gap-3" data-testid={`lista-${nombre}`}>
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1 basis-56">
          <span className="sr-only">Buscar</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mute" aria-hidden="true" />
          <Input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={placeholder} maxLength={80} className="h-11 w-full pl-9" data-testid="lista-buscar" />
        </label>
        {filtros.map(f => (
          <label key={f.clave} className="shrink-0">
            <span className="sr-only">{f.titulo}</span>
            <Select aria-label={f.titulo} value={valores[f.clave] || ''} onChange={e => cambiarFiltro(f.clave, e.target.value)} className="h-11 w-auto" data-testid={`filtro-${f.clave}`}>
              {f.opciones.map(([valor, etiqueta]) => <option key={valor} value={valor}>{etiqueta}</option>)}
            </Select>
          </label>
        ))}
        <label className="shrink-0">
          <span className="sr-only">Ordenar por</span>
          <Select aria-label="Ordenar por" value={orden} onChange={e => { setOrden(e.target.value); setPagina(1) }} className="h-11 w-auto" data-testid="lista-orden">
            {ordenes.map(([valor, etiqueta]) => <option key={valor} value={valor}>Orden: {etiqueta}</option>)}
          </Select>
        </label>
        <button type="button" onClick={() => { setDir(d => (d === 'asc' ? 'desc' : 'asc')); setPagina(1) }} className={`${CAMPO} shrink-0 font-medium`} aria-label={dir === 'asc' ? 'Orden ascendente' : 'Orden descendente'} data-testid="lista-dir">
          {dir === 'asc' ? '↑ Asc' : '↓ Desc'}
        </button>
      </div>

      {error && <p role="alert" className="rounded-xl border border-bad/40 bg-ink-800 p-4 text-sm text-bad-text">{error}</p>}
      {!datos && !error && <p className="text-sm text-mute" role="status">Cargando…</p>}
      {datos && filas.length === 0 && !error && (
        <p className="rounded-xl border border-ink-600 bg-ink-800 p-4 text-sm text-mute" data-testid="lista-vacia">
          {consulta || Object.values(valores).some(Boolean) ? 'Ningún resultado con esos filtros.' : 'Sin datos todavía.'}
        </p>
      )}

      {filas.length > 0 && (
        <>
          <div className="hidden overflow-hidden rounded-xl border border-ink-600 bg-ink-800 md:block">
            <table className="w-full table-fixed text-left text-sm">
              <thead className="border-b border-ink-600 text-xs uppercase tracking-wide text-mute">
                <tr>{columnas.map(c => <th key={c.clave} scope="col" className={`px-3 py-2.5 font-medium ${c.ancho || ''}`}>{c.titulo}</th>)}</tr>
              </thead>
              <tbody>
                {filas.map(fila => (
                  <tr key={filaId(fila)} className="border-b border-ink-600 last:border-b-0 hover:bg-ink-700">
                    {columnas.map((c, i) => (
                      <td key={c.clave} className="p-0">
                        {i === 0 ? (
                          <button type="button" onClick={() => setAbierto(filaId(fila))} className="block min-h-11 w-full truncate px-3 py-2 text-left font-medium text-fore focus-visible:outline focus-visible:outline-2 focus-visible:outline-fono" data-testid="lista-fila">{c.render(fila)}</button>
                        ) : (
                          <div className="min-h-11 truncate px-3 py-3 text-fore">{c.render(fila) || <span className="text-mute">—</span>}</div>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="flex flex-col gap-2 md:hidden">
            {filas.map(fila => (
              <li key={filaId(fila)}>
                <button type="button" onClick={() => setAbierto(filaId(fila))} className="flex min-h-11 w-full flex-col gap-1 rounded-xl border border-ink-600 bg-ink-800 p-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-fono" data-testid="lista-fila">
                  <span className="break-words text-sm font-semibold text-fore">{columnas[0].render(fila)}</span>
                  {columnas.slice(1).map(c => {
                    const v = c.render(fila)
                    return v ? <span key={c.clave} className="flex justify-between gap-3 text-xs"><span className="text-mute">{c.titulo}</span><span className="min-w-0 break-words text-right text-fore">{v}</span></span> : null
                  })}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {datos && datos.total > 0 && (
        <nav className="flex items-center justify-between gap-2" aria-label="Paginación">
          <p className="text-xs text-mute" data-testid="lista-total">{formatNumero(datos.total)} en total · página {pagina} de {paginas}</p>
          <div className="flex gap-2">
            <button type="button" disabled={pagina <= 1} onClick={() => setPagina(p => p - 1)} className={`${CAMPO} inline-flex w-11 items-center justify-center px-0 disabled:opacity-40`} aria-label="Página anterior" data-testid="pagina-anterior"><ChevronLeft className="h-4 w-4" /></button>
            <button type="button" disabled={pagina >= paginas} onClick={() => setPagina(p => p + 1)} className={`${CAMPO} inline-flex w-11 items-center justify-center px-0 disabled:opacity-40`} aria-label="Página siguiente" data-testid="pagina-siguiente"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </nav>
      )}

      {abierto && (
        <VentanaDetalle open onClose={() => setAbierto(null)} title={detalleTitulo} size="md">
          <DetalleContenido id={abierto} />
        </VentanaDetalle>
      )}
    </div>
  )
}

export function useDetalle(ruta, id) {
  const [estado, setEstado] = useState({ cargando: true, datos: null, error: '' })
  useEffect(() => {
    let vivo = true
    setEstado({ cargando: true, datos: null, error: '' })
    api.get(`${ruta}/${encodeURIComponent(id)}`, { cacheMs: 0 })
      .then(datos => { if (vivo) setEstado({ cargando: false, datos, error: '' }) })
      .catch(err => { console.error('[superadmin] detalle:', err); if (vivo) setEstado({ cargando: false, datos: null, error: 'No se pudo cargar el detalle.' }) })
    return () => { vivo = false }
  }, [ruta, id])
  return estado
}

export function Datos({ filas }) {
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
      {filas.map(([titulo, valor]) => (
        <div key={titulo} className="min-w-0">
          <dt className="text-xs text-mute">{titulo}</dt>
          <dd className="break-words text-fore">{valor || valor === 0 ? valor : <span className="text-mute">—</span>}</dd>
        </div>
      ))}
    </dl>
  )
}
