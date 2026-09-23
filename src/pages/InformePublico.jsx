import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Badge, Skeleton } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import { API_URL } from '@/lib/api'
import { isDemoRuntime } from '@/lib/demoMode'
import { demoInformePayload, marcarInformeVistoDemo } from '@/lib/demoInforme'
import { fechaCorta } from '@/utils/fecha'
import { copiarAlPortapapeles } from '@/utils/portapapeles'
import { GRILLA_DOS_COLUMNAS } from '@/components/shared/formulario'
import MedidorBateria from '@/components/shared/MedidorBateria'
import { colorBadge, gradoCondicion } from '@/lib/estadoEquipo'

// Semáforo del checklist en el informe público (mismos tonos que la ficha).
const SEMAFORO_CHECKLIST = { ok: 'bg-ok', observacion: 'bg-warn', falla: 'bg-bad', na: 'bg-mute' }

// Informe de dispositivo (#240 ítem 3): página pública por serial
// (`/u/<serial>`), pensada para compartirse desde la ficha/portal del cliente
// (link + WhatsApp). Muestra los datos que la tienda ya tiene: modelo, serial e
// IMEI enmascarados, condición, batería, verificación física, venta y garantía.
// El grado/checklist de la inspección de INV se suman cuando estén disponibles.
export default function InformePublico() {
  const { serial } = useParams()
  const [searchParams] = useSearchParams()
  const [informe, setInforme] = useState(null)
  const [estado, setEstado] = useState('cargando')
  const [copiado, setCopiado] = useState(false)

  // El portal demo vive en su subdominio y no comparte la sesión de /demo del
  // host de la app: el enlace del portal trae `?demo=1` para resolver el
  // informe con los datos ficticios del navegador (mismo criterio que el token
  // `demo-…` de la cuenta). Un serial real nunca necesita el parámetro.
  const demoDelEnlace = searchParams.get('demo') === '1'
  // Seguimiento del informe compartido (#240 ítem 3): la vista previa del
  // equipo desde la app viaja con `?preview=1` y no cuenta como apertura del
  // cliente (ni en la cuenta real ni en la demo).
  const preview = searchParams.get('preview') === '1'

  useEffect(() => {
    let vigente = true
    if (isDemoRuntime || demoDelEnlace) {
      const demo = demoInformePayload(serial)
      if (vigente) {
        setInforme(demo)
        setEstado(demo ? 'listo' : 'sin')
        if (demo && !preview) marcarInformeVistoDemo(serial)
      }
      return () => { vigente = false }
    }
    fetch(`${API_URL}/api/public/units/${encodeURIComponent(serial || '')}${preview ? '?preview=1' : ''}`)
      .then(async (respuesta) => {
        const cuerpo = await respuesta.json().catch(() => null)
        if (!vigente) return
        if (!respuesta.ok) { setEstado('sin'); setInforme(cuerpo); return }
        setInforme(cuerpo)
        setEstado('listo')
      })
      .catch(() => { if (vigente) setEstado('error') })
    return () => { vigente = false }
  }, [serial, demoDelEnlace, preview])

  async function copiarEnlace() {
    // Se copia sin `preview`: ese parámetro es solo para la vista previa del
    // equipo desde la app y no debe viajar a un enlace reenviado.
    const url = new URL(window.location.href)
    url.searchParams.delete('preview')
    const ok = await copiarAlPortapapeles(url.toString())
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
            {/* #240: controles del dispositivo (iCloud/MDM/ESN/carrier) con semáforo. */}
            {unit.controles?.length ? <div className="mt-2 flex flex-wrap gap-1.5">
              {unit.controles.map((control) => <span key={control.clave} className={`rounded-lg border px-2 py-1 text-[10px] font-semibold ${control.ok ? 'border-ok/40 text-ok' : 'border-bad/40 text-bad'}`} title={`${control.label}: ${control.valor}`}>{control.label}: {control.valor}</span>)}
            </div> : null}
          </div>}
        </section>
      )}

      {/* #240: checklist de la inspección con semáforo (notas solo de lo no-OK). */}
      {unit.checklist?.items?.length ? <section className="rounded-2xl border border-ink-600 bg-ink-800/40 p-4 text-sm">
        <p className="text-[11px] font-bold uppercase tracking-wider text-mute">Checklist de inspección</p>
        <p className="mt-1 text-xs text-mute">
          {unit.checklist.aprobados} de {unit.checklist.evaluados} conformes
          {unit.checklist.puntaje !== null && unit.checklist.puntaje !== undefined ? ` · ${unit.checklist.puntaje}/100` : ''}
        </p>
        <ul className="mt-2 space-y-1">
          {unit.checklist.items.map((item) => <li key={`${item.label}-${item.estado}`} className="flex items-start gap-2">
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${SEMAFORO_CHECKLIST[item.estado] || 'bg-mute'}`} />
            <span className="text-mute"><b className="text-fore">{item.label}</b>{item.nota ? ` — ${item.nota}` : ''}</span>
          </li>)}
        </ul>
      </section> : null}

      {/* #240: repuestos no-OEM detectados en la inspección (sin datos personales). */}
      {unit.repuestosNoOem && <section className="rounded-2xl border border-ink-600 bg-ink-800/40 p-4 text-sm">
        <p className="text-[11px] font-bold uppercase tracking-wider text-mute">Repuestos no-OEM</p>
        <p className="mt-1 font-semibold text-fore">{unit.repuestosNoOem}</p>
        {unit.repuestosNoOemNota && <p className="mt-1 text-xs text-mute">{unit.repuestosNoOemNota}</p>}
      </section>}

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
