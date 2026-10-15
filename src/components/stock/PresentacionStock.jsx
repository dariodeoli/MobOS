// Presentación del Stock (#448), en Stock › Control › Ubicaciones (los depósitos):
//  - orden por defecto de la lista (qué tipo de artículo primero y si los nuevos
//    van arriba o abajo de los semi nuevos): una preferencia de la tienda y, si
//    cada uno quiere, la suya que la pisa;
//  - color de fila por condición × depósito (de fábrica: los tokens de #435). El
//    texto se elige solo para que siempre pase 4.5:1; acá se muestra el contraste.
import './planilla.css'
import { useState } from 'react'
import { Button, Select, useToast } from '@/components/ui'
import { useStockDisplay } from '@/hooks/useStockDisplay'
import {
  COLORES_BASE, CONDICIONES_PRIMERO, TIPOS_PRIMERO, contraste, normalizarConfig, paletaFila,
} from '@/lib/stockDisplay'

const CONDICIONES = [['nuevo', 'Nuevo'], ['semi', 'Semi nuevo']]

function MuestraColor({ fondo, etiqueta }) {
  const { fg, fg2 } = paletaFila(fondo)
  const ratio = contraste(fg2, fondo)
  return (
    <span
      data-testid="muestra-color"
      className="inline-flex h-7 min-w-[7.5rem] items-center justify-between gap-2 rounded-md border px-2 text-[11px] font-semibold"
      style={{ background: fondo, borderColor: paletaFila(fondo).bd, color: fg }}
    >
      <span>{etiqueta}</span>
      <span style={{ color: fg2 }} title="Contraste del texto secundario sobre este color">{ratio.toFixed(1)}:1</span>
    </span>
  )
}

function CampoColor({ valor, base, etiqueta, onCambiar, onRestaurar, deposito }) {
  const efectivo = valor || base
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        aria-label={`Color ${etiqueta} · ${deposito}`}
        value={efectivo}
        onChange={(evento) => onCambiar(evento.target.value)}
        className="h-11 min-h-11 w-11 min-w-11 shrink-0 cursor-pointer rounded border border-ink-500 bg-transparent p-0.5"
      />
      <MuestraColor fondo={efectivo} etiqueta={etiqueta} />
      {valor ? (
        <button type="button" className="min-h-11 min-w-11 px-1 text-xs font-semibold text-fono-light hover:underline" onClick={onRestaurar}>De fábrica</button>
      ) : (
        <span className="text-[11px] text-mute">De fábrica</span>
      )}
    </div>
  )
}

