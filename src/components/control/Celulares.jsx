import { useEffect, useState } from 'react'
import {
  listCelulares,
  addCelular,
  updateCelular,
  deleteCelular,
  cargarLineupIphone,
  rankCelular,
  rankCapacidad,
  esModeloViejo,
  ESTADOS_CELULAR,
} from '@/lib/storage'
import { Card, Button, Input, Label, Select, Badge } from '@/components/ui'

const VACIO = () => ({ modelo: '', capacidad: '', color: '', estado: 'Nuevo', precio: '' })

// Los precios en ₲ son enteros y se escriben con puntos de miles ("14.990.000").
// Tomamos solo los dígitos para no confundir el punto con un decimal.
const precioNum = (v) => Number(String(v ?? '').replace(/[^\d]/g, '')) || 0
const fmtMiles = (n) => (n ? Number(n).toLocaleString('es-PY') : '')

// Estilo por condición: verde para Nuevo, ámbar para Seminuevo.
const TEMA = {
  Nuevo: {
    titulo: '✨ Nuevos',
    seccion: 'border-emerald-200 bg-emerald-50/40',
    card: 'border-emerald-200 bg-white',
    badge: 'green',
  },
  Seminuevo: {
    titulo: '♻️ Semi-nuevos',
    seccion: 'border-amber-200 bg-amber-50/40',
    card: 'border-amber-200 bg-white',
    badge: 'orange',
  },
}

// Ventana de confirmación propia de la app (no usa el confirm() del navegador,
// que se puede desactivar sin querer al tildar "impedir más diálogos").
function ConfirmDialog({ mensaje, onOk, onCancel }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onCancel}
    >
      <Card className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="text-center text-3xl mb-2">⚠️</div>
        <p className="text-center text-sm text-slate-700 mb-4">{mensaje}</p>
        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={onCancel}>
            Cancelar
          </Button>
          <Button variant="danger" className="flex-1" onClick={onOk}>
            Eliminar
          </Button>
        </div>
      </Card>
    </div>
  )
}

function TarjetaCelular({ c, tema, onEliminar, valorPrecio, onPrecioChange, editado }) {
  return (
    <div className={`rounded-xl border p-3 flex flex-col gap-2 ${tema.card}`}>
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0">
          <div className="font-semibold text-sm truncate">{c.modelo}</div>
          <div className="text-xs text-slate-500">{c.capacidad}</div>
        </div>
        <div className="flex gap-0.5 shrink-0">
          <button
            onClick={() => updateCelular(c.id, { activo: !c.activo })}
            className="text-slate-400 hover:text-fono p-1"
            title={c.activo ? 'Ocultar de la lista' : 'Mostrar en la lista'}
          >
            {c.activo ? '👁️' : '🚫'}
          </button>
          <button
            onClick={() => onEliminar(c)}
            className="text-slate-400 hover:text-bad p-1"
            title="Eliminar"
          >
            🗑️
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap text-xs">
        {c.color && <span className="text-slate-500">{c.color}</span>}
        <Badge color={tema.badge}>{c.estado}</Badge>
        {!c.activo && <Badge color="slate">Oculto</Badge>}
      </div>

      <Input
        inputMode="numeric"
        value={valorPrecio}
        onChange={(e) => onPrecioChange(c.id, e.target.value)}
        placeholder="₲ precio"
        className={'h-9 w-full ' + (editado ? 'border-amber-400 bg-amber-50' : '')}
      />
    </div>
  )
}

