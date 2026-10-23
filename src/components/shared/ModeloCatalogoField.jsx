import { useEffect, useMemo, useRef, useState } from 'react'
import ComboBuscador from '@/components/shared/ComboBuscador'
import SelectorResultadoCompacto from '@/components/shared/SelectorResultadoCompacto'
import { CATALOGO_APPLE, modeloApple } from '../../../backend/lib/catalogo-apple.mjs'

// Modelo del catálogo Apple (módulo «Catálogo de modelos»): buscador con la
// lista de todos los modelos y, una vez elegido, una sola fila compacta con
// «Cambiar» (un control por estado). También acepta un
// modelo que no es Apple escrito a mano (ej. Samsung): ahí no hay capacidades
// ni colores del catálogo y la pantalla pide la capacidad como texto.
const OPCIONES = CATALOGO_APPLE.map((modelo) => ({ value: modelo.nombre, label: modelo.nombre, detail: modelo.familia }))

export default function ModeloCatalogoField({ id = 'modelo-catalogo', value = '', onChange, disabled = false, placeholder = 'Buscar modelo (ej. 15 pro max)', testId = 'modelo-catalogo' }) {
  // La fila compacta aparece al elegir de la lista, no mientras se escribe «iPhone 13» camino a «iPhone 13 Pro».
  const [escribiendo, setEscribiendo] = useState(false)
  const [enfocar, setEnfocar] = useState(false)
  const caja = useRef(null)
  useEffect(() => { if (enfocar && caja.current) { caja.current.querySelector('input')?.focus(); setEnfocar(false) } }, [enfocar, escribiendo])
  const elegido = useMemo(() => modeloApple(value), [value])
  if (elegido && !escribiendo) {
    const caps = elegido.capacidades.length
    return <SelectorResultadoCompacto
      testId={`${testId}-elegido`}
      nombre={elegido.nombre}
      detalles={[elegido.familia, caps ? `${caps} capacidad${caps === 1 ? '' : 'es'}` : '']}
      onCambiar={disabled ? undefined : () => { setEscribiendo(true); setEnfocar(true); onChange?.('') }}
      etiquetaCambiar="Cambiar modelo"
    />
  }
  return <div ref={caja} data-testid={testId}>
    <ComboBuscador
      id={id}
      ariaLabel="Modelo"
      value={value}
      onChange={(texto) => { setEscribiendo(true); onChange?.(texto) }}
      onSelect={(opcion) => { setEscribiendo(false); onChange?.(opcion.value) }}
      options={OPCIONES}
      disabled={disabled}
      placeholder={placeholder}
      emptyLabel="Sin coincidencias en el catálogo: se usará lo que escribiste como modelo libre."
      maxLength={150}
    />
  </div>
}
