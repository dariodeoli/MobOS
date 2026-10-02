import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, apiFetch } from '@/lib/api/client'
import { Aviso, Badge, Button, EmptyState, Input, Label, Skeleton, useToast } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import { CELDA_NUMERO, ROTULO_DATO } from '@/components/shared/tabla'
import { descargarArchivo, descargarCsvCliente } from '@/utils/descargarArchivo'
import { cn } from '@/lib/utils'
import { FECHA_KARDEX, consultaKardex, extremosDelRango } from '@/utils/kardex'
import { listDemoTransfers, demoInventorySeed } from '@/lib/demoInventory'
import { construirKardexDemo } from '@/components/productos/kardexDemo'

// Descarga el CSV del rango que se está viendo, con la sesión de cookies.
async function descargarKardexCsv(productId, rango, nombreArchivo) {
  const response = await apiFetch(consultaKardex(productId, rango, { format: 'csv' }))
  if (!response.ok) {
    let mensaje = 'No se pudo exportar el kardex.'
    try {
      const payload = await response.json()
      if (payload?.message) mensaje = payload.message
    } catch { /* la respuesta de error no traía JSON */ }
    throw new Error(mensaje)
  }
  const blob = await response.blob()
  descargarArchivo(nombreArchivo, blob)
}

// CSV del kardex del demo: mismas columnas y separador que la exportación del
// servidor, para que el documento se pueda auditar igual.
function csvDelKardex(data) {
  const escapar = (valor) => {
    const texto = String(valor ?? '')
    return /[";\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto
  }
  const filas = [
    ['', 'Saldo inicial', data.desde ? `al ${data.desde.slice(0, 10)}` : 'antes del primer movimiento', '', '', '', '', data.saldoInicial],
    ...data.movimientos.map((movimiento) => [
      movimiento.at,
      TIPOS[movimiento.kind]?.label || movimiento.kind,
      `${movimiento.estimated ? '(reconstruido) ' : ''}${movimiento.label}${movimiento.detail ? ` · ${movimiento.detail}` : ''}`,
      movimiento.reference ?? '',
      movimiento.user ?? '',
      movimiento.delta > 0 ? movimiento.delta : '',
      movimiento.delta < 0 ? -movimiento.delta : '',
      movimiento.saldo,
    ]),
  ]
  return [['Fecha', 'Movimiento', 'Detalle', 'Referencia', 'Usuario', 'Entrada', 'Salida', 'Saldo'], ...filas]
    .map((fila) => fila.map(escapar).join(';'))
    .join('\r\n')
}

// Kardex por producto (#106): historial de movimientos con saldo corrido. El
// saldo final siempre coincide con el stock actual; cuando el saldo inicial
// arrastra movimientos sin documento, la vista lo advierte sin dramatizar.
// En la demo (#306) los movimientos se reconstruyen de las unidades y los
// traslados ficticios, así que la ficha también se puede auditar sin conexión.
const GRID = 'grid min-w-[52rem] grid-cols-[7rem_minmax(7rem,1fr)_minmax(9rem,1.5fr)_7rem_4.5rem_4.5rem_5.5rem] items-center gap-x-2'
const TIPOS = {
  ALTA: { label: 'Alta', color: 'green' },
  COMPRA: { label: 'Compra', color: 'green' },
  VENTA: { label: 'Venta', color: 'blue' },
  TRANSFERENCIA: { label: 'Transferencia', color: 'orange' },
  DEVOLUCION: { label: 'Devolución', color: 'orange' },
  AJUSTE: { label: 'Ajuste', color: 'slate' },
}
const numero = (valor) => Number(valor || 0).toLocaleString('es-PY')

export default function KardexProducto({ product, esDemo = false, onCerrar }) {
  const toast = useToast()
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [exportando, setExportando] = useState(false)

  const rango = useMemo(() => extremosDelRango(desde, hasta), [desde, hasta])

  const cargar = useCallback(async () => {
    if (!product?.id) return
    setLoading(true)
    setError('')
    try {
      if (esDemo) {
        setData(construirKardexDemo({
          producto: product,
          unidades: demoInventorySeed().units,
          transferencias: listDemoTransfers(),
          ...rango,
        }))
      } else {
        setData(await api.get(consultaKardex(product.id, rango)))
      }
    } catch (cause) {
      setData(null)
      setError(cause?.message || 'No se pudo cargar el kardex.')
    } finally {
      setLoading(false)
    }
  }, [product, rango, esDemo])
  useEffect(() => { cargar() }, [cargar])

  async function exportar() {
    if (!product?.id || exportando || !data) return
    setExportando(true)
    try {
      const nombre = `mobos-kardex-${product.sku || product.id}.csv`
      if (esDemo) {
        if (!descargarCsvCliente(nombre, csvDelKardex(data))) throw new Error('No se pudo exportar el kardex.')
        toast.success('Kardex exportado.')
      } else {
        await descargarKardexCsv(product.id, rango, nombre)
      }
    } catch (cause) {
      toast.error(cause?.message || 'No se pudo exportar el kardex.')
    } finally {
      setExportando(false)
    }
  }

  const filas = data?.movimientos || []

  return (
    <div className="space-y-4" data-testid="kardex-contenido">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label htmlFor="kardex-desde">Desde</Label>
            <Input id="kardex-desde" type="date" className="w-40" value={desde} max={hasta || undefined} onChange={(event) => setDesde(event.target.value)} />
          </div>
          <div>
            <Label htmlFor="kardex-hasta">Hasta</Label>
            <Input id="kardex-hasta" type="date" className="w-40" value={hasta} min={desde || undefined} onChange={(event) => setHasta(event.target.value)} />
          </div>
          {(desde || hasta) && (
            <Button type="button" variant="ghost" onClick={() => { setDesde(''); setHasta('') }}>Limpiar</Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {data && (
            <>
              <Badge color="slate">Stock actual: {numero(data.producto?.stock)}</Badge>
              <Badge color="green">Entradas: {numero(data.totales?.entradas)}</Badge>
              <Badge color="red">Salidas: {numero(data.totales?.salidas)}</Badge>
            </>
          )}
          {esDemo && <Badge color="blue">Demo</Badge>}
          <Button type="button" variant="outline" disabled={exportando || loading || !data} onClick={exportar} data-testid="kardex-exportar">
            <Icon name="download" className="h-4 w-4" />
            {exportando ? 'Exportando…' : 'Exportar CSV'}
          </Button>
          {onCerrar && <Button type="button" variant="ghost" onClick={onCerrar}>Ocultar</Button>}
        </div>
      </div>

      {loading && (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-8" />
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      )}

      {!loading && error && (
        <Aviso como="div" className="rounded-xl px-4 py-3">
          {error}
          <button type="button" onClick={cargar} className="ml-2 underline">Reintentar</button>
        </Aviso>
      )}

      {!loading && !error && data && (
        <>
          {data.truncado && (
            <Aviso tono="warn" compact className="rounded-xl px-4 py-2.5">
              Se muestran los últimos {numero(data.movimientos.length)} movimientos de {numero(data.total)}. Acotá el rango para ver un período completo.
            </Aviso>
          )}
          <div className="overflow-x-auto rounded-xl border border-ink-600" data-testid="kardex-tabla">
            <div className="max-h-[52vh] overflow-y-auto">
              <div className={cn(GRID + ' sticky top-0 z-10 border-b border-ink-600 bg-ink-800 px-3.5 py-2', ROTULO_DATO)}>
                <span>Fecha</span><span>Movimiento</span><span>Detalle</span><span>Usuario</span><span className="text-right">Entrada</span><span className="text-right">Salida</span><span className="text-right">Saldo</span>
              </div>
              <div className={GRID + ' border-b border-ink-600/60 bg-ink-700/30 px-3.5 py-2 text-xs'}>
                <span className="text-mute">{data.desde ? `al ${data.desde.slice(0, 10)}` : 'inicio'}</span>
                <span className="font-semibold">Saldo inicial</span>
                <span className="truncate text-mute" title={data.sinDocumentar ? 'Incluye movimientos sin documento' : undefined}>
                  {data.sinDocumentar ? `Incluye ${numero(Math.abs(data.sinDocumentar))} sin documento` : 'Inicio del historial'}
                </span>
                <span className="text-mute">—</span>
                <span className={CELDA_NUMERO}>{data.saldoInicial > 0 ? numero(data.saldoInicial) : ''}</span>
                <span className={CELDA_NUMERO}>{data.saldoInicial < 0 ? numero(-data.saldoInicial) : ''}</span>
                <span className="text-right font-semibold tabular-nums">{numero(data.saldoInicial)}</span>
              </div>
              {filas.length === 0 && (
                <EmptyState compact icon="box" title="Sin movimientos en el rango elegido." />
              )}
              {filas.map((movimiento) => {
                const tipo = TIPOS[movimiento.kind] || TIPOS.AJUSTE
                return (
                  <div key={movimiento.id} className={GRID + ' border-b border-ink-600/60 px-3.5 py-2 text-xs last:border-0'} data-testid="kardex-movimiento">
                    <span className="truncate text-mute" title={movimiento.at}>{FECHA_KARDEX(movimiento.at)}</span>
                    <span><Badge color={tipo.color} className="w-fit whitespace-nowrap px-1.5 py-0.5 text-[10px]">{tipo.label}</Badge></span>
                    <span className="truncate" title={`${movimiento.label} · ${movimiento.detail}`}>
                      {movimiento.estimated ? '≈ ' : ''}{movimiento.label}{movimiento.detail ? ` · ${movimiento.detail}` : ''}
                    </span>
                    <span className="truncate text-mute" title={movimiento.user || undefined}>{movimiento.user || '—'}</span>
                    <span className={cn('text-ok', CELDA_NUMERO)}>{movimiento.delta > 0 ? numero(movimiento.delta) : ''}</span>
                    <span className={cn('text-bad', CELDA_NUMERO)}>{movimiento.delta < 0 ? numero(-movimiento.delta) : ''}</span>
                    <span className="text-right font-semibold tabular-nums">{numero(movimiento.saldo)}</span>
                  </div>
                )
              })}
            </div>
          </div>
          <p className="text-xs text-mute">
            El saldo cierra contra el stock actual del producto. Las líneas con <strong className="text-fore">≈</strong> son restituciones
            reconstruidas desde el pedido; los ajustes manuales anteriores al registro quedan agrupados en el saldo inicial.
          </p>
          {esDemo && (
            <p className="rounded-xl border border-ink-600 bg-ink-700/40 px-4 py-2.5 text-xs text-mute" data-testid="kardex-demo-aviso">
              Demo: los movimientos se reconstruyen de las unidades y los traslados ficticios de este navegador. El saldo cierra contra el
              stock disponible del catálogo.
            </p>
          )}
          {data.sinDocumentar ? (
            <p className="rounded-xl border border-ink-600 bg-ink-700/40 px-4 py-2.5 text-xs text-mute">
              El saldo inicial difiere de la carga inicial registrada{cargaInicialTexto(data)}: la diferencia son movimientos sin documento (ediciones viejas de stock).
            </p>
          ) : null}
        </>
      )}
    </div>
  )
}

// Compatibilidad: el mismo contenido se usa embebido en la ficha del producto
// (#306); la exportación CSV también funciona en la demo, sin servidor.
function cargaInicialTexto(data) {
  if (data.cargaInicial === null || data.cargaInicial === undefined) return ''
  return ` (${numero(data.cargaInicial)})`
}
