import { useState } from 'react'
import { api } from '@/lib/api/client'
import { useSesion } from '@/lib/sesion'
import { Aviso, Badge, Button, Modal, useToast } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import AttachmentInput from '@/components/shared/AttachmentInput'
import { parseDelimited } from '@/utils/csv'
import { gs, num } from '@/utils/calculos'

const MAX_FILAS = 500
const VISTA_PREVIA = 5
const COLUMNAS = ['sku', 'nombre', 'precio', 'stock', 'categoria', 'condicion']

// Convierte un CSV crudo en filas normalizadas. El encabezado puede venir en
// cualquier orden y en mayúsculas; las filas sin SKU o nombre se descartan.
function filasParaImportar(texto) {
  const filas = parseDelimited(texto)
  if (filas.length < 2) return { productos: [], sinDatos: 0 }
  const encabezados = (filas[0] || []).map(celda =>
    String(celda).trim().toLowerCase().replace(/^\uFEFF/, ''),
  )
  const columna = nombre => {
    const indice = encabezados.indexOf(nombre)
    return indice >= 0 ? fila => String(fila[indice] ?? '').trim() : () => ''
  }
  const leer = Object.fromEntries(COLUMNAS.map(c => [c, columna(c)]))
  const productos = []
  let sinDatos = 0
  for (const fila of filas.slice(1)) {
    const sku = leer.sku(fila)
    const nombre = leer.nombre(fila)
    const precio = num(leer.precio(fila))
    // Sin SKU la fila no sirve; el nombre puede faltar solo en modo
    // actualización de precios (SKU + precio, sin crear productos).
    if (!sku || (!nombre && !precio)) {
      sinDatos += 1
      continue
    }
    productos.push({
      sku,
      nombre,
      precio,
      stock: num(leer.stock(fila)),
      categoria: leer.categoria(fila),
      condicion: leer.condicion(fila).toUpperCase(),
    })
  }
  return { productos, sinDatos }
}

// El backend rechaza el alta de un SKU que ya existe (409 con mensaje del
// campo); cualquier otro fallo se cuenta como error.
const esExistente = error =>
  error?.status === 409 || /(ya existe|duplicad|existe|unique|conflict)/i.test(error?.message || '')

