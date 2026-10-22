import ThemeLogo from '@/components/app/ThemeLogo'
import ProductFooter from '@/components/app/ProductFooter'
import Icon from '@/components/shared/Icon'
import GradoBadge from '@/components/shared/GradoBadge'
import MedidorBateria from '@/components/shared/MedidorBateria'
import ChipsLocks from '@/components/shared/ChipsLocks'
import PasosEquipo from '@/components/shared/PasosEquipo'
import StatusChip from '@/components/shared/StatusChip'
import { Aviso, BarraProgreso, Button, Skeleton } from '@/components/ui'
import { CELDA_DATO, CELDA_IDENTIDAD, ROTULO_SECCION } from '@/components/shared/tabla'
import { ETIQUETA_RACK, ORDEN_RACK } from '@/lib/tallerRack'
import { cn } from '@/lib/utils'
import '@/components/shared/operacionRediseno.css'

// Tablero ops F3 (#241). Lo comparten las dos caras detrás del flag:
// - modo `preview` (`/ops-preview`): mock sin API, para la aprobación del piloto.
// - modo `real` (`/ops` con VITE_OPS_V2=1): datos reales del inventario (#240) y
//   los pedidos, armados por `lib/opsTablero.js`.

const TONOS = {
  ok: 'border-ok/30 bg-ok/5 text-ok-text',
  info: 'border-info/25 bg-info/5 text-info-text',
  warn: 'border-warn/25 bg-warn/5 text-warn-text',
  fono: 'border-fono/25 bg-fono/5 text-fono-text',
  slate: 'border-ink-500 bg-ink-800 text-mute',
}

// Tono del tablero -> tono de StatusChip (ok · warn · bad · neutral).
const TONO_CHIP = { ok: 'ok', info: 'neutral', warn: 'warn', fono: 'ok', slate: 'neutral' }

function horaDe(fecha) {
  if (!fecha) return ''
  return new Date(fecha).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit', hour12: false })
}

