import { listVentas, productosById, deleteVenta } from '@/lib/storage'
import { useSesion } from '@/lib/sesion'
import { ventasDelDia, fechaClave, gs } from '@/utils/calculos'
import { Card, Badge, Button } from '@/components/ui'

// 'YYYY-MM-DD' → 'DD/MM/YYYY' (sin problemas de zona horaria).
function fmtFecha(clave) {
  const [y, m, d] = (clave || '').split('-')
  return d && m && y ? `${d}/${m}/${y}` : clave
}

// Agrupa las ventas por compra (compraId). Las ventas sueltas (sin compraId)
// quedan como un grupo de 1. Preserva el orden de aparición.
function agruparCompras(ventas) {
  const grupos = []
  const idx = new Map()
  ventas.forEach((v) => {
    const key = v.compraId || v.id
    if (!idx.has(key)) {
      idx.set(key, grupos.length)
      grupos.push({ key, items: [v] })
    } else {
      grupos[idx.get(key)].items.push(v)
    }
  })
  return grupos
}

export default function ListaVentasDia({
  vendedorId,
  mostrarVendedor = false,
  vendedoresById = {},
  fecha = fechaClave(),
}) {
  const { sesion } = useSesion()
  const puedeBorrar = !!sesion?.esPropietario
  const prods = productosById()
  const ventas = ventasDelDia(listVentas(), fecha, vendedorId)
  const grupos = agruparCompras(ventas)
  const esHoy = fecha === fechaClave()
  const titulo = esHoy ? '📋 Ventas de hoy' : `📋 Ventas del ${fmtFecha(fecha)}`

  if (!ventas.length) {
    return (
      <Card className="text-center text-slate-400 py-10">
        <div className="text-4xl mb-2">🧾</div>
        <p className="text-sm">
          {esHoy ? 'Todavía no hay ventas cargadas hoy.' : `No hubo ventas el ${fmtFecha(fecha)}.`}
        </p>
      </Card>
    )
  }

  return (
    <Card className="p-0 overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-slate-100">
        <h2 className="font-bold">{titulo}</h2>
        <Badge color="blue">{ventas.length} ventas</Badge>
      </div>

      {/* Lista en tarjetas (móvil) */}
      <div className="md:hidden divide-y divide-slate-100">
        {grupos.map((g) => {
          const v = g.items[0] // cabecera: datos compartidos de la compra
          const total = g.items.reduce((a, x) => a + (x.precio || 0), 0)
          const varios = g.items.length > 1
          return (
            <div key={g.key} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-bold text-sm truncate">{v.cliente || '—'}</div>
                  {varios && (
                    <Badge color="blue">🛒 {g.items.length} productos</Badge>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <div className="font-extrabold text-fono">{gs(total)}</div>
                  <Badge color={v.estadoPago === 'Pagado' ? 'green' : 'orange'}>
                    {v.estadoPago}
                  </Badge>
                </div>
              </div>

              {/* Productos de la compra */}
              <div className={varios ? 'mt-2 space-y-1' : 'mt-1'}>
                {g.items.map((it) => (
                  <div key={it.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-slate-600 truncate">
                      {varios && '• '}
                      {it.productoNombre || prods[it.productoId]?.nombre || 'Producto'}
                    </span>
                    {varios && <span className="text-slate-500 shrink-0">{gs(it.precio)}</span>}
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-1.5 mt-2 text-xs text-slate-500">
                <Badge color="slate">{v.medioPago}</Badge>
                {v.entrega === 'Delivery' && <Badge color="blue">🛵 {gs(v.montoDelivery)}</Badge>}
                {v.entrega === 'Encomienda' && <Badge color="blue">📦 {gs(v.montoDelivery)}</Badge>}
                {mostrarVendedor && (
                  <Badge color="slate">🧑‍💼 {vendedoresById[v.vendedorId] || '—'}</Badge>
                )}
                {v.observacion && <span className="italic">“{v.observacion}”</span>}
              </div>
            </div>
          )
        })}
      </div>

      {/* Tabla (desktop) */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-200">
              <th className="px-5 py-3.5 font-bold">Cliente</th>
              <th className="px-5 py-3.5 font-bold">Producto</th>
              <th className="px-5 py-3.5 font-bold">Estado</th>
              <th className="px-5 py-3.5 font-bold">Precio</th>
              <th className="px-5 py-3.5 font-bold">Medio</th>
              <th className="px-5 py-3.5 font-bold">Delivery</th>
              {mostrarVendedor && <th className="px-5 py-3.5 font-bold">Vendedor</th>}
              <th className="px-5 py-3.5 font-bold">Observación</th>
              <th className="px-5 py-3.5"></th>
            </tr>
          </thead>
          <tbody>
            {grupos.map((g) =>
              g.items.map((v, idx) => {
                const varios = g.items.length > 1
                const total = g.items.reduce((a, x) => a + (x.precio || 0), 0)
                return (
                  <tr
                    key={v.id}
                    className={
                      'border-b border-slate-100 hover:bg-slate-50 ' +
                      (varios ? 'bg-slate-50/40' : '')
                    }
                  >
                    {idx === 0 && (
                      <td
                        rowSpan={g.items.length}
                        className="px-5 py-3.5 font-semibold align-top border-r border-slate-100"
                      >
                        {v.cliente || '—'}
                        {varios && (
                          <div className="mt-1">
                            <Badge color="blue">🛒 {g.items.length} · {gs(total)}</Badge>
                          </div>
                        )}
                      </td>
                    )}
                    <td className="px-5 py-3.5">{prods[v.productoId]?.nombre || '—'}</td>
                    <td className="px-5 py-3.5">
                      <Badge color={v.estadoPago === 'Pagado' ? 'green' : 'orange'}>
                        {v.estadoPago}
                      </Badge>
                    </td>
                    <td className="px-5 py-3.5 font-bold text-fono">{gs(v.precio)}</td>
                    {idx === 0 ? (
                      <>
                        <td rowSpan={g.items.length} className="px-5 py-3.5 align-top">
                          {v.medioPago}
                        </td>
                        <td rowSpan={g.items.length} className="px-5 py-3.5 align-top">
                          {v.entrega === 'Delivery'
                            ? `🛵 ${gs(v.montoDelivery)}`
                            : v.entrega === 'Encomienda'
                              ? `📦 ${gs(v.montoDelivery)}`
                              : '🏬'}
                        </td>
                        {mostrarVendedor && (
                          <td rowSpan={g.items.length} className="px-5 py-3.5 align-top">
                            {vendedoresById[v.vendedorId] || '—'}
                          </td>
                        )}
                        <td
                          rowSpan={g.items.length}
                          className="px-5 py-3.5 text-slate-500 italic max-w-[200px] truncate align-top"
                        >
                          {v.observacion || ''}
                        </td>
                      </>
                    ) : null}
                    <td className="px-5 py-3.5">
                      {puedeBorrar ? (
                        <Button
                          variant="ghost"
                          className="h-8 px-2 text-bad"
                          onClick={() => deleteVenta(v.id)}
                          title="Eliminar"
                        >
                          🗑️
                        </Button>
                      ) : (
                        <span
                          className="text-slate-300"
                          title="Solo el dueño puede eliminar ventas"
                        >
                          🔒
                        </span>
                      )}
                    </td>
                  </tr>
                )
              }),
            )}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
