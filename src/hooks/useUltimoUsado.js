import { useCallback, useEffect, useRef, useState } from 'react'
import { EVENTO_ULTIMO_USADO, leerUltimo, olvidarUltimo, recordarUltimo } from '@/lib/ultimoUsado'

// Hook del patrón «último usado como predeterminado» (#209). Se usa como un
// useState: `[valor, guardar]`, con un tercer elemento `{ olvidar }`.
//
//   const [cuenta, recordarCuenta] = useUltimoUsado('pos:cuenta-cobro', 'Caja')
//   <Select value={cuenta} onChange={e => recordarCuenta(e.target.value)} />
//
// - `inicial` es el default sensato de la pantalla cuando no hay nada guardado.
// - `valido` valida lo guardado al leer (si la opción ya no existe, vuelve al
//   default). `legado` migra claves viejas al namespace `mobos:<área>:<dato>`.
// - `guardar` acepta un valor o una función `(actual) => siguiente` (igual que
//   los setters de React) y recuerda el cambio.
// - Queda sincronizado con los otros controles de la misma clave (evento del
//   helper) y con otras pestañas (evento `storage`).
export function useUltimoUsado(clave, inicial = '', { valido, legado } = {}) {
  // Las opciones viven en un ref: los llamadores suelen pasar funciones/arrays
  // nuevos en cada render y no queremos re-suscribir por eso.
  const opcionesRef = useRef({ valido, legado })
  opcionesRef.current = { valido, legado }

  const leer = useCallback(
    () => leerUltimo(clave, { porDefecto: inicial, ...opcionesRef.current }),
    [clave, inicial],
  )
  const [valor, setValor] = useState(leer)
  const valorRef = useRef(valor)
  valorRef.current = valor

  useEffect(() => {
    const actualizar = () => {
      const siguiente = leer()
      valorRef.current = siguiente
      setValor(siguiente)
    }
    window.addEventListener(EVENTO_ULTIMO_USADO, actualizar)
    window.addEventListener('storage', actualizar)
    return () => {
      window.removeEventListener(EVENTO_ULTIMO_USADO, actualizar)
      window.removeEventListener('storage', actualizar)
    }
  }, [leer])

  const guardar = useCallback(
    (siguiente) => {
      const nuevo = typeof siguiente === 'function' ? siguiente(valorRef.current) : siguiente
      if (nuevo === undefined) return
      recordarUltimo(clave, nuevo)
      valorRef.current = nuevo === null || nuevo === '' ? inicial : nuevo
      setValor(valorRef.current)
    },
    [clave, inicial],
  )

  const olvidar = useCallback(() => {
    olvidarUltimo(clave)
    valorRef.current = inicial
    setValor(inicial)
  }, [clave, inicial])

  return [valor, guardar, { olvidar }]
}
