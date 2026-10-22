import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/lib/api/client'
import { useSesion } from '@/lib/sesion'
import { useModulos } from '@/lib/useModulos'
import { estadoDemoModulos } from '@/lib/demo/modulos'
import {
  AL_DESACTIVAR, FILTROS_MODULOS, INCLUYE, SALDOS_AL_DESACTIVAR,
  dependenciasFaltantes, dependientesActivos, disponible, filtrarModulos, hrefConfigurar,
} from '@/lib/modulosPantalla'
import { Aviso, Badge, Button, Card, Nota, Subtabs, useToast } from '@/components/ui'
import { ConfirmDialog } from '@/components/shared/popupKit'
import Popup from '@/components/shared/Popup'
import Icon, { ICONOS } from '@/components/shared/Icon'
import { cn } from '@/lib/utils'

// Módulos: lista tipo tienda de apps. Cada fila trae ícono, nombre, una línea
// de descripción, estado, el botón Activar/Desactivar (44 px) y «Configurar ›».
// Tocar la fila abre el detalle (qué incluye, de qué depende, qué pasa al
// desactivarlo). Solo el dueño cambia algo; el resto ve la lista en lectura.
// En la demo todo está activo y los cambios no se guardan.
const ICONO_DE = { tool: 'wrench', heart: 'user' }
const iconoModulo = nombre => {
  const candidato = ICONO_DE[nombre] || nombre
  return ICONOS.includes(candidato) ? candidato : 'grid'
}

function FilaModulo({ def, activo, puedeCambiar, ocupado, faltan, dependientes, onAbrir, onCambiar }) {
  const habilitado = disponible(def)
  const configurar = activo ? hrefConfigurar(def) : null
  const bloqueo = !activo && faltan.length ? `Primero activá: ${faltan.join(', ')}` : activo && dependientes.length ? `Primero desactivá: ${dependientes.join(', ')}` : ''
  return (
    <li data-testid={`modulo-fila-${def.id}`} data-estado={habilitado ? (activo ? 'activo' : 'apagado') : 'proximamente'} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ink-700 text-fono-light">
          <Icon name={iconoModulo(def.icon)} className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <button
              type="button"
              onClick={() => onAbrir(def.id)}
              aria-label={`${def.name}: ver detalle`}
              className="-my-2 min-h-11 rounded-md py-2 text-left text-sm font-semibold text-fore hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-fono"
            >
              {def.name}
            </button>
            {!habilitado ? <Badge color="slate">Próximamente</Badge> : activo ? <Badge color="green">Activo</Badge> : <Badge color="slate">Desactivado</Badge>}
          </div>
          <p className="text-sm text-mute">{def.description}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
        {configurar && (
          <Link to={configurar} className="inline-flex min-h-11 items-center gap-1 rounded-lg px-3 text-sm font-semibold text-fono-light hover:bg-ink-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-fono">
            Configurar <span aria-hidden>›</span>
          </Link>
        )}
        {habilitado && (
          <Button
            type="button"
            className="min-h-11 min-w-28"
            variant={activo ? 'outline' : 'primary'}
            disabled={!puedeCambiar || ocupado || Boolean(bloqueo)}
            title={bloqueo || (!puedeCambiar ? 'Solo el dueño de la empresa puede cambiar los módulos.' : undefined)}
            aria-label={`${activo ? 'Desactivar' : 'Activar'} ${def.name}`}
            onClick={() => onCambiar(def, !activo)}
          >
            {activo ? 'Desactivar' : 'Activar'}
          </Button>
        )}
      </div>
    </li>
  )
}

