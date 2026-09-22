import { Badge, BarraProgreso, Card } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import { ROTULO_SECCION } from '@/components/shared/tabla'
import { temaV2Activo } from '@/lib/temaV2'
import { SECCIONES_INSPECCION } from '@/lib/inspeccionChecklist'

// Mock de F3 (#241): cómo se vería el shell y el tablero operativo con los
// tokens v2, SIN tocar la app real. Es una pantalla de propuesta: datos
// ficticios, marcada como mock, para aprobar el rumbo antes del rollout.

const EQUIPOS = [
  { modelo: 'iPhone 15 Pro 256 GB', serial: '•••• 3809', grado: 'A', bateria: 96, chips: [['Sin blacklist', 'ok'], ['iCloud off', 'ok'], ['MDM off', 'ok']], estado: 'Listo para vender' },
  { modelo: 'iPhone 14 128 GB', serial: '•••• 4712', grado: 'B', bateria: 86, chips: [['Sin blacklist', 'ok'], ['iCloud off', 'ok'], ['SIM libre', 'ok']], estado: 'Verificado' },
  { modelo: 'iPhone 13 128 GB', serial: '•••• 9021', grado: 'C', bateria: 74, chips: [['Pantalla con falla', 'bad'], ['iCloud off', 'ok']], estado: 'En revisión' },
]

const PASOS = [['Por verificar', 4], ['Verificado', 2], ['Listo para vender', 1]]

function Kpi({ titulo, valor, detalle, tono = '' }) {
  return (
    <div className="rounded-xl border border-ink-600 bg-ink-900 p-3">
      <p className={ROTULO_SECCION}>{titulo}</p>
      <p className={`v2-numero mt-1 text-3xl font-bold ${tono}`}>{valor}</p>
      <p className="mt-0.5 text-xs text-mute">{detalle}</p>
    </div>
  )
}

function ChipEstado({ children, tono = 'ok' }) {
  const tonos = { ok: 'border-ok/40 bg-ok/10 text-ok', bad: 'border-bad/40 bg-bad/10 text-bad', warn: 'border-warn/40 bg-warn/10 text-warn' }
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${tonos[tono]}`}>{children}</span>
}

export default function RedisenoF3() {
  if (!temaV2Activo()) {
    return (
      <div className="mx-auto max-w-xl p-6 text-sm text-mute">
        <p className={ROTULO_SECCION}>Propuesta F3</p>
        <p className="mt-2">
          Esta pantalla es la vista previa del tablero operativo con el tema v2 y está detrás del flag
          <b className="text-fore"> preview v2</b>. Activalo en este dispositivo para verla:
        </p>
        <p className="mt-2 rounded-lg border border-ink-600 bg-ink-800 px-3 py-2 font-mono text-xs">localStorage.setItem('mobos:tema-v2','1')</p>
        <p className="mt-2">Después recargá. Con <b className="text-fore">'0'</b> volvés al default.</p>
      </div>
    )
  }
  return (
    <div className="v2-piloto min-h-dvh bg-paper text-fore">
      <div className="flex items-center justify-between gap-3 border-b border-ink-600 bg-ink-900 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-fono text-onbrand"><Icon name="store" className="h-4 w-4" /></span>
          <div>
            <p className="text-sm font-bold leading-tight">PhoneCheck MobOS · propuesta F3</p>
            <p className="text-[11px] text-mute">Mock con datos ficticios · shell + tablero operativo</p>
          </div>
        </div>
        <span className="rounded-full border border-warn/40 bg-warn/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-warn">Mock · no funcional</span>
      </div>

      <div className="mx-auto max-w-5xl space-y-4 p-4">
        {/* KPIs grandes */}
        <div className="grid gap-3 sm:grid-cols-3">
          <Kpi titulo="En inspección" valor="4" detalle="de 7 del lote" />
          <Kpi titulo="Listos para vender" valor="1" detalle="certificados hoy" tono="text-ok" />
          <Kpi titulo="Pass promedio" valor="92%" detalle="checklist de 23 puntos" />
        </div>

        {/* Stepper de workflow */}
        <Card className="p-4">
          <p className={ROTULO_SECCION}>Flujo del lote</p>
          <ol className="mt-3 grid gap-2 sm:grid-cols-3">
            {PASOS.map(([paso, cantidad], indice) => (
              <li key={paso} className={`flex items-center gap-3 rounded-xl border p-3 ${indice === 0 ? 'border-info/40 bg-info/5' : 'border-ink-600'}`}>
                <span className={`grid h-7 w-7 place-items-center rounded-full text-xs font-bold ${indice === 0 ? 'bg-info text-white' : 'bg-ink-700 text-mute'}`}>{indice + 1}</span>
                <span className="min-w-0">
                  <b className="block truncate text-sm">{paso}</b>
                  <span className="text-xs text-mute">{cantidad} equipos</span>
                </span>
              </li>
            ))}
          </ol>
        </Card>

        {/* Tiles de equipo con chips */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {EQUIPOS.map((equipo) => (
            <article key={equipo.serial} className="rounded-2xl border border-ink-600 bg-ink-900 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <b className="block truncate text-sm">{equipo.modelo}</b>
                  <p className="font-mono text-xs text-mute">{equipo.serial}</p>
                </div>
                <span className={`v2-numero grid h-10 w-10 place-items-center rounded-xl border text-lg font-bold ${equipo.grado === 'A' ? 'border-ok/40 text-ok' : equipo.grado === 'B' ? 'border-warn/40 text-warn' : 'border-bad/40 text-bad'}`}>{equipo.grado}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {equipo.chips.map(([texto, tono]) => <ChipEstado key={texto} tono={tono}>{texto}</ChipEstado>)}
              </div>
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-mute">Batería</span>
                  <b className="v2-numero">{equipo.bateria}%</b>
                </div>
                <BarraProgreso valor={equipo.bateria} tono={equipo.bateria >= 85 ? 'ok' : 'warn'} alto="sm" etiqueta={`Batería de ${equipo.modelo}`} className="mt-1" />
              </div>
              <div className="mt-3 flex items-center justify-between gap-2">
                <Badge color={equipo.estado === 'Listo para vender' ? 'green' : equipo.estado === 'Verificado' ? 'blue' : 'orange'}>{equipo.estado}</Badge>
                <span className="text-[11px] text-mute">
                  {SECCIONES_INSPECCION.length} secciones · {SECCIONES_INSPECCION.flatMap((s) => s.items).length} puntos
                </span>
              </div>
            </article>
          ))}
        </div>

        <Card className="p-4">
          <p className={ROTULO_SECCION}>Notas de la propuesta</p>
          <ul className="mt-2 space-y-1.5 text-sm text-mute">
            <li>· Los tokens v2 son los del piloto (base consola, verde pass, azul acción); acá se muestran en el shell y el tablero.</li>
            <li>· Patrones: tiles con chips de locks, grado grande, stepper del lote y “x de y” del checklist.</li>
            <li>· Es un <b className="text-fore">mock sin función</b>: no lee inventario real ni guarda nada. La implementación real va por lotes, con QA antes/después como el piloto.</li>
          </ul>
        </Card>
      </div>
    </div>
  )
}