export default function ImportarProductosCSV({ onImportada }) {
  const { sucursal } = useSesion()
  const toast = useToast()
  const [abierto, setAbierto] = useState(false)
  const [archivo, setArchivo] = useState(null)
  const [filas, setFilas] = useState(null)
  const [sinDatos, setSinDatos] = useState(0)
  const [error, setError] = useState('')
  const [importando, setImportando] = useState(false)
  const [progreso, setProgreso] = useState({ hechas: 0, total: 0 })
  const [resumen, setResumen] = useState(null)

  const filasAImportar = (filas || []).slice(0, MAX_FILAS)
  const superaTope = Boolean(filas && filas.length > MAX_FILAS)

  async function seleccionar(archivoElegido) {
    setResumen(null)
    setError('')
    setFilas(null)
    setSinDatos(0)
    if (!archivoElegido) {
      setArchivo(null)
      return
    }
    setArchivo(archivoElegido)
    try {
      const texto = await archivoElegido.text()
      const parseo = filasParaImportar(texto)
      setSinDatos(parseo.sinDatos)
      if (!parseo.productos.length) {
        setError('El archivo no tiene filas válidas. Revisá el encabezado y que cada fila tenga SKU y nombre.')
        return
      }
      setFilas(parseo.productos)
    } catch (err) {
      console.error('[ImportarCSV] no se pudo leer el archivo:', err)
      setError('No se pudo leer el archivo. Verificá que sea un CSV en UTF-8.')
    }
  }

  async function importar() {
    if (!filasAImportar.length || importando) return
    setImportando(true)
    setError('')
    setProgreso({ hechas: 0, total: filasAImportar.length })
    let creados = 0
    let actualizados = 0
    let omitidos = 0
    let errores = 0
    for (const [indice, fila] of filasAImportar.entries()) {
      try {
        await api.post('/api/products', {
          sku: fila.sku,
          name: fila.nombre || fila.sku,
          pricePyg: fila.precio,
          stock: fila.stock,
          category: fila.categoria || undefined,
          condition: fila.condicion === 'SEMI' ? 'USED' : 'NEW',
          branchId: sucursal?.id,
        })
        creados += 1
      } catch (err) {
        console.error(`[ImportarCSV] falló la fila ${indice + 1} (${fila.sku}):`, err)
        if (esExistente(err) && fila.precio > 0) {
          // SKU existente con precio: actualiza el precio de lista (flyer).
          try {
            const resultados = await api.get(`/api/products?q=${encodeURIComponent(fila.sku)}`)
            const objetivo = (Array.isArray(resultados) ? resultados : []).find(producto => String(producto.sku || '').toLowerCase() === fila.sku.toLowerCase())
            if (objetivo?.id) {
              await api.patch('/api/products', { id: objetivo.id, pricePyg: fila.precio })
              actualizados += 1
            } else {
              omitidos += 1
            }
          } catch (errUpdate) {
            console.error(`[ImportarCSV] no se pudo actualizar ${fila.sku}:`, errUpdate)
            errores += 1
          }
        } else if (esExistente(err)) omitidos += 1
        else errores += 1
      }
      setProgreso({ hechas: indice + 1, total: filasAImportar.length })
    }
    setImportando(false)
    setResumen({ creados, actualizados, omitidos, errores })
    onImportada?.()
    if (errores === 0) {
      toast.success(
        'Importación terminada',
        `${creados} creados · ${actualizados} precios actualizados · ${omitidos} omitidos.`,
      )
    } else {
      toast.error(
        'Importación con errores',
        `${creados} creados · ${omitidos} omitidos · ${errores} errores.`,
      )
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="h-9 px-3 text-xs font-medium"
        onClick={() => setAbierto(true)}
      >
        <Icon name="upload" className="h-4 w-4" />
        Importar CSV
      </Button>

      <Modal
        open={abierto}
        onClose={importando ? undefined : () => setAbierto(false)}
        title="Importar productos por CSV" size="amplio">
        <div className="space-y-4">
          <div className="rounded-xl border border-ink-600 bg-ink-700/40 p-4 text-xs leading-5 text-mute">
            <p className="font-semibold text-fore">Columnas esperadas</p>
            <p className="mt-1">
              <code className="rounded bg-ink-600 px-1.5 py-0.5 text-[11px] text-fore">
                {COLUMNAS.join(',')}
              </code>
            </p>
            <p className="mt-2">
              El encabezado puede estar en cualquier orden y también se aceptan mayúsculas. La
              condición es <strong className="text-fore">NUEVO</strong> o{' '}
              <strong className="text-fore">SEMI</strong>. El precio va en guaraníes y el stock
              como número entero.
            </p>
            <p className="mt-2">
              <strong className="text-fore">Actualización de precios:</strong> si el SKU ya
              existe y la fila trae precio, se actualiza el precio de lista (ideal para pegar tu
              flyer con <code className="rounded bg-ink-600 px-1.5 py-0.5 text-[11px] text-fore">sku,precio</code>).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <AttachmentInput
              accept=".csv,text/csv"
              etiqueta="Elegir archivo .csv"
              mensaje="El archivo debe ser un CSV (.csv o text/csv) de hasta 5 MiB."
              disabled={importando}
              onSelect={seleccionar}
              onError={setError}
            >
              <span className="inline-flex h-9 items-center gap-2 rounded-lg border border-ink-500 px-3 text-xs font-semibold text-fore transition hover:border-fono hover:bg-fono/10">
                <Icon name="upload" className="h-4 w-4" />
                {archivo ? archivo.name : 'Elegir archivo .csv'}
              </span>
            </AttachmentInput>
            {Boolean(filasAImportar.length) && (
              <Button
                type="button"
                onClick={importar}
                disabled={importando || Boolean(resumen)}
              >
                {importando
                  ? `Importando ${progreso.hechas}/${progreso.total}…`
                  : `Importar ${filasAImportar.length} ${filasAImportar.length === 1 ? 'producto' : 'productos'}`}
              </Button>
            )}
          </div>

          {error && (
            <Aviso tono="error" className="px-4 py-3 text-sm rounded-xl">
              {error}
            </Aviso>
          )}

          {superaTope && (
            <Aviso tono="warn" className="rounded-xl px-4 py-3">
              El archivo tiene {filas.length} filas. Por seguridad se importarán solo las primeras{' '}
              {MAX_FILAS}.
            </Aviso>
          )}

          {Boolean(filas?.length) && (
            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-mute">
                  Vista previa · {Math.min(VISTA_PREVIA, filas.length)} de {filas.length} filas
                </p>
                {sinDatos > 0 && (
                  <p className="text-xs text-mute">{sinDatos} filas sin SKU o nombre se ignoran.</p>
                )}
              </div>
              <div className="overflow-x-auto rounded-xl border border-ink-600">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-ink-600 text-left uppercase tracking-wider text-mute">
                      {['SKU', 'Nombre', 'Precio', 'Stock', 'Categoría', 'Condición'].map(col => (
                        <th key={col} className="px-3 py-2 font-medium">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filas.slice(0, VISTA_PREVIA).map((fila, indice) => (
                      <tr key={indice} className="border-b border-ink-600/60 last:border-0">
                        <td className="px-3 py-2 font-medium">{fila.sku}</td>
                        <td className="px-3 py-2">{fila.nombre}</td>
                        <td className="px-3 py-2 tabular-nums">{gs(fila.precio)}</td>
                        <td className="px-3 py-2 tabular-nums">{fila.stock}</td>
                        <td className="px-3 py-2">{fila.categoria || '—'}</td>
                        <td className="px-3 py-2">
                          <Badge color={fila.condicion === 'SEMI' ? 'orange' : 'green'}>
                            {fila.condicion === 'SEMI' ? 'Seminuevo' : 'Nuevo'}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {importando && (
            <div aria-live="polite">
              <div className="flex items-center justify-between text-xs text-mute">
                <span>
                  Importando {progreso.hechas}/{progreso.total}…
                </span>
                <span>
                  {progreso.total
                    ? Math.round((progreso.hechas / progreso.total) * 100)
                    : 0}
                  %
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-600">
                <div
                  className="h-full bg-fono transition-all"
                  style={{
                    width: `${progreso.total ? (progreso.hechas / progreso.total) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          )}

          {resumen && (
            <div className="rounded-xl border border-ink-600 bg-ink-700/40 p-4">
              <p className="text-sm font-semibold">Importación terminada</p>
              <p className="mt-2 text-sm">
                <Badge color="green">{resumen.creados} creados</Badge>{' '}
                <Badge color="blue">{resumen.actualizados} precios actualizados</Badge>{' '}
                <Badge color="orange">{resumen.omitidos} omitidos</Badge>{' '}
                <Badge color="red">{resumen.errores} errores</Badge>
              </p>
              <p className="mt-2 text-xs text-mute">
                Elegí otro archivo para seguir importando o cerrá el diálogo.
              </p>
            </div>
          )}
        </div>
      </Modal>
    </>
  )
}
