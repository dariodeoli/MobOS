import { useCallback, useEffect, useMemo, useState } from 'react'
import TableroOps from '@/components/ops/TableroOps'
import { api, resources } from '@/lib/api'
import { demoSessionActive } from '@/lib/demoMode'
import { colasDelTaller, equiposEnProceso, kpisOps, pasosDelLote, resumenOps } from '@/lib/opsTablero'

// F3 real (#241): el tablero de operaciones con DATOS REALES de la empresa,
// detrás del flag VITE_OPS_V2=1 (ruta /ops, sin entrada en el menú hasta la
// aprobación del piloto). Lee el rack del taller (#240) y los pedidos
// recientes; las cuentas viven en `lib/opsTablero.js`. La vista previa con
// datos ficticios sigue en /ops-preview.

function mensajeDeError(error) {
  return String(error?.message || error || 'No pudimos leer los datos del tablero.')
}

// El API devuelve las unidades de a 500: el tablero cuenta el rack completo, así
// que se recorren las páginas con el cursor (#245). En la demo se lee el
// inventario local de práctica.
async function todasLasUnidades() {
  if (demoSessionActive()) return resources.inventoryUnits.list()
  const todas = []
  let cursor = null
  for (let pagina = 0; pagina < 20; pagina += 1) {
    const lote = await api.get(`/api/inventory-units?limit=500${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)
    const filas = Array.isArray(lote) ? lote : []
    todas.push(...filas)
    if (filas.length < 500) break
    cursor = filas[filas.length - 1].id
  }
  return todas
}

export default function Ops() {
  const [unidades, setUnidades] = useState([])
  const [pedidos, setPedidos] = useState([])
  const [avisos, setAvisos] = useState([])
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(true)
  const [actualizado, setActualizado] = useState(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    const pendientes = []
    let siguienteUnidades = []
    let siguientesPedidos = []
    try {
      siguienteUnidades = await todasLasUnidades()
    } catch (fallo) {
      setError(mensajeDeError(fallo))
      setAvisos([])
      setCargando(false)
      return
    }
    if (demoSessionActive()) {
      pendientes.push('En la demo no se leen pedidos reales: los KPIs de ventas quedan en cero.')
    } else {
      try {
        siguientesPedidos = await api.get('/api/orders?limit=200&filtro=todos')
      } catch (fallo) {
        pendientes.push(`No pudimos leer los pedidos (${mensajeDeError(fallo)}). Los KPIs de pedidos quedan en cero.`)
      }
    }
    setUnidades(Array.isArray(siguienteUnidades) ? siguienteUnidades : [])
    setPedidos(Array.isArray(siguientesPedidos) ? siguientesPedidos : [])
    setAvisos(pendientes)
    setError('')
    setActualizado(new Date())
    setCargando(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  // El tablero se mantiene al día solo mientras la pestaña está visible.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') cargar()
    }, 60000)
    return () => clearInterval(id)
  }, [cargar])

  const resumen = useMemo(() => resumenOps({ unidades, pedidos, ahora: actualizado || new Date() }), [unidades, pedidos, actualizado])
  const kpis = useMemo(() => kpisOps(resumen), [resumen])
  const pasos = useMemo(() => pasosDelLote(resumen), [resumen])
  const equipos = useMemo(() => equiposEnProceso(unidades), [unidades])
  const colas = useMemo(() => colasDelTaller(unidades), [unidades])

  return (
    <TableroOps
      modo="real"
      kpis={kpis}
      equipos={equipos}
      colas={colas}
      pasos={pasos}
      // Esqueletos solo en la primera carga: después se refresca sin parpadear.
      cargando={cargando && !actualizado}
      error={error || avisos.join(' ')}
      actualizado={actualizado}
      onRefrescar={cargar}
    />
  )
}
