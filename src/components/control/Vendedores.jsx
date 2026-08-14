import { useState } from 'react'
import {
  getVendedores,
  addVendedor,
  updateVendedor,
  deleteVendedor,
  listVentas,
  productosById,
} from '@/lib/storage'
import {
  totalesVendedor,
  ventasDelDia,
  comisionDeVentas,
  fechaClave,
  num,
  gs,
} from '@/utils/calculos'
import { Card, Button, Input, Badge } from '@/components/ui'
import Icon from '@/components/shared/Icon'

const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]
// 'YYYY-MM' 'Julio 2026'
function mesLabel(clave) {
  const [y, m] = (clave || '').split('-')
  return `${MESES[Number(m) - 1] || m} ${y}`
}

export default function Vendedores() {
  const vendedores = getVendedores()
  const ventas = listVentas()
  const prods = productosById()
  const [nuevo, setNuevo] = useState('')

  // Nombres por id (incluye vendedores ya eliminados que tienen ventas viejas).
  const nombreById = Object.fromEntries(vendedores.map((v) => [v.id, v.nombre]))

  // Agrupa ventas por mes y vendedor: { 'YYYY-MM': { vendedorId: [ventas] } }.
  const porMes = {}
  ventas.forEach((v) => {
    const mes = (v.fecha || '').slice(0, 7)
    if (!mes) return
    const vid = v.vendedorId || 'sin'
    if (!porMes[mes]) porMes[mes] = {}
    if (!porMes[mes][vid]) porMes[mes][vid] = []
    porMes[mes][vid].push(v)
  })
  const meses = Object.keys(porMes).sort().reverse()

  // Meses desplegados (abierto el más reciente por defecto).
  const [abiertos, setAbiertos] = useState(() => new Set(meses.slice(0, 1)))
  function toggleMes(mes) {
    setAbiertos((prev) => {
      const s = new Set(prev)
      s.has(mes) ? s.delete(mes) : s.add(mes)
      return s
    })
  }

  function crear(e) {
    e.preventDefault()
    const nombre = nuevo.trim()
    if (!nombre) return
    addVendedor(nombre)
    setNuevo('')
  }

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="font-bold mb-1">‍ Funcionarios y metas</h2>
        <p className="text-sm text-mute mb-4">
          Fijá la <strong>meta diaria</strong> de cada vendedor y agregá nuevos cuando contrates. La
          meta se guarda al salir del campo.
        </p>
        <form onSubmit={crear} className="flex gap-2 mb-4">
          <Input
            value={nuevo}
            onChange={(e) => setNuevo(e.target.value)}
            placeholder="Nombre del nuevo vendedor"
            autoCapitalize="words"
          />
          <Button type="submit">Agregar</Button>
        </form>

        <div className="space-y-2.5">
          {vendedores.map((v) => {
            const t = totalesVendedor(ventas, v.id)
            const com = comisionDeVentas(ventasDelDia(ventas, fechaClave(), v.id), prods)
            return (
              <div key={v.id} className="rounded-xl border border-ink-600 p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <input
                    defaultValue={v.nombre}
                    onBlur={(e) =>
                      updateVendedor(v.id, { nombre: e.target.value.trim() || v.nombre })
                    }
                    className="font-bold text-sm bg-transparent outline-none border-b border-transparent focus:border-fono"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => updateVendedor(v.id, { activo: !v.activo })}
                      className="text-xs"
                      title={v.activo ? 'Desactivar' : 'Activar'}
                    >
                      {v.activo ? (
                        <Badge color="green">Activo</Badge>
                      ) : (
                        <Badge color="slate">Inactivo</Badge>
                      )}
                    </button>
                    <button
                      onClick={() => {
                        if (
                          confirm(
                            `¿Eliminar a "${v.nombre}"? Las ventas que ya cargó se mantienen.`,
                          )
                        )
                          deleteVendedor(v.id)
                      }}
                      className="text-ink-500 hover:text-bad text-sm transition"
                      title="Eliminar vendedor"
                    >
                      <Icon name="trash" className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
                  <label className="block col-span-2 md:col-span-1">
                    <span className="text-[10px] font-bold uppercase text-mute">Meta diaria ₲</span>
                    <Input
                      inputMode="numeric"
                      defaultValue={v.metaDiaria || ''}
                      onBlur={(e) => updateVendedor(v.id, { metaDiaria: num(e.target.value) })}
                      placeholder="0"
                    />
                  </label>
                  <Mini label="Hoy" valor={t.hoy} />
                  <Mini label="Comisión hoy" valor={com} />
                  <Mini label="Mes" valor={t.mes} />
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      {/* Historial mensual por vendedor */}
      {meses.length > 0 && (
        <Card>
          <h2 className="font-bold mb-1">Historial mensual por vendedor</h2>
          <p className="text-sm text-mute mb-4">
            Cuánto vendió cada uno y su <strong>comisión total</strong> en cada mes.
          </p>
          <div className="space-y-4">
            {meses.map((mes) => {
              const filas = Object.entries(porMes[mes])
                .map(([vid, lista]) => ({
                  vid,
                  nombre: nombreById[vid] || 'Sin vendedor',
                  total: lista.reduce((a, x) => a + num(x.precio), 0),
                  com: comisionDeVentas(lista, prods),
                  cant: lista.length,
                }))
                .sort((a, b) => b.total - a.total)
              const totalMes = filas.reduce((a, f) => a + f.total, 0)
              const comMes = filas.reduce((a, f) => a + f.com, 0)

              const abierto = abiertos.has(mes)
              return (
                <div key={mes} className="rounded-xl border border-ink-600 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleMes(mes)}
                    className="w-full flex items-center justify-between gap-2 bg-ink-700 px-4 py-2.5 hover:bg-ink-700 transition text-left"
                  >
                    <span className="flex items-center gap-2 font-bold text-sm capitalize">
                      <span className="text-mute text-xs">{abierto ? '▼' : '▶'}</span>
                      {mesLabel(mes)}
                    </span>
                    <div className="flex items-center gap-2 text-xs">
                      <Badge color="blue">Vendido {gs(totalMes)}</Badge>
                      <Badge color="green">Comisión {gs(comMes)}</Badge>
                    </div>
                  </button>
                  {abierto && (
                    <div className="divide-y divide-ink-600 border-t border-ink-600">
                      {filas.map((f) => (
                        <div
                          key={f.vid}
                          className="flex items-center justify-between gap-2 px-4 py-2.5"
                        >
                          <div className="min-w-0">
                            <div className="font-semibold text-sm truncate">{f.nombre}</div>
                            <div className="text-xs text-mute">
                              {f.cant} {f.cant === 1 ? 'venta' : 'ventas'}
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0 text-sm">
                            <span className="font-bold text-fono">{gs(f.total)}</span>
                            <Badge color="green">Comisión {gs(f.com)}</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Card>
      )}
    </div>
  )
}

function Mini({ label, valor }) {
  return (
    <div className="text-center rounded-lg bg-ink-700 py-2">
      <div className="text-[10px] font-bold uppercase text-mute">{label}</div>
      <div className="text-sm font-bold text-fono">{gs(valor)}</div>
    </div>
  )
}
