import { useEffect, useState } from 'react'
import { useSesion } from '@/lib/sesion'
import { api } from '@/lib/api/client'
import { Button, Card, FormField, Select } from '@/components/ui'
import { GRILLA_DOS_COLUMNAS } from '@/components/shared/formulario'
import { EstadoGuardado, useGuardadoCuenta } from '@/components/control/GuardadoCuenta'
import { mensajeDeGuardado } from '@/utils/guardadoCuenta'

// Cotización de monedas (#401): de dónde sale la cotización automática de los
// cobros en dólares y de los costos, y si se toma el precio de compra o de venta
// de la casa de cambio. Por defecto Cambios Chaco · venta. La cotización siempre
// se puede cargar a mano en cada pantalla. Solo el dueño la cambia.
const FUENTES_INICIALES = [
  { id: 'cambioschaco', label: 'Cambios Chaco' },
  { id: 'bcp', label: 'BCP' },
]
const POR_DEFECTO = { source: 'cambioschaco', side: 'venta' }

function Fila({ titulo, ayuda, valor, onChange, fuentes, disabled, prefijo }) {
  return (
    <div className="space-y-2" data-testid={`cotizacion-${prefijo}`}>
      <div>
        <h3 className="text-sm font-semibold">{titulo}</h3>
        <p className="text-xs text-mute">{ayuda}</p>
      </div>
      <div className={GRILLA_DOS_COLUMNAS}>
        <FormField label="Fuente" htmlFor={`cotizacion-fuente-${prefijo}`}>
          <Select id={`cotizacion-fuente-${prefijo}`} value={valor.source} disabled={disabled} onChange={(evento) => onChange({ ...valor, source: evento.target.value })}>
            {fuentes.map((fuente) => <option key={fuente.id} value={fuente.id}>{fuente.label}</option>)}
          </Select>
        </FormField>
        <FormField label="Precio de la casa" htmlFor={`cotizacion-lado-${prefijo}`}>
          <Select id={`cotizacion-lado-${prefijo}`} value={valor.side} disabled={disabled} onChange={(evento) => onChange({ ...valor, side: evento.target.value })}>
            <option value="venta">Venta</option>
            <option value="compra">Compra</option>
          </Select>
        </FormField>
      </div>
    </div>
  )
}

export default function CotizacionFuente({ onReauth }) {
  const { sesion, esDemo } = useSesion() || {}
  const esDueno = Boolean(sesion?.esPropietario)
  const [ventas, setVentas] = useState(POR_DEFECTO)
  const [costos, setCostos] = useState(POR_DEFECTO)
  const [fuentes, setFuentes] = useState(FUENTES_INICIALES)
  const [busy, setBusy] = useState(false)
  const guardado = useGuardadoCuenta({ id: 'cotizacion', onReauth })

  useEffect(() => {
    if (esDemo) return undefined
    let vivo = true
    api.get('/api/tenant/fx-settings')
      .then((datos) => {
        if (!vivo || !datos) return
        if (datos.sales) setVentas(datos.sales)
        if (datos.costs) setCostos(datos.costs)
        if (Array.isArray(datos.sources) && datos.sources.length) setFuentes(datos.sources)
      })
      .catch((causa) => { console.error('[cotizacion] no se pudo leer la fuente:', causa) })
    return () => { vivo = false }
  }, [esDemo])

  async function guardar(evento) {
    evento?.preventDefault?.()
    if (busy || !esDueno) return
    if (esDemo) { guardado.setEstado({ ok: true, texto: mensajeDeGuardado('solo en este navegador (demo)') }); return }
    setBusy(true)
    try {
      await guardado.ejecutar(() => api.put('/api/tenant/fx-settings', { sales: ventas, costs: costos }), { etiqueta: 'la fuente de cotización' })
    } finally { setBusy(false) }
  }

  return (
    <form onSubmit={guardar} data-testid="grupo-cotizacion">
      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div>
            <h2 className="font-semibold">Cotización del dólar</h2>
            <p className="mt-1 text-sm text-mute">De dónde sale la cotización automática. En cada cobro o costo siempre podés escribirla a mano; los pagos ya registrados no cambian.</p>
          </div>
          <EstadoGuardado testId="cotizacion-estado" estado={guardado.estado} />
        </div>
        <Fila prefijo="cobros" titulo="Cobros en dólares" ayuda="Pagos de ventas y pedidos en cuentas en USD." valor={ventas} onChange={setVentas} fuentes={fuentes} disabled={!esDueno || busy} />
        <Fila prefijo="costos" titulo="Costos en dólares" ayuda="Costo de unidades y compras cargadas en USD." valor={costos} onChange={setCostos} fuentes={fuentes} disabled={!esDueno || busy} />
        <div className="flex flex-wrap items-center gap-3">
          {esDueno
            ? <Button type="submit" variant="outline" disabled={busy}>Guardar cotización</Button>
            : <p className="text-xs text-mute">Solo el dueño puede cambiar la fuente.</p>}
        </div>
        {guardado.panel}
      </Card>
    </form>
  )
}