export default function Modulos() {
  const { esDemo } = useSesion()
  const modulos = useModulos()
  const toast = useToast()
  const [filtro, setFiltro] = useState('todos')
  const [detalleId, setDetalleId] = useState(null)
  const [aApagar, setAApagar] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState(null)
  const [cargaFallida, setCargaFallida] = useState('')

  const datos = esDemo ? estadoDemoModulos() : modulos.fuente
  useEffect(() => {
    if (esDemo || datos || !modulos.resuelto) return
    modulos.refrescar().catch(() => setCargaFallida('No se pudo cargar la lista de módulos.'))
  }, [esDemo, datos, modulos])
  // La demo ve todo activo (`demo`); en una empresa real manda el estado guardado.
  const fuente = useMemo(() => (esDemo ? { demo: true } : datos), [esDemo, datos])
  const puedeCambiar = Boolean(datos?.canManage)
  const lista = useMemo(() => (datos ? filtrarModulos(fuente, filtro, datos.catalog) : []), [datos, fuente, filtro])
  const activoDe = id => (esDemo ? true : modulos.activo(id))
  const detalle = detalleId ? datos?.catalog.find(def => def.id === detalleId) : null

  async function aplicar(def, enabled) {
    if (ocupado) return
    if (esDemo) {
      toast.info('Vista previa de la demo', 'En la demo los módulos están todos activos y no se guardan cambios.')
      return
    }
    setOcupado(true); setError(null)
    try {
      const resultado = await api.put('/api/tenant/modules', { moduleId: def.id, enabled })
      window.dispatchEvent(new CustomEvent('mobos:module-store-updated', { detail: resultado.state }))
      toast.success(enabled ? `${def.name} activado` : `${def.name} desactivado`)
    } catch (causa) {
      const saldos = Array.isArray(causa?.details?.saldos) ? causa.details.saldos : []
      setError({
        titulo: `No se pudo ${enabled ? 'activar' : 'desactivar'} ${def.name}.`,
        mensaje: saldos.length ? 'Todavía hay saldos o trámites abiertos. Resolvelos primero:' : causa?.message || 'Probá de nuevo.',
        saldos,
      })
    } finally { setOcupado(false) }
  }

  function pedirCambio(def, enabled) {
    setError(null)
    if (esDemo) aplicar(def, enabled)
    else if (enabled) aplicar(def, true)
    else setAApagar(def)
  }

  if (!datos) {
    return (
      <Card className="p-4 text-sm text-mute" data-testid="modulos-pantalla">
        {cargaFallida ? <Aviso tono="error" role="alert">{cargaFallida}</Aviso> : 'Cargando módulos…'}
      </Card>
    )
  }

  return (
    <div className="space-y-3" data-testid="modulos-pantalla">
      {!puedeCambiar && (
        <Nota tono="info" como="div" role="status" data-testid="modulos-solo-lectura">
          Solo el dueño de la empresa puede activar o desactivar módulos. Acá ves cuáles están activos.
        </Nota>
      )}
      {esDemo && (
        <Nota tono="info" como="div" role="status" data-testid="modulos-demo">
          Vista previa con datos de ejemplo: en la demo todos los módulos están activos y los cambios no se guardan.
        </Nota>
      )}
      {error && (
        <Aviso tono="error" como="div" className="rounded-xl p-3 text-sm" data-testid="modulos-error">
          <b className="block">{error.titulo}</b>
          <span className="block">{error.mensaje}</span>
          {error.saldos.length > 0 && (
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {error.saldos.map(saldo => <li key={saldo.detalle || saldo.tipo}>{saldo.detalle || saldo.tipo}</li>)}
            </ul>
          )}
        </Aviso>
      )}
      <Subtabs value={filtro} onChange={setFiltro} items={FILTROS_MODULOS} ariaLabel="Filtrar módulos" className="[&>button]:min-h-11 md:[&>button]:min-h-9" />
      <Card className="overflow-hidden p-0">
        {lista.length === 0 ? (
          <p className="p-5 text-sm text-mute" data-testid="modulos-vacio">No hay módulos para este filtro.</p>
        ) : (
          <ul className={cn('divide-y divide-ink-600')} aria-label="Módulos disponibles" data-testid="modulos-lista">
            {lista.map(def => (
              <FilaModulo
                key={def.id}
                def={def}
                activo={activoDe(def.id)}
                puedeCambiar={puedeCambiar}
                ocupado={ocupado}
                faltan={dependenciasFaltantes(def, fuente, datos.catalog)}
                dependientes={dependientesActivos(def, fuente, datos.catalog)}
                onAbrir={setDetalleId}
                onCambiar={pedirCambio}
              />
            ))}
          </ul>
        )}
      </Card>

      {detalle && (() => {
        const activo = activoDe(detalle.id)
        const habilitado = disponible(detalle)
        const faltan = dependenciasFaltantes(detalle, fuente, datos.catalog)
        const dependientes = dependientesActivos(detalle, fuente, datos.catalog)
        const bloqueo = !activo && faltan.length > 0 ? `Primero activá: ${faltan.join(', ')}` : activo && dependientes.length > 0 ? `Primero desactivá: ${dependientes.join(', ')}` : ''
        const incluye = INCLUYE[detalle.id] || detalle.capabilities || []
        const cerrar = () => setDetalleId(null)
        return (
          <Popup
            open
            onClose={cerrar}
            title={detalle.name}
            tamano="md"
            testId="modulo-detalle"
            acciones={{
              secundaria: { label: 'Cerrar', onClick: cerrar },
              ...(habilitado && puedeCambiar && !bloqueo ? { [activo ? 'peligro' : 'primaria']: { label: activo ? 'Desactivar' : 'Activar', onClick: () => { cerrar(); pedirCambio(detalle, !activo) } } } : {}),
            }}
          >
            <div className="space-y-4 text-sm">
              <p className="text-mute">{detalle.description}</p>
              {incluye.length > 0 && (
                <section>
                  <h3 className="font-semibold text-fore">Qué incluye</h3>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-mute">{incluye.map(item => <li key={item}>{item}</li>)}</ul>
                </section>
              )}
              <section>
                <h3 className="font-semibold text-fore">De qué depende</h3>
                <p className="mt-1 text-mute">
                  {detalle.dependencies.length
                    ? detalle.dependencies.map(id => datos.catalog.find(item => item.id === id)?.name || id).join(', ')
                    : 'No necesita otros módulos.'}
                </p>
              </section>
              {habilitado && (
                <section>
                  <h3 className="font-semibold text-fore">Qué pasa al desactivarlo</h3>
                  <p className="mt-1 text-mute">{AL_DESACTIVAR}</p>
                  {SALDOS_AL_DESACTIVAR[detalle.id] && <p className="mt-1 text-mute">{SALDOS_AL_DESACTIVAR[detalle.id]}</p>}
                </section>
              )}
              {!habilitado && <p className="rounded-lg border border-ink-600 p-2 text-mute">Todavía no está disponible. Lo vas a poder activar acá cuando salga.</p>}
              {bloqueo && <p role="note" className="rounded-lg border border-ink-600 p-2 text-mute">{bloqueo}.</p>}
            </div>
          </Popup>
        )
      })()}

      <ConfirmDialog
        open={Boolean(aApagar)}
        variant="danger"
        title={aApagar ? `¿Desactivar ${aApagar.name}?` : ''}
        description={`${AL_DESACTIVAR}${aApagar && SALDOS_AL_DESACTIVAR[aApagar.id] ? ` ${SALDOS_AL_DESACTIVAR[aApagar.id]}` : ''}`}
        confirmLabel="Desactivar"
        busy={ocupado}
        onCancel={() => setAApagar(null)}
        onConfirm={async () => { const def = aApagar; await aplicar(def, false); setAApagar(null) }}
      />
    </div>
  )
}