function Seccion({ estado, items, onEliminar, draft, onPrecioChange }) {
  const tema = TEMA[estado] || TEMA.Nuevo
  const sinPrecio = items.filter((c) => c.precio <= 0).length
  return (
    <div className={`rounded-2xl border p-4 ${tema.seccion}`}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="font-bold">
          {tema.titulo} <span className="text-slate-400 font-normal">({items.length})</span>
        </h3>
        {sinPrecio > 0 && <Badge color="orange">{sinPrecio} sin precio</Badge>}
      </div>
      {items.length === 0 ? (
        <div className="py-6 text-center text-slate-400 text-sm">
          Sin modelos en esta condición.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map((c) => (
            <TarjetaCelular
              key={c.id}
              c={c}
              tema={tema}
              onEliminar={onEliminar}
              valorPrecio={draft[c.id] !== undefined ? draft[c.id] : fmtMiles(c.precio)}
              editado={draft[c.id] !== undefined}
              onPrecioChange={onPrecioChange}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function Celulares({ registrarDirty }) {
  const celulares = listCelulares()
  const [f, setF] = useState(VACIO)
  const [confirmar, setConfirmar] = useState(null) // { mensaje, onOk }
  const [aviso, setAviso] = useState('')
  const [draft, setDraft] = useState({}) // { [id]: precioStr } cambios de precio sin guardar
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))

  // Cambios reales (el draft difiere del precio guardado).
  const cambios = Object.entries(draft).filter(([id, v]) => {
    const c = celulares.find((x) => x.id === id)
    return c && precioNum(v) !== precioNum(c.precio)
  })
  const hayCambios = cambios.length > 0

  // Avisar al Centro de Control si hay cambios sin guardar (para alertar al salir).
  useEffect(() => {
    registrarDirty?.(() => hayCambios)
    return () => registrarDirty?.(null)
  }, [hayCambios, registrarDirty])

  function onPrecioChange(id, valor) {
    setDraft((d) => ({ ...d, [id]: valor }))
  }
  function guardarPrecios() {
    cambios.forEach(([id, v]) => updateCelular(id, { precio: precioNum(v) }))
    setDraft({})
    setAviso(`Se guardaron ${cambios.length} precio(s). ✅`)
  }
  function descartar() {
    setDraft({})
  }

  // Ordenados del modelo más nuevo al más viejo (y, dentro de cada modelo, por
  // capacidad ascendente) y separados por condición.
  const ordenados = [...celulares].sort(
    (a, b) =>
      rankCelular(a.modelo) - rankCelular(b.modelo) ||
      rankCapacidad(a.capacidad) - rankCapacidad(b.capacidad),
  )
  const nuevos = ordenados.filter((c) => c.estado === 'Nuevo')
  const seminuevos = ordenados.filter((c) => c.estado === 'Seminuevo')
  const viejos = celulares.filter((c) => esModeloViejo(c.modelo))

  function agregar(e) {
    e.preventDefault()
    if (!f.modelo.trim() || !f.capacidad.trim()) return
    addCelular({ ...f, precio: precioNum(f.precio) })
    setF(VACIO())
  }

  function cargarLineup() {
    const n = cargarLineupIphone()
    setAviso(n ? `Se agregaron ${n} modelos de iPhone. Cargales el precio. 📱` : 'Ya estaban todos cargados.')
  }

  function pedirEliminar(c) {
    setConfirmar({
      mensaje: `¿Eliminar ${c.modelo} ${c.capacidad}?`,
      onOk: () => deleteCelular(c.id),
    })
  }

  function limpiarViejos() {
    setConfirmar({
      mensaje: `Se van a eliminar ${viejos.length} modelo(s) anteriores al iPhone 13. ¿Continuar?`,
      onOk: () => viejos.forEach((c) => deleteCelular(c.id)),
    })
  }

  return (
    <div className="space-y-4">
      {/* Barra de guardado (sticky arriba) */}
      <div
        className={
          'sticky top-2 z-20 flex items-center justify-between gap-2 rounded-xl border px-3 py-2 shadow-sm ' +
          (hayCambios ? 'bg-amber-50 border-amber-300' : 'bg-white border-slate-200')
        }
      >
        <span className="text-sm font-medium">
          {hayCambios ? (
            <span className="text-amber-700">● {cambios.length} precio(s) sin guardar</span>
          ) : (
            <span className="text-slate-500">Todo guardado</span>
          )}
        </span>
        <div className="flex items-center gap-2">
          {hayCambios && (
            <Button variant="ghost" className="h-9 px-3 text-xs" onClick={descartar}>
              Descartar
            </Button>
          )}
          <Button
            variant="success"
            className="h-9 px-4 text-sm"
            onClick={guardarPrecios}
            disabled={!hayCambios}
          >
            💾 Guardar
          </Button>
        </div>
      </div>

      <Card>
        <div className="flex items-start justify-between gap-2 mb-1">
          <h2 className="font-bold">📱 Lista de precios de celulares</h2>
          <Button variant="outline" className="h-9 px-3 text-xs" onClick={cargarLineup}>
            ⬇️ Cargar lineup iPhone
          </Button>
        </div>

        {aviso && (
          <div className="mb-3 flex items-center justify-between gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-800">
            <span>{aviso}</span>
            <button onClick={() => setAviso('')} className="text-emerald-600 hover:text-emerald-800" title="Cerrar">✕</button>
          </div>
        )}
        <p className="text-sm text-slate-500 mb-4">
          Cargá los modelos con su precio en ₲. Se separan en <strong>Nuevos</strong> y{' '}
          <strong>Semi-nuevos</strong>. Los que tengan precio aparecen en la lista que los
          vendedores comparten por WhatsApp.
        </p>

        <form onSubmit={agregar} className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
          <div className="col-span-2">
            <Label>Modelo</Label>
            <Input value={f.modelo} onChange={set('modelo')} placeholder="iPhone 15 Pro" autoCapitalize="words" />
          </div>
          <div>
            <Label>Capacidad</Label>
            <Input value={f.capacidad} onChange={set('capacidad')} placeholder="256GB" />
          </div>
          <div>
            <Label>Color</Label>
            <Input value={f.color} onChange={set('color')} placeholder="Titanio" />
          </div>
          <div>
            <Label>Condición</Label>
            <Select value={f.estado} onChange={set('estado')}>
              {ESTADOS_CELULAR.map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </Select>
          </div>
          <div className="col-span-2 md:col-span-1">
            <Label>Precio ₲</Label>
            <Input inputMode="numeric" value={f.precio} onChange={set('precio')} placeholder="0" />
          </div>
          <Button type="submit" className="col-span-2 md:col-span-6">➕ Agregar modelo</Button>
        </form>

        {viejos.length > 0 && (
          <div className="mt-3 flex justify-end">
            <Button variant="outline" className="h-9 px-3 text-xs text-bad" onClick={limpiarViejos}>
              🗑️ Limpiar {viejos.length} modelo(s) anteriores al 13
            </Button>
          </div>
        )}
      </Card>

      {celulares.length === 0 ? (
        <Card className="text-center text-slate-400 text-sm py-8">
          Sin modelos. Usá “Cargar lineup iPhone” o agregá uno arriba.
        </Card>
      ) : (
        <div className="space-y-4">
          <Seccion
            estado="Nuevo"
            items={nuevos}
            onEliminar={pedirEliminar}
            draft={draft}
            onPrecioChange={onPrecioChange}
          />
          <Seccion
            estado="Seminuevo"
            items={seminuevos}
            onEliminar={pedirEliminar}
            draft={draft}
            onPrecioChange={onPrecioChange}
          />
        </div>
      )}

      {confirmar && (
        <ConfirmDialog
          mensaje={confirmar.mensaje}
          onOk={() => {
            confirmar.onOk()
            setConfirmar(null)
          }}
          onCancel={() => setConfirmar(null)}
        />
      )}
    </div>
  )
}
