import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Badge, Skeleton } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import { API_URL } from '@/lib/api'
import { isDemoRuntime } from '@/lib/demoMode'
import { demoInformePayload } from '@/lib/demoInforme'
import { fechaCorta } from '@/utils/fecha'
import { copiarAlPortapapeles } from '@/utils/portapapeles'
import { GRILLA_DOS_COLUMNAS } from '@/components/shared/formulario'
import MedidorBateria from '@/components/shared/MedidorBateria'
import { colorBadge, gradoCondicion } from '@/lib/estadoEquipo'

// Informe de dispositivo (#240 ítem 3): página pública por serial
// (`/u/<serial>`), pensada para compartirse desde la ficha/portal del cliente
// (link + WhatsApp). Muestra los datos que la tienda ya tiene: modelo, serial e
// IMEI enmascarados, condición, batería, verificación física, venta y garantía.
// El grado/checklist de la inspección de INV se suman cuando estén disponibles.
export default function InformePublico() {
  const { serial } = useParams()
  const [informe, setInforme] = useState(null)
  const [estado, setEstado] = useState('cargando')
  const [copiado, setCopiado] = useState(false)

  useEffect(() => {
    let vigente = true
    if (isDemoRuntime) {
      const demo = demoInformePayload(serial)
      if (vigente) {
        setInforme(demo)
        setEstado(demo ? 'listo' : 'sin')
      }
      return () => { vigente = false }
    }
    fetch(`${API_URL}/api/public/units/${encodeURIComponent(serial || '')}`)
      .then(async (respuesta) => {
        const cuerpo = await respuesta.json().catch(() => null)
        if (!vigente) return
        if (!respuesta.ok) { setEstado('sin'); setInforme(cuerpo); return }
        setInforme(cuerpo)
        setEstado('listo')
      })
      .catch(() => { if (vigente) setEstado('error') })
    return () => { vigente = false }
  }, [serial])

  async function copiarEnlace() {
    const ok = await copiarAlPortapapeles(window.location.href)
    if (!ok) return
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  const marco = 'mx-auto w-full max-w-2xl px-4 pb-10'
  if (estado === 'cargando') return <main className={`${marco} pt-10`}><Skeleton className="h-56 w-full" /></main>
  if (estado === 'sin' || estado === 'error' || !informe?.unit) {
    return <main className={`${marco} pt-16 text-center`}>
      <p className="text-sm font-bold uppercase tracking-[.2em] text-fono-light">Informe de dispositivo</p>
      <h1 className="mt-2 text-2xl font-bold">No encontramos este equipo</h1>
      <p className="mt-2 text-sm text-mute">El enlace puede estar incompleto o el equipo no pertenece a esta tienda. Pedile a la tienda que te comparta el informe de nuevo.</p>
    </main>
  }

  const { store, unit, sale, warranty, check, disclaimer } = informe
  const dato = (etiqueta, valor) => <div className="flex items-center justify-between gap-3 border-b border-ink-600/60 py-2 last:border-0"><span className="text-mute">{etiqueta}</span><b className="shrink-0 tabular-nums text-right">{valor}</b></div>

  return (
    <main className={`${marco} space-y-4 pt-8`}>
      <header className="text-center">
        <p className="text-[11px] font-bold uppercase tracking-[.2em] text-fono-light">Informe de dispositivo</p>
        <h1 className="mt-1 text-2xl font-bold">{store.name}</h1>
        {store.branch && <p className="text-sm text-mute">{store.branch}</p>}
      </header>

      <section className="rounded-2xl border border-ink-600 bg-ink-800/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-lg font-bold">{unit.model}</p>
          <div className="flex items-center gap-1.5">
            <Badge color="blue">{unit.condition}</Badge>
            {gradoCondicion(unit.grade) && <Badge color={colorBadge(gradoCondicion(unit.grade).tono)}>{gradoCondicion(unit.grade).etiqueta}</Badge>}
          </div>
        </div>
        <div className="mt-3 text-sm">
          {dato('Serial', unit.serialMasked)}
          {dato('IMEI', unit.imeiMasked)}
          {unit.batteryHealth !== null && unit.batteryHealth !== undefined && (
            <div className="flex items-center justify-between gap-3 border-b border-ink-600/60 py-2">
              <span className="text-mute">Batería</span>
              <MedidorBateria porcentaje={unit.batteryHealth} variante="chip" />
            </div>
          )}
          {dato('Verificación física', unit.verifiedAt ? `${fechaCorta(unit.verifiedAt)}${unit.verifiedBy ? ` · ${unit.verifiedBy}` : ''}${unit.verifiedByCode ? ` (${unit.verifiedByCode})` : ''}` : 'Sin verificar')}
          {unit.verificationCount > 0 && dato('Verificaciones registradas', unit.verificationCount)}
        </div>
      </section>

      {(sale || warranty || check) && (
        <section className={GRILLA_DOS_COLUMNAS}>
          {sale && <div className="rounded-2xl border border-ink-600 bg-ink-800/40 p-4 text-sm">
            <p className="text-[11px] font-bold uppercase tracking-wider text-mute">Compra</p>
            <div className="mt-1">{dato('Pedido', sale.orderNumber || '—')}{dato('Fecha', sale.date ? fechaCorta(sale.date) : '—')}{sale.branch && dato('Sucursal', sale.branch)}</div>
          </div>}
          {warranty && <div className="rounded-2xl border border-ok/30 bg-ok/5 p-4 text-sm">
            <p className="text-[11px] font-bold uppercase tracking-wider text-mute">Garantía</p>
            <div className="mt-1">{dato('Estado', warranty.status)}{warranty.expiresAt && dato('Vence', fechaCorta(warranty.expiresAt))}</div>
          </div>}
          {check && <div className="rounded-2xl border border-ink-600 bg-ink-800/40 p-4 text-sm">
            <p className="text-[11px] font-bold uppercase tracking-wider text-mute">Consulta de IMEI</p>
            <div className="mt-1">{dato('Fuente', check.provider)}{dato('Resultado', check.status)}{dato('Fecha', check.date ? fechaCorta(check.date) : '—')}</div>
          </div>}
        </section>
      )}

      <p className="text-center text-xs text-mute">{disclaimer}</p>

      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" className="inline-flex items-center gap-2 rounded-xl border border-ink-500 px-3 py-2 text-sm font-semibold transition hover:border-fono" onClick={copiarEnlace}>
          <Icon name="copy" className="h-4 w-4" />{copiado ? 'Enlace copiado' : 'Copiar enlace'}
        </button>
        <button type="button" className="inline-flex items-center gap-2 rounded-xl border border-ink-500 px-3 py-2 text-sm font-semibold transition hover:border-fono" onClick={() => window.print()}>
          <Icon name="printer" className="h-4 w-4" />Imprimir
        </button>
      </div>
    </main>
  )
}
