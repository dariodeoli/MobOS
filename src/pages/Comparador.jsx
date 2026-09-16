import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listCelulares, rankCelular, rankCapacidad, getComparadorImagenes } from '@/lib/storage'
import { useLive } from '@/hooks/useLive'
import { gs } from '@/utils/calculos'
import { colorHex } from '@/utils/colores'
import { cn } from '@/lib/utils'
import { Button, Select } from '@/components/ui'
import ProductFooter from '@/components/app/ProductFooter'
import Icon from '@/components/shared/Icon'

const CONDICIONES = [
  ['Nuevo', 'Nuevos'],
  ['Seminuevo', 'Semi-nuevos'],
]

// Maqueta de teléfono teñida con el color elegido. Si el equipo tiene una
// imagen cargada (campo `imagen`), se muestra la foto real en su lugar.
function Telefono({ hex, imagen, alt }) {
  if (imagen) {
    return <img src={imagen} alt={alt} className="mx-auto h-64 object-contain" />
  }
  return (
    <div className="mx-auto flex h-64 items-center justify-center">
      <div
        className="relative w-32 rounded-[2rem] border-4 border-black/5 shadow-inner"
        style={{ background: hex, aspectRatio: '9 / 19' }}
      >
        <div className="absolute left-1/2 top-2.5 h-1.5 w-12 -translate-x-1/2 rounded-full bg-black/15" />
        <div className="absolute left-3 top-3 h-8 w-8 rounded-2xl bg-black/10" />
        <div className="absolute left-3.5 top-12 h-5 w-5 rounded-full bg-black/10" />
      </div>
    </div>
  )
}

