import { useEffect, useState } from 'react'
import { Cronologia as ListaCronologia } from 'owncoding-ui'
import { api } from '@/lib/api/client'
import { isDemoRuntime } from '@/lib/demoMode'
import { historialDemo } from '@/lib/demo/historial.js'
import { fuentesHistoriaDemo } from '@/lib/demoHistoria'

// Adaptador (#268): la lista, los estados honestos (cargando/error/vacío) y la
// cabecera de actualizar viven en la biblioteca; acá queda el fetch del
// endpoint y el mapeo de los eventos de la app al contrato de hitos.
// Los tipos de evento llevan su ícono y tono propios (el objeto los pisa).
const EVENTOS = {
  product: { icono: 'box', tono: 'info' },
  unit: { icono: 'box', tono: 'mute' },
  purchase: { icono: 'receipt', tono: 'warn' },
  payment: { icono: 'money', tono: 'ok' },
  price: { icono: 'money', tono: 'ok' },
  supplier: { icono: 'user', tono: 'info' },
  quote: { icono: 'report', tono: 'info' },
  sale: { icono: 'cart', tono: 'ok' },
  cash: { icono: 'wallet', tono: 'ok' },
  expense: { icono: 'receipt', tono: 'bad' },
  user: { icono: 'user', tono: 'info' },
  attachment: { icono: 'upload', tono: 'mute' },
  audit: { icono: 'edit', tono: 'mute' },
  service: { icono: 'box', tono: 'warn' },
  notice: { icono: 'report', tono: 'info' },
  order: { icono: 'cart', tono: 'ok' },
  customer: { icono: 'user', tono: 'info' },
  warranty: { icono: 'box', tono: 'info' },
  imei: { icono: 'box', tono: 'mute' },
  repair: { icono: 'box', tono: 'warn' },
  credit: { icono: 'wallet', tono: 'warn' },
  tradein: { icono: 'phone', tono: 'info' },
  reservation: { icono: 'clock', tono: 'warn' },
}
const ICONOS = Object.fromEntries(Object.entries(EVENTOS).map(([tipo, valor]) => [tipo, valor.icono]))
const TONOS = Object.fromEntries(Object.entries(EVENTOS).map(([tipo, valor]) => [tipo, valor.tono]))

// Lista de eventos de { events: [{ id, type, action, createdAt, user, detail }] }
// más reciente primero, con carga bajo demanda: se pide al activarse, al
// actualizar y al reintentar. Mismo formato que la cronología del cliente.
// `eventos` (opcional) saltea el fetch: la demo resuelve su historial local.
// `paginado`: pide páginas de 25 (`limit`/`offset`) y ofrece «Ver más»; en demo
// pagina en el navegador. `resumen(meta)` dibuja un bloque (totales, productos)
// encima de la lista con lo que devuelva el endpoint además de `events`.
const PAGINA = 25
export default function Cronologia({ endpoint, eventos: eventosLocales = null, active = true, vacio = 'Sin actividad', descripcionVacio = 'Los movimientos aparecerán acá.', paginado = false, resumen = null }) {
  const [eventosRemotos, setEventosRemotos] = useState([])
  const [meta, setMeta] = useState(null)
  const [siguiente, setSiguiente] = useState(null)
  const [cargandoMas, setCargandoMas] = useState(false)
  const [visiblesDemo, setVisiblesDemo] = useState(PAGINA)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const recargar = () => setRevision((valor) => valor + 1)
  const conLocales = Array.isArray(eventosLocales)
  const url = (offset = 0) => (paginado ? `${endpoint}${endpoint.includes('?') ? '&' : '?'}limit=${PAGINA}${offset ? `&offset=${offset}` : ''}` : endpoint)

  useEffect(() => {
    if (conLocales || !active || !endpoint) return undefined
    let vivo = true
    setCargando(true)
    setError('')
    setVisiblesDemo(PAGINA)
    // #324: en demo la cronología sale de los fixtures locales; fuera de demo
    // va al endpoint real como siempre.
    const pedido = isDemoRuntime ? Promise.resolve(historialDemo(endpoint, fuentesHistoriaDemo())) : paginado ? api.get(url()) : api.get(endpoint)
    pedido
      .then((data) => {
        if (!vivo) return
        setEventosRemotos(Array.isArray(data?.events) ? data.events : [])
        setSiguiente(data?.nextOffset ?? null)
        const { events: _eventos, ...resto } = data || {}
        setMeta(resto)
        setCargando(false)
      })
      .catch((causa) => {
        if (!vivo) return
        setError(causa?.message || 'No se pudo cargar la cronología.')
        setCargando(false)
      })
    return () => { vivo = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conLocales, active, endpoint, revision])

  async function verMas() {
    if (isDemoRuntime) { setVisiblesDemo((n) => n + PAGINA); return }
    if (siguiente == null || cargandoMas) return
    setCargandoMas(true)
    try {
      const data = await api.get(url(siguiente))
      setEventosRemotos((actual) => [...actual, ...(Array.isArray(data?.events) ? data.events : [])])
      setSiguiente(data?.nextOffset ?? null)
    } catch (causa) {
      setError(causa?.message || 'No se pudo cargar más.')
    } finally { setCargandoMas(false) }
  }

  const todos = conLocales ? eventosLocales : eventosRemotos
  const eventos = paginado && isDemoRuntime && !conLocales ? todos.slice(0, visiblesDemo) : todos
  const hayMas = paginado && !conLocales && (isDemoRuntime ? todos.length > visiblesDemo : siguiente != null)

  const hitos = eventos.map((evento) => ({
    id: evento.id,
    fecha: evento.createdAt,
    tipo: evento.type,
    titulo: evento.action,
    detalle: evento.detail,
    actor: evento.user?.name || 'Sistema',
  }))

  return (
    <div className="space-y-3">
      {resumen && meta ? resumen(meta) : null}
      <ListaCronologia
        hitos={hitos}
        cargando={cargando}
        error={error}
        onReintentar={recargar}
        onActualizar={recargar}
        iconos={ICONOS}
        tonos={TONOS}
        vacioTitulo={vacio}
        vacioDetalle={descripcionVacio}
      />
      {hayMas && !cargando && (
        <div className="flex justify-center">
          <button type="button" disabled={cargandoMas} onClick={verMas} data-testid="cronologia-ver-mas" className="min-h-11 rounded-lg border border-ink-500 px-4 py-2 text-xs font-semibold text-mute transition hover:border-fono hover:text-fore disabled:opacity-60 md:min-h-0">{cargandoMas ? 'Cargando…' : 'Ver más'}</button>
        </div>
      )}
    </div>
  )
}
