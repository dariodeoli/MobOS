import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/lib/api/client'
import { useSesion } from '@/lib/sesion'
import { useModulos } from '@/lib/useModulos'
import { estadoDemoModulos } from '@/lib/demo/modulos'
import { cambiarModuloSesion } from '@/lib/demo/modulosSesion'
import {
  AL_DESACTIVAR, FILTROS_MODULOS, INCLUYE, SALDOS_AL_DESACTIVAR,
  agruparModulos, beneficiosDe, dependenciasFaltantes, dependientesActivos, disponible, filtrarModulos, hrefConfigurar, irA, modulosOpcionales, viveEn,
} from '@/lib/modulosPantalla'
import { Aviso, Badge, Card, Nota, Subtabs, useToast } from '@/components/ui'
import { ConfirmDialog } from '@/components/shared/popupKit'
import Popup from '@/components/shared/Popup'
import Icon, { ICONOS } from '@/components/shared/Icon'
import Switch from '@/components/shared/Switch'
import IlustracionModulo, { tieneIlustracion } from './IlustracionModulo'
import './modulos.css'

// Módulos: grilla de tarjetas agrupadas por área (Ventas, Stock, Finanzas,
// Clientes, Integraciones). Cada tarjeta trae una mini ilustración con datos
// ficticios, 2-3 beneficios, ícono + nombre + interruptor, chips de estado,
// dónde vive en el menú y los botones «Ir a …» y «Configurar». El nombre (o
// «Qué incluye») abre el detalle. Solo el dueño cambia algo; el resto ve las
// tarjetas en lectura. En la demo el estado vive en memoria de la sesión.
const ICONO_DE = { tool: 'wrench', heart: 'user' }
const iconoModulo = nombre => {
  const candidato = ICONO_DE[nombre] || nombre
  return ICONOS.includes(candidato) ? candidato : 'grid'
}