function Columna({ info, valor, onModelo, onColor, modelos }) {
  const { modelo, color } = valor
  const hex = colorHex(color)
  const imagen = info?.imagenes?.[color] || null

  return (
    <div className="flex flex-col rounded-2xl border border-ink-600 bg-ink-800 p-4">
      <Select value={modelo} onChange={(e) => onModelo(e.target.value)} className="font-semibold">
        {modelos.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </Select>

      <div className="my-4">
        <Telefono hex={hex} imagen={imagen} alt={`${modelo} ${color}`} />
      </div>

      {info?.colores?.length > 0 ? (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {info.colores.map((c) => (
            <button
              key={c}
              onClick={() => onColor(c)}
              title={c}
              className={cn(
                'h-7 w-7 rounded-full border transition',
                color === c ? 'ring-2 ring-fono ring-offset-2' : 'border-ink-500 hover:scale-110',
              )}
              style={{ background: colorHex(c) }}
            />
          ))}
        </div>
      ) : (
        <div className="text-center text-xs text-mute">Sin colores cargados</div>
      )}
      {color && <div className="mt-2 text-center text-sm font-medium text-fore">{color}</div>}

      <div className="mt-4 border-t border-ink-600 pt-3">
        {info?.min > 0 && (
          <div className="mb-2 text-center text-sm text-mute">
            Desde <span className="font-extrabold text-fore">{gs(info.min)}</span>
          </div>
        )}
        <div className="space-y-1">
          {info?.capacidades?.map(({ capacidad, precio }) => (
            <div key={capacidad} className="flex items-center justify-between text-sm">
              <span className="text-mute">{capacidad}</span>
              <span className="font-bold text-fore">{precio > 0 ? gs(precio) : '—'}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function Comparador() {
  useLive()
  const navigate = useNavigate()
  const [condicion, setCondicion] = useState('Nuevo')

  const activos = useMemo(
    () => listCelulares().filter((c) => c.activo && c.estado === condicion),
    [condicion],
  )

  const modelos = useMemo(() => {
    const set = [...new Set(activos.map((c) => c.modelo))]
    return set.sort((a, b) => rankCelular(a) - rankCelular(b))
  }, [activos])

  const imgStore = getComparadorImagenes()

  // Info por modelo: colores, imágenes por color, capacidades con precio y mínimo.
  const infoPorModelo = useMemo(() => {
    const map = new Map()
    modelos.forEach((modelo) => {
      const items = activos.filter((c) => c.modelo === modelo)
      // Imágenes subidas para este modelo (mapa color dataUrl PNG).
      const imagenes = { ...(imgStore[modelo] || {}) }
      items.forEach((c) => {
        if (c.color && c.imagen && !imagenes[c.color]) imagenes[c.color] = c.imagen
      })
      // Colores = los de las filas + los que tengan imagen subida.
      const colores = [
        ...new Set([...Object.keys(imagenes), ...items.map((c) => c.color).filter(Boolean)]),
      ]
      const capMap = new Map()
      items.forEach((c) => {
        const prev = capMap.get(c.capacidad)
        if (prev == null || (c.precio > 0 && c.precio < prev)) capMap.set(c.capacidad, c.precio)
      })
      const capacidades = [...capMap.entries()]
        .map(([capacidad, precio]) => ({ capacidad, precio }))
        .sort((a, b) => rankCapacidad(a.capacidad) - rankCapacidad(b.capacidad))
      const precios = items.map((c) => c.precio).filter((p) => p > 0)
      const min = precios.length ? Math.min(...precios) : 0
      map.set(modelo, { colores, imagenes, capacidades, min })
    })
    return map
  }, [activos, modelos, imgStore])

  const primerColor = (modelo) => infoPorModelo.get(modelo)?.colores?.[0] || ''

  // Columnas: hasta 3 modelos, cada una con su color elegido. Se reinician al
  // cambiar de condición (clave en el render).
  const [columnas, setColumnas] = useState(() =>
    modelos.slice(0, 3).map((m) => ({ modelo: m, color: '' })),
  )

  // Sincroniza columnas cuando cambian los modelos disponibles (cambio de
  // condición o datos nuevos): toma los primeros disponibles.
  const claveModelos = modelos.join('|')
  const [claveActual, setClaveActual] = useState(claveModelos)
  if (claveModelos !== claveActual) {
    setClaveActual(claveModelos)
    setColumnas(modelos.slice(0, 3).map((m) => ({ modelo: m, color: primerColor(m) })))
  }

  function cambiarModelo(i, modelo) {
    setColumnas((cols) =>
      cols.map((c, idx) => (idx === i ? { modelo, color: primerColor(modelo) } : c)),
    )
  }
  function cambiarColor(i, color) {
    setColumnas((cols) => cols.map((c, idx) => (idx === i ? { ...c, color } : c)))
  }

  return (
    <div className="min-h-dvh bg-ink-700">
      <header className="sticky top-0 z-30 bg-fono text-onbrand pt-safe shadow-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <div className="flex items-center gap-2 font-bold">Comparar modelos</div>
          <Button
            variant="ghost"
            className="text-onbrand hover:bg-ink-800/15"
            onClick={() => navigate('/celulares')}
          >
            Lista de precios
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-5 p-4">
        {/* Toggle de condición */}
        <div className="inline-flex rounded-xl border border-ink-600 bg-ink-800 p-1">
          {CONDICIONES.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setCondicion(key)}
              className={cn(
                'rounded-lg px-4 py-1.5 text-sm font-bold transition',
                condicion === key ? 'bg-fono text-onbrand shadow-sm' : 'text-mute hover:text-fono',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {modelos.length === 0 ? (
          <div className="rounded-2xl border border-ink-600 bg-ink-800 py-16 text-center text-mute">
            <div className="mb-2 text-4xl">
              <Icon name="phone" className="h-4 w-4" />
            </div>
            <p className="text-sm">
              No hay modelos {condicion === 'Nuevo' ? 'nuevos' : 'semi-nuevos'} cargados.
              <br />
              Cargalos desde el Centro de Control Celulares.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {columnas.map((col, i) => (
              <Columna
                key={i}
                info={infoPorModelo.get(col.modelo)}
                valor={col}
                modelos={modelos}
                onModelo={(m) => cambiarModelo(i, m)}
                onColor={(c) => cambiarColor(i, c)}
              />
            ))}
          </div>
        )}

        <p className="text-center text-xs text-mute">
          Subí las fotos reales en Centro de Control Imágenes. Donde no haya foto, se muestra una
          maqueta con el color elegido.
        </p>
      </main>
      <ProductFooter />
    </div>
  )
}
