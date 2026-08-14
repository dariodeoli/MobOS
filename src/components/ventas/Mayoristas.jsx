import { useMemo, useState } from 'react'
import {
  getProductos,
  listMayoristas,
  addMayorista,
  deleteMayorista,
  listVentasMay,
  addVentaMayorista,
  deleteVentaMay,
  updateVentaMay,
  MEDIOS_PAGO,
  ESTADOS_PAGO,
} from '@/lib/storage'
import { fechaClave, num, gs } from '@/utils/calculos'
import SelectorMedioPago from '@/components/shared/SelectorMedioPago'
import MedioPago from '@/components/shared/MedioPago'
import Icon from '@/components/shared/Icon'
import { Button, Input, Label, Select, Dot } from '@/components/ui'
import { cn } from '@/lib/utils'

// Montos en ₲: solo dígitos, para que "20.000" no se lea como 20.
const gsNum = (v) => Number(String(v ?? '').replace(/[^\d]/g, '')) || 0
const nuevaKey = () => Math.random().toString(36).slice(2)

function Caja({ titulo, extra, children, className }) {
  return (
    <div className={cn('rounded-xl border border-fono/30 bg-ink-800', className)}>
      {titulo && (
        <div className="flex items-center justify-between gap-2 border-b border-fono/20 px-5 py-3.5">
          <span className="font-semibold">{titulo}</span>
          {extra}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  )
}

const FORM_VACIO = () => ({
  mayoristaId: '',
  medioPago: MEDIOS_PAGO[0],
  estadoPago: 'No pagado',
  observacion: '',
  fecha: fechaClave(),
})

export default function Mayoristas() {
  const productos = getProductos().filter((p) => p.activo)
  const mayoristas = listMayoristas()
  const ventas = listVentasMay()

  const [f, setF] = useState(FORM_VACIO)
  const [lineas, setLineas] = useState([{ key: nuevaKey(), productoId: '', cantidad: '', precioUnit: '' }])
  const [nuevoMay, setNuevoMay] = useState(false)
  const [nm, setNm] = useState({ nombre: '', ruc: '', contacto: '', tel: '' })
  const [aviso, setAviso] = useState('')
  const [error, setError] = useState('')
  const [confirmar, setConfirmar] = useState(null)

  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  const mayById = useMemo(
    () => Object.fromEntries(mayoristas.map((m) => [m.id, m])),
    [mayoristas],
  )

  // Al elegir producto, propone el precio mayorista cargado en Inventario.
  function setLinea(key, campo, valor) {
    setLineas((ls) =>
      ls.map((l) => {
        if (l.key !== key) return l
        const next = { ...l, [campo]: valor }
        if (campo === 'productoId') {
          const p = productos.find((x) => x.id === valor)
          const sugerido = num(p?.precioMayorista) || num(p?.precioVenta)
          next.precioUnit = sugerido > 0 ? String(sugerido) : ''
        }
        return next
      }),
    )
  }
  const agregarLinea = () =>
    setLineas((ls) => [...ls, { key: nuevaKey(), productoId: '', cantidad: '', precioUnit: '' }])
  const quitarLinea = (key) =>
    setLineas((ls) => (ls.length === 1 ? ls : ls.filter((l) => l.key !== key)))

  const total = lineas.reduce((a, l) => a + num(l.cantidad) * gsNum(l.precioUnit), 0)
  const unidades = lineas.reduce((a, l) => a + num(l.cantidad), 0)

  function crearMayorista() {
    const nombre = nm.nombre.trim()
    if (!nombre) return
    const m = addMayorista(nm)
    setF((s) => ({ ...s, mayoristaId: m.id }))
    setNm({ nombre: '', ruc: '', contacto: '', tel: '' })
    setNuevoMay(false)
  }

  function guardar(e) {
    e.preventDefault()
    setError('')
    if (!f.mayoristaId) return setError('Elegí el mayorista.')
    const validas = lineas.filter((l) => l.productoId && num(l.cantidad) > 0 && gsNum(l.precioUnit) > 0)
    if (!validas.length) return setError('Cargá al menos un producto con cantidad y precio.')

    // Aviso (no bloquea) si algún producto queda con stock negativo.
    const sinStock = validas
      .map((l) => ({ p: productos.find((x) => x.id === l.productoId), c: num(l.cantidad) }))
      .filter((x) => x.p && num(x.p.stock) < x.c)

    addVentaMayorista({
      mayoristaId: f.mayoristaId,
      lineas: validas.map((l) => ({
        productoId: l.productoId,
        cantidad: num(l.cantidad),
        precioUnit: gsNum(l.precioUnit),
      })),
      medioPago: f.medioPago,
      estadoPago: f.estadoPago,
      observacion: f.observacion,
      fecha: f.fecha,
    })

    setLineas([{ key: nuevaKey(), productoId: '', cantidad: '', precioUnit: '' }])
    setF((s) => ({ ...FORM_VACIO(), mayoristaId: s.mayoristaId }))
    setAviso(
      sinStock.length
        ? `Venta guardada. Ojo: ${sinStock.map((x) => x.p.nombre).join(', ')} quedó con stock negativo.`
        : 'Venta mayorista guardada y stock descontado.',
    )
    setTimeout(() => setAviso(''), 5000)
  }

  const totalVendido = ventas.reduce((a, v) => a + num(v.total), 0)
  const pendiente = ventas.filter((v) => v.estadoPago !== 'Pagado').reduce((a, v) => a + num(v.total), 0)

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]">
      {/* ── Carga de venta mayorista ─────────────────────────────── */}
      <div className="flex min-w-0 flex-col gap-5">
        <Caja titulo="Nueva venta mayorista">
          <form onSubmit={guardar} className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label>Mayorista</Label>
                {nuevoMay ? (
                  <div className="space-y-2 rounded-lg border border-ink-500 p-3">
                    <Input
                      autoFocus
                      value={nm.nombre}
                      onChange={(e) => setNm((s) => ({ ...s, nombre: e.target.value }))}
                      placeholder="Nombre del comercio"
                      autoCapitalize="words"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        value={nm.ruc}
                        onChange={(e) => setNm((s) => ({ ...s, ruc: e.target.value }))}
                        placeholder="RUC"
                      />
                      <Input
                        value={nm.tel}
                        onChange={(e) => setNm((s) => ({ ...s, tel: e.target.value }))}
                        placeholder="Teléfono"
                        inputMode="tel"
                      />
                    </div>
                    <Input
                      value={nm.contacto}
                      onChange={(e) => setNm((s) => ({ ...s, contacto: e.target.value }))}
                      placeholder="Persona de contacto"
                      autoCapitalize="words"
                    />
                    <div className="flex gap-2">
                      <Button type="button" onClick={crearMayorista} className="flex-1">
                        Agregar
                      </Button>
                      <Button type="button" variant="ghost" onClick={() => setNuevoMay(false)}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Select
                    value={f.mayoristaId}
                    onChange={(e) =>
                      e.target.value === '__nuevo__'
                        ? setNuevoMay(true)
                        : setF((s) => ({ ...s, mayoristaId: e.target.value }))
                    }
                  >
                    <option value="">— Elegir mayorista —</option>
                    {mayoristas.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.nombre}
                      </option>
                    ))}
                    <option value="__nuevo__">+ Agregar mayorista…</option>
                  </Select>
                )}
              </div>
              <div>
                <Label>Fecha</Label>
                <Input type="date" value={f.fecha} max={fechaClave()} onChange={set('fecha')} />
              </div>
            </div>

            {/* Líneas de producto */}
            <div>
              <Label>Productos</Label>
              <div className="space-y-2">
                {lineas.map((l) => {
                  const p = productos.find((x) => x.id === l.productoId)
                  const stock = num(p?.stock)
                  const falta = p && num(l.cantidad) > stock
                  return (
                    <div key={l.key} className="grid gap-2 sm:grid-cols-[1fr_5rem_8rem_auto]">
                      <Select
                        value={l.productoId}
                        onChange={(e) => setLinea(l.key, 'productoId', e.target.value)}
                      >
                        <option value="">— Producto —</option>
                        {productos.map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.nombre} (stock {num(x.stock)})
                          </option>
                        ))}
                      </Select>
                      <Input
                        inputMode="numeric"
                        value={l.cantidad}
                        onChange={(e) => setLinea(l.key, 'cantidad', e.target.value)}
                        placeholder="Cant."
                        className={cn(falta && 'border-warn')}
                      />
                      <Input
                        inputMode="numeric"
                        value={l.precioUnit}
                        onChange={(e) => setLinea(l.key, 'precioUnit', e.target.value)}
                        placeholder="Precio u."
                      />
                      <button
                        type="button"
                        onClick={() => quitarLinea(l.key)}
                        className="rounded-lg px-2 text-mute transition hover:text-bad disabled:opacity-30"
                        disabled={lineas.length === 1}
                        title="Quitar"
                      >
                        <Icon name="trash" className="h-4 w-4" />
                      </button>
                    </div>
                  )
                })}
              </div>
              <button
                type="button"
                onClick={agregarLinea}
                className="mt-2 inline-flex items-center gap-1.5 text-sm text-fono-light transition hover:text-white"
              >
                <Icon name="plus" className="h-4 w-4" /> Agregar producto
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <Label>Medio de pago</Label>
                <SelectorMedioPago
                  value={f.medioPago}
                  onChange={(v) => setF((s) => ({ ...s, medioPago: v }))}
                />
              </div>
              <div>
                <Label>Estado</Label>
                <Select value={f.estadoPago} onChange={set('estadoPago')}>
                  {ESTADOS_PAGO.map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Observación</Label>
                <Input
                  value={f.observacion}
                  onChange={set('observacion')}
                  placeholder="Nota del pedido"
                />
              </div>
            </div>

            {error && <p className="text-sm text-bad">{error}</p>}
            {aviso && <p className="text-sm text-ok">{aviso}</p>}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-600 pt-4">
              <div className="text-sm text-mute">
                {unidades} {unidades === 1 ? 'unidad' : 'unidades'} ·{' '}
                <span className="text-lg font-semibold text-white">{gs(total)}</span>
              </div>
              <Button type="submit" variant="success" disabled={total <= 0 || !f.mayoristaId}>
                Guardar venta mayorista
              </Button>
            </div>
          </form>
        </Caja>

        {/* ── Historial ──────────────────────────────────────────── */}
        <Caja
          titulo="Ventas mayoristas"
          extra={
            <div className="flex items-center gap-3 text-sm">
              <span className="text-mute">{ventas.length}</span>
              <span className="font-semibold">{gs(totalVendido)}</span>
            </div>
          }
          className="p-0"
        >
          {ventas.length === 0 ? (
            <div className="py-10 text-center">
              <Icon name="store" className="mx-auto mb-3 h-8 w-8 text-ink-500" />
              <p className="text-sm text-mute">Todavía no cargaste ventas mayoristas.</p>
            </div>
          ) : (
            <div className="-m-5 divide-y divide-ink-600">
              {ventas.map((v) => {
                const may = mayById[v.mayoristaId]
                const pagado = v.estadoPago === 'Pagado'
                return (
                  <div key={v.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Dot color={pagado ? 'green' : 'red'} />
                          <span className="truncate font-medium">
                            {may?.nombre || 'Mayorista eliminado'}
                          </span>
                          <span className="rounded border border-ink-500 px-1.5 py-0.5 text-[11px] text-mute">
                            {v.codigo}
                          </span>
                        </div>
                        <div className="mt-1 pl-4 text-xs text-mute">
                          {v.fecha.split('-').reverse().join('/')} · {v.unidades} unidades
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="font-semibold">{gs(v.total)}</div>
                          <button
                            onClick={() =>
                              updateVentaMay(v.id, {
                                estadoPago: pagado ? 'No pagado' : 'Pagado',
                              })
                            }
                            className={cn(
                              'text-xs transition hover:underline',
                              pagado ? 'text-ok' : 'text-bad',
                            )}
                            title="Cambiar estado"
                          >
                            {pagado ? 'Pagado' : 'No pagado'}
                          </button>
                        </div>
                        <button
                          onClick={() => setConfirmar(v)}
                          className="rounded-lg p-1.5 text-mute transition hover:text-bad"
                          title="Eliminar y reponer stock"
                        >
                          <Icon name="trash" className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    <div className="mt-2 space-y-1 pl-4">
                      {(v.lineas || []).map((l, i) => (
                        <div key={i} className="flex justify-between gap-3 text-sm text-mute">
                          <span className="truncate">
                            {l.cantidad}× {l.nombre}
                          </span>
                          <span className="shrink-0">{gs(l.cantidad * l.precioUnit)}</span>
                        </div>
                      ))}
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2 pl-4">
                      <MedioPago medio={v.medioPago} alto="h-4" />
                      {v.observacion && (
                        <span className="text-xs italic text-mute">{v.observacion}</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Caja>
      </div>

      {/* ── Lateral ──────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4">
        <Caja titulo="Resumen">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-mute">Total vendido</span>
              <span className="font-semibold">{gs(totalVendido)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-mute">Por cobrar</span>
              <span className={cn('font-semibold', pendiente > 0 ? 'text-bad' : 'text-ok')}>
                {gs(pendiente)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-mute">Mayoristas</span>
              <span className="font-semibold">{mayoristas.length}</span>
            </div>
          </div>
        </Caja>

        <Caja titulo="Clientes mayoristas">
          {mayoristas.length === 0 ? (
            <p className="py-4 text-center text-sm text-mute">
              Agregá el primero desde el formulario.
            </p>
          ) : (
            <div className="space-y-2.5">
              {mayoristas.map((m) => {
                const suyas = ventas.filter((v) => v.mayoristaId === m.id)
                const suTotal = suyas.reduce((a, v) => a + num(v.total), 0)
                return (
                  <div
                    key={m.id}
                    className="group flex items-start justify-between gap-2 rounded-lg border border-ink-600 p-3"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{m.nombre}</div>
                      <div className="mt-0.5 space-y-0.5 text-[11px] text-mute">
                        {m.ruc && <div>RUC {m.ruc}</div>}
                        {m.contacto && <div>{m.contacto}</div>}
                        {m.tel && <div>{m.tel}</div>}
                      </div>
                      <div className="mt-1 text-xs text-fono-light">
                        {suyas.length} compras · {gs(suTotal)}
                      </div>
                    </div>
                    <button
                      onClick={() => setConfirmar({ mayorista: m })}
                      className="rounded p-1 text-mute opacity-0 transition group-hover:opacity-100 hover:text-bad"
                      title="Eliminar mayorista"
                    >
                      <Icon name="trash" className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </Caja>

        <Caja titulo="Stock bajo">
          {(() => {
            const bajos = productos
              .filter((p) => num(p.stock) <= 3)
              .sort((a, b) => num(a.stock) - num(b.stock))
              .slice(0, 8)
            return bajos.length === 0 ? (
              <p className="py-4 text-center text-sm text-mute">Todo con stock suficiente.</p>
            ) : (
              <div className="space-y-2">
                {bajos.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate">{p.nombre}</span>
                    <span
                      className={cn(
                        'shrink-0 rounded px-1.5 py-0.5 text-xs font-medium',
                        num(p.stock) <= 0 ? 'bg-bad/15 text-bad' : 'bg-warn/15 text-warn',
                      )}
                    >
                      {num(p.stock)}
                    </span>
                  </div>
                ))}
              </div>
            )
          })()}
        </Caja>
      </div>

      {/* ── Confirmación ─────────────────────────────────────────── */}
      {confirmar && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setConfirmar(null)}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-fono/30 bg-ink-800 p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <Icon name="alert" className="mx-auto mb-2 h-7 w-7 text-warn" />
            <p className="mb-4 text-center text-sm">
              {confirmar.mayorista
                ? `¿Eliminar a "${confirmar.mayorista.nombre}"? Sus ventas quedan en el historial.`
                : `¿Eliminar ${confirmar.codigo}? Se repone el stock de los productos.`}
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={() => setConfirmar(null)}>
                Cancelar
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                onClick={() => {
                  if (confirmar.mayorista) deleteMayorista(confirmar.mayorista.id)
                  else deleteVentaMay(confirmar.id)
                  setConfirmar(null)
                }}
              >
                Eliminar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