function TarjetaModulo({ def, indice, activo, puedeCambiar, ocupado, faltan, dependientes, onAbrir, onCambiar }) {
  const habilitado = disponible(def)
  const destino = activo ? irA(def) : null
  // «Configurar» solo cuando lleva a otro lugar que «Ir a …» (Delivery se configura en su pantalla).
  const configurar = activo && hrefConfigurar(def) !== destino?.href ? hrefConfigurar(def) : null
  const vive = viveEn(def)
  const beneficios = beneficiosDe(def)
  const bloqueo = !activo && faltan.length ? `Primero activá: ${faltan.join(', ')}` : activo && dependientes.length ? `Primero desactivá: ${dependientes.join(', ')}` : ''
  const estado = habilitado ? (activo ? 'activo' : 'apagado') : 'proximamente'
  return (
    <li data-testid={`modulo-fila-${def.id}`} data-estado={estado} className="mod-card" style={{ '--i': indice }}>
      {tieneIlustracion(def.id) && (
        <div>
          <IlustracionModulo key={estado} id={def.id} apagado={!activo || !habilitado} />
          <p className="mod-leyenda">Ilustración de ejemplo: los datos no son reales.</p>
        </div>
      )}
      {beneficios.length > 0 && (
        <ul className="mod-beneficios">{beneficios.map(texto => <li key={texto}>{texto}</li>)}</ul>
      )}
      <div className="flex items-start gap-3">
        <span aria-hidden className="mod-icono">
          <Icon name={iconoModulo(def.icon)} className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => onAbrir(def.id)}
            aria-label={`${def.name}: ver detalle`}
            className="mod-nombre -my-1.5 min-h-11 rounded-md py-1.5"
          >
            {def.name}
          </button>
          <div className="mt-0.5 flex flex-wrap gap-1.5">
            <span key={estado} className="mod-estado">
              {!habilitado ? <Badge color="slate">Próximamente</Badge> : activo ? <Badge color="green">Activo</Badge> : <Badge color="slate">Disponible</Badge>}
            </span>
            {def.tier === 'included' && <Badge color="blue">Incluido en tu plan</Badge>}
          </div>
        </div>
        {habilitado && (
          <label className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center" title={bloqueo || (!puedeCambiar ? 'Solo el dueño de la empresa puede cambiar los módulos.' : undefined)}>
            <Switch
              checked={activo}
              disabled={!puedeCambiar || ocupado || Boolean(bloqueo)}
              ariaLabel={def.name}
              onChange={() => onCambiar(def, !activo)}
            />
          </label>
        )}
      </div>
      <p className="text-sm text-mute">{def.description}</p>
      {vive && <p className="mod-vive"><b>Vive en:</b> {vive}</p>}
      {bloqueo && <p role="note" className="text-sm text-warn-text">{bloqueo}.</p>}
      {!habilitado && <p className="text-sm text-mute">Todavía no está disponible. Lo vas a poder activar acá cuando salga.</p>}
      <div className="mod-acciones">
        {destino && (
          <Link to={destino.href} className="mod-ir">
            Ir a {destino.label} <span aria-hidden className="mod-flecha">→</span>
          </Link>
        )}
        {configurar && <Link to={configurar} className="mod-secundario">Configurar</Link>}
        <button type="button" onClick={() => onAbrir(def.id)} aria-label={`${def.name}: qué incluye`} className="mod-terciario">
          Qué incluye
        </button>
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

  // Demo: catálogo ficticio con el estado en memoria de la sesión (se aplica de verdad).
  const datos = useMemo(() => (esDemo ? { ...estadoDemoModulos(), state: modulos.fuente?.state ?? estadoDemoModulos().state } : modulos.fuente), [esDemo, modulos.fuente])
  useEffect(() => {
    if (esDemo || datos || !modulos.resuelto) return
    modulos.refrescar().catch(() => setCargaFallida('No se pudo cargar la lista de módulos.'))
  }, [esDemo, datos, modulos])
  // La demo ve todo activo (`demo`); en una empresa real manda el estado guardado.
  const fuente = datos
  const puedeCambiar = Boolean(datos?.canManage)
  const lista = useMemo(() => (datos ? filtrarModulos(fuente, filtro, datos.catalog) : []), [datos, fuente, filtro])
  const grupos = useMemo(() => agruparModulos(lista), [lista])
  const activoDe = id => modulos.activo(id)
  const opcionales = datos ? modulosOpcionales(datos.catalog).filter(disponible) : []
  const totalActivos = opcionales.filter(def => activoDe(def.id)).length
  const detalle = detalleId ? datos?.catalog.find(def => def.id === detalleId) : null

  async function aplicar(def, enabled) {
    if (ocupado) return
    if (esDemo) {
      cambiarModuloSesion(def.id, enabled)
      toast.success(enabled ? `${def.name} activado` : `${def.name} desactivado`)
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
    if (enabled) aplicar(def, true)
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
          Demo: activá o desactivá módulos y mirá cómo cambia el menú. Se reinicia al salir.
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
      <p className="text-sm text-mute" data-testid="modulos-resumen">
        <b className="font-semibold text-fore">{totalActivos} de {opcionales.length}</b> módulos activos. Lo que apagues se oculta del menú; tus datos se conservan.
      </p>
      <Subtabs value={filtro} onChange={setFiltro} items={FILTROS_MODULOS} ariaLabel="Filtrar módulos" className="[&>button]:min-h-11 md:[&>button]:min-h-9" />
      {lista.length === 0 ? (
        <Card className="p-5 text-sm text-mute" data-testid="modulos-vacio">No hay módulos para este filtro.</Card>
      ) : (
        <div aria-label="Módulos disponibles" role="region" data-testid="modulos-lista" className="pt-1">
          {grupos.map(grupo => (
            <section key={grupo.id} className="mod-grupo" aria-labelledby={`modulos-grupo-${grupo.id}`}>
              <h2 id={`modulos-grupo-${grupo.id}`} className="mod-grupo-titulo">
                {grupo.titulo}
                <span className="mod-grupo-cuenta">{grupo.modulos.filter(def => disponible(def) && activoDe(def.id)).length} de {grupo.modulos.length} activos</span>
              </h2>
              <ul className="mod-grilla">
                {grupo.modulos.map((def, indice) => (
                  <TarjetaModulo
                    key={def.id}
                    def={def}
                    indice={indice}
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
            </section>
          ))}
        </div>
      )}

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
