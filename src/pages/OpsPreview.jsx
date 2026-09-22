import ThemeLogo from '@/components/app/ThemeLogo'
import ProductFooter from '@/components/app/ProductFooter'
import Icon from '@/components/shared/Icon'
import { Badge } from '@/components/ui'
import { CELDA_DATO, CELDA_IDENTIDAD, ROTULO_SECCION } from '@/components/shared/tabla'
import { GRILLA_DOS_COLUMNAS } from '@/components/shared/formulario'
import { cn } from '@/lib/utils'

// Mock F3 del rediseño «device ops» (#241): tablero de operaciones con el ADN
// visual de la propuesta (tiles de equipo, chips de estado, números grandes en
// mono). Es una VISTA PREVIA sin activar: no está en el menú, no llama al API y
// solo se abre con /ops-preview en desarrollo (o VITE_OPS_PREVIEW=1). Se activa
// después de la aprobación del piloto F2.

const KPIS = [
  { label: 'Ingresos hoy', value: 'Gs 14.280.000', delta: '+34%', tono: 'ok' },
  { label: 'Pedidos', value: '3', detalle: '2 pagados · 1 pendiente', tono: 'info' },
  { label: 'En taller', value: '5', detalle: '2 por verificar', tono: 'warn' },
  { label: 'Certificados', value: '18', detalle: 'esta semana', tono: 'fono' },
]

const EQUIPOS = [
  { modelo: 'iPhone 15 Pro · 256 GB', imei: '35 123456 789012 3', estado: 'Certificado', grado: 'A', bateria: 92, tono: 'green' },
  { modelo: 'iPhone 14 · 128 GB', imei: '35 998877 665544 1', estado: 'Por verificar', grado: '—', bateria: null, tono: 'slate' },
  { modelo: 'Samsung S24 · 256 GB', imei: '35 445566 778899 0', estado: 'Diagnóstico', grado: 'B', bateria: 81, tono: 'orange' },
  { modelo: 'iPhone 13 · 128 GB', imei: '35 112233 445566 7', estado: 'Listo', grado: 'A', bateria: 88, tono: 'green' },
]

const COLAS = [
  { titulo: 'Up next', tono: 'info', items: ['iPhone 15 Pro · verificación física', 'Samsung S24 · diagnóstico de batería'] },
  { titulo: 'Queued', tono: 'slate', items: ['iPhone 14 · limpieza y datos', 'iPad 10 · cambio de pantalla'] },
  { titulo: 'Ready', tono: 'ok', items: ['iPhone 13 · etiqueta impresa', 'iPhone 12 · pendiente de retiro'] },
]

const TONOS = {
  ok: 'border-ok/30 bg-ok/5 text-ok',
  info: 'border-info/25 bg-info/5 text-info',
  warn: 'border-warn/25 bg-warn/5 text-warn',
  fono: 'border-fono/25 bg-fono/5 text-fono-light',
  slate: 'border-ink-500 bg-ink-800 text-mute',
}

export default function OpsPreview() {
  return (
    <main className="min-h-dvh bg-paper px-4 py-6 text-fore sm:px-8" data-testid="ops-preview">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <ThemeLogo className="h-8 w-auto" />
            <div>
              <p className="text-xs font-bold uppercase tracking-[.18em] text-fono-dark">MobOS Ops</p>
              <h1 className="text-xl font-bold tracking-tight">Tablero de operaciones</h1>
            </div>
          </div>
          <span className={cn('rounded-full border px-3 py-1 text-xs font-semibold', TONOS.warn)}>
            Propuesta F3 · no activada (aprobación del piloto pendiente)
          </span>
        </header>

        <section className={cn(GRILLA_DOS_COLUMNAS, 'lg:grid-cols-4')} aria-label="Indicadores de hoy">
          {KPIS.map((kpi) => (
            <article key={kpi.label} className={cn('rounded-2xl border p-4', TONOS[kpi.tono])}>
              <p className={ROTULO_SECCION}>{kpi.label}</p>
              <p className="mt-2 font-mono text-2xl font-bold tabular-nums tracking-tight">{kpi.value}</p>
              <p className={cn(CELDA_DATO, 'mt-1')}>{kpi.delta || kpi.detalle}</p>
            </article>
          ))}
        </section>

        <section className="rounded-2xl border border-ink-600 bg-ink p-4" aria-label="Equipos en proceso">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Equipos en proceso</h2>
            <span className="text-xs text-mute">Vista rack · estados y grado</span>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {EQUIPOS.map((equipo) => (
              <article key={equipo.imei} className={cn('flex items-start gap-3 rounded-xl border p-3', TONOS[equipo.tono === 'green' ? 'ok' : equipo.tono === 'orange' ? 'warn' : 'slate'])}>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ink-800 text-mute">
                  <Icon name="box" className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className={CELDA_IDENTIDAD} title={equipo.modelo}>{equipo.modelo}</p>
                  <p className="mt-0.5 truncate font-mono text-[11px] text-fono-light">{equipo.imei}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Badge color={equipo.tono}>{equipo.estado}</Badge>
                    {equipo.grado !== '—' && <Badge color="slate">Grado {equipo.grado}</Badge>}
                    {equipo.bateria !== null && <Badge color={equipo.bateria >= 90 ? 'green' : 'orange'}>{equipo.bateria}%</Badge>}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="grid gap-3 lg:grid-cols-3" aria-label="Colas de trabajo">
          {COLAS.map((cola) => (
            <article key={cola.titulo} className="rounded-2xl border border-ink-600 bg-ink-800/40 p-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-semibold">{cola.titulo}</h2>
                <Badge color={cola.tono === 'ok' ? 'green' : cola.tono === 'info' ? 'blue' : 'slate'}>{cola.items.length}</Badge>
              </div>
              <ul className="mt-3 space-y-1.5">
                {cola.items.map((item) => (
                  <li key={item} className="flex items-center gap-2 rounded-lg border border-ink-600 px-2.5 py-2 text-sm">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-fono" aria-hidden="true" />
                    <span className="truncate">{item}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </section>

        <p className="text-center text-xs text-mute">
          Mock de la fase F3 (#241) con datos ficticios: no consulta el API ni cambia nada. Se activa solo con la aprobación del piloto.
        </p>
      </div>
      <ProductFooter />
    </main>
  )
}
