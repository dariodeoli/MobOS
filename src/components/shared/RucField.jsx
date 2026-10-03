// Adaptador de migración (#253): la UI y el flujo de confirmación viven en la
// biblioteca (`owncoding-ui/RucField`); acá queda solo la consulta: API real
// con cuota/auditoría del servidor, o el mock del navegador en la demo (#234).
import { useCallback } from 'react'
import { RucField as CampoRuc } from 'owncoding-ui'
import { api } from '@/lib/api/client'
import { consultarRucDemo } from '@/lib/demoRuc'

export default function RucField({ esDemo = false, ...props }) {
  // #334: identidad estable para `consultar`. La librería invalida la consulta
  // pendiente en un layout effect que depende del proveedor; una función nueva
  // por render descartaba el resultado cuando el formulario se re-renderizaba
  // mientras la consulta estaba en vuelo.
  const consultar = useCallback(async (ruc) => {
    if (esDemo) return consultarRucDemo(ruc)
    const respuesta = await api.get(`/api/ruc?ruc=${encodeURIComponent(ruc)}`)
    return respuesta?.result
  }, [esDemo])
  return <CampoRuc consultar={consultar} {...props} />
}
