import { useEffect, useState } from 'react'
import { EVENTO_FORMATO_58, formato58Activo } from '@/lib/printing/preferencias'

// «Formato 58 mm» (Configuración › Impresión y dispositivos): se relee al
// cambiar el interruptor, en esta pestaña o en otra.
export default function useFormato58() {
  const [activo, setActivo] = useState(() => formato58Activo())
  useEffect(() => {
    const leer = () => setActivo(formato58Activo())
    window.addEventListener(EVENTO_FORMATO_58, leer)
    window.addEventListener('storage', leer)
    return () => { window.removeEventListener(EVENTO_FORMATO_58, leer); window.removeEventListener('storage', leer) }
  }, [])
  return activo
}
