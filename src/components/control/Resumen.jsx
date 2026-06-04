import { useState } from 'react'
import { listVentas, getVendedores, productosById } from '@/lib/storage'
import {
  totalesTienda,
  totalesVendedor,
  semaforo,
  ventasDelDia,
  comisionDeVentas,
  fechaClave,
  num,
  gs,
} from '@/utils/calculos'
import ListaVentasDia from '@/components/ventas/ListaVentasDia'
import { Card, Badge, Input, Button } from '@/components/ui'

export default function Resumen() {
  const ventas = listVentas()
  const [fecha, setFecha] = useState(fechaClave())
  const totalDia = ventasDelDia(ventas, fecha).reduce((a, v) => a + num(v.precio), 0)
  const tienda = totalesTienda(ventas)
  const sem = semaforo(tienda.hoy, tienda.ayer)
  const vendedores = getVendedores()
  const prods = productosById()
  const vendedoresById = Object.fromEntries(vendedores.map((v) => [v.id, v.nombre]))

  const verde = sem.estado === 'verde'
  const rojo = sem.estado === 'rojo'

  return (
    <div className="space-y-4">
      {/* Semáforo total de la tienda */}
      <Card
        className={
          verde
            ? 'bg-emerald-50 border-emerald-300'
            : rojo
              ? 'bg-red-50 border-red-300'
              : 'bg-white'
        }
      >
        <div className="flex items-center gap-3">
          <div className="text-4xl">{verde ? '🟢' : rojo ? '🔴' : '⚪'}</div>
          <div className="flex-1">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Tienda · hoy vs ayer
            </div>
            <div className="text-3xl font-extrabold tracking-tight">{gs(tienda.hoy)}</div>
            <div className="text-sm text-slate-500">
              {sem.meta > 0
                ? verde
                  ? `🎉 ¡Superaron la meta de ayer (${gs(sem.meta)})!`
                  : `Faltan ${gs(sem.falta)} para igualar ayer (${gs(sem.meta)})`
                : 'Sin referencia de ayer todavía'}
            </div>
          </div>
        </div>
      </Card>

      {/* Totales */}
      <div className="grid grid-cols-3 gap-3">
        {[
          ['Hoy', tienda.hoy],
          ['Esta semana', tienda.semana],
          ['Este mes', tienda.mes],
        ].map(([label, valor]) => (
          <Card key={label} className="text-center">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
              {label}
            </div>
            <div className="text-lg md:text-2xl font-extrabold text-fono mt-1">
              {gs(valor)}
            </div>
          </Card>
        ))}
      </div>

      {/* Por vendedor */}
      <Card>
        <h2 className="font-bold mb-3">🧑‍💼 Por vendedor (hoy)</h2>
        <div className="space-y-2">
          {vendedores.map((v) => {
            const t = totalesVendedor(ventas, v.id)
            const s = semaforo(t.hoy, t.ayer)
            const com = comisionDeVentas(ventasDelDia(ventas, fechaClave(), v.id), prods)
            return (
              <div
                key={v.id}
                className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5"
              >
                <div className="flex items-center gap-2">
                  <span>{s.estado === 'verde' ? '🟢' : s.estado === 'rojo' ? '🔴' : '⚪'}</span>
                  <span className="font-semibold text-sm">{v.nombre}</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="font-bold text-fono">{gs(t.hoy)}</span>
                  <Badge color="blue">Comisión {gs(com)}</Badge>
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      {/* Selector de fecha para ver ventas de otros días */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">📅 Ver ventas del día:</span>
            <Input
              type="date"
              value={fecha}
              max={fechaClave()}
              onChange={(e) => setFecha(e.target.value)}
              className="w-auto h-9"
            />
            {fecha !== fechaClave() && (
              <Button
                variant="ghost"
                className="h-9 px-3 text-xs"
                onClick={() => setFecha(fechaClave())}
              >
                Hoy
              </Button>
            )}
          </div>
          <div className="text-sm text-slate-500">
            Total del día: <span className="font-bold text-fono">{gs(totalDia)}</span>
          </div>
        </div>
      </Card>

      {/* Ventas del día seleccionado */}
      <ListaVentasDia fecha={fecha} mostrarVendedor vendedoresById={vendedoresById} />
    </div>
  )
}