export default function TableroOps({
  modo = 'real',
  kpis = [],
  equipos = [],
  colas = [],
  pasos = [],
  cargando = false,
  error = '',
  actualizado = null,
  demo = false,
  embebido = false,
  onRefrescar,
}) {
  const esPreview = modo === 'preview'
  const vacio = cargando && !kpis.length
  const Raiz = embebido ? 'div' : 'main'
  return (
    <Raiz className={cn('op-rd v2-piloto text-fore', embebido ? 'min-w-0' : 'min-h-dvh bg-paper px-4 py-6 sm:px-8')} data-testid={esPreview ? 'ops-preview' : 'ops-tablero'}>
      <div className={cn('space-y-5', !embebido && 'mx-auto max-w-6xl')}>
        <header className="flex flex-wrap items-center justify-between gap-3">
          {/* Embebido: el shell del panel ya pone logo y título. */}
          {!embebido && (
            <div className="flex items-center gap-3">
              <ThemeLogo className="h-8 w-auto" />
              <div>
                <p className="text-xs font-bold uppercase tracking-[.18em] text-fono-text">MobOS Ops</p>
                <h1 className="text-xl font-bold tracking-tight">Tablero de operaciones</h1>
              </div>
            </div>
          )}
          {esPreview ? (
            <span className={cn('rounded-full border px-3 py-1 text-xs font-semibold', TONOS.warn)}>
              Propuesta F3 · no activada (aprobación del piloto pendiente)
            </span>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {/* En la demo el origen es «Demo»: «Datos reales» sería falso. */}
              <StatusChip
                testId="ops-actualizado"
                tono={demo ? 'neutral' : 'ok'}
                etiqueta={`${demo ? 'Demo' : 'Datos reales'}${actualizado ? ` · ${horaDe(actualizado)}` : ''}`}
                className="px-3 py-1"
              />
              {onRefrescar && (
                <Button type="button" variant="outline" className="h-11 px-3 text-xs md:h-11 lg:h-8" onClick={onRefrescar} data-testid="ops-refrescar">
                  <Icon name="refresh" className="h-3.5 w-3.5" /> Actualizar
                </Button>
              )}
              {!embebido && <a href="/" className="inline-flex min-h-11 items-center px-1 text-xs font-semibold text-fono-text hover:underline">← Volver a la app</a>}
            </div>
          )}
        </header>

        {error && <Aviso tono="warn">{error}</Aviso>}

        <section className="grid grid-cols-2 gap-2 md:gap-3 lg:grid-cols-4" aria-label="Indicadores de hoy">
          {vacio
            ? [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl md:h-24" />)
            : kpis.map((kpi) => (
              <article key={kpi.clave} data-testid={`ops-kpi-${kpi.clave}`} className={cn('min-w-0 rounded-xl border p-3 md:p-4', TONOS[kpi.tono])}>
                <p className={ROTULO_SECCION}>{kpi.label}</p>
                <p className="v2-numero mt-1.5 break-words text-xl font-bold md:mt-2 md:text-3xl" data-testid={`ops-valor-${kpi.clave}`}>{kpi.valor}</p>
                <p className={cn(CELDA_DATO, 'mt-1')}>{kpi.detalle}</p>
              </article>
            ))}
        </section>

        {!vacio && !esPreview && pasos.length > 0 && (() => {
          const activo = pasos.findIndex((paso) => paso.total > 0)
          return (
            <ol className="grid grid-cols-1 gap-2 sm:grid-cols-3" aria-label="Flujo del lote">
              {pasos.map((paso, indice) => {
                const esActivo = indice === activo
                const hecho = activo > -1 && indice < activo
                return (
                  <li key={paso.clave} className={cn('flex items-center gap-3 rounded-xl border p-3', esActivo ? 'border-info/40 bg-info/5' : 'border-ink-600')}>
                    <span className={cn('v2-numero grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold', esActivo ? 'oc-paso-activo' : hecho ? 'bg-ok/15 text-ok' : 'bg-ink-700 text-mute')} aria-hidden>{hecho ? '✓' : paso.total}</span>
                    <span className="min-w-0">
                      <b className="block truncate text-sm">{paso.label}</b>
                      <span className="text-xs text-mute">{paso.total === 1 ? '1 equipo' : `${paso.total} equipos`}</span>
                    </span>
                  </li>
                )
              })}
            </ol>
          )
        })()}

        <div className="op-rd-page">
        <div className="op-rd-main">
        <section className="rounded-2xl border border-ink-600 bg-ink p-4" aria-label="Equipos en proceso">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Equipos en proceso</h2>
            <span className="text-xs text-mute">Vista rack · estados y grado</span>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {vacio
              ? [0, 1].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)
              : equipos.map((equipo) => (
                <article key={equipo.id} data-testid="ops-equipo" className={cn('flex items-start gap-3 rounded-xl border p-3', TONOS[equipo.tono] || TONOS.slate)}>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ink-800 text-mute">
                    <Icon name="box" className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={CELDA_IDENTIDAD} title={equipo.modelo}>{equipo.modelo}</p>
                    <p className="mt-0.5 truncate font-mono text-[11px] text-fono-light" title={equipo.serial}>{equipo.serial}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-1.5">
                      <StatusChip tono={TONO_CHIP[equipo.tono] || 'neutral'} etiqueta={ETIQUETA_RACK[equipo.estado] || equipo.estado} />
                      {equipo.grado && <GradoBadge grado={equipo.grado} />}
                      {equipo.bateria !== null && equipo.bateria !== undefined && <MedidorBateria porcentaje={equipo.bateria} variante="chip" mostrarEtiqueta />}
                      {equipo.ubicacion && <span className={CELDA_DATO}>{equipo.ubicacion}</span>}
                    </p>
                    {ORDEN_RACK.includes(equipo.estado) && <PasosEquipo estado={equipo.estado} testId="ops-pasos" className="mt-1.5" />}
                    {equipo.checklist && (
                      <div className="mt-1.5 max-w-[16rem]">
                        <div className="flex items-center justify-between gap-2 text-[11px] text-mute">
                          <span><b className="v2-numero text-fore">{equipo.checklist.pasan}</b> de {equipo.checklist.total} pasan</span>
                          <span className="v2-numero">{equipo.checklist.porcentaje}%</span>
                        </div>
                        <BarraProgreso className="mt-1" valor={equipo.checklist.pasan} max={equipo.checklist.total} tono={equipo.checklist.fallan > 0 ? 'warn' : 'ok'} alto="sm" etiqueta={`Checklist de ${equipo.modelo}: ${equipo.checklist.pasan} de ${equipo.checklist.total} pasan`} />
                      </div>
                    )}
                    {equipo.locks
                      ? <ChipsLocks locks={equipo.locks} className="mt-1.5" />
                      // En el mock (preview) no se inventa el estado: el chip honesto
                      // es solo para el tablero real, donde el dato puede faltar.
                      : !esPreview && <ul className="mt-1.5"><li className="inline-flex items-center gap-1.5 rounded-lg border border-ink-600 px-2 py-0.5 text-[11px] font-semibold text-mute">Locks sin verificar</li></ul>}
                  </div>
                </article>
              ))}
            {!vacio && !equipos.length && (
              <p className="rounded-xl border border-dashed border-ink-600 p-3 text-sm text-mute" data-testid="ops-equipos-vacio">
                No hay equipos en proceso: el taller está al día.
              </p>
            )}
          </div>
        </section>

        </div>
        <div className="op-rd-side">
        <section className="grid grid-cols-1 gap-3" aria-label="Colas de trabajo">
          {vacio
            ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-40 w-full rounded-2xl" />)
            : colas.map((cola) => (
              <article key={cola.estado} data-testid={`ops-cola-${cola.estado}`} className="rounded-2xl border border-ink-600 bg-ink-800/40 p-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-semibold">{cola.titulo}</h2>
                  <StatusChip tono={TONO_CHIP[cola.tono] || 'neutral'} etiqueta={String(cola.total ?? cola.items.length)} />
                </div>
                <ul className="mt-3 space-y-1.5">
                  {cola.items.map((item) => (
                    <li key={item.id} data-testid="ops-cola-item" className="flex items-center gap-2 rounded-lg border border-ink-600 px-2.5 py-2 text-sm">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-fono" aria-hidden="true" />
                      <span className="truncate" title={item.texto}>{item.texto}</span>
                      {item.ubicacion && <span className="ml-auto shrink-0 text-[11px] text-mute">{item.ubicacion}</span>}
                    </li>
                  ))}
                  {!cola.items.length && <li className="rounded-lg border border-dashed border-ink-600 px-2.5 py-2 text-xs text-mute">Sin equipos acá.</li>}
                </ul>
              </article>
            ))}
        </section>
        </div>
        </div>

        <p className="text-center text-xs text-mute">
          {esPreview
            ? 'Mock de la fase F3 (#241) con datos ficticios: no consulta el API ni cambia nada. Se activa solo con la aprobación del piloto.'
            : 'Datos en vivo de tu empresa: rack del taller y los últimos 200 pedidos. Se actualiza solo cada minuto.'}
        </p>
      </div>
      {!embebido && <ProductFooter />}
    </Raiz>
  )
}
