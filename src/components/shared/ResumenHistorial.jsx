import { formatGs } from '@/utils/moneda'
import ResumenMetricas from '@/components/shared/ResumenMetricas'

// Bloques de totales que acompañan a la cronología de proveedores y de
// funcionarios (ver `resumen` de shared/Cronologia). Reciben el `summary` que
// devuelven /api/suppliers/:id/history y /api/users/:id/history.
export function ResumenProveedor({ meta }) {
  const resumen = meta?.summary
  if (!resumen) return null
  const productos = resumen.products || []
  return (
    <div className="space-y-3" data-testid="proveedor-resumen">
      <ResumenMetricas
        testId="proveedor-resumen-metricas"
        items={[
          { titulo: 'Comprado', valor: formatGs(resumen.totalPurchasedPyg) },
          { titulo: 'Pagado', valor: formatGs(resumen.paidPyg), tono: 'text-ok' },
          { titulo: 'Saldo pendiente', valor: formatGs(resumen.outstandingPyg), tono: resumen.outstandingPyg > 0 ? 'text-warn' : 'text-ok' },
        ]}
      />
      {productos.length > 0 && (
        <details className="rounded-xl border border-ink-600 bg-ink-800 p-3" data-testid="proveedor-productos">
          <summary className="cursor-pointer text-sm font-semibold">Productos comprados ({productos.length})</summary>
          <ul className="mt-2 space-y-1.5 text-xs">
            {productos.map((producto) => (
              <li key={producto.productId} className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3">
                <span className="min-w-0 break-words font-medium text-fore">{producto.name}</span>
                <span className="tabular-nums text-mute">{producto.quantity} u · {formatGs(producto.totalPyg)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

export function ResumenFuncionario({ meta }) {
  const resumen = meta?.summary
  if (!resumen) return null
  return (
    <ResumenMetricas
      testId="funcionario-resumen-metricas"
      items={[
        { titulo: 'Ventas', valor: `${resumen.ventas} · ${formatGs(resumen.ventasPyg)}` },
        { titulo: 'Cobros', valor: `${resumen.cobros} · ${formatGs(resumen.cobrosPyg)}` },
        { titulo: 'Comisión pagada', valor: formatGs(resumen.comisionPagadaPyg), tono: 'text-ok' },
        { titulo: 'Comisión pendiente', valor: formatGs(resumen.comisionPendientePyg), tono: resumen.comisionPendientePyg > 0 ? 'text-warn' : '' },
      ]}
    />
  )
}