export default function PresentacionStock({ ubicaciones = [], puedeEditar = false }) {
  const toast = useToast()
  const { empresa, propia, guardarEmpresa, guardarPropia } = useStockDisplay()
  const [borrador, setBorrador] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const actual = borrador || empresa
  const cambiado = Boolean(borrador)

  const editar = (parche) => setBorrador({ ...actual, ...parche })
  const colorDe = (clave, condicion) => actual.colores?.[clave]?.[condicion] || ''
  const poner = (clave, condicion, hex) => {
    const previo = { ...(actual.colores?.[clave] || {}) }
    if (hex) previo[condicion] = hex; else delete previo[condicion]
    const colores = { ...(actual.colores || {}) }
    if (previo.nuevo || previo.semi) colores[clave] = previo; else delete colores[clave]
    editar({ colores })
  }
  async function guardar() {
    setGuardando(true)
    try {
      await guardarEmpresa(normalizarConfig(actual))
      setBorrador(null)
      toast.success('Presentación del stock guardada.')
    } catch (causa) {
      console.error('[stock] no se pudo guardar la presentación', causa)
      toast.error(causa?.message || 'No se pudo guardar. Probá de nuevo.')
    } finally {
      setGuardando(false)
    }
  }

  const filas = [{ id: '*', nombre: 'Todos los depósitos' }, ...ubicaciones.map((ubicacion) => ({ id: ubicacion.id, nombre: ubicacion.name, sucursal: ubicacion.branch?.name }))]
  return (
    <section data-testid="presentacion-stock" className="rounded-xl border border-ink-600 p-3 space-y-4">
      <div>
        <h3 className="text-sm font-bold">Cómo se ve el stock</h3>
        <p className="mt-0.5 text-xs text-mute">Orden de la lista y color de cada fila según su condición y su depósito.</p>
      </div>

      <div className="grid gap-x-6 gap-y-3 lg:grid-cols-2" data-testid="presentacion-orden">
        <fieldset className="flex flex-wrap items-end gap-x-3 gap-y-2" disabled={!puedeEditar}>
          <legend className="mb-1 text-xs font-semibold text-mute">Orden de la tienda</legend>
          <label className="block w-full text-xs sm:w-56">
            <span className="mb-1 block font-semibold">Mostrar primero</span>
            <Select aria-label="Tipo que se muestra primero (tienda)" value={actual.tipoPrimero} onChange={(evento) => editar({ tipoPrimero: evento.target.value })}>
              {TIPOS_PRIMERO.map(([clave, etiqueta]) => <option key={clave} value={clave}>{etiqueta}</option>)}
            </Select>
          </label>
          <label className="block w-full text-xs sm:w-56">
            <span className="mb-1 block font-semibold">Condición</span>
            <Select aria-label="Condición que se muestra primero (tienda)" value={actual.condicionPrimero} onChange={(evento) => editar({ condicionPrimero: evento.target.value })}>
              {CONDICIONES_PRIMERO.map(([clave, etiqueta]) => <option key={clave} value={clave}>{etiqueta}</option>)}
            </Select>
          </label>
          {!puedeEditar ? <p className="w-full text-[11px] text-mute">Solo el dueño o el gerente cambia el de la tienda.</p> : null}
        </fieldset>
        <fieldset className="flex flex-wrap items-end gap-x-3 gap-y-2">
          <legend className="mb-1 text-xs font-semibold text-mute">Mi orden (solo para mí)</legend>
          <label className="block w-full text-xs sm:w-56">
            <span className="mb-1 block font-semibold">Mostrar primero</span>
            <Select aria-label="Tipo que se muestra primero (mío)" value={propia.tipoPrimero} onChange={(evento) => guardarPropia({ ...propia, tipoPrimero: evento.target.value })}>
              <option value="">Como la tienda</option>
              {TIPOS_PRIMERO.filter(([clave]) => clave).map(([clave, etiqueta]) => <option key={clave} value={clave}>{etiqueta}</option>)}
            </Select>
          </label>
          <label className="block w-full text-xs sm:w-56">
            <span className="mb-1 block font-semibold">Condición</span>
            <Select aria-label="Condición que se muestra primero (mía)" value={propia.condicionPrimero} onChange={(evento) => guardarPropia({ ...propia, condicionPrimero: evento.target.value })}>
              <option value="">Como la tienda</option>
              {CONDICIONES_PRIMERO.filter(([clave]) => clave).map(([clave, etiqueta]) => <option key={clave} value={clave}>{etiqueta}</option>)}
            </Select>
          </label>
        </fieldset>
      </div>

      <div data-testid="presentacion-colores">
        <p className="mb-1 text-xs font-semibold text-mute">Color por condición y depósito</p>
        <div className="space-y-1">
          {filas.map((fila) => (
            <div key={fila.id} className="grid items-center gap-x-3 gap-y-1 rounded-lg border border-ink-600 px-2 py-1.5 lg:grid-cols-[minmax(0,12rem)_1fr_1fr]" data-testid="presentacion-color-fila">
              <span className="min-w-0 truncate text-xs font-semibold" title={fila.nombre}>{fila.nombre}{fila.sucursal ? <span className="font-normal text-mute"> · {fila.sucursal}</span> : null}</span>
              {CONDICIONES.map(([condicion, etiqueta]) => (
                <fieldset key={condicion} disabled={!puedeEditar}>
                  <CampoColor
                    deposito={fila.nombre}
                    etiqueta={etiqueta}
                    valor={colorDe(fila.id, condicion)}
                    base={fila.id === '*' ? COLORES_BASE.claro[condicion === 'nuevo' ? 'nuevo' : 'semi'] : (colorDe('*', condicion) || COLORES_BASE.claro[condicion === 'nuevo' ? 'nuevo' : 'semi'])}
                    onCambiar={(hex) => poner(fila.id, condicion, hex)}
                    onRestaurar={() => poner(fila.id, condicion, '')}
                  />
                </fieldset>
              ))}
            </div>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-mute">El texto de cada fila se ajusta solo (claro u oscuro) para que se lea bien con cualquier color.</p>
      </div>

      {puedeEditar ? (
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" disabled={!cambiado || guardando} onClick={() => setBorrador(null)}>Descartar</Button>
          <Button type="button" disabled={!cambiado || guardando} onClick={guardar} data-testid="presentacion-guardar">{guardando ? 'Guardando…' : 'Guardar'}</Button>
        </div>
      ) : null}
    </section>
  )
}
