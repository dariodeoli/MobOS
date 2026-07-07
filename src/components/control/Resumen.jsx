import { useState } from 'react'
import { listVentas, getVendedores, productosById } from '@/lib/storage'
import {
  totalesTienda,
  semaforo,
  ventasDelDia,
  comisionDeVentas,
  fechaClave,
  num,
  gs,
} from '@/utils/calculos'
import ListaVentasDia from '@/components/ventas/ListaVentasDia'
import { Card, Badge, Input, Button } from '@/components/ui'

// 'YYYY-MM-DD' → 'DD/MM/YYYY'
function fmtFecha(clave) {
  const [y, m, d] = (clave || '').split('-')
  return d && m && y ? `${d}/${m}/${y}` : clave
}

export default function Resumen() {
  const ventas = listVentas()
  const [fecha, setFecha] = useState(fechaClave())
  const esHoy = fecha === fechaClave()
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

      {/* Selector de fecha: controla el resumen por vendedor y la lista de abajo */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">📅 Ver resumen del día:</span>
            <Input
              type="date"
              value={fecha}
              max={fechaClave()}
              onChange={(e) => setFecha(e.target.value)}
              className="w-auto h-9"
            />
            {!esHoy && (
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

      {/* Por vendedor (del día seleccionado) */}
      <Card>
        <h2 className="font-bold mb-3">
          🧑‍💼 Por vendedor · {esHoy ? 'hoy' : fmtFecha(fecha)}
        </h2>
        <div className="space-y-2">
          {vendedores.map((v) => {
            const vventas = ventasDelDia(ventas, fecha, v.id)
            const totalV = vventas.reduce((a, x) => a + num(x.precio), 0)
            const com = comisionDeVentas(vventas, prods)
            return (
              <div
                key={v.id}
                className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5"
              >
                <div className="flex items-center gap-2">
                  <span>{totalV > 0 ? '🟢' : '⚪'}</span>
                  <span className="font-semibold text-sm">{v.nombre}</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="font-bold text-fono">{gs(totalV)}</span>
                  <Badge color="blue">Comisión {gs(com)}</Badge>
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      {/* Ventas del día seleccionado */}
      <ListaVentasDia fecha={fecha} mostrarVendedor vendedoresById={vendedoresById} />
    </div>
  )
}
