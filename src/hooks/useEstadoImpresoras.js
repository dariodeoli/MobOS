import { useEffect, useMemo, useRef, useState } from 'react'
import { diagnosticoAgente, estadoAgente } from '@/lib/printing/agent'
import { ESTADO_IMPRESORA, agregarEstado, estadoDeDiagnostico, motivoDeDiagnostico } from '@/lib/printing/estadoImpresoras'

// Verificación invisible: cada 20 s el agente local prueba el destino sin
// gastar papel (probe TCP / existencia de la cola CUPS). No sondea con la
// pestaña oculta ni durante una impresión o prueba, y como máximo dos
// impresoras a la vez para no martillar al agente.
export const INTERVALO_ESTADO_MS = 20000
const CONCURRENCIA = 2

const destinosDe = (impresoras = []) => (impresoras || [])
  .filter((impresora) => impresora?.id && impresora?.destino && impresora.activa !== false)
  .map((impresora) => ({ id: impresora.id, destino: impresora.destino }))

const claveDe = (destinos) => destinos.map((destino) => `${destino.id}=${destino.destino}`).join('|')

const sinVerificar = (actual, destinos) => {
  const siguiente = { ...actual }
  for (const destino of destinos) {
    if (siguiente[destino.id]?.estado !== ESTADO_IMPRESORA.SIN_VERIFICAR) siguiente[destino.id] = { estado: ESTADO_IMPRESORA.SIN_VERIFICAR, fecha: null, motivo: '' }
  }
  return siguiente
}

export function useEstadoImpresoras(impresoras = [], { intervaloMs = INTERVALO_ESTADO_MS, enPausa = false, concurrencia = CONCURRENCIA } = {}) {
  const [estados, setEstados] = useState({})
  const destinos = destinosDe(impresoras)
  const clave = claveDe(destinos)
  const destinosRef = useRef(destinos)
  useEffect(() => { destinosRef.current = destinos }, [destinos])

  useEffect(() => {
    if (enPausa || !clave) return undefined
    let vivo = true
    let enCurso = false
    let control = null
    const ciclo = async () => {
      if (!vivo || enCurso || document.visibilityState !== 'visible') return
      enCurso = true
      control = new AbortController()
      try {
        const agente = await estadoAgente()
        if (!vivo) return
        const lista = destinosRef.current
        if (!lista.length) return
        // Sin agente local no se inventa un estado: todo queda sin verificar.
        if (!agente?.disponible) {
          setEstados((actual) => sinVerificar(actual, lista))
          return
        }
        const lote = Math.max(1, concurrencia)
        for (let indice = 0; indice < lista.length; indice += lote) {
          await Promise.all(lista.slice(indice, indice + lote).map(async (destino) => {
            // "Verificando…" solo mientras no haya un dato previo: evita el
            // parpadeo del badge en cada ciclo.
            setEstados((actual) => (actual[destino.id] ? actual : { ...actual, [destino.id]: { estado: ESTADO_IMPRESORA.VERIFICANDO, fecha: null, motivo: '' } }))
            try {
              const resultado = await diagnosticoAgente(destino.destino, { signal: control.signal })
              if (!vivo) return
              const estado = estadoDeDiagnostico(resultado)
              setEstados((actual) => ({ ...actual, [destino.id]: { estado, fecha: Date.now(), motivo: estado === ESTADO_IMPRESORA.OK ? '' : motivoDeDiagnostico(resultado) } }))
            } catch (cause) {
              if (!vivo) return
              setEstados((actual) => ({ ...actual, [destino.id]: { estado: ESTADO_IMPRESORA.ERROR, fecha: Date.now(), motivo: cause?.message || 'El agente no respondió' } }))
            }
          }))
          if (!vivo) return
        }
      } catch {
        // El sondeo es informativo: un fallo inesperado no rompe la pantalla.
      } finally {
        enCurso = false
      }
    }
    void ciclo()
    const timer = window.setInterval(() => { void ciclo() }, intervaloMs)
    const visibilidad = () => { if (document.visibilityState === 'visible') void ciclo() }
    document.addEventListener('visibilitychange', visibilidad)
    return () => {
      vivo = false
      window.clearInterval(timer)
      control?.abort()
      document.removeEventListener('visibilitychange', visibilidad)
    }
  }, [clave, intervaloMs, enPausa, concurrencia])

  const agregado = useMemo(() => agregarEstado(impresoras, estados), [impresoras, estados])
  return { estados, agregado }
}
