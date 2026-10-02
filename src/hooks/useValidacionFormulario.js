import { useCallback, useMemo, useState } from 'react'
import { validarCampos } from 'owncoding-ui'
import { resumenFaltantes } from '@/lib/validacionGlobal'

// Validación de formularios con la regla global #297: el mensaje aparece al
// salir del campo (o al intentar enviar), el resumen de faltantes alimenta el
// botón deshabilitado con motivo y el submit vuelve a validar antes de mutar.
//
//   const v = useValidacionFormulario(valores, reglas)
//   <FormField error={v.errorDe('monto')}>
//     <Input onBlur={v.alSalir('monto')} … />
//   </FormField>
//   <Button type="submit" disabled={!v.valido} title={v.motivo}>Guardar</Button>
//
// Las reglas y las etiquetas viven en `@/lib/validacionGlobal` (puras y
// testeables); acá solo vive el estado de "tocado" y el resumen del submit.
export default function useValidacionFormulario(valores, reglas, etiquetas = {}) {
  const resultado = useMemo(() => validarCampos(valores, reglas), [valores, reglas])
  const [tocados, setTocados] = useState({})
  const [intentado, setIntentado] = useState(false)
  const alSalir = useCallback(
    (campo) => () => setTocados((actuales) => (actuales[campo] ? actuales : { ...actuales, [campo]: true })),
    [],
  )
  const errorDe = useCallback(
    (campo) => (tocados[campo] || intentado ? resultado.errores[campo] || '' : ''),
    [tocados, intentado, resultado],
  )
  // Marca el intento de envío inválido: recién ahí se ve el resumen completo.
  const intentar = useCallback(() => {
    setIntentado(true)
    return resultado
  }, [resultado])
  const limpiar = useCallback(() => {
    setTocados({})
    setIntentado(false)
  }, [])
  const motivo = useMemo(() => resumenFaltantes(etiquetas, resultado.campos), [resultado.campos, etiquetas])
  // El resumen aparece cuando ya hay un campo visitado o un envío intentado:
  // no se adelanta a lo que la persona todavía no tocó.
  const mostrarResumen = intentado || Object.keys(tocados).length > 0
  return {
    valido: resultado.valido,
    errores: resultado.errores,
    campos: resultado.campos,
    primerError: resultado.primerError,
    motivo,
    intentado,
    mostrarResumen,
    errorDe,
    alSalir,
    intentar,
    limpiar,
  }
}
