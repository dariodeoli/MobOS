import { useEffect, useState } from 'react'
import { Cronologia as ListaCronologia } from 'owncoding-ui'
import { api } from '@/lib/api/client'
import { isDemoRuntime } from '@/lib/demoMode'
import { historialDemo } from '@/lib/demo/historial.js'

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
}
const ICONOS = Object.fromEntries(Object.entries(EVENTOS).map(([tipo, valor]) => [tipo, valor.icono]))
const TONOS = Object.fromEntries(Object.entries(EVENTOS).map(([tipo, valor]) => [tipo, valor.tono]))

// Lista de eventos de { events: [{ id, type, action, createdAt, user, detail }] }
// más reciente primero, con carga bajo demanda: se pide al activarse, al
// actualizar y al reintentar. Mismo formato que la cronología del cliente.
export default function Cronologia({ endpoint, active = true, vacio = 'Sin actividad', descripcionVacio = 'Los movimientos aparecerán acá.' }) {
  const [eventos, setEventos] = useState([])
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const recargar = () => setRevision((valor) => valor + 1)

  useEffect(() => {
    if (!active || !endpoint) return undefined
    let vivo = true
    setCargando(true)
    setError('')
    // #324: en demo la cronología sale de los fixtures locales; fuera de demo
    // va al endpoint real como siempre.
    const pedido = isDemoRuntime ? Promise.resolve(historialDemo(endpoint)) : api.get(endpoint)
    pedido
      .then((data) => {
        if (!vivo) return
        setEventos(Array.isArray(data?.events) ? data.events : [])
        setCargando(false)
      })
      .catch((causa) => {
        if (!vivo) return
        setError(causa?.message || 'No se pudo cargar la cronología.')
        setCargando(false)
      })
    return () => { vivo = false }
  }, [active, endpoint, revision])

  const hitos = eventos.map((evento) => ({
    id: evento.id,
    fecha: evento.createdAt,
    tipo: evento.type,
    titulo: evento.action,
    detalle: evento.detail,
    actor: evento.user?.name || 'Sistema',
  }))

  return (
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
  )
}
