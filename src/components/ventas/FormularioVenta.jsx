import { useState } from 'react'
import {
  getProductos,
  addProducto,
  addVenta,
  getVendedores,
  addVendedor,
  MEDIOS_PAGO,
  ESTADOS_PAGO,
  ENTREGA,
} from '@/lib/storage'
import { fechaClave, num, gs } from '@/utils/calculos'
import { agruparProductos } from '@/utils/colores'
import { Button, Card, Input, Label, Select, Textarea, Badge } from '@/components/ui'
import SelectorColor from './SelectorColor'

// Recuerda el último vendedor elegido en esta compu, para no re-seleccionarlo
// en cada venta (suelen ser ráfagas de la misma persona).
const ULTIMO_VENDEDOR = 'fono:ultimoVendedor'

const VACIO = (vendedorId) => ({
  vendedorId: vendedorId || '',
  cliente: '',
  productoId: '',
  estadoPago: ESTADOS_PAGO[0],
  fecha: fechaClave(),
  precio: '',
  medioPago: MEDIOS_PAGO[0],
  entrega: ENTREGA[0],
  montoDelivery: '',
  observacion: '',
})

export default function FormularioVenta({ onGuardado }) {
  const productos = getProductos().filter((p) => p.activo)
  const familias = agruparProductos(productos)
  const vendedores = getVendedores().filter((v) => v.activo)
  const [f, setF] = useState(() => VACIO(localStorage.getItem(ULTIMO_VENDEDOR)))
  const [nuevoProd, setNuevoProd] = useState(false)
  const [nombreProd, setNombreProd] = useState('')
  const [coloresNuevos, setColoresNuevos] = useState([])
  const [colorInput, setColorInput] = useState('')
  const [familiaActiva, setFamiliaActiva] = useState(null) // { base, items } cuando se eligió una familia con colores
  const [modalColor, setModalColor] = useState(false)
  const [nuevoVend, setNuevoVend] = useState(false)
  const [nombreVend, setNombreVend] = useState('')
  const [ok, setOk] = useState(false)

  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))

  // Lo que muestra el <Select>: la familia (si hay color elegido) o el id directo.
  const valorSelect = familiaActiva ? 'fam:' + familiaActiva.base : f.productoId
  // Producto/color elegido actualmente (para el chip).
  const itemActivo =
    familiaActiva && f.productoId
      ? familiaActiva.items.find((it) => it.id === f.productoId)
      : null

  function elegirVendedor(e) {
    const v = e.target.value
    if (v === '__nuevo__') {
      setNuevoVend(true)
      return
    }
    setF((s) => ({ ...s, vendedorId: v }))
  }

  function crearVendedor() {
    const nombre = nombreVend.trim()
    if (!nombre) return
    const v = addVendedor(nombre)
    setNuevoVend(false)
    setNombreVend('')
    setF((s) => ({ ...s, vendedorId: v.id }))
  }

  function aplicarProducto(p) {
    setF((s) => ({
      ...s,
      productoId: p.id,
      precio: p && p.precioVenta > 0 ? String(p.precioVenta) : s.precio,
    }))
  }

  function elegirProducto(e) {
    const v = e.target.value
    if (v === '__nuevo__') {
      setNuevoProd(true)
      return
    }
    if (v.startsWith('fam:')) {
      // Familia con varios colores → abrir la ventana para elegir color.
      const fam = familias.find((x) => 'fam:' + x.base === v)
      setFamiliaActiva(fam)
      setF((s) => ({ ...s, productoId: '' }))
      setModalColor(true)
      return
    }
    // Producto directo (sin colores)
    setFamiliaActiva(null)
    const p = productos.find((x) => x.id === v)
    if (p) aplicarProducto(p)
  }

  function elegirColor(item) {
    aplicarProducto(item)
    setModalColor(false)
  }

  function agregarColor() {
    const c = colorInput.trim()
    if (!c) return
    if (!coloresNuevos.some((x) => x.toLowerCase() === c.toLowerCase()))
      setColoresNuevos((s) => [...s, c])
    setColorInput('')
  }

  function cancelarNuevoProd() {
    setNuevoProd(false)
    setNombreProd('')
    setColoresNuevos([])
    setColorInput('')
  }

  function crearProducto() {
    const base = nombreProd.trim()
    if (!base) return
    if (coloresNuevos.length === 0) {
      // Producto sin colores → uno solo, queda elegido.
      const p = addProducto(base)
      setFamiliaActiva(null)
      setF((s) => ({ ...s, productoId: p.id }))
    } else {
      // Con colores → creamos una variante por color ("Base Color") y abrimos
      // la ventana para elegir cuál corresponde a esta venta.
      const items = coloresNuevos.map((c) => {
        const p = addProducto(`${base} ${c}`)
        return { ...p, color: c }
      })
      setFamiliaActiva({ base, items })
      setF((s) => ({ ...s, productoId: '' }))
      setModalColor(true)
    }
    setNuevoProd(false)
    setNombreProd('')
    setColoresNuevos([])
    setColorInput('')
  }

  function guardar(e) {
    e.preventDefault()
    if (!f.vendedorId || !f.productoId || num(f.precio) <= 0) return
    addVenta({
      ...f,
      precio: num(f.precio),
      montoDelivery: num(f.montoDelivery),
    })
    localStorage.setItem(ULTIMO_VENDEDOR, f.vendedorId)
    setF(VACIO(f.vendedorId))
    setFamiliaActiva(null)
    setOk(true)
    setTimeout(() => setOk(false), 2500)
    onGuardado?.()
  }

  const valido = f.vendedorId && f.cliente.trim() && f.productoId && num(f.precio) > 0

  return (
    <Card>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xl">🧾</span>
        <h2 className="font-bold">Cargar venta</h2>
      </div>

      <form onSubmit={guardar} className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {/* Vendedor */}
        <div className="md:col-span-2">
          <Label>Vendedor</Label>
          {nuevoVend ? (
            <div className="flex gap-2">
              <Input
                autoFocus
                value={nombreVend}
                onChange={(e) => setNombreVend(e.target.value)}
                placeholder="Nombre del nuevo vendedor"
                autoCapitalize="words"
                autoCorrect="off"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    crearVendedor()
                  }
                }}
              />
              <Button type="button" onClick={crearVendedor}>
                ➕ Agregar
              </Button>
              <Button type="button" variant="ghost" onClick={() => setNuevoVend(false)}>
                ✕
              </Button>
            </div>
          ) : (
            <Select value={f.vendedorId} onChange={elegirVendedor}>
              <option value="">— ¿Quién hace esta venta? —</option>
              {vendedores.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nombre}
                </option>
              ))}
              <option value="__nuevo__">➕ Agregar vendedor…</option>
            </Select>
          )}
        </div>

        {/* Cliente */}
        <div className="md:col-span-2">
          <Label>Cliente</Label>
          <Input
            value={f.cliente}
            onChange={set('cliente')}
            placeholder="Nombre del cliente"
            autoCapitalize="words"
            autoCorrect="off"
          />
        </div>

        {/* Producto */}
        <div className="md:col-span-2">
          <Label>Producto</Label>
          {nuevoProd ? (
            <div className="rounded-xl border border-slate-200 p-3 space-y-2.5">
              <Input
                autoFocus
                value={nombreProd}
                onChange={(e) => setNombreProd(e.target.value)}
                placeholder="Nombre base (ej: Protector 17 Air)"
                autoCapitalize="words"
              />
              <div>
                <div className="text-[11px] font-bold uppercase text-slate-400 mb-1">
                  Colores (opcional)
                </div>
                <div className="flex gap-2">
                  <Input
                    value={colorInput}
                    onChange={(e) => setColorInput(e.target.value)}
                    placeholder="Ej: Azul"
                    autoCapitalize="words"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        agregarColor()
                      }
                    }}
                  />
                  <Button type="button" variant="outline" onClick={agregarColor}>
                    + Color
                  </Button>
                </div>
                {coloresNuevos.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {coloresNuevos.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() =>
                          setColoresNuevos((s) => s.filter((x) => x !== c))
                        }
                        className="rounded-full bg-fono-light text-fono text-xs font-bold px-2.5 py-1 hover:bg-red-100 hover:text-bad transition"
                        title="Quitar"
                      >
                        {c} ✕
                      </button>
                    ))}
                  </div>
                )}
                <p className="text-[11px] text-slate-400 mt-1">
                  Sin colores: se crea un solo producto. Con colores: se crea una variante por
                  color y vas a elegir cuál en cada venta.
                </p>
              </div>
              <div className="flex gap-2">
                <Button type="button" onClick={crearProducto} className="flex-1">
                  ➕ Crear {coloresNuevos.length > 0 ? `(${coloresNuevos.length} colores)` : ''}
                </Button>
                <Button type="button" variant="ghost" onClick={cancelarNuevoProd}>
                  ✕
                </Button>
              </div>
            </div>
          ) : (
            <>
              <Select value={valorSelect} onChange={elegirProducto}>
                <option value="">— Seleccionar producto —</option>
                {familias.map((fam) =>
                  fam.items.length > 1 ? (
                    <option key={fam.base} value={'fam:' + fam.base}>
                      🎨 {fam.base} · {fam.items.length} colores
                    </option>
                  ) : (
                    <option key={fam.items[0].id} value={fam.items[0].id}>
                      {fam.items[0].nombre}
                    </option>
                  ),
                )}
                <option value="__nuevo__">➕ Agregar otro producto…</option>
              </Select>
              {familiaActiva && (
                <div className="flex items-center gap-2 mt-2">
                  {itemActivo ? (
                    <Badge color="green">🎨 {itemActivo.color || itemActivo.nombre}</Badge>
                  ) : (
                    <Badge color="orange">Elegí un color</Badge>
                  )}
                  <button
                    type="button"
                    onClick={() => setModalColor(true)}
                    className="text-xs font-bold text-fono hover:underline"
                  >
                    Cambiar color
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Estado de pago */}
        <div>
          <Label>Estado de pago</Label>
          <Select value={f.estadoPago} onChange={set('estadoPago')}>
            {ESTADOS_PAGO.map((x) => (
              <option key={x} value={x}>
                {x === 'Pagado' ? '✅ Pagado' : '⏳ No pagado'}
              </option>
            ))}
          </Select>
        </div>

        {/* Fecha */}
        <div>
          <Label>Fecha</Label>
          <Input type="date" value={f.fecha} onChange={set('fecha')} />
        </div>

        {/* Precio */}
        <div>
          <Label>Precio (₲)</Label>
          <Input
            inputMode="numeric"
            value={f.precio}
            onChange={set('precio')}
            placeholder="Ej: 110000"
          />
        </div>

        {/* Medio de pago */}
        <div>
          <Label>Medio de pago</Label>
          <Select value={f.medioPago} onChange={set('medioPago')}>
            {MEDIOS_PAGO.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </Select>
        </div>

        {/* Entrega + monto envío */}
        <div>
          <Label>Entrega</Label>
          <Select value={f.entrega} onChange={set('entrega')}>
            {ENTREGA.map((x) => (
              <option key={x} value={x}>
                {x === 'Delivery'
                  ? '🛵 Delivery'
                  : x === 'Encomienda'
                    ? '📦 Envío por encomienda'
                    : '🏬 Retiro en tienda'}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>
            {f.entrega === 'Encomienda' ? 'Costo de la encomienda (₲)' : 'Monto del delivery (₲)'}
          </Label>
          <Input
            inputMode="numeric"
            value={f.montoDelivery}
            onChange={set('montoDelivery')}
            placeholder="0 si retira en tienda"
            disabled={f.entrega === 'Retiro en tienda'}
          />
        </div>

        {/* Observación */}
        <div className="md:col-span-2">
          <Label>Observación</Label>
          <Textarea
            rows={2}
            value={f.observacion}
            onChange={set('observacion')}
            placeholder="Notas, color, envío vía encomienda, etc."
            autoCapitalize="sentences"
          />
        </div>

        <div className="md:col-span-2 flex items-center gap-3">
          <Button type="submit" variant="success" disabled={!valido} className="flex-1">
            💾 Guardar venta {num(f.precio) > 0 ? `· ${gs(f.precio)}` : ''}
          </Button>
          {ok && (
            <span className="text-ok font-bold text-sm whitespace-nowrap">
              ✅ ¡Guardada!
            </span>
          )}
        </div>
      </form>

      {modalColor && familiaActiva && (
        <SelectorColor
          base={familiaActiva.base}
          items={familiaActiva.items}
          onPick={elegirColor}
          onCancel={() => setModalColor(false)}
        />
      )}
    </Card>
  )
}
