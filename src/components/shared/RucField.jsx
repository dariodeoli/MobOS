// Adaptador de migración (#253): la UI y el flujo de confirmación viven en la
// biblioteca (`owncoding-ui/RucField`); acá queda solo la consulta: API real
// con cuota/auditoría del servidor, o el mock del navegador en la demo (#234).
import { RucField as CampoRuc } from 'owncoding-ui'
import { api } from '@/lib/api/client'
import { consultarRucDemo } from '@/lib/demoRuc'

export default function RucField({ esDemo = false, ...props }) {
  async function consultar(ruc) {
    if (esDemo) return consultarRucDemo(ruc)
    const respuesta = await api.get(`/api/ruc?ruc=${encodeURIComponent(ruc)}`)
    return respuesta?.result
  }
  return <CampoRuc consultar={consultar} {...props} />
}
