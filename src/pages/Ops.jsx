import { useCallback, useEffect, useMemo, useState } from 'react'
import TableroOps from '@/components/ops/TableroOps'
import { api, resources } from '@/lib/api'
import { demoSessionActive } from '@/lib/demoMode'
import { consultasDemoImei } from '@/lib/demoImei'
import { colasDelTaller, equiposEnProceso, imeiConsultable, kpisOps, locksDeConsulta, pasosDelLote, resumenOps } from '@/lib/opsTablero'

// F3 real (#241): el tablero de operaciones con DATOS REALES de la empresa en
// `/ops` (activo desde la aprobación del rollout; `VITE_OPS_V2=0` lo apaga).
// Lee el rack del taller (#240), los pedidos recientes y la última consulta
// IMEI de cada equipo en proceso (chips de locks); las cuentas viven en
// `lib/opsTablero.js`. La vista previa con datos ficticios sigue en
// /ops-preview.

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

// #240: los locks del equipo salen de la última consulta IMEI guardada. Se pide
// solo por los equipos en proceso (el tablero muestra hasta 6) y solo si el
// serial es un IMEI consultable; sin consulta el tile muestra «Locks sin
// verificar» en vez de un «libre» que nadie verificó.
async function completarLocks(equipos) {
  const consultables = equipos.filter((equipo) => !equipo.locks && imeiConsultable(equipo.serial))
  const pares = await Promise.all(consultables.map(async (equipo) => {
    try {
      if (demoSessionActive()) return [equipo.id, locksDeConsulta(consultasDemoImei(equipo.serial)?.[0], equipo.serial)]
      const datos = await api.get(`/api/imei?imei=${encodeURIComponent(equipo.serial)}&limit=1`)
      return [equipo.id, locksDeConsulta(datos?.consultas?.[0], equipo.serial)]
    } catch {
      return [equipo.id, null]
    }
  }))
  const porId = Object.fromEntries(pares)
  return equipos.map((equipo) => (porId[equipo.id] === undefined ? equipo : { ...equipo, locks: porId[equipo.id] }))
}

export default function Ops() {
  const [unidades, setUnidades] = useState([])
  const [equipos, setEquipos] = useState([])
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
    const listaUnidades = Array.isArray(siguienteUnidades) ? siguienteUnidades : []
    const enProceso = equiposEnProceso(listaUnidades)
    setUnidades(listaUnidades)
    // Los locks son un extra: si fallan, el rack igual se pinta.
    setEquipos(await completarLocks(enProceso).catch(() => enProceso))
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
